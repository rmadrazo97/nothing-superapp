-- 011_gym_routine_v2.sql — coach-grade structured multi-day training plans.
-- Applied 2026-08-09.
--
-- Motivation:
--   v1 routines held a flat list of exercises with a single sets/reps/weight
--   shape. Real coach-authored plans have far more structure: day-by-day
--   splits, top-set + back-off blocks, rep and RIR ranges, supersets,
--   alternatives, bilingual names, cardio prescriptions, and conventions
--   that explain the notation. Rather than shred all of that into columns
--   we tuck the whole `plan` object into jsonb, keep v1 rows working
--   untouched, and add a schema_version tag so the app can pick the right
--   renderer per row.
--
-- Design:
--   - schema_version defaults to '1.0' — v2 routines set it explicitly on
--     insert, existing v1 rows can adopt it later.
--   - plan is nullable — v1 routines carry on with the flat `exercises`
--     column; only v2 rows populate `plan`.
--   - source + athlete + parsing_notes hold the provenance metadata a
--     coach or parser attaches to the plan. All optional.
--   - workout_sessions gets three optional columns so a live session can
--     reference "day 1, exercise d1e3, top_set block" of a v2 plan
--     without breaking existing v1 sessions (all three nullable).
--   - GIN index on plan lets us do containment queries later (e.g.
--     "find plans that hit chest on day 1") without a full scan. Cheap
--     to add now, expensive to backfill later.

alter table workout_routines
  add column if not exists schema_version text not null default '1.0';

alter table workout_routines
  add column if not exists plan jsonb;

alter table workout_routines
  add column if not exists source jsonb;

alter table workout_routines
  add column if not exists athlete jsonb;

alter table workout_routines
  add column if not exists parsing_notes text[] not null default '{}';

create index if not exists workout_routines_plan_gin_idx
  on workout_routines using gin (plan);

alter table workout_sessions
  add column if not exists plan_day int;

alter table workout_sessions
  add column if not exists plan_exercise_id text;

alter table workout_sessions
  add column if not exists block_role text;
