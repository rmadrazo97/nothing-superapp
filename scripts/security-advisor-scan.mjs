#!/usr/bin/env node
/**
 * security-advisor-scan.mjs
 *
 * Automates the Supabase Studio "Security Advisor" (Splinter lint suite —
 * github.com/supabase/splinter) against prod. The `supabase` CLI in this
 * workspace (2.24.3) doesn't ship an `advisor` subcommand, so we invoke the
 * canonical Splinter queries directly via the Management API's
 * `POST /v1/projects/{ref}/database/query` endpoint.
 *
 * WHY THIS EXISTS
 * ---------------
 *   During v0.5.5 we ran the same lints by hand and found 3 real findings
 *   (2 fixed in migration 026, 1 deferred pg_trgm-in-public to v0.5.6).
 *   Lesson from that ship-log: these scans are ~cheap and worth firing at
 *   every release, so any NEW WARN/ERROR gets caught the same day it lands.
 *
 * AUTH — MANAGEMENT TOKEN, NOT SERVICE ROLE KEY
 * ---------------------------------------------
 *   The Management API rejects the service-role JWT (that key auths against
 *   PostgREST on your project, not the api.supabase.com control plane).
 *   You need a Personal Access Token (starts `sbp_...`) from
 *   https://supabase.com/dashboard/account/tokens. Pass it via env var
 *   `SUPABASE_MANAGEMENT_TOKEN` in CI. Locally on macOS the CLI stores it
 *   in the login keychain — extract with:
 *
 *     security find-generic-password -s "Supabase CLI" -w \
 *       | sed 's/^go-keyring-base64://' | base64 -d
 *
 *   Then `export SUPABASE_MANAGEMENT_TOKEN=sbp_...`. DO NOT hardcode it.
 *
 * REQUIREMENTS
 * ------------
 *   - Node ≥ 18 (native fetch, no npm deps).
 *   - Env: SUPABASE_MANAGEMENT_TOKEN + SUPABASE_PROJECT_ID (both fall back
 *     to `apps/web/.env.local` if unset in the shell).
 *   - Missing creds → prints `[SKIP]` and exits 0 (never blocks CI on PRs
 *     that don't have secrets wired).
 *
 * EXIT CODES
 * ----------
 *   0 → only INFO-level findings (or clean, or credentials missing → skip).
 *   1 → at least one WARN- or ERROR-level lint has findings.
 *   2 → transport / unexpected runtime error (network, 401, malformed JSON).
 *
 * FLAGS
 * -----
 *   --json   emit a machine-readable JSON summary to stdout (still writes
 *            per-lint status to stderr so a CI log stays legible).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// env loading — shell first, then apps/web/.env.local (same pattern as
// verify-migrations-applied.mjs so local dev is one-command).
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
// ANSI colors — inline, no chalk dep. Auto-disable when NO_COLOR is set or
// stdout isn't a TTY (CI logs).
// ---------------------------------------------------------------------------
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const c = {
  reset: useColor ? '\x1b[0m' : '',
  dim:   useColor ? '\x1b[2m' : '',
  red:   useColor ? '\x1b[31m' : '',
  green: useColor ? '\x1b[32m' : '',
  yellow:useColor ? '\x1b[33m' : '',
  blue:  useColor ? '\x1b[34m' : '',
  bold:  useColor ? '\x1b[1m' : '',
};

// ---------------------------------------------------------------------------
// Splinter lint definitions
// ---------------------------------------------------------------------------
//
// Each lint carries:
//   - name:  the canonical Splinter lint name (lower_snake_case).
//   - level: 'ERROR' | 'WARN' | 'INFO' — matches upstream severity so we
//            can fail CI on WARN+ but stay silent on pure INFO noise.
//   - description: one-liner shown in the summary.
//   - sql: the raw SQL Splinter runs (paraphrased where needed for the
//          management-API's single-statement constraint).
//   - describe(row): renders one finding into a short human string.
//
// These are the exact lints hand-run in v0.5.5 during the security-advisor
// cleanup — see ship-log/0.5.5.md.
const LINTS = [
  {
    name: 'rls_disabled_in_public',
    level: 'ERROR',
    description: 'Tables in the public schema with Row Level Security disabled',
    sql: `
      select n.nspname as schema, c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r'
        and n.nspname = 'public'
        and c.relrowsecurity = false
      order by c.relname;
    `,
    describe: (r) => `${r.schema}.${r.name} — RLS disabled`,
  },
  {
    name: 'rls_enabled_no_policy',
    level: 'INFO',
    description: 'Tables with RLS enabled but zero policies (locked-down, or accidentally so)',
    sql: `
      select n.nspname as schema, c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r'
        and n.nspname = 'public'
        and c.relrowsecurity = true
        and not exists (
          select 1 from pg_policy p where p.polrelid = c.oid
        )
      order by c.relname;
    `,
    describe: (r) => `${r.schema}.${r.name} — RLS on, 0 policies`,
  },
  {
    name: 'security_definer_view',
    level: 'ERROR',
    description: 'Views without security_invoker=on (runs with view-owner privileges — RLS bypass)',
    sql: `
      select n.nspname as schema, c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'v'
        and n.nspname = 'public'
        and not exists (
          select 1
          from unnest(coalesce(c.reloptions, array[]::text[])) as opt
          where opt ilike 'security_invoker=%on%'
             or opt ilike 'security_invoker=%true%'
        )
      order by c.relname;
    `,
    describe: (r) => `${r.schema}.${r.name} — no security_invoker=on`,
  },
  {
    name: 'function_search_path_mutable',
    level: 'WARN',
    description: 'Functions in public without a pinned search_path (privilege-escalation risk)',
    // Exclude extension-owned functions via pg_depend (deptype='e').
    // This matches the join pattern used during v0.5.5's manual sweep — if we
    // don't filter these out, the report is dominated by pg_trgm/pgcrypto
    // internals we can't fix anyway.
    sql: `
      select n.nspname as schema, p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
          where cfg ilike 'search_path=%'
        )
        and not exists (
          select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e'
        )
      order by p.proname;
    `,
    describe: (r) => `${r.schema}.${r.name}() — no pinned search_path`,
  },
  {
    name: 'extension_in_public',
    level: 'WARN',
    description: 'Extensions installed into the public schema (should live in `extensions`)',
    sql: `
      select e.extname as name, n.nspname as schema
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
      where n.nspname = 'public'
      order by e.extname;
    `,
    describe: (r) => `extension ${r.name} — installed in ${r.schema}`,
  },
  {
    name: 'auth_users_exposed',
    level: 'ERROR',
    description: 'Views/tables that expose auth.users columns to anon or authenticated roles',
    // Splinter's canonical query looks for views whose definition references
    // `auth.users` AND which have SELECT granted to anon/authenticated. Using
    // pg_views.definition is the simplest way to detect the reference; the
    // ACL check uses has_table_privilege() which respects grants + defaults.
    sql: `
      select v.schemaname as schema, v.viewname as name
      from pg_views v
      where v.schemaname not in ('pg_catalog','information_schema','auth','storage','realtime','vault','extensions')
        and v.definition ilike '%auth.users%'
        and (
          has_table_privilege('anon', quote_ident(v.schemaname)||'.'||quote_ident(v.viewname), 'SELECT')
          or
          has_table_privilege('authenticated', quote_ident(v.schemaname)||'.'||quote_ident(v.viewname), 'SELECT')
        )
      order by v.viewname;
    `,
    describe: (r) => `${r.schema}.${r.name} — exposes auth.users columns`,
  },
];

// ---------------------------------------------------------------------------
// management API client
// ---------------------------------------------------------------------------
async function runQuery({ projectId, token, sql }) {
  const url = `https://api.supabase.com/v1/projects/${projectId}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql.trim() }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    // Deliberately do NOT log `token` here or anywhere else in this file.
    throw new Error(`management-api ${res.status}: ${bodyText.slice(0, 400)}`);
  }
  // API returns an array of rows on success (may be empty).
  try {
    const parsed = JSON.parse(bodyText);
    if (!Array.isArray(parsed)) {
      throw new Error(`unexpected response shape: ${bodyText.slice(0, 200)}`);
    }
    return parsed;
  } catch (err) {
    throw new Error(`malformed JSON from management-api: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function levelColor(level) {
  if (level === 'ERROR') return c.red;
  if (level === 'WARN') return c.yellow;
  return c.blue; // INFO
}

function statusTag(status) {
  if (status === 'OK')    return `${c.green}[OK]${c.reset}   `;
  if (status === 'INFO')  return `${c.blue}[INFO]${c.reset} `;
  if (status === 'WARN')  return `${c.yellow}[WARN]${c.reset} `;
  if (status === 'ERROR') return `${c.red}[ERROR]${c.reset}`;
  if (status === 'SKIP')  return `${c.dim}[SKIP]${c.reset} `;
  return `[${status}]`;
}

async function main() {
  const asJson = process.argv.includes('--json');
  // In JSON mode, per-lint chatter goes to stderr so stdout stays parseable.
  const log = asJson ? (s) => process.stderr.write(s + '\n') : (s) => process.stdout.write(s + '\n');

  const projectId = readEnv('SUPABASE_PROJECT_ID');
  const token = readEnv('SUPABASE_MANAGEMENT_TOKEN');

  if (!projectId || !token) {
    const missing = [
      !projectId && 'SUPABASE_PROJECT_ID',
      !token && 'SUPABASE_MANAGEMENT_TOKEN',
    ].filter(Boolean).join(' + ');
    const msg = `${statusTag('SKIP')} security-advisor scan skipped — missing ${missing}`;
    if (asJson) {
      process.stderr.write(msg + '\n');
      process.stdout.write(JSON.stringify({ skipped: true, missing: missing.split(' + ') }, null, 2) + '\n');
    } else {
      log(msg);
    }
    process.exit(0);
  }

  log(`${c.bold}Splinter security-advisor scan${c.reset} — project ${projectId}`);
  log('');

  const results = [];
  let hardFailures = 0;

  for (const lint of LINTS) {
    let rows;
    try {
      rows = await runQuery({ projectId, token, sql: lint.sql });
    } catch (err) {
      log(`${statusTag('ERROR')} ${lint.name}: ${err.message}`);
      results.push({ name: lint.name, level: lint.level, status: 'transport-error', error: err.message, findings: [] });
      // Transport failure — bail with code 2, don't pretend green.
      if (asJson) process.stdout.write(JSON.stringify({ results, exitCode: 2 }, null, 2) + '\n');
      process.exit(2);
    }

    const count = rows.length;
    if (count === 0) {
      log(`${statusTag('OK')} ${lint.name} — ${c.dim}${lint.description}${c.reset}`);
      results.push({ name: lint.name, level: lint.level, status: 'ok', findings: [] });
      continue;
    }

    // Non-empty: status = level of the lint. INFO doesn't fail; WARN/ERROR does.
    const status = lint.level; // 'INFO' | 'WARN' | 'ERROR'
    if (status === 'WARN' || status === 'ERROR') hardFailures += 1;

    const findings = rows.map((r) => ({ raw: r, summary: safeDescribe(lint, r) }));
    log(
      `${statusTag(status)} ${lint.name} — ${levelColor(lint.level)}${count} finding${count === 1 ? '' : 's'}${c.reset}` +
        ` ${c.dim}(${lint.description})${c.reset}`,
    );
    for (const f of findings) log(`         · ${f.summary}`);
    results.push({ name: lint.name, level: lint.level, status: status.toLowerCase(), findings: findings.map((f) => f.raw) });
  }

  log('');
  const totalFindings = results.reduce((n, r) => n + r.findings.length, 0);
  log(
    `${c.bold}summary${c.reset}: ${results.length} lints run, ${totalFindings} total findings, ` +
      `${hardFailures} WARN+ lints ${hardFailures > 0 ? c.yellow + '(fail)' + c.reset : c.green + '(pass)' + c.reset}`,
  );

  if (asJson) {
    const summary = {
      projectId,
      generatedAt: new Date().toISOString(),
      totalFindings,
      hardFailures,
      exitCode: hardFailures > 0 ? 1 : 0,
      results,
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  }

  process.exit(hardFailures > 0 ? 1 : 0);
}

function safeDescribe(lint, row) {
  try {
    return lint.describe(row);
  } catch {
    return JSON.stringify(row);
  }
}

main().catch((err) => {
  // Belt-and-suspenders for any unhandled rejection above main's try/catches.
  process.stderr.write(`[FATAL] ${err.stack || err.message || err}\n`);
  process.exit(2);
});
