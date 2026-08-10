-- Migration 023 — Food search ranking overhaul (v0.5.3 · #97)
--
-- Problem:
--   After migration 014 pulled ~500+ USDA rows into `foods`, searching for a
--   common query like "sweet potato" or "chicken" started leading with
--   variant rows that only a data engineer wants — "Babyfood, junior,
--   sweet potato", "Sweet potatoes, frozen, unprepared", "Fast foods,
--   chicken tenders". The canonical `Sweet potato, baked` and
--   `Chicken breast, cooked` rows were buried below the fold. This kills
--   MFP-parity — the whole point of the seed catalog is that "chicken" one-
--   tap-logs a real serving of chicken breast.
--
-- Fix — two additive columns on `foods`:
--   1. `rank_penalty int` (default 0) — bigger = worse. Non-canonical
--      variants (babyfood, alcoholic-with-brand, "*, strained/junior",
--      "*, frozen, unprepared", "Fast foods, <chain>", "Agutuk, *") get
--      penalty >= 100 so they never lead a search for a bare noun. Ties
--      resolved by `name asc` so within a penalty bucket the ordering
--      stays deterministic.
--   2. `is_canonical bool` (default false) — the small, curated whitelist
--      of "if you type 'chicken', this is the row we want to show". Seeded
--      to true for the ~200-500 rows in `packages/shared/canonical-foods.json`
--      via the backfill script `scripts/rank-foods.mjs`. Canonical rows
--      also get `rank_penalty = 0` regardless of pattern matches.
--
-- Query path:
--   The `foods` search endpoint (apps/web/src/app/api/mini-apps/calorie-lite/
--   foods/route.ts) now orders by
--     ORDER BY (similarity(lower(name), $1) * boost) DESC,
--              rank_penalty ASC,
--              name ASC
--   where `boost` is a JS-computed 3× for a prefix match, 2× for a
--   word-initial match, 1× otherwise (see route.ts). Boost has to happen
--   client-side because Supabase's PostgREST layer doesn't cleanly expose
--   the similarity function as a sortable expression; we compensate by
--   fetching a wider window and sorting in-process.
--
-- Backfill:
--   `scripts/rank-foods.mjs` reads canonical-foods.json + applies the
--   pattern-based penalties. Idempotent — safe to re-run when we add rows.
--
-- Rollback:
--   The columns are additive with defaults, so the previous ORDER BY (by
--   name ASC) still works if a future migration drops them. No data loss.

alter table foods
  add column if not exists rank_penalty  int  not null default 0;

alter table foods
  add column if not exists is_canonical  boolean not null default false;

-- Partial + filtered indexes keep the search path cheap without bloating
-- the base table. `rank_penalty` is queried on every search; `is_canonical`
-- is used by the assistant's smart-search prompt filtering.
create index if not exists foods_rank_penalty_idx
  on foods (rank_penalty);

create index if not exists foods_canonical_idx
  on foods (is_canonical)
  where is_canonical = true;

-- Pattern-based demotion — applied here as a SQL-only baseline so a fresh
-- DB gets sensible ranking even if the backfill script hasn't been run.
-- The backfill script re-applies these plus adds the canonical whitelist.
--
-- Weights:
--   200 — babyfood / strained-or-junior / frozen-unprepared → almost never
--         what a normal search wants.
--   150 — alcoholic beverages with a brand ("Alcoholic beverage, wine,
--         table, red, Merlot"). Users searching "wine" want the generic row.
--   150 — fast-food chain rows ("Fast foods, <chain>, ...") — the chain
--         name in the string dilutes fuzzy matches.
--   150 — Agutuk, * (an Alaska Native dessert; a legitimate USDA row but
--         will otherwise always outscore "avocado" on partial substring).
--
-- Idempotent — the update runs the max between existing + pattern-derived
-- so a re-run of the migration doesn't lower a previously-tuned value.

update foods
   set rank_penalty = greatest(rank_penalty, 200)
 where name ilike 'Babyfood,%'
    or name ilike '%, strained%'
    or name ilike '%, junior%'
    or name ilike '%, frozen, unprepared%';

update foods
   set rank_penalty = greatest(rank_penalty, 150)
 where (name ilike 'Alcoholic beverage,%' and name ~* ',[^,]+,[^,]+,[^,]+')
    or name ilike 'Fast foods,%'
    or name ilike 'Agutuk,%';

-- Downgrade: nothing to do here — canonical seeding lives in the backfill
-- script so the migration stays hermetic (no dependency on repo files).
