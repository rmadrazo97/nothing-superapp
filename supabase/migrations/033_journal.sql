-- ============================================================================
-- Migration 033 — Journal mini-app (daily text entry + optional mood tag).
--
-- One table:
--   journal_entries  — one row per user per calendar day, optionally with
--                      more than one row per day (morning + evening pages).
--                      `entered_on` is the LOCAL date the entry is FOR;
--                      `created_at` is when the row was written. These may
--                      differ when the user back-fills yesterday.
--
-- No unique constraint on (user_id, entered_on) — journaling is not
-- accounting; multiple entries per day is fine and the UI treats "today's
-- entry" as the most recent row for today.
--
-- RLS: standard 4 owner-only policies. No service-role writes expected —
-- everything flows through the user's own session.
--
-- Idempotent: `create table if not exists` + `drop policy if exists`
-- throughout so re-runs are safe.
-- ============================================================================

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Local date the entry is FOR (may differ from created_at if the user
  -- back-fills yesterday). Stored as `date` so timezone edge cases are
  -- impossible.
  entered_on date not null,

  -- 5-tier mood token. NULL when the user opts out of tagging.
  mood text check (mood in ('great','good','neutral','low','bad')) null,

  -- Free text body. 20k chars is enough for a long journal entry without
  -- becoming a novel-length row that bloats the list query.
  body text not null check (char_length(body) between 1 and 20000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hot path: "give me this user's entries newest first" — the list endpoint
-- and the RECENT ENTRIES home strip both depend on this ordering. Composite
-- (user_id, entered_on desc, created_at desc) so the tiebreak between two
-- entries on the same day is deterministic (latest write wins).
create index if not exists journal_entries_user_date_idx
  on journal_entries (user_id, entered_on desc, created_at desc);

-- updated_at trigger — set_updated_at() defined in migration 003.
drop trigger if exists journal_entries_updated_at on journal_entries;
create trigger journal_entries_updated_at
  before update on journal_entries
  for each row execute function set_updated_at();

alter table journal_entries enable row level security;

drop policy if exists journal_entries_owner_select on journal_entries;
create policy journal_entries_owner_select on journal_entries
  for select using (auth.uid() = user_id);

drop policy if exists journal_entries_owner_insert on journal_entries;
create policy journal_entries_owner_insert on journal_entries
  for insert with check (auth.uid() = user_id);

drop policy if exists journal_entries_owner_update on journal_entries;
create policy journal_entries_owner_update on journal_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists journal_entries_owner_delete on journal_entries;
create policy journal_entries_owner_delete on journal_entries
  for delete using (auth.uid() = user_id);
