#!/usr/bin/env node
/**
 * native-feel audit — run every DETECT recipe from audit-recipes.txt in one shot.
 *
 * Usage:
 *   node scripts/audit.mjs [--repo <path>] [--out <path>]
 *
 *   --repo   root of the project to audit (default: cwd)
 *   --out    where to write the audit report (default: docs/native-feel/<date>/audit.md)
 *
 * Zero dependencies. Node >= 18. Uses spawnSync('grep', ...) — POSIX only.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ─── args ───────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const REPO = resolve(arg('--repo', process.cwd()));
const today = new Date().toISOString().slice(0, 10);
const DEFAULT_OUT = join(REPO, 'docs', 'native-feel', today, 'audit.md');
const OUT = resolve(arg('--out', DEFAULT_OUT));

// ─── the recipes (mirror of references/audit-recipes.txt DETECT commands) ───
// Each entry: { id, category, title, detect: [{type, cmd, args, expect}], notes }
// type "grep": run grep; expect "empty" means recipe applies when grep returns nothing,
//              "any" means recipe applies when grep returns anything.
// type "find": run find; expect same semantics.
// type "readjson": read JSON file, check jq-style path; expect "missing" or specific value.
const RECIPES = [
  { id: '01', cat: 'A', title: 'Viewport meta + viewport-fit=cover',
    detect: [{ type: 'grep', re: 'viewport-fit=cover' }],
    // If empty → FOUND (recipe applies); if any → ALREADY FIXED
    fixWhen: 'empty' },

  { id: '02', cat: 'A', title: 'theme-color per color scheme',
    detect: [{ type: 'grep', re: 'name="theme-color"[^>]*prefers-color-scheme' }],
    fixWhen: 'empty' },

  { id: '03', cat: 'A', title: 'apple-touch-icon',
    detect: [{ type: 'grep', re: 'rel="apple-touch-icon"' }],
    fixWhen: 'empty' },

  { id: '04', cat: 'A', title: 'apple-mobile-web-app-*',
    detect: [{ type: 'grep', re: 'apple-mobile-web-app-capable' }],
    fixWhen: 'empty' },

  { id: '05', cat: 'A', title: 'PWA manifest + linked',
    detect: [
      { type: 'find', pattern: '\\( -name "manifest.json" -o -name "*.webmanifest" \\)' },
      { type: 'grep', re: 'rel="manifest"' },
    ],
    fixWhen: 'anyEmpty' },  // FOUND if either is empty

  { id: '06', cat: 'A', title: 'Manifest display: standalone',
    detect: [{ type: 'jsonKey', file: 'public/manifest.json', key: 'display', wantValue: 'standalone' }],
    fixWhen: 'notMatching' },

  { id: '07', cat: 'A', title: 'Manifest maskable icon',
    detect: [{ type: 'jsonHas', file: 'public/manifest.json', keyPath: 'icons', containsProp: 'maskable' }],
    fixWhen: 'notContaining' },

  { id: '08', cat: 'B', title: 'Kill tap flash (webkit-tap-highlight-color)',
    detect: [{ type: 'grep', re: 'webkit-tap-highlight-color[^;]*transparent' }],
    fixWhen: 'empty' },

  { id: '09', cat: 'B', title: 'Gate :hover in @media (hover: hover)',
    detect: [
      { type: 'grep', re: ':hover' },
      { type: 'grep', re: '@media \\(hover: hover\\)' },
    ],
    fixWhen: 'hoverPresentButNotGated' },

  { id: '10', cat: 'B', title: 'touch-action: manipulation on interactives',
    detect: [{ type: 'grep', re: 'touch-action:\\s*manipulation' }],
    fixWhen: 'empty' },

  { id: '11', cat: 'B', title: 'user-select: none on buttons',
    detect: [{ type: 'grep', re: 'user-select:\\s*none' }],
    fixWhen: 'empty' },

  { id: '12', cat: 'C', title: '100vh → 100dvh / 100svh',
    detect: [{ type: 'grep', re: '\\b100vh\\b' }],
    fixWhen: 'any' },  // any hit means we still have raw 100vh somewhere

  { id: '13', cat: 'C', title: 'safe-area-inset-* on fixed edges',
    detect: [{ type: 'grep', re: 'safe-area-inset-' }],
    fixWhen: 'empty' },

  { id: '14', cat: 'C', title: 'Bottom sheet respects home-indicator inset',
    detect: [{ type: 'manual', note: 'Grep for modal/sheet components + verify each uses safe-area-inset-bottom.' }],
    fixWhen: 'manual' },

  { id: '15', cat: 'D', title: 'Inputs ≥ 16px font-size',
    detect: [{ type: 'manual', note: 'Grep inputs + inspect font-size declarations. Automated only surfaces the raw file list.' }],
    fixWhen: 'manual' },

  { id: '16', cat: 'D', title: 'visualViewport focus-scroll for keyboard',
    detect: [{ type: 'grep', re: 'visualViewport|scrollIntoView.*focus' }],
    fixWhen: 'empty' },

  { id: '17', cat: 'D', title: '-webkit-text-size-adjust: 100%',
    detect: [{ type: 'grep', re: 'text-size-adjust' }],
    fixWhen: 'empty' },

  { id: '18', cat: 'D', title: 'Correct input type + inputmode',
    detect: [{ type: 'manual', note: 'Enumerate <input> elements and audit each type / inputmode / autocomplete.' }],
    fixWhen: 'manual' },

  { id: '19', cat: 'D', title: 'autocorrect off on usernames / codes',
    detect: [{ type: 'grep', re: 'autocorrect="off"' }],
    fixWhen: 'empty' },

  { id: '20', cat: 'E', title: 'overscroll-behavior scoped',
    detect: [{ type: 'grep', re: 'overscroll-behavior' }],
    fixWhen: 'empty' },

  { id: '21', cat: 'E', title: 'touch-action: pan-x on carousels',
    detect: [{ type: 'grep', re: 'touch-action:\\s*pan-x' }],
    fixWhen: 'empty' },

  { id: '22', cat: 'E', title: 'Body scroll lock on modal open',
    detect: [{ type: 'grep', re: 'body\\.style\\.position\\s*=\\s*.fixed.|scroll-lock' }],
    fixWhen: 'empty' },

  { id: '23', cat: 'E', title: 'Remove deprecated -webkit-overflow-scrolling',
    detect: [{ type: 'grep', re: '-webkit-overflow-scrolling' }],
    fixWhen: 'any' },  // any hit = should be removed

  { id: '24', cat: 'F', title: 'Video autoplay: muted + playsinline',
    detect: [{ type: 'grep', re: '<video|<Video' }],
    fixWhen: 'manualIfPresent' },

  { id: '25', cat: 'F', title: 'Images with width/height or aspect-ratio',
    detect: [{ type: 'manual', note: 'Every <img> should have width+height attrs or aspect-ratio wrapper. Manual audit.' }],
    fixWhen: 'manual' },

  { id: '26', cat: 'G', title: 'iOS splash screens (apple-touch-startup-image)',
    detect: [{ type: 'grep', re: 'apple-touch-startup-image' }],
    fixWhen: 'empty' },

  { id: '27', cat: 'G', title: 'Service worker + /offline fallback',
    detect: [
      { type: 'find', pattern: '\\( -name "sw.js" -o -name "service-worker.js" \\)' },
      { type: 'grep', re: 'serviceWorker\\.register|next-pwa|workbox' },
    ],
    fixWhen: 'anyEmpty' },

  { id: '28', cat: 'G', title: 'format-detection: telephone=no',
    detect: [{ type: 'grep', re: 'format-detection' }],
    fixWhen: 'empty' },

  { id: '29', cat: 'G', title: 'Manifest start_url + scope + id',
    detect: [{ type: 'jsonKeys', file: 'public/manifest.json', keys: ['start_url', 'scope', 'id'] }],
    fixWhen: 'anyMissing' },

  { id: '30', cat: 'G', title: 'Manifest shortcuts / share_target',
    detect: [{ type: 'jsonHas', file: 'public/manifest.json', keyPath: 'shortcuts' }],
    fixWhen: 'notPresent' },
];

// ─── helpers ────────────────────────────────────────────
const SEARCH_DIRS = ['src', 'app', 'pages', 'components', 'styles', 'public', 'lib'];
const EXCLUDE = ['node_modules', '.next', '.nuxt', 'dist', 'build', '.git'];

function runGrep(re) {
  const dirs = SEARCH_DIRS.filter((d) => existsSync(join(REPO, d)));
  if (dirs.length === 0) return { hits: [], raw: '' };
  const excludeArgs = EXCLUDE.flatMap((e) => ['--exclude-dir', e]);
  const res = spawnSync('grep', ['-rInE', ...excludeArgs, re, ...dirs], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const raw = (res.stdout || '').trim();
  const hits = raw ? raw.split('\n').slice(0, 20) : [];
  return { hits, count: raw ? raw.split('\n').length : 0, raw };
}

function runFind(pattern) {
  const excludeArgs = EXCLUDE.map((e) => `-not -path "*/${e}/*"`).join(' ');
  const cmd = `find . -type f ${pattern} ${excludeArgs} 2>/dev/null | head -20`;
  const res = spawnSync('bash', ['-c', cmd], { cwd: REPO, encoding: 'utf8' });
  const raw = (res.stdout || '').trim();
  const hits = raw ? raw.split('\n') : [];
  return { hits, count: hits.length };
}

function readJson(file) {
  const p = join(REPO, file);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return null; }
}

function classify(recipe) {
  const d = recipe.detect;

  if (recipe.fixWhen === 'manual' || d.some((x) => x.type === 'manual')) {
    return { status: 'UNKNOWN', evidence: d.find((x) => x.type === 'manual')?.note || 'manual audit required' };
  }

  if (recipe.fixWhen === 'hoverPresentButNotGated') {
    const hoverHits = runGrep(':hover');
    const gateHits = runGrep('@media \\(hover: hover\\)');
    if (hoverHits.count === 0) return { status: 'NOT PRESENT', evidence: 'no :hover rules in codebase' };
    if (gateHits.count > 0) return { status: 'ALREADY FIXED', evidence: `${gateHits.count} @media (hover: hover) block(s) present` };
    return { status: 'FOUND', evidence: `${hoverHits.count} :hover rules, no @media gate:\n${hoverHits.hits.slice(0, 5).join('\n')}` };
  }

  if (recipe.fixWhen === 'manualIfPresent') {
    const r = runGrep(d[0].re);
    if (r.count === 0) return { status: 'NOT PRESENT', evidence: 'no video elements' };
    return { status: 'UNKNOWN', evidence: `${r.count} video element(s) — manual audit: muted+playsinline+autoplay all present?\n${r.hits.slice(0, 3).join('\n')}` };
  }

  const first = d[0];

  if (first.type === 'jsonKey') {
    const json = readJson(first.file);
    if (!json) return { status: 'NOT PRESENT', evidence: `no ${first.file}` };
    if (json[first.key] === first.wantValue) return { status: 'ALREADY FIXED', evidence: `${first.file}: ${first.key} = ${first.wantValue}` };
    return { status: 'FOUND', evidence: `${first.file}: ${first.key} = ${JSON.stringify(json[first.key])}, want ${first.wantValue}` };
  }

  if (first.type === 'jsonHas') {
    const json = readJson(first.file);
    if (!json) return { status: 'NOT PRESENT', evidence: `no ${first.file}` };
    const val = json[first.keyPath];
    if (!val) return { status: 'FOUND', evidence: `${first.file}: no ${first.keyPath}` };
    if (first.containsProp) {
      const s = JSON.stringify(val);
      if (s.includes(first.containsProp)) return { status: 'ALREADY FIXED', evidence: `${first.keyPath} contains ${first.containsProp}` };
      return { status: 'FOUND', evidence: `${first.keyPath} present but no ${first.containsProp}` };
    }
    return { status: 'ALREADY FIXED', evidence: `${first.keyPath} present` };
  }

  if (first.type === 'jsonKeys') {
    const json = readJson(first.file);
    if (!json) return { status: 'NOT PRESENT', evidence: `no ${first.file}` };
    const missing = first.keys.filter((k) => !(k in json));
    if (missing.length === 0) return { status: 'ALREADY FIXED', evidence: `all keys present: ${first.keys.join(', ')}` };
    return { status: 'FOUND', evidence: `missing: ${missing.join(', ')}` };
  }

  // Multi-detect (recipe 05, 27): all must be non-empty for ALREADY FIXED
  if (recipe.fixWhen === 'anyEmpty' && d.length > 1) {
    const results = d.map((det) => det.type === 'find' ? runFind(det.pattern) : runGrep(det.re));
    const emptyOnes = results.filter((r) => r.count === 0);
    if (emptyOnes.length === 0) return { status: 'ALREADY FIXED', evidence: `all checks passed (${results.map((r) => r.count).join(' + ')})` };
    return { status: 'FOUND', evidence: `${emptyOnes.length}/${results.length} checks missing evidence` };
  }

  // Single grep / find recipes
  const r = first.type === 'find' ? runFind(first.pattern) : runGrep(first.re);

  if (recipe.fixWhen === 'empty') {
    if (r.count === 0) return { status: 'FOUND', evidence: 'no evidence of the fix pattern in codebase' };
    return { status: 'ALREADY FIXED', evidence: `${r.count} occurrence(s) — sample: ${r.hits[0] || '(hit)'}` };
  }
  if (recipe.fixWhen === 'any') {
    if (r.count > 0) return { status: 'FOUND', evidence: `${r.count} anti-pattern hit(s):\n${r.hits.slice(0, 5).join('\n')}` };
    return { status: 'NOT PRESENT', evidence: 'anti-pattern absent' };
  }

  return { status: 'UNKNOWN', evidence: 'unhandled fixWhen ' + recipe.fixWhen };
}

// ─── main ───────────────────────────────────────────────
console.log(`native-feel audit — scanning ${REPO}`);
console.log(`writing report → ${OUT}\n`);

const rows = RECIPES.map((r) => {
  const c = classify(r);
  const line = `  [${c.status.padEnd(14)}] ${r.id} · ${r.title}`;
  console.log(line);
  return { ...r, ...c };
});

const counts = {
  FOUND: rows.filter((r) => r.status === 'FOUND').length,
  'NOT PRESENT': rows.filter((r) => r.status === 'NOT PRESENT').length,
  'ALREADY FIXED': rows.filter((r) => r.status === 'ALREADY FIXED').length,
  UNKNOWN: rows.filter((r) => r.status === 'UNKNOWN').length,
};

const md = [
  `# native-feel audit — ${today}`,
  ``,
  `**Repo:** \`${REPO}\``,
  `**Recipes evaluated:** ${RECIPES.length}`,
  `**FOUND (to fix):** ${counts.FOUND}`,
  `**NOT PRESENT (skip):** ${counts['NOT PRESENT']}`,
  `**ALREADY FIXED (skip):** ${counts['ALREADY FIXED']}`,
  `**UNKNOWN (manual):** ${counts.UNKNOWN}`,
  ``,
  `## Results`,
  ``,
  `| # | Category | Title | Status | Evidence |`,
  `| --- | --- | --- | --- | --- |`,
  ...rows.map((r) => `| ${r.id} | ${r.cat} | ${r.title} | ${r.status} | ${(r.evidence || '').replace(/\|/g, '\\|').replace(/\n/g, '<br/>').slice(0, 400)} |`),
  ``,
  `## Next step`,
  ``,
  `Load \`references/audit-recipes.txt\` for the DETECT → FIX → VERIFY block of each FOUND recipe, then execute Phase 4.`,
].join('\n');

mkdirSync(join(OUT, '..'), { recursive: true });
writeFileSync(OUT, md);

console.log('');
console.log(`✅ audit complete: FOUND=${counts.FOUND}  NOT PRESENT=${counts['NOT PRESENT']}  ALREADY FIXED=${counts['ALREADY FIXED']}  UNKNOWN=${counts.UNKNOWN}`);
console.log(`   report: ${OUT}`);
