-- 012_meal_plans.sql — nutritionist-style structured meal plans + adherence.
-- Applied 2026-08-09.
--
-- Motivation:
--   Real nutritionist plans have meals with multiple equivalent OPTIONS,
--   free/unlimited ingredients (salads, tomato), unquantified generic items
--   ("Fruta 150 g"), and a flexible rules block (weighing state, free meal
--   per week, hydration, vegetables policy, option interchangeability,
--   protein source swaps). Rather than shred all of that into columns we
--   tuck the whole `plan` object into jsonb, validate on write via Zod
--   (packages/shared/src/schemas/meal-plan.ts → mealPlanSchema), and rely
--   on the write-time schema for shape confidence.
--
-- Design:
--   - `meal_plans.plan` is jsonb — the full nutritionist plan. GIN index for
--     containment queries ("plans that include chicken breast").
--   - `preferences.active_meal_plan_id` — nullable pointer so users can pick
--     which plan is "the current one" without duplicating rows.
--   - `meal_plan_adherence` — one row per (user, date, meal) so re-logging
--     the same meal updates the same row (unique constraint enforces it).
--     Substitutions log which ingredients were swapped so the copilot can
--     surface trends ("you skipped chicken 4 of 7 days").
--   - `set_updated_at()` function already defined in migration 003 — we just
--     attach the trigger here.
--   - Owner-only RLS on both tables. Templates (is_template=true) are
--     read-only fixtures a user "adopts" by copying — no cross-user reads.

create table if not exists meal_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  schema_version  text not null default '1.0',
  plan            jsonb not null,
  source          jsonb,
  athlete         jsonb,
  is_template     boolean not null default false,
  parsing_notes   text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists meal_plans_user_updated_idx
  on meal_plans (user_id, updated_at desc);

create index if not exists meal_plans_plan_gin_idx
  on meal_plans using gin (plan);

drop trigger if exists meal_plans_updated_at on meal_plans;
create trigger meal_plans_updated_at
  before update on meal_plans
  for each row execute function set_updated_at();

alter table meal_plans enable row level security;

drop policy if exists meal_plans_owner_select on meal_plans;
create policy meal_plans_owner_select on meal_plans
  for select using (auth.uid() = user_id);

drop policy if exists meal_plans_owner_insert on meal_plans;
create policy meal_plans_owner_insert on meal_plans
  for insert with check (auth.uid() = user_id);

drop policy if exists meal_plans_owner_update on meal_plans;
create policy meal_plans_owner_update on meal_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists meal_plans_owner_delete on meal_plans;
create policy meal_plans_owner_delete on meal_plans
  for delete using (auth.uid() = user_id);

-- Add nullable pointer on preferences. Uses `add column if not exists` so
-- reruns are safe. ON DELETE SET NULL so nuking a plan doesn't wedge the
-- preferences row.
alter table preferences
  add column if not exists active_meal_plan_id uuid references meal_plans(id) on delete set null;

-- ─── meal_plan_adherence ──────────────────────────────────────────────────
--
-- One row per (user_id, date, meal_id). Re-logging the same meal upserts
-- the row so the user's TODAY view stays clean. `option_selected` records
-- which of the meal's options they chose; `substitutions` is a freeform
-- ingredient-swap log; `free_meal_used` marks the once-a-week free meal.

create table if not exists meal_plan_adherence (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  meal_plan_id    uuid not null references meal_plans(id) on delete cascade,
  date            date not null,
  meal_id         text not null,
  option_selected int,
  substitutions   jsonb,
  notes           text,
  free_meal_used  boolean not null default false,
  water_litres    numeric(4,1),
  bodyweight_kg   numeric(6,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint meal_plan_adherence_unique_daily
    unique (user_id, date, meal_id)
);

create index if not exists meal_plan_adherence_user_date_idx
  on meal_plan_adherence (user_id, date desc);

create index if not exists meal_plan_adherence_plan_date_idx
  on meal_plan_adherence (meal_plan_id, date desc);

drop trigger if exists meal_plan_adherence_updated_at on meal_plan_adherence;
create trigger meal_plan_adherence_updated_at
  before update on meal_plan_adherence
  for each row execute function set_updated_at();

alter table meal_plan_adherence enable row level security;

drop policy if exists meal_plan_adherence_owner_select on meal_plan_adherence;
create policy meal_plan_adherence_owner_select on meal_plan_adherence
  for select using (auth.uid() = user_id);

drop policy if exists meal_plan_adherence_owner_insert on meal_plan_adherence;
create policy meal_plan_adherence_owner_insert on meal_plan_adherence
  for insert with check (auth.uid() = user_id);

drop policy if exists meal_plan_adherence_owner_update on meal_plan_adherence;
create policy meal_plan_adherence_owner_update on meal_plan_adherence
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists meal_plan_adherence_owner_delete on meal_plan_adherence;
create policy meal_plan_adherence_owner_delete on meal_plan_adherence
  for delete using (auth.uid() = user_id);
