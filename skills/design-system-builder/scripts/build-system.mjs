#!/usr/bin/env node
/**
 * build-system.mjs — assemble a full design-system folder from a theme.json + optional overrides.
 *
 * v0.3.0 schema:
 *  - 3-font stack: display / body / label (Doto / Space Grotesk / Space Mono for Nothing-style)
 *  - Text opacity ladder: display / primary / secondary / disabled (4 tiers, not "text: X")
 *  - Palette: bg / surface / surface_raised / border / border_visible + text_*
 *  - Geometry: radiusCard (px) + radiusButton ("999px" pill OR "6px" technical)
 *
 * Usage:
 *   node scripts/build-system.mjs --theme <theme.json> [--readme <readme.md.filled>] --out <out-dir>
 *
 * Zero dependencies. Node >= 18.
 */

import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, '..');
const templatesDir = join(skillRoot, 'templates');

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

if (!args.theme || !args.out) {
  console.error('usage: build-system.mjs --theme <theme.json> [--readme <readme.md.filled>] --out <out-dir>');
  process.exit(2);
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const substitute = (str, vars) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), str);

function densityToSpacing(density) {
  const base = 8 * density;
  return {
    SPACE_1: (0.4 * base).toFixed(2),
    SPACE_2: (0.8 * base).toFixed(2),
    SPACE_3: (1.2 * base).toFixed(2),
    SPACE_4: (1.6 * base).toFixed(2),
    SPACE_6: (2.4 * base).toFixed(2),
    SPACE_8: (3.2 * base).toFixed(2),
  };
}

