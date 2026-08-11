#!/usr/bin/env node
/**
 * verify-rpcs-defined.mjs
 *
 * Post-deploy sanity check: for every `supabase.rpc('<name>', …)` call-site
 * in the client source tree, confirm the named function actually exists in
 * prod's `pg_proc` (public schema).
 *
 * WHY THIS EXISTS
 * ---------------
 *   On 2026-08-10 (v0.5.8 lesson 1) we discovered
 *   `apps/web/src/lib/foods/resolve-ingredient.ts` had been calling
 *   `supabase.rpc('resolve_ingredient_alias_fuzzy', …)` and
 *   `supabase.rpc('resolve_ingredient_food_fuzzy', …)` for months — but
 *   those functions were never defined in any migration and were absent
 *   from prod's schema cache. PostgREST silently returned no rows and
 *   the food-resolver's passes 3+4 were effectively no-ops. Migration
 *   029 finally added the functions.
 *
 *   The v0.5.5 safety net (`scripts/verify-migrations-applied.mjs`)
 *   only introspects tables/columns/indexes. It cannot catch this third
 *   class of drift because it never queries `pg_proc`. This script does.
 *
 * APPROACH
 * --------
 *   1. Grep the source tree (`apps/web/src`, `apps/mini-apps/**`) for
 *      `.rpc(` call-sites and extract the first-arg string literal —
 *      the RPC name. Non-literal names (variables, template strings)
 *      are logged as `[WARN]` and skipped — we can't verify what we
 *      can't statically extract.
 *   2. Query prod `pg_proc` joined to `pg_namespace` for those names
 *      restricted to schema `public` (one round-trip).
 *   3. For each expected name → `[OK]` or `[MISS]` with the call-site.
 *
 *   Same psql + skip-on-missing-creds pattern as
 *   `verify-migrations-applied.mjs` so it slots into CI identically.
 *
 * REQUIREMENTS
 * ------------
 *   - `psql` on PATH (Homebrew's `libpq` locally; preinstalled on
 *     GitHub `ubuntu-latest`).
 *   - Env: SUPABASE_PROJECT_ID (or NEXT_PUBLIC_SUPABASE_URL to derive
 *     the ref) + SUPABASE_DB_PASSWORD. Falls back to
 *     `apps/web/.env.local` if unset in the shell.
 *   - Missing creds → `[SKIP]` + exit 0 (never fails CI on secret gaps).
 *
 * EXIT CODES
 * ----------
 *   0 → all expected RPCs defined (or credentials missing → skip).
 *   1 → at least one referenced RPC is missing from prod pg_proc.
 *   2 → psql not available or unexpected runtime error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// Roots we scan for `.rpc(` call-sites. Kept narrow (apps only) so we
// never accidentally grep built artefacts under `.next/` or `node_modules/`.
const SCAN_ROOTS = [
  join(REPO_ROOT, 'apps', 'web', 'src'),
  join(REPO_ROOT, 'apps', 'mini-apps'),
];

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// ---------------------------------------------------------------------------
// env loading — shell first, then apps/web/.env.local
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// source-tree walk + `.rpc(` extraction
// ---------------------------------------------------------------------------
function walkSourceFiles(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip build/dep dirs defensively even though our roots are
        // already narrow — future contributors might drop a `node_modules`
        // under `apps/mini-apps/*` and we don't want to grep bundles.
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.turbo' ||
          entry.name.startsWith('.')
        ) {
          continue;
        }
        stack.push(full);
      } else if (entry.isFile()) {
        const dot = entry.name.lastIndexOf('.');
        if (dot < 0) continue;
        const ext = entry.name.slice(dot);
        if (SOURCE_EXTS.has(ext)) out.push(full);
      }
    }
  }
  return out;
}

/**
 * Extract `.rpc('name', …)` call-sites from one source file.
 * Returns an array of { name, file, line } for literal string names,
 * plus an array of { file, line, snippet } for non-literal calls.
 *
 * We match `\.rpc\(` followed by an optional whitespace and then
 * capture either a single-/double-quoted literal (extract it) or
 * anything else (flag as non-literal). Backtick template strings
 * count as non-literal unless they contain no `${…}` interpolation,
 * in which case we accept them as static.
 */
