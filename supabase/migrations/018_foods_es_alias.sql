-- Migration 018 — Spanish alias lookup + trigram fuzzy for ingredient resolver.
--
-- v0.5.1 introduced `resolve-ingredient.ts`, called from log_meal_from_plan
-- when a plan ingredient carries no `food_id`. Two problems the resolver has
-- to handle:
--
--   1) Nutritionist-authored meal plans use Spanish ingredient names
--      ("pechuga de pollo") but the USDA foods table (migration 014) is
--      English. Naive ILIKE returns zero rows for common items.
--
--   2) Free-text ingredients ("chicken breat", "arroz basmati") need
--      forgiving matching — a strict `lower(name) = lower(input)` is too
--      brittle.
--
-- What this migration does:
--
--   * Ensures `pg_trgm` is installed (idempotent, already present from 014).
--   * Adds a small curated `food_aliases` table mapping Spanish (or free
--     text) → foods.id, so the resolver can look up the exact canonical
--     row cheaply before falling back to `similarity()` search.
--     RLS-open (public read); rows are seeded by a follow-up script — no
--     user writes.
--
-- Fuzzy search itself doesn't need a schema change: the existing
-- `foods_name_trgm_idx` (GIN gin_trgm_ops on lower(name)) already backs
-- `similarity(lower(name), lower($1)) > 0.3` predicates in constant-ish
-- time. Adding a functional trigram index on `foods.name` was considered
-- but the existing one covers the same query path.

create extension if not exists pg_trgm;

create table if not exists food_aliases (
  id           uuid primary key default gen_random_uuid(),
  -- Free-text Spanish or English input the user (or planner) might type.
  alias        text not null,
  -- Canonical foods.id we should resolve to.
  food_id      text not null references foods(id) on delete cascade,
  -- 'es' | 'en' | 'other' — lets us weight by locale later; not used yet.
  locale       text not null default 'es',
  -- Provenance so a future retune can drop machine-generated rows safely.
  source       text not null default 'seed',
  created_at   timestamptz not null default now(),
  -- Same alias may map to multiple foods (e.g. "pollo" could mean either
  -- chicken breast or thigh); dedup on the pair.
  unique (alias, food_id)
);

create index if not exists food_aliases_alias_lower_idx
  on food_aliases (lower(alias));

create index if not exists food_aliases_alias_trgm_idx
  on food_aliases using gin (lower(alias) gin_trgm_ops);

-- Public-read table (no user data). RLS enabled + a permissive SELECT
-- policy so anon/authed clients can query it via PostgREST if we ever
-- expose it directly. Writes are service-role only.
alter table food_aliases enable row level security;

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'food_aliases'
       and policyname = 'food_aliases_public_read'
  ) then
    create policy food_aliases_public_read
      on food_aliases
      for select
      using (true);
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────
-- Seed rows — small curated batch covering the ingredients that appear in
-- the reference Diet Jam v1 meal plan (see scripts/seed-reference-meal-plan.py).
-- Kept in-migration so a fresh database resolves out-of-the-box. Future
-- alias additions should live in a data-only migration to keep this file
-- append-only.
-- ────────────────────────────────────────────────────────────────────────

-- ES → foods.id. Uses SELECT-then-filter so we skip aliases whose target
-- foods.id doesn't exist in this database yet (e.g. USDA seed skipped a
-- curated row, or the food id was renamed). Safe to re-run.
with candidates(alias, food_id, locale) as (
  values
    ('pechuga de pollo',   'chicken-breast-cooked',   'es'),
    ('pollo',              'chicken-breast-cooked',   'es'),
    ('huevo',              'egg-large',               'es'),
    ('huevos',             'egg-large',               'es'),
    ('claras de huevo',    'egg-white',               'es'),
    ('arroz blanco',       'rice-white-cooked',       'es'),
    ('arroz integral',     'rice-brown-cooked',       'es'),
    ('avena',              'oats-dry',                'es'),
    ('platano',            'banana',                  'es'),
    ('plátano',            'banana',                  'es'),
    ('manzana',            'apple',                   'es'),
    ('leche',              'milk-whole',              'es'),
    ('yogur griego',       'greek-yogurt-plain',      'es'),
    ('atun',               'tuna-canned-water',       'es'),
    ('atún',               'tuna-canned-water',       'es'),
    ('salmon',             'salmon-cooked',           'es'),
    ('salmón',             'salmon-cooked',           'es'),
    ('aguacate',           'avocado',                 'es'),
    ('brocoli',            'broccoli-cooked',         'es'),
    ('brócoli',            'broccoli-cooked',         'es'),
    ('espinaca',           'spinach-raw',             'es'),
    ('lechuga',            'lettuce-romaine',         'es'),
    ('tomate',             'tomato-raw',              'es'),
    ('cebolla',            'onion-raw',               'es'),
    ('aceite de oliva',    'olive-oil',               'es'),
    ('almendras',          'almonds',                 'es'),
    ('nueces',             'walnuts',                 'es'),
    ('queso',              'cheese-cheddar',          'es'),
    ('pan integral',       'bread-whole-wheat',       'es'),
    ('lentejas',           'lentils-cooked',          'es'),
    ('frijoles negros',    'black-beans-cooked',      'es'),
    ('garbanzos',          'chickpeas-cooked',        'es'),
    ('pasta',              'pasta-cooked',            'es'),
    ('pavo',               'turkey-breast-cooked',    'es'),
    ('carne molida',       'ground-beef-cooked',      'es'),
    ('res',                'beef-lean-cooked',        'es')
)
insert into food_aliases (alias, food_id, locale)
select c.alias, c.food_id, c.locale
  from candidates c
  join foods f on f.id = c.food_id
on conflict (alias, food_id) do nothing;
