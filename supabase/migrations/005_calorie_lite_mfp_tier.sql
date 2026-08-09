-- 005_calorie_lite_mfp_tier.sql — nutrition mini-app promoted from "reference"
-- to MyFitnessPal-tier tracking. Applied 2026-08-09.
--
-- Adds:
--   foods                    Public reference table (~500 common foods seeded)
--   custom_foods             User-created food entries (private)
--   custom_meals             User-created meal templates (multi-ingredient combos)
--   weight_entries           One weight datapoint per user per event
--   water_entries            Water intake in mL (quick +250mL buttons)
-- Extends:
--   app_calorie_entries with fiber_g, sugar_g, sodium_mg, cholesterol_mg,
--                        food_id nullable FK, serving_qty, serving_unit
--   preferences with macro_goal_pct jsonb ({p:%, c:%, f:%}),
--                    water_goal_ml, weight_goal_kg, weight_unit
--
-- Design notes:
--   - `foods` uses text pk (slug) so seed data is stable across environments.
--   - `custom_foods` is separate table (not a discriminator column) so RLS
--     stays trivial: public foods = anyone reads; custom = owner-only.
--   - `custom_meals.components` is jsonb: [{food_id|custom_food_id, qty, unit}]
--     — flexible enough for recipes without a join table explosion.
--   - Water in mL (not "cups") for locale-independence; UI converts.
--   - Weight in kg (not lbs) for the same reason.

-- ────────────────────────────────────────────────────────────────
-- foods — public reference table
-- ────────────────────────────────────────────────────────────────
create table if not exists foods (
  id            text primary key,           -- slug: "chicken-breast-cooked"
  name          text not null,              -- "Chicken breast, cooked"
  brand         text,                       -- null for generic
  serving_g     numeric(10,2) not null,     -- one serving in grams (usually 100)
  serving_label text not null,              -- "100 g" | "1 medium (118 g)"
  kcal          numeric(10,2) not null,
  protein_g     numeric(10,2) not null default 0,
  carbs_g       numeric(10,2) not null default 0,
  fat_g         numeric(10,2) not null default 0,
  fiber_g       numeric(10,2) not null default 0,
  sugar_g       numeric(10,2) not null default 0,
  sodium_mg     numeric(10,2) not null default 0,
  cholesterol_mg numeric(10,2) not null default 0,
  category      text                        -- "protein" | "grain" | "veg" | "fruit" | "dairy" | "fat" | "sweet" | "drink"
);

create index if not exists foods_name_lower_idx on foods (lower(name));
create index if not exists foods_category_idx on foods (category);
create index if not exists foods_kcal_idx on foods (kcal);

alter table foods enable row level security;
create policy foods_authenticated_read on foods
  for select using (auth.role() = 'authenticated');
-- No write policy — service_role only via bypass.

-- ────────────────────────────────────────────────────────────────
-- custom_foods — user-owned food entries
-- ────────────────────────────────────────────────────────────────
create table if not exists custom_foods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  brand         text,
  serving_g     numeric(10,2) not null,
  serving_label text not null,
  kcal          numeric(10,2) not null,
  protein_g     numeric(10,2) not null default 0,
  carbs_g       numeric(10,2) not null default 0,
  fat_g         numeric(10,2) not null default 0,
  fiber_g       numeric(10,2) not null default 0,
  sugar_g       numeric(10,2) not null default 0,
  sodium_mg     numeric(10,2) not null default 0,
  cholesterol_mg numeric(10,2) not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists custom_foods_user_name_idx on custom_foods (user_id, lower(name));

alter table custom_foods enable row level security;
create policy custom_foods_owner_all on custom_foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- custom_meals — user-owned reusable meal templates
-- ────────────────────────────────────────────────────────────────
create table if not exists custom_meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,               -- "Oats + almond butter"
  meal_slot   text check (meal_slot in ('breakfast','lunch','dinner','snacks')),
  -- components: [{food_id?, custom_food_id?, qty_g, name_snapshot}]
  -- Store a name snapshot so a deleted food doesn't break the meal display.
  components  jsonb not null default '[]'::jsonb,
  kcal        numeric(10,2) not null default 0,     -- denormalized totals
  protein_g   numeric(10,2) not null default 0,
  carbs_g     numeric(10,2) not null default 0,
  fat_g       numeric(10,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists custom_meals_user_updated_idx on custom_meals (user_id, updated_at desc);

alter table custom_meals enable row level security;
create policy custom_meals_owner_all on custom_meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists custom_meals_updated_at on custom_meals;
create trigger custom_meals_updated_at
  before update on custom_meals
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────────
-- weight_entries
-- ────────────────────────────────────────────────────────────────
create table if not exists weight_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  weight_kg  numeric(6,2) not null check (weight_kg > 20 and weight_kg < 400),
  note       text,
  entered_at timestamptz not null default now()
);

create index if not exists weight_entries_user_time_idx on weight_entries (user_id, entered_at desc);

alter table weight_entries enable row level security;
create policy weight_entries_owner_all on weight_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- water_entries
-- ────────────────────────────────────────────────────────────────
create table if not exists water_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ml         integer not null check (ml > 0 and ml < 5000),
  entered_at timestamptz not null default now()
);

create index if not exists water_entries_user_time_idx on water_entries (user_id, entered_at desc);

alter table water_entries enable row level security;
create policy water_entries_owner_all on water_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- Extend app_calorie_entries with detailed nutrition + food link
-- ────────────────────────────────────────────────────────────────
alter table app_calorie_entries add column if not exists fiber_g       numeric(10,2) not null default 0;
alter table app_calorie_entries add column if not exists sugar_g       numeric(10,2) not null default 0;
alter table app_calorie_entries add column if not exists sodium_mg     numeric(10,2) not null default 0;
alter table app_calorie_entries add column if not exists cholesterol_mg numeric(10,2) not null default 0;
alter table app_calorie_entries add column if not exists food_id       text references foods(id) on delete set null;
alter table app_calorie_entries add column if not exists custom_food_id uuid references custom_foods(id) on delete set null;
alter table app_calorie_entries add column if not exists serving_qty   numeric(10,2);   -- e.g. 1.5
alter table app_calorie_entries add column if not exists serving_unit  text;            -- "g" | "serving" | "cup"

-- ────────────────────────────────────────────────────────────────
-- Extend preferences with macro goals + water/weight targets
-- ────────────────────────────────────────────────────────────────
alter table preferences add column if not exists macro_goal_pct jsonb not null default '{"protein": 30, "carbs": 40, "fat": 30}'::jsonb;
alter table preferences add column if not exists water_goal_ml  integer not null default 2500 check (water_goal_ml > 0);
alter table preferences add column if not exists weight_goal_kg numeric(6,2);
alter table preferences add column if not exists weight_unit    text not null default 'kg' check (weight_unit in ('kg','lb'));
alter table preferences add column if not exists volume_unit    text not null default 'ml' check (volume_unit in ('ml','oz'));