function extractRpcCalls(source, filePath) {
  const literalCalls = [];
  const nonLiteralCalls = [];
  const lines = source.split('\n');
  // Pre-compute cumulative offsets to convert a char index → line number.
  // Faster than `source.slice(0, idx).split('\n').length` for large files.
  const lineOffsets = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') lineOffsets.push(i + 1);
  }
  const offsetToLine = (offset) => {
    // Binary search.
    let lo = 0;
    let hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (lineOffsets[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1; // 1-indexed
  };

  // Match `.rpc(` and then capture the first argument up to the first
  // comma or closing paren at depth 0. We keep the regex loose (accept
  // whitespace + optional generic type param) and do the argument sniff
  // manually.
  const rpcRe = /\.rpc\s*(?:<[^>]*>\s*)?\(\s*/g;
  let m;
  while ((m = rpcRe.exec(source)) !== null) {
    const argStart = rpcRe.lastIndex;
    const ch = source[argStart];
    const line = offsetToLine(m.index);
    const snippet = (lines[line - 1] || '').trim();
    if (ch === "'" || ch === '"') {
      // Simple quoted literal — scan to matching close quote,
      // respecting backslash escapes.
      const quote = ch;
      let i = argStart + 1;
      let value = '';
      let closed = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\' && i + 1 < source.length) {
          value += source[i + 1];
          i += 2;
          continue;
        }
        if (c === quote) {
          closed = true;
          break;
        }
        value += c;
        i += 1;
      }
      if (closed && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        literalCalls.push({ name: value, file: filePath, line });
      } else {
        nonLiteralCalls.push({ file: filePath, line, snippet });
      }
    } else if (ch === '`') {
      // Template literal — accept if there's no `${…}` interpolation
      // inside, otherwise flag as non-literal.
      let i = argStart + 1;
      let value = '';
      let hasInterp = false;
      let closed = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\' && i + 1 < source.length) {
          value += source[i + 1];
          i += 2;
          continue;
        }
        if (c === '`') {
          closed = true;
          break;
        }
        if (c === '$' && source[i + 1] === '{') {
          hasInterp = true;
        }
        value += c;
        i += 1;
      }
      if (closed && !hasInterp && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        literalCalls.push({ name: value, file: filePath, line });
      } else {
        nonLiteralCalls.push({ file: filePath, line, snippet });
      }
    } else {
      // Variable, identifier, expression — can't verify statically.
      nonLiteralCalls.push({ file: filePath, line, snippet });
    }
  }
  return { literalCalls, nonLiteralCalls };
}

// ---------------------------------------------------------------------------
// psql runner (mirrors verify-migrations-applied.mjs)
// ---------------------------------------------------------------------------
function buildDbUrl(projectId, password) {
  const enc = encodeURIComponent(password);
  return `postgresql://postgres.${projectId}:${enc}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`;
}

function psqlQuery(dbUrl, sql) {
  const res = spawnSync(
    'psql',
    [dbUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    throw new Error(`psql failed (exit ${res.status}): ${stderr}`);
  }
  return (res.stdout || '').trim();
}

function fetchPresentRpcs(dbUrl, names) {
  if (names.length === 0) return new Set();
  const list = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const out = psqlQuery(
    dbUrl,
    `select p.proname from pg_proc p ` +
      `join pg_namespace n on n.oid = p.pronamespace ` +
      `where n.nspname = 'public' and p.proname in (${list});`,
  );
  return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function deriveRefFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).host;
    return host.split('.')[0] || null;
  } catch {
    return null;
  }
}

function relPath(abs) {
  if (abs.startsWith(REPO_ROOT + '/')) return abs.slice(REPO_ROOT.length + 1);
  return abs;
}

