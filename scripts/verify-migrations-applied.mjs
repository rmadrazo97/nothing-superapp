#!/usr/bin/env node
/**
 * verify-migrations-applied.mjs
 *
 * Post-deploy sanity check: for every DDL statement in `supabase/migrations/`,
 * confirm the resulting object actually exists in the prod database.
 *
 * WHY THIS EXISTS
 * ---------------
 *   On 2026-08-10 migrations 024 (profiles.timezone) + 025
 *   (copilot_tool_calls.idempotency_key) were committed but never applied
 *   to prod. Because every DDL uses `IF NOT EXISTS` guards, local dev and
 *   unit tests noticed nothing — the drift surfaced 4 hours later when
 *   Playwright hit `/api/profile` and got a silent 500.
 *   See services/growth/campaigns/nothing-superapp/ship-log/0.5.4.md lesson 6.
 *
 * APPROACH
 * --------
 *   Chose `psql` (via `child_process.spawnSync`) over the `pg` npm dep or
 *   PostgREST because:
 *     - Zero npm additions to the workspace.
 *     - `psql` ships preinstalled on `ubuntu-latest` GitHub runners.
 *     - Reuses the existing pooler URL pattern from
 *       `scripts/apply-migration-015.py` (SUPABASE_PROJECT_ID +
 *       SUPABASE_DB_PASSWORD → aws-1-eu-west-1 pooler).
 *   PostgREST cannot query `information_schema` without a custom RPC
 *   function, and adding `pg` is another lockfile churn for a one-off
 *   verifier. psql wins on simplicity.
 *
 * REQUIREMENTS
 * ------------
 *   - `psql` on PATH (Homebrew's `libpq` locally; preinstalled on Actions).
 *   - Env: SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD (falls back to
 *     apps/web/.env.local if unset in the shell).
 *   - Missing creds → prints `[SKIP]` and exits 0 (never fails CI just
 *     because secrets aren't wired).
 *
 * EXIT CODES
 * ----------
 *   0 → all expected objects present (or credentials missing → skip).
 *   1 → at least one expected object is missing from prod.
 *   2 → psql not available or unexpected runtime error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

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
// DDL extraction — regex over each .sql file
// ---------------------------------------------------------------------------
/**
 * Extracts expected objects from a single SQL file.
 * Returns [{ kind: 'table' | 'column' | 'index', ...details }].
 *
 * Matches (case-insensitive, dots-in-identifiers allowed):
 *   CREATE TABLE [IF NOT EXISTS] <name> (…)
 *   ALTER TABLE <table> ADD COLUMN [IF NOT EXISTS] <col> <type>
 *   CREATE [UNIQUE] INDEX [IF NOT EXISTS] <name> ON <table> …
 *
 * Skips lines inside `-- comments` (line-level) and `/* … *\/` blocks.
 */
function stripComments(sql) {
  // Remove /* … */ blocks (non-greedy, multi-line).
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove -- to end-of-line.
  s = s.replace(/--[^\n]*/g, '');
  return s;
}

function extractExpectations(sql, migrationName) {
  const clean = stripComments(sql);
  const expectations = [];

  // CREATE TABLE [IF NOT EXISTS] [schema.]<name> (
  const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_.]*)\s*\(/gi;
  for (const m of clean.matchAll(tableRe)) {
    const name = m[1].split('.').pop().toLowerCase();
    expectations.push({ migration: migrationName, kind: 'table', name });
  }

  // ALTER TABLE <table> ... ADD COLUMN [IF NOT EXISTS] <col> ...
  // Handle both single-line and multi-line forms. We scan for `alter table
  // <t>` then look forward for one or more `add column [if not exists] <c>`
  // clauses until the terminating `;`.
  const alterRe = /alter\s+table\s+(?:only\s+)?([a-z_][a-z0-9_.]*)\s+([\s\S]*?);/gi;
  for (const m of clean.matchAll(alterRe)) {
    const table = m[1].split('.').pop().toLowerCase();
    const body = m[2];
    const addColRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi;
    for (const c of body.matchAll(addColRe)) {
      expectations.push({
        migration: migrationName,
        kind: 'column',
        table,
        name: c[1].toLowerCase(),
      });
    }
  }

  // CREATE [UNIQUE] INDEX [IF NOT EXISTS] <name> ON <table>
  const indexRe = /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_.]*)/gi;
  for (const m of clean.matchAll(indexRe)) {
    expectations.push({
      migration: migrationName,
      kind: 'index',
      name: m[1].toLowerCase(),
      table: m[2].split('.').pop().toLowerCase(),
    });
  }

  return expectations;
}

// ---------------------------------------------------------------------------
// psql runner
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

