-- 021_body_metrics.sql
--
-- Body composition tracker for the Gym mini-app (task #90).
--
-- One row per weekly weigh-in / measurement session. All measurements stored
-- in canonical SI-adjacent units (mm for length, g for mass) as integers so
-- unit conversion happens client-side without float drift:
--   inches → mm:   mm = round(inches * 25.4)
--   cm     → mm:   mm = round(cm * 10)
--   lbs    → g:    g  = round(lbs * 453.59237)
--   kg     → g:    g  = round(kg * 1000)
--
-- `iso_week` is a text bucket ("2026-W32") because ISO week + year isn't a
-- native Postgres type and users can log against a past/future week from the
-- UI. We keep `measured_at` alongside for the exact timestamp of the entry.
--
-- CHECK ranges are generous but bound obvious garbage: 10cm–3m for any body
-- measurement, 20kg–500kg for weight. Notes capped at 1000 chars to match the
-- Zod insertSchema on the API boundary (see packages/shared/src/schemas/gym.ts).
--
-- RLS: owner-only. Reads + writes both gated by `auth.uid() = user_id`.

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  iso_week text not null,
  measured_at timestamptz not null default now(),
  glutes_mm int check (glutes_mm between 100 and 3000),
  waist_mm int check (waist_mm between 100 and 3000),
  chest_mm int check (chest_mm between 100 and 3000),
  thighs_mm int check (thighs_mm between 100 and 3000),
  biceps_mm int check (biceps_mm between 100 and 3000),
  weight_g int check (weight_g between 20000 and 500000),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists body_metrics_user_week_idx
  on public.body_metrics(user_id, iso_week desc);

alter table public.body_metrics enable row level security;

create policy "users manage own"
  on public.body_metrics for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
