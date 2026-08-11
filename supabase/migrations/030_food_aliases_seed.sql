-- Migration 030 — expanded food_aliases seed for daily-log queries (v0.5.9 W15).
--
-- v0.5.8 W12 flagged that the resolver's four-pass pipeline
-- (apps/web/src/lib/foods/resolve-ingredient.ts) still returns NULL for
-- common daily-log queries the user actually types — the classic case
-- being "oatmeal", where:
--   - pass 1 (exact alias) misses because no `oatmeal` alias existed.
--   - pass 2 (short-query canonical prefix ILIKE) misses because our
--     canonical row is named "Oats, rolled, dry" — it doesn't start with
--     "oatmeal", so `name ilike 'oatmeal%'` never fires.
--   - pass 3 (fuzzy alias) misses for the same reason as pass 1.
--   - pass 4 (fuzzy foods.name) lands on "Bread, oatmeal" (0.57 similarity)
--     because "Oats, rolled, dry" is below pg_trgm's 0.3 threshold on the
--     "oatmeal" needle.
--
-- The cleanest fix is an alias row — pass 1 wins in O(log n), scores 1.0,
-- and short-circuits every downstream ambiguity. We seed both English
-- synonyms ("oatmeal" → oats-rolled-dry, "pb" → peanut-butter) and Spanish
-- daily-log terms not already covered by migration 018 (aguacate is in 018;
-- pechuga de pavo / pavo molido are new).
--
-- The migration follows the same append-only pattern as 018: a `values(..)`
-- CTE joined against `foods` so any alias targeting a food_id that isn't
-- seeded in this DB is silently skipped, and `on conflict do nothing` keeps
-- re-runs safe.

with candidates(alias, food_id, locale) as (
  values
    -- ── English synonyms that pass 2 (canonical prefix) can't cover ────
    ('oatmeal',            'oats-rolled-dry',           'en'),
    ('oats',               'oats-rolled-dry',           'en'),
    ('rolled oats',        'oats-rolled-dry',           'en'),
    ('pb',                 'peanut-butter',             'en'),
    ('peanut butter',      'peanut-butter',             'en'),
    ('almond butter',      'almond-butter',             'en'),
    ('evoo',               'olive-oil',                 'en'),
    ('olive oil',          'olive-oil',                 'en'),
    ('greek yogurt',       'greek-yogurt-nonfat-plain', 'en'),
    ('cottage cheese',     'cottage-cheese-1pct',       'en'),
    ('protein bar',        'protein-bar-quest',         'en'),
    ('protein powder',     'whey-protein-scoop',        'en'),
    ('whey',               'whey-protein-scoop',        'en'),
    ('lentils',            'lentils-cup',               'en'),
    ('black beans',        'black-beans-cup',           'en'),
    ('chickpeas',          'chickpeas-cup',             'en'),
    ('garbanzo beans',     'chickpeas-cup',             'en'),
    ('quinoa',             'quinoa-cooked',             'en'),
    ('brown rice',         'rice-brown-cooked',         'en'),
    ('white rice',         'rice-white-cooked',         'en'),
    ('whole wheat bread',  'bread-whole-wheat',         'en'),
    ('wheat bread',        'bread-whole-wheat',         'en'),
    ('ground turkey',      'usda-171506',               'en'),
    ('turkey breast',      'turkey-breast-cooked',      'en'),
    ('pork chop',          'usda-168231',               'en'),
    ('shrimp',             'shrimp-cooked',             'en'),
    ('tuna',               'tuna-canned-water',         'en'),
    ('salmon',             'salmon-cooked',             'en'),
    ('kale',               'kale-raw',                  'en'),
    ('asparagus',          'asparagus-cup-cooked',      'en'),
    ('blueberries',        'usda-171711',               'en'),
    ('strawberries',       'usda-167762',               'en'),

    -- ── Spanish additions not already in migration 018 ────────────────
    ('avena',              'oats-rolled-dry',           'es'),
    ('avena arrollada',    'oats-rolled-dry',           'es'),
    ('mantequilla de mani',      'peanut-butter',       'es'),
    ('mantequilla de maní',      'peanut-butter',       'es'),
    ('mantequilla de cacahuete', 'peanut-butter',       'es'),
    ('mantequilla de almendra',  'almond-butter',       'es'),
    ('queso cottage',      'cottage-cheese-1pct',       'es'),
    ('requeson',           'cottage-cheese-1pct',       'es'),
    ('requesón',           'cottage-cheese-1pct',       'es'),
    ('quinua',             'quinoa-cooked',             'es'),
    ('camaron',            'shrimp-cooked',             'es'),
    ('camarón',            'shrimp-cooked',             'es'),
    ('camarones',          'shrimp-cooked',             'es'),
    ('pechuga de pavo',    'turkey-breast-cooked',      'es'),
    ('pavo molido',        'usda-171506',               'es'),
    ('chuleta de cerdo',   'usda-168231',               'es'),
    ('lomo de cerdo',      'pork-tenderloin-cooked',    'es'),
    ('carne de res',       'ground-beef-93',            'es'),
    ('col rizada',         'kale-raw',                  'es'),
    ('kale',               'kale-raw',                  'es'),
    ('esparragos',         'asparagus-cup-cooked',      'es'),
    ('espárragos',         'asparagus-cup-cooked',      'es'),
    ('arandanos',          'usda-171711',               'es'),
    ('arándanos',          'usda-171711',               'es'),
    ('fresas',             'usda-167762',               'es'),
    ('frutillas',          'usda-167762',               'es'),
    ('barra de proteina',  'protein-bar-quest',         'es'),
    ('barra de proteína',  'protein-bar-quest',         'es'),
    ('proteina en polvo',  'whey-protein-scoop',        'es'),
    ('proteína en polvo',  'whey-protein-scoop',        'es'),
    ('suero de leche',     'whey-protein-scoop',        'es'),
    ('aceite de oliva extra virgen', 'olive-oil',       'es')
)
insert into food_aliases (alias, food_id, locale)
select c.alias, c.food_id, c.locale
  from candidates c
  join foods f on f.id = c.food_id
on conflict (alias, food_id) do nothing;

-- No columns / policies changed — pure data. `verify-migrations-applied.mjs`
-- treats data-only migrations as trivially applied because it introspects
-- schema, so we don't need a table check here.