// Batch presence checks — one round-trip per kind, not per object.
function fetchPresentTables(dbUrl, names) {
  if (names.length === 0) return new Set();
  const list = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const out = psqlQuery(
    dbUrl,
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace ` +
      `where c.relkind in ('r','p') and n.nspname = 'public' and c.relname in (${list});`,
  );
  return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
}

function fetchPresentColumns(dbUrl, pairs) {
  if (pairs.length === 0) return new Set();
  const list = pairs
    .map(({ table, name }) => `('${table.replace(/'/g, "''")}','${name.replace(/'/g, "''")}')`)
    .join(',');
  const out = psqlQuery(
    dbUrl,
    `select table_name || '.' || column_name from information_schema.columns ` +
      `where table_schema = 'public' and (table_name, column_name) in (${list});`,
  );
  return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
}

function fetchPresentIndexes(dbUrl, names) {
  if (names.length === 0) return new Set();
  const list = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const out = psqlQuery(
    dbUrl,
    `select indexname from pg_indexes where schemaname = 'public' and indexname in (${list});`,
  );
  return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function deriveRefFromUrl(url) {
  // https://<ref>.supabase.co → <ref>
  if (!url) return null;
  try {
    const host = new URL(url).host;
    return host.split('.')[0] || null;
  } catch {
    return null;
  }
}

function main() {
  const explicitProjectId = readEnv('SUPABASE_PROJECT_ID');
  const password = readEnv('SUPABASE_DB_PASSWORD');
  // NEXT_PUBLIC_SUPABASE_URL first because it's typically inline at workflow-
  // env level (public value), whereas SUPABASE_URL is often a masked secret
  // that stringifies to *** — and *** doesn't parse as a URL.
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL') || readEnv('SUPABASE_URL');
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  // URL-derived ref is the source of truth when present — SUPABASE_URL is
  // public + inline at workflow level, so it's always right. The explicit
  // SUPABASE_PROJECT_ID secret was found in prod CI to sometimes be empty
  // or stale; prefer the URL-derived value and use the secret only as a
  // fallback when the URL isn't set at all.
  const derivedProjectId = deriveRefFromUrl(url);
  let projectId = derivedProjectId || explicitProjectId;
  if (derivedProjectId && explicitProjectId && derivedProjectId !== explicitProjectId) {
    console.log(
      `[WARN] SUPABASE_PROJECT_ID secret (${explicitProjectId ? '<set>' : '<empty>'}) disagrees with SUPABASE_URL-derived ref (${derivedProjectId}); using URL-derived.`,
    );
  } else if (derivedProjectId) {
    console.log(`[INFO] using project ref derived from SUPABASE_URL: ${derivedProjectId}`);
  }

  // Cred check — need PROJECT_ID (or derivable from URL) + PASSWORD for
  // the psql path. If either is missing, skip cleanly so CI doesn't fail
  // on PRs without secrets.
  if (!projectId || !password) {
    const hint =
      !projectId
        ? 'SUPABASE_PROJECT_ID or SUPABASE_URL (to derive the ref)'
        : 'SUPABASE_DB_PASSWORD (required for the pooler URL)';
    console.log(`[SKIP] missing prod credentials (${hint}); script is a no-op in this env`);
    process.exit(0);
  }

  // Extract expectations from every migration.
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const expectations = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    expectations.push(...extractExpectations(sql, file));
  }

  if (expectations.length === 0) {
    console.log('[SKIP] no DDL expectations extracted — nothing to verify');
    process.exit(0);
  }

  const dbUrl = buildDbUrl(projectId, password);

  // Sanity-check that psql exists before doing anything.
  const which = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (which.error || which.status !== 0) {
    console.error(
      '[ERR] `psql` not found on PATH. Install `postgresql-client` (Ubuntu) ' +
        'or `libpq` (macOS Homebrew). On GitHub `ubuntu-latest`, psql is preinstalled.',
    );
    process.exit(2);
  }

  // Group + batch queries.
  const tableNames = [...new Set(expectations.filter((e) => e.kind === 'table').map((e) => e.name))];
  const columnPairs = [
    ...new Map(
      expectations
        .filter((e) => e.kind === 'column')
        .map((e) => [`${e.table}.${e.name}`, { table: e.table, name: e.name }]),
    ).values(),
  ];
  const indexNames = [...new Set(expectations.filter((e) => e.kind === 'index').map((e) => e.name))];

  let presentTables, presentColumns, presentIndexes;
  try {
    presentTables = fetchPresentTables(dbUrl, tableNames);
    presentColumns = fetchPresentColumns(dbUrl, columnPairs);
    presentIndexes = fetchPresentIndexes(dbUrl, indexNames);
  } catch (err) {
    console.error(`[ERR] ${err.message}`);
    process.exit(2);
  }

  let missing = 0;
  let ok = 0;
  for (const e of expectations) {
    let present = false;
    let label = '';
    if (e.kind === 'table') {
      present = presentTables.has(e.name);
      label = `table ${e.name}`;
    } else if (e.kind === 'column') {
      present = presentColumns.has(`${e.table}.${e.name}`);
      label = `column ${e.table}.${e.name}`;
    } else if (e.kind === 'index') {
      present = presentIndexes.has(e.name);
      label = `index ${e.name}`;
    }
    if (present) {
      ok += 1;
      console.log(`[OK]   ${e.migration}: ${label}`);
    } else {
      missing += 1;
      console.log(`[MISS] ${e.migration}: ${label}`);
    }
  }

  console.log(
    `\nchecked ${expectations.length} objects across ${files.length} migrations — ` +
      `${ok} present, ${missing} missing`,
  );
  process.exit(missing > 0 ? 1 : 0);
}

main();