// Google Fonts URL supporting up to 3 families with variable-axis Doto handled correctly.
function googleFontsUrl(fonts) {
  const parts = [];
  for (const f of fonts) {
    if (!f || !f.family) continue;
    const name = f.family.replaceAll(' ', '+');
    const weights = f.weights && f.weights.length ? f.weights : [400];
    // Doto has a variable "ROND" axis but the standard `wght` axis works fine — Google serves the variable font.
    parts.push(`family=${name}:wght@${weights.join(';')}`);
  }
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`;
}

function fallbackFor(cls) {
  switch (cls) {
    case 'serif-trans':  return 'Georgia, "Times New Roman", serif';
    case 'grotesque':    return 'system-ui, -apple-system, "Segoe UI", sans-serif';
    case 'humanist':     return 'system-ui, sans-serif';
    case 'mono':         return '"SF Mono", Menlo, monospace';
    case 'dot-matrix':   return '"Space Mono", "SF Mono", monospace';
    case 'display':      return 'Georgia, serif';
    default:             return 'system-ui, sans-serif';
  }
}

/**
 * Emit the button variant block. `style` values:
 *  - 'filled-white'   → Primary is filled WHITE (or --color-text-display) with black text. The Nothing default on dark grounds.
 *  - 'filled-accent'  → Primary is filled accent color with contrast text. Consumer / marketing.
 *  - 'outline'        → Primary is transparent with accent border. Editorial.
 *  - 'ghost'          → Primary is no-border, accent text.
 */
function buttonVariantCSS(style) {
  const common = `
.btn-destructive { color: var(--color-accent); border-color: var(--color-accent); }
.btn-destructive:hover  { background: var(--color-accent-subtle); }
.btn-destructive:active { background: color-mix(in srgb, var(--color-accent) 25%, transparent); }
.btn-ghost { padding-inline: 8px; color: var(--color-text-secondary); }
.btn-ghost:hover  { color: var(--color-text-display); }
.btn-ghost:active { color: var(--color-text-primary); }`.trim();

  switch (style) {
    case 'filled-white':
      return `.btn-primary { background: var(--color-text-display); color: var(--color-bg); border-color: var(--color-text-display); }
.btn-primary:hover  { background: color-mix(in srgb, var(--color-text-display) 88%, transparent); border-color: transparent; }
.btn-primary:active { background: color-mix(in srgb, var(--color-text-display) 78%, transparent); border-color: transparent; }
.btn-secondary { border-color: var(--color-border-visible); color: var(--color-text-primary); }
.btn-secondary:hover  { border-color: var(--color-text-primary); color: var(--color-text-display); }
.btn-secondary:active { background: var(--color-surface-raised); }
${common}`;

    case 'filled-accent':
      return `.btn-primary { background: var(--color-accent); color: var(--color-text-display); border-color: var(--color-accent); }
.btn-primary:hover  { background: color-mix(in srgb, var(--color-accent) 90%, white); border-color: transparent; }
.btn-primary:active { background: color-mix(in srgb, var(--color-accent) 80%, black);  border-color: transparent; }
.btn-secondary { border-color: var(--color-border-visible); color: var(--color-text-primary); }
.btn-secondary:hover  { border-color: var(--color-text-primary); color: var(--color-text-display); }
.btn-secondary:active { background: var(--color-surface-raised); }
${common}`;

    case 'outline':
      return `.btn-primary { color: var(--color-accent); border-color: var(--color-accent); }
.btn-primary:hover  { background: var(--color-accent-subtle); }
.btn-primary:active { background: color-mix(in srgb, var(--color-accent) 25%, transparent); }
.btn-secondary { border-color: var(--color-border-visible); color: var(--color-text-primary); }
.btn-secondary:hover  { border-color: var(--color-text-primary); color: var(--color-text-display); }
.btn-secondary:active { background: var(--color-surface-raised); }
${common}`;

    case 'ghost':
      return `.btn-primary { color: var(--color-accent); }
.btn-primary:hover  { background: var(--color-accent-subtle); }
.btn-primary:active { background: color-mix(in srgb, var(--color-accent) 25%, transparent); }
.btn-secondary { color: var(--color-text-primary); }
.btn-secondary:hover  { color: var(--color-text-display); }
.btn-secondary:active { color: var(--color-text-primary); }
${common}`;

    default:
      throw new Error(`unknown button style: ${style} — expected filled-white | filled-accent | outline | ghost`);
  }
}

function imageTreatmentCSS(kind) {
  switch (kind) {
    case 'lighten': return `.lighten { mix-blend-mode: lighten; background-color: transparent; }`;
    case 'halftone': return `.halftone { position: relative; filter: grayscale(0.35) contrast(1.15); overflow: hidden; }
.halftone::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(circle, rgba(0,0,0,0.22) 30%, transparent 32%);
  background-size: 3px 3px; mix-blend-mode: multiply; }`;
    case 'duotone': return `.duotone { filter: grayscale(1) contrast(1.1) sepia(1) hue-rotate(180deg); }`;
    case 'none':
    default: return `/* No image treatment class — photographs render as-is. */`;
  }
}

// ─── ramp generator invocation ──────────────────────────────────────────────
async function runRampGenerator(themePath) {
  const script = join(skillRoot, 'scripts', 'generate-ramps.mjs');
  const { stdout } = await execFileP('node', [script, '--theme', themePath]);
  return stdout;
}

function parseRampOutput(text) {
  const lines = text.split('\n');
  const grab = (name) => {
    const start = lines.findIndex((l) => l.includes(`--color-${name}-100:`));
    if (start < 0) return '';
    const block = [];
    for (let i = start; i < lines.length && lines[i].includes(`--color-${name}-`); i++) {
      block.push(lines[i]);
    }
    return block.join('\n');
  };
  return {
    neutral: grab('neutral'),
    accent:  grab('accent'),
    accent2: grab('accent-2'),
  };
}

// ─── copy verbatim (foundations + components) ────────────────────────────────
async function copyDir(src, dst, transform = null) {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = join(src, e.name), d = join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d, transform);
    else if (transform) {
      const raw = await readFile(s, 'utf8');
      await writeFile(d, transform(raw, e.name));
    } else await copyFile(s, d);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────
const theme = JSON.parse(await readFile(args.theme, 'utf8'));
const outDir = resolve(args.out);
await mkdir(outDir, { recursive: true });
await mkdir(join(outDir, 'foundations'), { recursive: true });
await mkdir(join(outDir, 'components'), { recursive: true });

const spacing = densityToSpacing(theme.density);

// Ramp generator uses only accent + ground; run against theme.json.
const rampOutput = await runRampGenerator(resolve(args.theme));
const ramps = parseRampOutput(rampOutput);

const fontUrl = googleFontsUrl([theme.fonts.display, theme.fonts.body, theme.fonts.label]);

const substitutions = {
  SYSTEM_NAME: theme.name,
  GOOGLE_FONTS_URL: fontUrl,

  // — palette —
  COLOR_BG:              theme.palette.bg,
  COLOR_SURFACE:         theme.palette.surface,
  COLOR_SURFACE_RAISED:  theme.palette.surface_raised,
  COLOR_BORDER:          theme.palette.border,
  COLOR_BORDER_VISIBLE:  theme.palette.border_visible,
  COLOR_TEXT_DISPLAY:    theme.palette.text_display,
  COLOR_TEXT_PRIMARY:    theme.palette.text_primary,
  COLOR_TEXT_SECONDARY:  theme.palette.text_secondary,
  COLOR_TEXT_DISABLED:   theme.palette.text_disabled,
  COLOR_ACCENT:          theme.palette.accent,

  // — optional secondary accent —
  OPTIONAL_ACCENT_2_ROLE:  theme.palette.accent2 ? `  --color-accent-2: ${theme.palette.accent2};\n  --color-accent-2-subtle: color-mix(in srgb, ${theme.palette.accent2} 15%, transparent);\n` : '',
  OPTIONAL_ACCENT_2_PIN:   theme.palette.accent2 ? `,\n      "accent2": "${theme.palette.accent2}"` : '',
  OPTIONAL_ACCENT_2_FIELD: theme.palette.accent2 ? `,\n    "accent2": "${theme.palette.accent2}"` : '',
  OPTIONAL_RAMPS_ACCENT_2: theme.palette.accent2 ? `\n  /* — secondary accent ramp — */\n${ramps.accent2}\n` : '',

  RAMPS_NEUTRAL: ramps.neutral,
  RAMPS_ACCENT:  ramps.accent,

  // — fonts (3-family stack) —
  FONT_DISPLAY:          theme.fonts.display.family,
  FONT_DISPLAY_FALLBACK: fallbackFor(theme.fonts.display.class),
  FONT_DISPLAY_CLASS:    theme.fonts.display.class,
  FONT_DISPLAY_WEIGHT:   theme.fonts.displayWeight ?? 400,
  FONT_DISPLAY_WEIGHTS_JSON: JSON.stringify(theme.fonts.display.weights || [400]),

  FONT_BODY:          theme.fonts.body.family,
  FONT_BODY_FALLBACK: fallbackFor(theme.fonts.body.class),
  FONT_BODY_CLASS:    theme.fonts.body.class,
  FONT_BODY_WEIGHT:   theme.fonts.bodyWeight ?? 400,
  FONT_BODY_WEIGHTS_JSON: JSON.stringify(theme.fonts.body.weights || [400]),

  FONT_LABEL:          theme.fonts.label.family,
  FONT_LABEL_FALLBACK: fallbackFor(theme.fonts.label.class),
  FONT_LABEL_CLASS:    theme.fonts.label.class,
  FONT_LABEL_WEIGHTS_JSON: JSON.stringify(theme.fonts.label.weights || [400]),

  // — geometry —
  DENSITY: theme.density,
  ...spacing,
  RADIUS_CARD:   theme.radiusCard   ?? 14,
  RADIUS_BUTTON: theme.radiusButton ?? '999px',

  // — style knobs —
  IMAGE_TREATMENT: theme.imageTreatment,
  IMAGE_TREATMENT_CSS: imageTreatmentCSS(theme.imageTreatment),
  ICON_SET: theme.iconSet,
  BUTTON_STYLE: theme.buttonStyle,
  BUTTON_VARIANT_CSS: buttonVariantCSS(theme.buttonStyle),
  LAYOUT_STYLE: theme.layoutStyle || 'left',

  // — theme.json metadata mirrors —
  HUE:    theme.palette.hue,
  BAND:   theme.palette.band,
  SCHEME: theme.palette.scheme,
  SAT:    theme.palette.sat ?? 0.1,
};

// — write substituted files at output root —
const stylesTpl = await readFile(join(templatesDir, 'styles.css'), 'utf8');
await writeFile(join(outDir, 'styles.css'), substitute(stylesTpl, substitutions));

const themeJsonTpl = await readFile(join(templatesDir, 'theme.json'), 'utf8');
await writeFile(join(outDir, 'theme.json'), substitute(themeJsonTpl, substitutions));

const thumbnailTpl = await readFile(join(templatesDir, 'thumbnail.html'), 'utf8');
await writeFile(join(outDir, 'thumbnail.html'), substitute(thumbnailTpl, substitutions));

const themeHtmlTpl = await readFile(join(templatesDir, 'theme.html'), 'utf8');
await writeFile(join(outDir, 'theme.html'), substitute(themeHtmlTpl, substitutions));

const indexHtmlTpl = await readFile(join(templatesDir, 'index.html'), 'utf8');
await writeFile(join(outDir, 'index.html'), substitute(indexHtmlTpl, substitutions));

// — copy foundations + components with the full substitution map —
// (they reference {{FONT_*}}, {{DENSITY}}, {{RADIUS_*}}, etc. in their editorial captions)
const transformWithTokens = (raw) => substitute(raw, substitutions);
await copyDir(join(templatesDir, 'foundations'), join(outDir, 'foundations'), transformWithTokens);
await copyDir(join(templatesDir, 'components'), join(outDir, 'components'), transformWithTokens);

// — readme —
if (args.readme) {
  const readme = await readFile(args.readme, 'utf8');
  await writeFile(join(outDir, 'readme.md'), readme);
} else {
  const readmeTpl = await readFile(join(templatesDir, 'readme.md.txt'), 'utf8');
  await writeFile(join(outDir, 'readme.md'),
    `<!-- STUB — replace the {{...}} placeholders with real prose or supply --readme -->\n` + readmeTpl);
}

console.log(`✅ Design system built at ${outDir}`);
console.log(`   open ${outDir}/index.html   (or run: node scripts/preview.mjs ${outDir})`);
