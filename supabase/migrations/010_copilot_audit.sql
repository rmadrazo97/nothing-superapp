-- 010_copilot_audit.sql — audit log for every copilot tool invocation.
-- Applied 2026-08-09.
--
-- Motivation:
--   The copilot is being upgraded from a read-only chat to a tool-calling
--   agent that can log calories, water, weight, and start pomodoros on the
--   user's behalf. Every write is guarded server-side by auth + entitlement +
--   a second per-user rate limit, but we still want a cheap accountability
--   trail — one row per tool call, success OR failure — so we can:
--     - answer "did the agent actually log that?" for support cases,
--     - measure tool-call error rates for prompt/tool iteration,
--     - detect abuse patterns (100 log_water calls in a minute etc.).
--
-- Design:
--   - Owner-only RLS. Users see their own history; nobody else does.
--   - jsonb for input + output so schema changes on individual tools don't
--     require migrations. Bounded by the app-side gate (tool inputs are
--     small; output is a short summary + a scalar payload).
--   - status is a plain text tag ('ok' | 'error' | 'rate_limited' etc.) —
--     kept as text so we can add new statuses without an enum migration.
--   - Indexed on (user_id, called_at desc) for the common "last N by user"
--     query the copilot UI + support tools will use.

create table if not exists copilot_tool_calls (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tool_name     text not null,
  input         jsonb not null default '{}'::jsonb,
  output        jsonb,
  status        text not null default 'ok',
  error_message text,
  called_at     timestamptz not null default now()
);

create index if not exists copilot_tool_calls_user_time_idx
  on copilot_tool_calls (user_id, called_at desc);

create index if not exists copilot_tool_calls_status_idx
  on copilot_tool_calls (status)
  where status <> 'ok';

alter table copilot_tool_calls enable row level security;

-- Read-your-own only. Writes come from the app via the caller's session
-- Supabase client, so INSERT also needs a policy checking auth.uid().
drop policy if exists copilot_tool_calls_owner_select on copilot_tool_calls;
create policy copilot_tool_calls_owner_select on copilot_tool_calls
  for select using (auth.uid() = user_id);

drop policy if exists copilot_tool_calls_owner_insert on copilot_tool_calls;
create policy copilot_tool_calls_owner_insert on copilot_tool_calls
  for insert with check (auth.uid() = user_id);

-- No update / delete policy — audit rows are immutable. Retention is a future
-- concern; a simple `delete from copilot_tool_calls where called_at < now() -
-- interval '90 days'` run out-of-band handles it when the table gets large.
