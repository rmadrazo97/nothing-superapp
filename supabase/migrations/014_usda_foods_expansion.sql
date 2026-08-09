-- 014_usda_foods_expansion.sql — widen `foods` for the USDA SR Legacy import.
-- Applied 2026-08-09.
--
-- Adds columns to track USDA-sourced rows alongside our curated 153. Keeps the
-- existing `id text` PK — curated rows stay kebab-case slugs (chicken-breast-cooked),
-- USDA rows are keyed as `usda-<fdc_id>` for uniqueness + traceability.
--
-- Trigram GIN index on lower(name) makes ILIKE / similarity search performant
-- across the projected ~17k rows once the seed lands.
--
-- Idempotent: safe to re-run.

-- pg_trgm powers the GIN index used by search_foods for fuzzy matching.
create extension if not exists pg_trgm;

-- USDA FoodData Central id (nullable — curated rows stay null).
alter table foods add column if not exists usda_fdc_id integer;

-- provenance: curated | usda_sr_legacy | usda_foundation | usda_branded | openfoodfacts
alter table foods add column if not exists source text not null default 'curated';

-- USDA data_type (sr_legacy_food, foundation_food, ...). Null for curated rows.
alter table foods add column if not exists data_type text;

-- USDA scientific name (often present for whole foods).
alter table foods add column if not exists scientific_name text;

-- USDA-native food group (finer-grained than our 8-value `category`).
alter table foods add column if not exists food_group text;

create index if not exists foods_usda_fdc_id_idx on foods (usda_fdc_id);
create index if not exists foods_source_idx on foods (source);
create index if not exists foods_name_trgm_idx on foods using gin (lower(name) gin_trgm_ops);
