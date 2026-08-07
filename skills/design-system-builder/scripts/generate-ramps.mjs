#!/usr/bin/env node
/**
 * generate-ramps.mjs — OKLCH tonal ramp generator + WCAG AA contrast check.
 *
 * Zero dependencies. Node >= 18.
 *
 * Usage:
 *   node scripts/generate-ramps.mjs --theme <path-to-theme.json>
 *     → prints CSS lines for the neutral + accent (+ accent-2) ramps + role assignments
 *
 *   node scripts/generate-ramps.mjs --theme <path> --contrast
 *     → also runs WCAG AA contrast checks and exits non-zero if body-on-bg < 4.5
 *
 *   node scripts/generate-ramps.mjs --hex "#9184d9" --ground dark
 *     → quick one-off from a hex + ground, no theme file needed
 *
 * The math: OKLCH is a perceptually-uniform color space; equal L deltas produce
 * equal perceived lightness steps. Neutral ramp shares the accent hue at very
 * low chroma so neutrals feel like a de-saturated version of the accent, not a
 * separate grey palette (this is what makes a system feel "designed").
 */

// ─── args ────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) {
      const k = cur.slice(2);
      const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
      acc.push([k, v]);
    }
    return acc;
  }, [])
);

// ─── OKLCH ↔ sRGB (inline, no deps) ──────────────────────────────────────────
// Refs: https://bottosson.github.io/posts/oklab/
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linearToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return { r: parseInt(n.slice(0, 2), 16) / 255, g: parseInt(n.slice(2, 4), 16) / 255, b: parseInt(n.slice(4, 6), 16) / 255 };
}
function rgbToHex({ r, g, b }) {
  const to = (x) => clamp(Math.round(x * 255), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToOklab({ r, g, b }) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}
function oklabToRgb({ L, a, b }) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return { r: clamp(linearToSrgb(R)), g: clamp(linearToSrgb(G)), b: clamp(linearToSrgb(B)) };
}
function oklabToOklch({ L, a, b }) {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}
function oklchToOklab({ L, C, h }) {
  const rad = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}
const hexToOklch = (hex) => oklabToOklch(rgbToOklab(hexToRgb(hex)));
const oklchToHex = (oklch) => rgbToHex(oklabToRgb(oklchToOklab(oklch)));

// ─── ramp generator ──────────────────────────────────────────────────────────
// L values for steps 100..900 — perceptually even, warm-white → deep-shade.
const RAMP_L = [0.97, 0.92, 0.85, 0.75, 0.66, 0.55, 0.44, 0.32, 0.20];

function generateRamp(hex, { chroma = null, hue = null } = {}) {
  const seed = hexToOklch(hex);
  const H = hue ?? seed.h;
  const C = chroma ?? seed.C;
  return RAMP_L.map((L, i) => {
    const step = (i + 1) * 100;
    return { step, hex: oklchToHex({ L, C, h: H }) };
  });
}

