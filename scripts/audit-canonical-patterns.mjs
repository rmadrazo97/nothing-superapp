#!/usr/bin/env node
/**
 * scripts/audit-canonical-patterns.mjs — v0.5.7 diagnostic helper.
 *
 * For each entry in packages/shared/canonical-foods.json, checks whether the
 * `name_pattern` actually hits any row in `foods`. When a pattern misses,
 * runs a pg_trgm similarity search on the `query` to surface plausible
 * replacement candidates from the actual USDA data.
 *
 * Outputs a Markdown audit table to stdout so the caller can pipe it into
 * a report. Read-only — never mutates the DB.
 *
 * Usage:
 *   set -a && . apps/web/.env.local && set +a && node scripts/audit-canonical-patterns.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CANONICAL_JSON = join(REPO_ROOT, 'packages/shared/canonical-foods.json');

function loadDotEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function readEnv(name) {
  if (process.env[name] && process.env[name].length > 0) return process.env[name];
  const dotenv = loadDotEnv(join(REPO_ROOT, 'apps', 'web', '.env.local'));
  return dotenv[name];
}

const projectId = readEnv('SUPABASE_PROJECT_ID');
const password = readEnv('SUPABASE_DB_PASSWORD');
if (!projectId || !password) {
  console.error('Missing SUPABASE_PROJECT_ID or SUPABASE_DB_PASSWORD.');
  process.exit(1);
}
const DB_URL = `postgresql://postgres.${projectId}:${encodeURIComponent(password)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`;

function psql(sql) {
  const res = spawnSync(
    'psql',
    [DB_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '', '-c', sql],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) throw new Error(`psql failed: ${res.stderr}`);
  return (res.stdout || '').trim();
}

function esc(s) {
  return s.replace(/'/g, "''");
}

const parsed = JSON.parse(readFileSync(CANONICAL_JSON, 'utf8'));
const entries = parsed.entries;

console.error(`Auditing ${entries.length} entries...`);

const rows = [];
let hits = 0;
let misses = 0;
for (let i = 0; i < entries.length; i++) {
  const { query, name_pattern } = entries[i];
  // Match logic identical to rank-foods.mjs: .ilike('name', pattern) with no
  // wildcards means case-insensitive exact match.
  const countSql = `select count(*) from foods where name ilike '${esc(name_pattern)}';`;
  const hitCount = parseInt(psql(countSql), 10);

  let candidates = '';
  if (hitCount === 0) {
    misses++;
    // Try similarity search on the query.
    const simSql =
      `select name from foods where lower(name) % lower('${esc(query)}') ` +
      `order by similarity(lower(name), lower('${esc(query)}')) desc limit 3;`;
    const simOut = psql(simSql);
    candidates = simOut ? simOut.split('\n').filter(Boolean).join(' ; ') : '(none)';
  } else {
    hits++;
  }
  rows.push({ query, name_pattern, hitCount, candidates });
  if ((i + 1) % 25 === 0) console.error(`  ${i + 1}/${entries.length}`);
}

console.error(`\nDone: ${hits} hits / ${misses} misses / ${entries.length} total`);

// ── Missed-demand check (v0.5.9 W15) ────────────────────────────────────
//
// Beyond "does every JSON entry hit a row?", we also want to catch the
// inverse: common daily-log queries a user would plausibly type that we
// have NO canonical entry for. Absent real query analytics, we compare a
// curated list of common food nouns to the current entry set — if a
// candidate query isn't already covered (by exact match on the `query`
// field OR by a canonical-flagged row whose name starts with the
// candidate), we flag it as missed demand.
//
// Extend this list whenever the app grows a new must-log food. Keeping it
// in-script (rather than a separate file) means the audit output stays
// self-contained.
const COMMON_DAILY_LOG_QUERIES = [
  'oatmeal', 'greek yogurt', 'peanut butter', 'almond butter', 'olive oil',
  'tuna', 'shrimp', 'lentils', 'black beans', 'chickpeas', 'garbanzos',
  'quinoa', 'whole wheat bread', 'brown rice', 'cottage cheese', 'pasta',
  'broccoli', 'asparagus', 'kale', 'blueberries', 'strawberries',
  'ground beef', 'ground turkey', 'turkey breast', 'pork chop', 'steak',
  'sirloin', 'protein powder', 'protein bar', 'chicken breast', 'eggs',
  'rice', 'milk', 'yogurt', 'cheese', 'butter', 'bread', 'salmon',
  'banana', 'apple', 'avocado', 'spinach', 'tomato', 'onion', 'garlic',
  'potato', 'sweet potato', 'carrot', 'almonds', 'walnuts', 'honey',
  'coffee', 'tea', 'water',
  // Spanish common terms
  'pollo', 'huevo', 'arroz', 'leche', 'queso', 'avena', 'pan',
  'yogur', 'atun', 'salmon', 'aguacate', 'platano', 'manzana',
  'lentejas', 'garbanzos', 'brocoli', 'espinaca', 'tomate', 'cebolla',
];

const queryExists = new Set(entries.map((e) => e.query.toLowerCase()));
const missedQueries = [];
for (const cand of COMMON_DAILY_LOG_QUERIES) {
  if (queryExists.has(cand.toLowerCase())) continue;
  // Second chance: is there ANY canonical-flagged row whose lowercased name
  // starts with the candidate? If so, the search path will still land on
  // a good row via prefix ranking — not urgent to add.
  const covered = parseInt(
    psql(
      `select count(*) from foods where is_canonical=true and lower(name) like lower('${esc(cand)}%');`,
    ),
    10,
  );
  if (covered > 0) continue;
  // Note likely target so the reader can copy-paste a name_pattern.
  const suggestion = psql(
    `select name from foods where lower(name) like lower('${esc(cand)}%') order by is_canonical desc nulls last, rank_penalty asc nulls last, name asc limit 1;`,
  );
  missedQueries.push({ query: cand, suggestion: suggestion || '(no candidate)' });
}

// Emit markdown table
console.log(`# Canonical foods audit (v0.5.9)`);
console.log(``);
console.log(`Total: ${entries.length}, hits: ${hits}, misses: ${misses}`);
console.log(``);
console.log(`| query | current_pattern | hits | similarity candidates (top 3) |`);
console.log(`|---|---|---|---|`);
for (const r of rows) {
  const q = r.query.replace(/\|/g, '\\|');
  const p = r.name_pattern.replace(/\|/g, '\\|');
  const c = r.candidates.replace(/\|/g, '\\|');
  console.log(`| ${q} | ${p} | ${r.hitCount} | ${c} |`);
}

console.log(``);
console.log(`## Missed-demand check`);
console.log(``);
console.log(
  `Common daily-log queries not covered by any canonical entry (${missedQueries.length} of ${COMMON_DAILY_LOG_QUERIES.length} candidates):`,
);
console.log(``);
if (missedQueries.length === 0) {
  console.log(`All curated demand candidates are already covered.`);
} else {
  console.log(`| missed_query | suggested canonical row |`);
  console.log(`|---|---|`);
  for (const m of missedQueries) {
    const q = m.query.replace(/\|/g, '\\|');
    const s = m.suggestion.replace(/\|/g, '\\|');
    console.log(`| ${q} | ${s} |`);
  }
}

console.error(
  `Missed-demand: ${missedQueries.length}/${COMMON_DAILY_LOG_QUERIES.length} candidates uncovered.`,
);