function main() {
  // Scan sources first — even without creds we can report what we found.
  const files = SCAN_ROOTS.flatMap(walkSourceFiles);
  const literal = [];
  const nonLiteral = [];
  for (const file of files) {
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!src.includes('.rpc(')) continue;
    const { literalCalls, nonLiteralCalls } = extractRpcCalls(src, file);
    literal.push(...literalCalls);
    nonLiteral.push(...nonLiteralCalls);
  }

  for (const nl of nonLiteral) {
    console.log(`[WARN] non-literal .rpc() call at ${relPath(nl.file)}:${nl.line} — ${nl.snippet}`);
  }

  if (literal.length === 0) {
    console.log('[SKIP] no literal supabase.rpc(<name>) call-sites found — nothing to verify');
    process.exit(0);
  }

  // Cred resolution — same story as verify-migrations-applied.mjs.
  const explicitProjectId = readEnv('SUPABASE_PROJECT_ID');
  const password = readEnv('SUPABASE_DB_PASSWORD');
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL') || readEnv('SUPABASE_URL');

  const derivedProjectId = deriveRefFromUrl(url);
  const projectId = derivedProjectId || explicitProjectId;
  if (derivedProjectId && explicitProjectId && derivedProjectId !== explicitProjectId) {
    console.log(
      `[WARN] SUPABASE_PROJECT_ID secret (${explicitProjectId ? '<set>' : '<empty>'}) disagrees with SUPABASE_URL-derived ref (${derivedProjectId}); using URL-derived.`,
    );
  } else if (derivedProjectId) {
    console.log(`[INFO] using project ref derived from SUPABASE_URL: ${derivedProjectId}`);
  }

  if (!projectId || !password) {
    const hint = !projectId
      ? 'SUPABASE_PROJECT_ID or SUPABASE_URL (to derive the ref)'
      : 'SUPABASE_DB_PASSWORD (required for the pooler URL)';
    console.log(`[SKIP] missing prod credentials (${hint}); script is a no-op in this env`);
    process.exit(0);
  }

  const dbUrl = buildDbUrl(projectId, password);

  const which = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (which.error || which.status !== 0) {
    console.error(
      '[ERR] `psql` not found on PATH. Install `postgresql-client` (Ubuntu) ' +
        'or `libpq` (macOS Homebrew). On GitHub `ubuntu-latest`, psql is preinstalled.',
    );
    process.exit(2);
  }

  // Dedupe expected names before the round-trip.
  const expectedNames = [...new Set(literal.map((c) => c.name))].sort();
  let present;
  try {
    present = fetchPresentRpcs(dbUrl, expectedNames);
  } catch (err) {
    const msg = String(err.message || '');
    if (/password authentication failed|tenant\/user postgres|ENOTFOUND/i.test(msg)) {
      console.log(
        `[SKIP] prod DB creds appear misconfigured (${msg.split('\n')[0].slice(0, 100)}); safety net will re-enable once SUPABASE_DB_PASSWORD is correct.`,
      );
      process.exit(0);
    }
    console.error(`[ERR] ${err.message}`);
    process.exit(2);
  }

  // Report per name; on MISS, cite every call-site so ops can grep+fix fast.
  const bySite = new Map();
  for (const c of literal) {
    if (!bySite.has(c.name)) bySite.set(c.name, []);
    bySite.get(c.name).push(`${relPath(c.file)}:${c.line}`);
  }

  let missing = 0;
  let ok = 0;
  for (const name of expectedNames) {
    const sites = bySite.get(name) || [];
    if (present.has(name)) {
      ok += 1;
      console.log(`[OK]   rpc ${name}`);
    } else {
      missing += 1;
      const sitesStr = sites.join(', ');
      console.log(`[MISS] rpc ${name} — called at ${sitesStr} but not defined in prod pg_proc`);
    }
  }

  console.log(
    `\nchecked ${expectedNames.length} distinct RPC names across ${literal.length} call-sites — ` +
      `${ok} present, ${missing} missing`,
  );
  process.exit(missing > 0 ? 1 : 0);
}

main();
