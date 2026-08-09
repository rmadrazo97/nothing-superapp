-- ============================================================================
-- Migration 017 — Reminders + agent-loop reminders (dev-loop reminders slice).
--
-- Ships a standalone Reminders mini-app whose killer feature is agent-loop
-- reminders: a reminder can be a plain push notification (`kind='notify'`)
-- OR an autonomous copilot prompt (`kind='agent_loop'`) that runs on the
-- same schedule.
--
-- Tables:
--   reminders      — user's reminder rules. Schedule shape is expressed as
--                    `schedule_kind` (`once|daily|weekly|monthly|cron`) +
--                    per-shape columns; `next_fire_at` is denormalised so
--                    the tick handler filters cheap (a single index scan).
--   reminder_runs  — append-only audit log of every reminder fire. For
--                    agent loops we store the assistant's summary + link
--                    back to the copilot_threads row (nullable, set null on
--                    delete — 015 already applied).
--
-- Design notes:
--   - Two-mode `kind` keeps the tick handler simple (`switch(kind)`) and
--     the future roadmap open (say `webhook`, `email`, `sms`).
--   - `next_fire_at` is a partial-indexed column so due-check queries
--     stay O(log n) even at 100k reminders.
--   - Owner-only RLS on both tables. The tick handler runs with service
--     role so it can see every user's due reminders — an explicit user_id
--     scope is applied per-user inside the handler.
--
-- Applied via psql against the prod project (pqbwzcjiedllzafgczhx).
-- Migration slot: 017 (016 taken by calorie-entry-grouping worker).
-- ============================================================================

-- ─── reminders ────────────────────────────────────────────────────────────
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null check (length(title) between 1 and 200),
  notes text,

  -- 'notify' → send a push at the scheduled time.
  -- 'agent_loop' → run an autonomous copilot loop and push the result.
  kind text not null check (kind in ('notify','agent_loop')),

  -- Schedule shape. Only the columns matching the shape are populated;
  -- Zod at the API boundary enforces the cross-field required-ness.
  schedule_kind text not null check (schedule_kind in ('once','daily','weekly','monthly','cron')),
  schedule_at timestamptz,               -- once
  schedule_time text,                    -- HH:MM for daily/weekly
  schedule_dow int[],                    -- weekly: 0=Sun..6=Sat
  schedule_dom int check (schedule_dom between 1 and 31), -- monthly
  schedule_cron text,                    -- cron kind (raw 5- or 6-field string)

  timezone text not null default 'UTC',

  -- Only populated when kind='agent_loop'. Shape:
  --   { prompt: text, context?: text, model?: text, max_steps?: int }
  agent_task jsonb,

  -- Which push topic the outcome fires to. Defaults to the new 'reminders'
  -- topic added in the same migration below.
  push_topic text not null default 'reminders',

  active boolean not null default true,
  last_fired_at timestamptz,
  next_fire_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hot path: "give me every active reminder whose next fire is due".
create index if not exists reminders_due_idx
  on reminders (user_id, next_fire_at)
  where active;

-- Global due-scan (used by the tick handler with service_role).
create index if not exists reminders_active_next_fire_idx
  on reminders (next_fire_at)
  where active;

-- updated_at trigger — set_updated_at() defined in migration 003.
drop trigger if exists reminders_updated_at on reminders;
create trigger reminders_updated_at
  before update on reminders
  for each row execute function set_updated_at();

alter table reminders enable row level security;

drop policy if exists reminders_owner_select on reminders;
create policy reminders_owner_select on reminders
  for select using (auth.uid() = user_id);

drop policy if exists reminders_owner_insert on reminders;
create policy reminders_owner_insert on reminders
  for insert with check (auth.uid() = user_id);

drop policy if exists reminders_owner_update on reminders;
create policy reminders_owner_update on reminders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reminders_owner_delete on reminders;
create policy reminders_owner_delete on reminders
  for delete using (auth.uid() = user_id);

-- ─── reminder_runs ────────────────────────────────────────────────────────
create table if not exists reminder_runs (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references reminders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fired_at timestamptz not null default now(),
  kind text not null check (kind in ('notify','agent_loop')),
  status text not null check (status in ('ok','error','skipped')),

  -- First ~500 chars of the agent's response, for the history UI + PWA
  -- push preview. NULL for notify kind.
  agent_summary text,

  -- Link back to the copilot_threads row when the agent loop was persisted
  -- (015 already applied → foreign key is safe). Nullable so notify rows +
  -- transient loops that skipped persistence stay valid.
  agent_thread_id uuid references copilot_threads(id) on delete set null,

  push_sent boolean not null default false,
  error_message text
);

create index if not exists reminder_runs_reminder_time_idx
  on reminder_runs (reminder_id, fired_at desc);

create index if not exists reminder_runs_user_time_idx
  on reminder_runs (user_id, fired_at desc);

alter table reminder_runs enable row level security;

drop policy if exists reminder_runs_owner_select on reminder_runs;
create policy reminder_runs_owner_select on reminder_runs
  for select using (auth.uid() = user_id);

-- Writes happen from the tick handler (service_role, bypasses RLS). No
-- insert/update policy for regular users — they can only read + delete.

drop policy if exists reminder_runs_owner_delete on reminder_runs;
create policy reminder_runs_owner_delete on reminder_runs
  for delete using (auth.uid() = user_id);
