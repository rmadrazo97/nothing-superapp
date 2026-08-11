-- ============================================================================
-- Migration 032 — Habits mini-app (daily checkboxes + streak counter).
--
-- Two tables:
--   habits              — the user's habit definitions. Name, optional emoji,
--                         target days/week, active flag. Owned by user;
--                         cascades on user delete.
--   habit_completions   — one row per habit per completed local date. The
--                         unique (habit_id, completed_on) constraint means
--                         "check today" is idempotent — tapping twice does
--                         nothing new. The client toggles by inserting or
--                         deleting the row for today's date.
--
-- Streak is derived on the client from `habit_completions` (walk backward
-- from today counting consecutive days). We deliberately do NOT denormalise
-- a `streak` column on `habits` — it drifts the moment you cross midnight
-- and the derivation is trivial.
--
-- RLS: standard 4 owner-only policies per table. No service-role writes
-- expected — everything flows through the user's own session.
--
-- Idempotent: `create table if not exists` + `drop policy if exists`
-- throughout so re-runs are safe.
--
-- Migration slot: 032 (031 taken by handle_new_user_revoke).
-- ============================================================================

-- ─── habits ───────────────────────────────────────────────────────────────
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null check (char_length(name) between 1 and 80),
  -- Optional row emoji (1–2 char). NULL when the user opts for text-only.
  emoji text,

  -- 1..7 — the client uses this to compute "on-track" percentage for the
  -- week hero. 7 = every day.
  target_days_per_week int not null default 7
    check (target_days_per_week between 1 and 7),

  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Owner-order-by-name is the primary list query (LIST endpoint).
create index if not exists habits_user_active_idx
  on habits (user_id, active, created_at desc);

-- updated_at trigger — set_updated_at() defined in migration 003.
drop trigger if exists habits_updated_at on habits;
create trigger habits_updated_at
  before update on habits
  for each row execute function set_updated_at();

alter table habits enable row level security;

drop policy if exists habits_owner_select on habits;
create policy habits_owner_select on habits
  for select using (auth.uid() = user_id);

drop policy if exists habits_owner_insert on habits;
create policy habits_owner_insert on habits
  for insert with check (auth.uid() = user_id);

drop policy if exists habits_owner_update on habits;
create policy habits_owner_update on habits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists habits_owner_delete on habits;
create policy habits_owner_delete on habits
  for delete using (auth.uid() = user_id);

-- ─── habit_completions ────────────────────────────────────────────────────
create table if not exists habit_completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Local date the checkbox was ticked. Stored as `date` (no time) so
  -- crossing-midnight-in-timezone-X ambiguities are impossible.
  completed_on date not null,

  created_at timestamptz not null default now(),

  -- One completion per habit per day — the toggle endpoint relies on this
  -- to make double-tap idempotent.
  unique (habit_id, completed_on)
);

-- Hot path: "give me all completions for this user in the last N days".
create index if not exists habit_completions_user_date_idx
  on habit_completions (user_id, completed_on desc);

-- Per-habit streak walk: fast lookup of a habit's ordered completion list.
create index if not exists habit_completions_habit_date_idx
  on habit_completions (habit_id, completed_on desc);

alter table habit_completions enable row level security;

drop policy if exists habit_completions_owner_select on habit_completions;
create policy habit_completions_owner_select on habit_completions
  for select using (auth.uid() = user_id);

drop policy if exists habit_completions_owner_insert on habit_completions;
create policy habit_completions_owner_insert on habit_completions
  for insert with check (auth.uid() = user_id);

drop policy if exists habit_completions_owner_update on habit_completions;
create policy habit_completions_owner_update on habit_completions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists habit_completions_owner_delete on habit_completions;
create policy habit_completions_owner_delete on habit_completions
  for delete using (auth.uid() = user_id);
