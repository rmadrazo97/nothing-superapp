# USDA FoodData Central — SR Legacy ingest

`seed-usda-foods.py` bulk-loads the **USDA FoodData Central Standard Reference
(SR) Legacy** dataset into the `foods` reference table. SR Legacy is the
final release of the classic USDA nutrient database — the same table
MyFitnessPal, Cronometer, and every serious tracker eventually ships against.

## What it produces

- ~7,700 foods keyed as `usda-<fdc_id>` (unique + traceable back to the
  source), per-100 g nutrient facts, mapped into our 8-value `category`
  enum (`protein | grain | veg | fruit | dairy | fat | sweet | drink`) or
  `NULL` for USDA groups that don't fit (soups, spices, baby foods, etc.
  — still fully searchable, just uncategorized).
- Curated rows (`source = 'curated'`) are **never touched** — the UPSERT
  has a `where foods.source <> 'curated'` guard.

## Source

- **Release:** USDA SR Legacy `2018-04` (last packaged 2023-10).
- **URL:** <https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip>
  (6 MB zipped, 54 MB unzipped)
- **License:** Public domain (U.S. federal government work — no attribution
  required, but a tasteful "Nutrition data: USDA FoodData Central, SR Legacy
  2018-04" line in an About screen is the polite move.)
- **Update cadence:** USDA has stated SR Legacy will not be updated further.
  The Foundation Foods and Branded Foods datasets are the newer replacements;
  we intentionally skip Branded (400k+ rows, mostly noise) for v1.

## How the script works

1. **Download.** `.cache/usda/sr_legacy_2018-04.zip` — cached; re-run is a
   no-op unless you pass `--force-download`. The URL is fetched with a
   `Mozilla/5.0` UA because plain `curl` gets 403'd by USDA's fronting
   Akamai instance on unusual user agents.
2. **Extract.** Unzips into `.cache/usda/FoodData_Central_sr_legacy_food_csv_2018-04/`
   (git-ignored — see `.gitignore` `.cache/`).
3. **Parse.** Reads four CSVs:
   - `food_category.csv` — 28 USDA-native groups (dictionary).
   - `food.csv` — 7,793 SR Legacy foods (`fdc_id, data_type, description, food_category_id`).
   - `nutrient.csv` — nutrient dictionary (verified our IDs against it).
   - `food_nutrient.csv` — 644k `(fdc_id, nutrient_id, amount)` facts;
     we filter down to the 9 nutrient IDs we care about in a single pass.
4. **Map nutrients.** Canonical USDA nutrient IDs (verified against the
   actual `nutrient.csv` in the download):

   | ID   | Nutrient                    | Column           |
   |------|-----------------------------|------------------|
   | 1008 | Energy (kcal) — primary     | `kcal`           |
   | 2047 | Energy (Atwater General)    | `kcal` fallback  |
   | 2048 | Energy (Atwater Specific)   | `kcal` fallback  |
   | 1003 | Protein (g)                 | `protein_g`      |
   | 1005 | Carbohydrate, by difference | `carbs_g`        |
   | 1004 | Total lipid (fat) (g)       | `fat_g`          |
   | 1079 | Fiber, total dietary (g)    | `fiber_g`        |
   | 2000 | Sugars, Total (g)           | `sugar_g`        |
   | 1093 | Sodium, Na (mg)             | `sodium_mg`      |
   | 1253 | Cholesterol (mg)            | `cholesterol_mg` |

   Some rows omit `1008` and only carry Atwater energies; we fall back
   through `1008 → 2047 → 2048 → 0`.
5. **Map categories.** USDA's 28 `food_category.description` values collapse
   to our 8-value enum. See `CATEGORY_MAP` in the script; nuts and oils
   land in `fat`, eggs in `dairy`, alcohol in `drink`, everything without
   a clean bucket (soups, spices, baby foods, fast foods, entrees,
   restaurant foods, American Indian/Alaska Native foods) stays `NULL`.
6. **Stage + UPSERT.** Writes a TSV to `working/usda-foods/usda_foods.tsv`
   (git-ignored), `psql \copy`s it into a temp `_foods_usda_stage` table,
   then `INSERT … ON CONFLICT (id) DO UPDATE SET … WHERE foods.source <>
   'curated'`. Full run against the Supabase pooler completes in ~2 seconds.

## Row counts after seed

```
foods total: 7946
 source         | count
----------------+-------
 usda_sr_legacy | 7793
 curated        |  153
```

Categories on the USDA side:

```
 protein | 2858
 (null)  | 1329
 grain   |  893
 veg     |  814
 sweet   |  534
 drink   |  366
 fruit   |  355
 fat     |  353
 dairy   |  291
```

## Usage

```bash
# Dry run — parses everything, previews 10 rows, doesn't touch the DB.
python3 scripts/seed-usda-foods.py --dry-run

# Preview a small slice with a real DB round-trip:
python3 scripts/seed-usda-foods.py --limit 50

# Full seed (idempotent — safe to re-run):
python3 scripts/seed-usda-foods.py

# Force fresh download (if USDA ever re-releases):
python3 scripts/seed-usda-foods.py --force-download
```

Requires `SUPABASE_PROJECT_ID` + `SUPABASE_DB_PASSWORD` in
`apps/web/.env.local` and `psql` on `PATH`.

## Refreshing

SR Legacy is frozen at `2018-04` — there won't be a new release. To move
to Foundation Foods (~300 gold-standard entries) or Branded Foods later,
add a sibling `seed-usda-foundation.py` / `seed-usda-branded.py`; the
same staging + `source <> 'curated'` UPSERT pattern applies. Use a
distinct `source` value (`usda_foundation`, `usda_branded`) so future
scripts can target their own slice.

## Gotchas learned

- **User-Agent guard.** Bare `curl` gets 403 from `www.usda.gov` because
  Akamai fronts that host; hitting `fdc.nal.usda.gov` directly with any
  UA string works. Script uses `Mozilla/5.0`.
- **Kcal fallbacks.** Some SR Legacy rows carry only Atwater energies
  (`2047` / `2048`) rather than the modern `1008` — always walk the
  fallback chain.
- **Uncategorized is fine.** ~1,300 rows have no `category` (soups,
  spices, ethnic foods, fast foods with mixed macros). They're still
  searchable — the ILIKE/trgm index doesn't care about `category`.
- **Trgm index vs. small table.** With ~8k rows the planner still chooses
  seq scan for short substring queries (~10 ms). The GIN trgm index
  earns its keep once we're doing `similarity()` scoring at scale or if
  we ever add Foundation + Branded on top.
- **Guard the curated rows.** The `WHERE foods.source <> 'curated'`
  guard on the UPSERT is the load-bearing bit — without it a re-run
  would overwrite our hand-curated serving labels (`1 slice (28 g)`,
  `1 medium (118 g)`, etc.) with the generic `100 g` from USDA.
