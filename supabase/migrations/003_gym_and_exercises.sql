-- 003_gym_and_exercises.sql — gym-routine mini-app tables + exercises reference data
-- Applied 2026-08-08.

-- ────────────────────────────────────────────────────────────────
-- exercises (reference data — public read for any signed-in user)
-- ────────────────────────────────────────────────────────────────
create table if not exists exercises (
  id text primary key,                              -- zero-padded 4-digit id from source dataset ("0001")
  name text not null,
  body_part text not null check (body_part in (
    'back','cardio','chest','lower arms','lower legs','neck','shoulders','upper arms','upper legs','waist'
  )),
  target text not null,                             -- primary muscle (abs, biceps, etc)
  equipment text not null,                          -- 'body weight', 'dumbbell', 'barbell', ...
  muscle_group text not null,
  secondary_muscles text[] not null default '{}',
  instruction_steps text[] not null default '{}',   -- ordered English step-by-step
  image_url text not null,                          -- 180x180 thumbnail
  gif_url text not null,                            -- 180x180 animation
  attribution text not null default '© Gym visual — https://gymvisual.com/'
);

create index if not exists exercises_body_part_idx on exercises (body_part);
create index if not exists exercises_target_idx on exercises (target);
create index if not exists exercises_equipment_idx on exercises (equipment);
-- trigram-ready name search (extension may not be enabled; fall back to ILIKE)
create index if not exists exercises_name_lower_idx on exercises (lower(name));

alter table exercises enable row level security;
-- Public read for any authenticated user (this is reference data, not per-user)
create policy exercises_authenticated_read on exercises
  for select using (auth.role() = 'authenticated');
-- No insert/update/delete via anon or authenticated — service_role only (bypass)

-- ────────────────────────────────────────────────────────────────
-- workout_routines (user-owned recipe of exercises + planned sets)
-- ────────────────────────────────────────────────────────────────
create table if not exists workout_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- exercises: [{exercise_id, sets:[{reps,weight_kg}]}]
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_routines_user_idx on workout_routines (user_id, updated_at desc);

alter table workout_routines enable row level security;

create policy workout_routines_owner_all on workout_routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- workout_sessions (a live/completed workout — logged sets)
-- ────────────────────────────────────────────────────────────────
create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references workout_routines(id) on delete set null,
  name text,                                        -- snapshot of routine name (or ad-hoc)
  started_at timestamptz not null default now(),
  ended_at timestamptz,                             -- null = live/in-progress
  -- entries: [{exercise_id, name, sets:[{reps,weight_kg,completed_at}]}]
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workout_sessions_user_idx on workout_sessions (user_id, started_at desc);
create index if not exists workout_sessions_live_idx on workout_sessions (user_id) where ended_at is null;

alter table workout_sessions enable row level security;

create policy workout_sessions_owner_all on workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at trigger for workout_routines
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end
$$ language plpgsql;

drop trigger if exists workout_routines_updated_at on workout_routines;
create trigger workout_routines_updated_at
  before update on workout_routines
  for each row execute function set_updated_at();
