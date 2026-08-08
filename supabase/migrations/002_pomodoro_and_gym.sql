-- 002_pomodoro_and_gym.sql
-- Shared migration slot for the pomodoro + gym-routine mini-apps.
-- Applied 2026-08-08.
--
-- The gym worker ended up writing to a separate file (003_gym_and_exercises.sql)
-- so this file currently only holds the pomodoro block. Kept at 002 to match
-- the coordination plan in the pomodoro task brief — future migrations can
-- still slot in above 003 without renumbering.

-- BEGIN pomodoro --

create table if not exists pomodoro_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase text not null check (phase in ('work','short_break','long_break')),
  planned_duration_seconds int not null,
  actual_duration_seconds int not null,
  completed boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now()
);

alter table pomodoro_sessions enable row level security;

create policy pomodoro_owner_all on pomodoro_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists pomodoro_sessions_user_time_idx
  on pomodoro_sessions (user_id, started_at desc);

-- END pomodoro --
