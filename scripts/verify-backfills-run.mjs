#!/usr/bin/env node
/**
 * verify-backfills-run.mjs
 *
 * Post-deploy sanity check: for every migration that ships with a paired
 * one-time backfill script, confirm that script has actually run against
 * prod (recorded in the `backfill_log` table added by migration 028).
 *
 * WHY THIS EXISTS
 * ---------------
 *   On 2026-08-11 (v0.5.6 lesson 1) we discovered migration 023
 *   (food_search_ranking) had been applied to prod for weeks, but its
 *   paired script `scripts/rank-foods.mjs` had never been run against
 *   prod. Result: `is_canonical` was NULL for every row and food search
 *   ranking behaved as if the whole feature didn't exist. Because a
 *   NULL column of all-false is a perfectly valid schema state,
 *   verify-migrations-applied.mjs couldn't detect the drift.
 *
 *   This script closes that gap: it enforces "if a migration promises
 *   a one-time backfill, that backfill actually ran."
 *
 * APPROACH
 * --------
 *   Reads the REQUIRED_BACKFILLS manifest below, then for each entry
 *   queries `backfill_log` for the most recent successful run. Uses
 *   psql (same pattern as verify-migrations-applied.mjs) so it needs
 *   zero npm additions and reuses the ubuntu-latest preinstall.
 *
 * REQUIREMENTS
 * ------------
 *   - `psql` on PATH.
 *   - Env: SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD (falls back to
 *     apps/web/.env.local if unset). Missing creds → prints `[SKIP]`
 *     and exits 0 so PRs without secrets don't fail CI.
 *
 * EXIT CODES
 * ----------
 *   0 → all required backfills recorded (or credentials missing → skip).
 *   1 → at least one required backfill has no record in prod.
 *   2 → psql not available or unexpected runtime error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Manifest — the source of truth for "which backfill scripts must run."
// ---------------------------------------------------------------------------
//
// Add an entry here whenever you ship a migration whose promised behaviour
// depends on a one-time data-transform script. `trigger_migration` is a
// human-readable pointer, not queried; `min_rows_hint` is the smallest
// rows_affected we'd reasonably expect from a full run (used for a soft
// warning, not a hard fail).
//
// seed-foods.py (paired with migration 014) is intentionally NOT listed:
// its output is already covered by row-count checks elsewhere, and it
// predates the backfill_log convention.
const REQUIRED_BACKFILLS = [
  {
    script: 'rank-foods',
    trigger_migration: '023_food_search_ranking.sql',
    min_rows_hint: 60,
  },
];

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
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

function deriveRefFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(url).host.split('.')[0] || null;
  } catch {
    return null;
  }
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
    [dbUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '|', '-c', sql],
    { encoding: 'utf8' },
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    throw new Error(`psql failed (exit ${res.status}): ${stderr}`);
  }
  return (res.stdout || '').trim();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  let projectId = readEnv('SUPABASE_PROJECT_ID');
  const password = readEnv('SUPABASE_DB_PASSWORD');
  const url = readEnv('SUPABASE_URL') || readEnv('NEXT_PUBLIC_SUPABASE_URL');

  if (!projectId && url) {
    projectId = deriveRefFromUrl(url);
    if (projectId) {
      console.log(`[INFO] derived project ref from SUPABASE_URL: ${projectId}`);
    }
  }

  if (!projectId || !password) {
    const hint = !projectId
      ? 'SUPABASE_PROJECT_ID or SUPABASE_URL (to derive the ref)'
      : 'SUPABASE_DB_PASSWORD (required for the pooler URL)';
    console.log(
      `[SKIP] missing prod credentials (${hint}); script is a no-op in this env`,
    );
    process.exit(0);
  }

  if (REQUIRED_BACKFILLS.length === 0) {
    console.log('[SKIP] REQUIRED_BACKFILLS manifest is empty — nothing to verify');
    process.exit(0);
  }

  // Sanity-check that psql exists.
  const which = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (which.error || which.status !== 0) {
    console.error(
      '[ERR] `psql` not found on PATH. Install `postgresql-client` (Ubuntu) ' +
        'or `libpq` (macOS Homebrew). On GitHub `ubuntu-latest`, psql is preinstalled.',
    );
    process.exit(2);
  }

  const dbUrl = buildDbUrl(projectId, password);

  let missing = 0;
  let warned = 0;
  let ok = 0;

  for (const entry of REQUIRED_BACKFILLS) {
    const script = entry.script.replace(/'/g, "''");
    let row;
    try {
      row = psqlQuery(
        dbUrl,
        `select coalesce(to_char(max(ran_at), 'YYYY-MM-DD'), '') as last_ran, ` +
          `count(*)::text as run_count, ` +
          `coalesce(sum(rows_affected), 0)::text as total_rows ` +
          `from backfill_log where script_name = '${script}';`,
      );
    } catch (err) {
      console.error(`[ERR] ${entry.script}: ${err.message}`);
      process.exit(2);
    }

    // Result is a single pipe-delimited row: "last_ran|run_count|total_rows".
    const [lastRan, runCount, totalRows] = (row || '||0').split('|');
    const runs = Number(runCount || '0');
    const rows = Number(totalRows || '0');

    if (runs === 0) {
      missing += 1;
      console.log(
        `[MISS] ${entry.script} — never recorded in backfill_log ` +
          `(paired with ${entry.trigger_migration})`,
      );
      continue;
    }

    if (rows < entry.min_rows_hint) {
      warned += 1;
      console.log(
        `[WARN] ${entry.script} ran but affected only ${rows} rows ` +
          `(expected >= ${entry.min_rows_hint}; last ran ${lastRan})`,
      );
    } else {
      ok += 1;
      console.log(`[OK]   ${entry.script} (${rows}+ rows on ${lastRan})`);
    }
  }

  console.log(
    `\nchecked ${REQUIRED_BACKFILLS.length} required backfills — ` +
      `${ok} ok, ${warned} warn, ${missing} missing`,
  );
  process.exit(missing > 0 ? 1 : 0);
}

main();