// ─── contrast (WCAG) ─────────────────────────────────────────────────────────
function relLuminance({ r, g, b }) {
  const [R, G, B] = [r, g, b].map(srgbToLinear);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrastRatio(hexA, hexB) {
  const L1 = relLuminance(hexToRgb(hexA));
  const L2 = relLuminance(hexToRgb(hexB));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// ─── role derivation ─────────────────────────────────────────────────────────
// Given an accent hex and a ground ("light" | "dark"), derive bg / surface / text.
function deriveRoles(accentHex, ground) {
  const { h } = hexToOklch(accentHex);
  if (ground === 'dark') {
    return {
      bg: oklchToHex({ L: 0.19, C: 0.02, h }),
      surface: oklchToHex({ L: 0.22, C: 0.02, h }),
      text: oklchToHex({ L: 0.92, C: 0.005, h }),
    };
  }
  return {
    bg: oklchToHex({ L: 0.97, C: 0.005, h }),
    surface: oklchToHex({ L: 0.94, C: 0.005, h }),
    text: oklchToHex({ L: 0.15, C: 0.01, h }),
  };
}

// ─── formatters ──────────────────────────────────────────────────────────────
function formatRampCSS(name, ramp, indent = '  ') {
  return ramp.map(({ step, hex }) => `${indent}--color-${name}-${step}: ${hex};`).join('\n');
}

function shadowFor(ground, neutralRamp) {
  const dark = neutralRamp[neutralRamp.length - 1].hex; // 900
  const midDark = neutralRamp[neutralRamp.length - 2].hex; // 800
  const midLight = neutralRamp[4].hex; // 500
  if (ground === 'dark') {
    return {
      sm: `0 0 0 1px ${midDark}`,
      md: `0 0 0 1px ${neutralRamp[6].hex}, 0 6px 18px rgba(0,0,0,0.55)`,
      lg: `0 0 0 1px ${midLight}, 0 16px 40px rgba(0,0,0,0.65)`,
    };
  }
  return {
    sm: `0 1px 2px color-mix(in srgb, ${dark} 14%, transparent)`,
    md: `0 3px 10px color-mix(in srgb, ${dark} 16%, transparent)`,
    lg: `0 12px 32px color-mix(in srgb, ${dark} 22%, transparent)`,
  };
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  let theme;
  if (args.theme) {
    const { readFile } = await import('node:fs/promises');
    theme = JSON.parse(await readFile(args.theme, 'utf8'));
  } else if (args.hex) {
    theme = {
      name: 'preview',
      palette: {
        band: args.ground === 'dark' ? 'dark' : 'light',
        scheme: 'mono',
        accent: args.hex,
      },
    };
  } else {
    console.error('usage: generate-ramps.mjs --theme <theme.json> [--contrast]');
    console.error('   or: generate-ramps.mjs --hex "#RRGGBB" --ground <light|dark>');
    process.exit(2);
  }

  const ground = theme.palette.band; // "light" | "dark"
  const accent = theme.palette.accent;
  const accent2 = theme.palette.accent2;
  const roles = theme.palette.bg && theme.palette.text
    ? { bg: theme.palette.bg, surface: theme.palette.surface || theme.palette.bg, text: theme.palette.text }
    : deriveRoles(accent, ground);

  const { h: accentHue } = hexToOklch(accent);
  const neutralRamp = generateRamp(oklchToHex({ L: 0.55, C: 0.008, h: accentHue }), { chroma: 0.008 });
  const accentRamp = generateRamp(accent);
  const accent2Ramp = accent2 ? generateRamp(accent2) : null;

  // — assemble output —
  console.log('\n/* — derived roles — */');
  console.log(`  --color-bg: ${roles.bg};`);
  console.log(`  --color-surface: ${roles.surface};`);
  console.log(`  --color-text: ${roles.text};`);
  console.log(`  --color-accent: ${accent};`);
  if (accent2) console.log(`  --color-accent-2: ${accent2};`);

  console.log('\n/* — neutral ramp (hue ' + accentHue.toFixed(0) + '°, chroma 0.008) — */');
  console.log(formatRampCSS('neutral', neutralRamp));

  console.log('\n/* — accent ramp — */');
  console.log(formatRampCSS('accent', accentRamp));

  if (accent2Ramp) {
    console.log('\n/* — secondary accent ramp — */');
    console.log(formatRampCSS('accent-2', accent2Ramp));
  }

  const shadows = shadowFor(ground, neutralRamp);
  console.log('\n/* — elevation — */');
  console.log(`  --shadow-sm: ${shadows.sm};`);
  console.log(`  --shadow-md: ${shadows.md};`);
  console.log(`  --shadow-lg: ${shadows.lg};`);

  // — contrast check —
  if (args.contrast) {
    console.log('\n/* — contrast (WCAG) — */');
    const bodyBg = contrastRatio(roles.text, roles.bg);
    const bodySurface = contrastRatio(roles.text, roles.surface);
    const accentBg = contrastRatio(accent, roles.bg);
    const check = (label, ratio, min) => {
      const pass = ratio >= min;
      const flag = pass ? 'PASS' : 'FAIL';
      console.log(`  ${label.padEnd(28)} ${ratio.toFixed(2)}:1  (min ${min}:1)  ${flag}`);
      return pass;
    };
    const results = [
      check('body text on bg (AA)', bodyBg, 4.5),
      check('body text on surface (AA)', bodySurface, 4.5),
      check('accent on bg (large / UI)', accentBg, 3.0),
    ];
    if (results.includes(false)) {
      console.error('\nCONTRAST FAILED — adjust the failing role in theme.json and regenerate.');
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
