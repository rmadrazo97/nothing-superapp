-- 028_backfill_log.sql — one row per successful backfill-script run.
-- Applied 2026-08-11.
--
-- Motivation:
--   Migration DDL is idempotent + verifiable (mig 018/021/023 etc all use
--   `if not exists`). But some migrations ship with a paired one-time
--   script (rank-foods.mjs for mig 023; seed-foods.py for mig 014, etc)
--   that MUST run afterwards to make the migration's promised feature
--   actually work. Without a persistence layer for "did the script run
--   against this DB?", the drift is invisible.
--
--   This table stores one row per successful run. verify-backfills-run.mjs
--   compares expected-backfill script names against this table.

create table if not exists backfill_log (
  id uuid primary key default gen_random_uuid(),
  script_name text not null,
  ran_at timestamptz not null default now(),
  rows_affected integer null,
  notes text null
);

create index if not exists backfill_log_script_name_idx
  on backfill_log (script_name, ran_at desc);

-- Not user-owned — this is sysadmin scaffolding. Service-role writes,
-- no one else reads.
alter table backfill_log enable row level security;

drop policy if exists backfill_log_no_direct_access on backfill_log;
create policy backfill_log_no_direct_access
  on backfill_log
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table backfill_log is
  'One row per successful run of a scripts/*.mjs backfill helper. verify-backfills-run.mjs reads this to enforce "if a migration promises a one-time backfill, that backfill actually ran against prod."';
