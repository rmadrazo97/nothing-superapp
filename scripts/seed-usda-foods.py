#!/usr/bin/env python3
"""
seed-usda-foods.py — bulk-ingest USDA FoodData Central SR Legacy foods.

Downloads the SR Legacy CSV bundle (public domain, no key), parses food.csv +
nutrient.csv + food_nutrient.csv + food_category.csv into per-100g rows, and
UPSERTs them into the `foods` table keyed as `usda-<fdc_id>`.

Idempotent — rerun to refresh values without duplicating rows. Curated rows
(source='curated', kebab-case ids) are never touched.

Usage:
  python3 scripts/seed-usda-foods.py [--dry-run] [--limit N] [--force-download]

Env (from apps/web/.env.local):
  SUPABASE_PROJECT_ID
  SUPABASE_DB_PASSWORD
"""
from __future__ import annotations

import argparse
import csv
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / '.cache' / 'usda'
WORKING_DIR = REPO_ROOT / 'working' / 'usda-foods'

# USDA SR Legacy CSV bundle — released April 2018, last packaging update 2023-10.
# "SR Legacy is the final release of the Standard Reference data type. These
#  data will not be updated." — USDA FDC download page
USDA_RELEASE = '2018-04'
USDA_ZIP_URL = f'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_{USDA_RELEASE}.zip'
USDA_ZIP_FILE = CACHE_DIR / f'sr_legacy_{USDA_RELEASE}.zip'
USDA_EXTRACT_SUBDIR = f'FoodData_Central_sr_legacy_food_csv_{USDA_RELEASE}'

# Canonical USDA nutrient IDs (verified against the SR Legacy nutrient.csv).
#   1008 = Energy (kcal)            — primary; some rows use 2047/2048 instead
#   2047 = Energy (Atwater General Factors, kcal)
#   2048 = Energy (Atwater Specific Factors, kcal)
NUTRIENT_KCAL_PRIMARY = 1008
NUTRIENT_KCAL_FALLBACKS = (2047, 2048)
NUTRIENT_PROTEIN = 1003         # g
NUTRIENT_CARBS = 1005           # g (by difference)
NUTRIENT_FAT = 1004             # g (total lipid)
NUTRIENT_FIBER = 1079           # g
NUTRIENT_SUGAR = 2000           # g (total sugars)
NUTRIENT_SODIUM = 1093          # mg
NUTRIENT_CHOLESTEROL = 1253     # mg

WANTED_NUTRIENTS: set[int] = {
    NUTRIENT_KCAL_PRIMARY, *NUTRIENT_KCAL_FALLBACKS,
    NUTRIENT_PROTEIN, NUTRIENT_CARBS, NUTRIENT_FAT,
    NUTRIENT_FIBER, NUTRIENT_SUGAR, NUTRIENT_SODIUM, NUTRIENT_CHOLESTEROL,
}

# Map USDA food_category.description → our 8-value `category` enum.
# Nuts skew fat-heavy → 'fat'. Eggs live in dairy for app simplicity.
CATEGORY_MAP: dict[str, str | None] = {
    # protein
    'Poultry Products': 'protein',
    'Beef Products': 'protein',
    'Pork Products': 'protein',
    'Lamb, Veal, and Game Products': 'protein',
    'Finfish and Shellfish Products': 'protein',
    'Sausages and Luncheon Meats': 'protein',
    'Legumes and Legume Products': 'protein',
    # fat (nuts/seeds are macro-fat by weight)
    'Nut and Seed Products': 'fat',
    'Fats and Oils': 'fat',
    # grain
    'Cereal Grains and Pasta': 'grain',
    'Baked Products': 'grain',
    'Breakfast Cereals': 'grain',
    # veg
    'Vegetables and Vegetable Products': 'veg',
    # fruit
    'Fruits and Fruit Juices': 'fruit',
    # dairy (eggs collapsed in)
    'Dairy and Egg Products': 'dairy',
    # sweet
    'Sweets': 'sweet',
    'Snacks': 'sweet',
    # drink
    'Beverages': 'drink',
    'Alcoholic Beverages': 'drink',
    # uncategorized (still searchable, category NULL)
    'Soups, Sauces, and Gravies': None,
    'Baby Foods': None,
    'Fast Foods': None,
    'Meals, Entrees, and Side Dishes': None,
    'Restaurant Foods': None,
    'American Indian/Alaska Native Foods': None,
    'Spices and Herbs': None,
    'Quality Control Materials': None,
    'Branded Food Products Database': None,
}


# ────────────────────────────────────────────────────────────────
# env / db url
# ────────────────────────────────────────────────────────────────
def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        k, _, v = s.partition('=')
        env[k.strip()] = v.strip()
    return env


def build_db_url(env: dict[str, str]) -> str:
    ref = env.get('SUPABASE_PROJECT_ID') or os.environ.get('SUPABASE_PROJECT_ID')
    pwd = env.get('SUPABASE_DB_PASSWORD') or os.environ.get('SUPABASE_DB_PASSWORD')
    if not ref or not pwd:
        sys.exit('Missing SUPABASE_PROJECT_ID or SUPABASE_DB_PASSWORD in apps/web/.env.local')
    return f'postgresql://postgres.{ref}:{urllib.parse.quote(pwd)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'


# ────────────────────────────────────────────────────────────────
# download + extract
# ────────────────────────────────────────────────────────────────
def ensure_download(force: bool = False) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if force or not USDA_ZIP_FILE.exists():
        print(f'downloading {USDA_ZIP_URL} …')
        req = urllib.request.Request(USDA_ZIP_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as r, USDA_ZIP_FILE.open('wb') as f:
            f.write(r.read())
        size_mb = USDA_ZIP_FILE.stat().st_size / (1024 * 1024)
        print(f'  saved {USDA_ZIP_FILE} ({size_mb:.1f} MB)')
    else:
        size_mb = USDA_ZIP_FILE.stat().st_size / (1024 * 1024)
        print(f'cache hit: {USDA_ZIP_FILE} ({size_mb:.1f} MB)')
    extract_dir = CACHE_DIR / USDA_EXTRACT_SUBDIR
    if not extract_dir.exists() or not (extract_dir / 'food.csv').exists():
        print(f'extracting → {CACHE_DIR}')
        with zipfile.ZipFile(USDA_ZIP_FILE) as z:
            z.extractall(CACHE_DIR)
    return extract_dir


# ────────────────────────────────────────────────────────────────
# parse
# ────────────────────────────────────────────────────────────────
def load_categories(extract_dir: Path) -> dict[int, str]:
    """category_id → USDA description string (e.g. 'Poultry Products')."""
    out: dict[int, str] = {}
    with (extract_dir / 'food_category.csv').open(newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            out[int(row['id'])] = row['description']
    return out


def load_foods(extract_dir: Path, categories: dict[int, str]) -> dict[int, dict]:
    """
    fdc_id → {description, data_type, category_id, food_group}
    Only sr_legacy_food rows are kept.
    """
    out: dict[int, dict] = {}
    with (extract_dir / 'food.csv').open(newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if row['data_type'] != 'sr_legacy_food':
                continue
            fdc_id = int(row['fdc_id'])
            cat_id_raw = row['food_category_id']
            cat_id = int(cat_id_raw) if cat_id_raw else None
            out[fdc_id] = {
                'description': row['description'],
                'data_type': row['data_type'],
                'category_id': cat_id,
                'food_group': categories.get(cat_id) if cat_id else None,
            }
    return out


def load_nutrient_facts(extract_dir: Path, fdc_ids: set[int]) -> dict[int, dict[int, float]]:
    """
    fdc_id → {nutrient_id → amount (per 100 g of edible portion)}
    Filters to WANTED_NUTRIENTS and to fdc_ids we care about.
    """
    out: dict[int, dict[int, float]] = {}
    path = extract_dir / 'food_nutrient.csv'
    with path.open(newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        # header: id, fdc_id, nutrient_id, amount, ...
        i_fdc = header.index('fdc_id')
        i_nut = header.index('nutrient_id')
        i_amt = header.index('amount')
        for row in reader:
            try:
                fdc = int(row[i_fdc])
                nut = int(row[i_nut])
            except (ValueError, IndexError):
                continue
            if fdc not in fdc_ids or nut not in WANTED_NUTRIENTS:
                continue
            amt_raw = row[i_amt]
            if not amt_raw:
                continue
            try:
                amt = float(amt_raw)
            except ValueError:
                continue
            out.setdefault(fdc, {})[nut] = amt
    return out


def pick_kcal(facts: dict[int, float]) -> float:
    for nid in (NUTRIENT_KCAL_PRIMARY, *NUTRIENT_KCAL_FALLBACKS):
        if nid in facts:
            return facts[nid]
    return 0.0


def build_rows(
    foods: dict[int, dict],
    facts_by_fdc: dict[int, dict[int, float]],
) -> list[tuple]:
    """
    Yields tuples matching the staging table column order:
      (id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g,
       fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, category,
       usda_fdc_id, source, data_type, scientific_name, food_group)
    """
    rows: list[tuple] = []
    for fdc_id, meta in foods.items():
        facts = facts_by_fdc.get(fdc_id, {})
        food_group = meta['food_group']
        category = CATEGORY_MAP.get(food_group) if food_group else None
        rows.append((
            f'usda-{fdc_id}',
            meta['description'],
            '',                                         # brand (null)
            100.0,
            '100 g',
            round(pick_kcal(facts), 2),
            round(facts.get(NUTRIENT_PROTEIN, 0.0), 2),
            round(facts.get(NUTRIENT_CARBS, 0.0), 2),
            round(facts.get(NUTRIENT_FAT, 0.0), 2),
            round(facts.get(NUTRIENT_FIBER, 0.0), 2),
            round(facts.get(NUTRIENT_SUGAR, 0.0), 2),
            round(facts.get(NUTRIENT_SODIUM, 0.0), 2),
            round(facts.get(NUTRIENT_CHOLESTEROL, 0.0), 2),
            category or '',
            fdc_id,
            'usda_sr_legacy',
            meta['data_type'],
            '',                                         # scientific_name (not in food.csv)
            food_group or '',
        ))
    return rows


def write_tsv(rows: list[tuple], dst: Path) -> None:
    with dst.open('w', encoding='utf-8') as f:
        for row in rows:
            cleaned = [
                str(v).replace('\t', ' ').replace('\r', ' ').replace('\n', ' ')
                for v in row
            ]
            f.write('\t'.join(cleaned) + '\n')


# ────────────────────────────────────────────────────────────────
# seed
# ────────────────────────────────────────────────────────────────
SEED_SQL_TEMPLATE = r'''
begin;

create temp table _foods_usda_stage (
  id text, name text, brand text, serving_g numeric, serving_label text,
  kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
  fiber_g numeric, sugar_g numeric, sodium_mg numeric, cholesterol_mg numeric,
  category text,
  usda_fdc_id integer, source text, data_type text,
  scientific_name text, food_group text
) on commit drop;

\copy _foods_usda_stage from '{tsv}' with (format csv, delimiter E'\t', quote E'\b', null '')

insert into foods (
  id, name, brand, serving_g, serving_label,
  kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg,
  category, usda_fdc_id, source, data_type, scientific_name, food_group
)
select
  id, name, nullif(brand, ''), serving_g, serving_label,
  kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg,
  nullif(category, ''), usda_fdc_id, source, data_type,
  nullif(scientific_name, ''), nullif(food_group, '')
from _foods_usda_stage
on conflict (id) do update set
  name            = excluded.name,
  serving_g       = excluded.serving_g,
  serving_label   = excluded.serving_label,
  kcal            = excluded.kcal,
  protein_g       = excluded.protein_g,
  carbs_g         = excluded.carbs_g,
  fat_g           = excluded.fat_g,
  fiber_g         = excluded.fiber_g,
  sugar_g         = excluded.sugar_g,
  sodium_mg       = excluded.sodium_mg,
  cholesterol_mg  = excluded.cholesterol_mg,
  category        = excluded.category,
  usda_fdc_id     = excluded.usda_fdc_id,
  source          = excluded.source,
  data_type       = excluded.data_type,
  scientific_name = excluded.scientific_name,
  food_group      = excluded.food_group
where foods.source <> 'curated';   -- never overwrite hand-curated rows

commit;

select 'foods total: ' || count(*) from foods;
select source, count(*) from foods group by source order by 2 desc;
select category, count(*) from foods where source = 'usda_sr_legacy' group by category order by 2 desc;
'''


def run_seed(db_url: str, tsv: Path) -> None:
    sql = SEED_SQL_TEMPLATE.format(tsv=tsv)
    t0 = time.time()
    result = subprocess.run(
        ['psql', db_url, '-v', 'ON_ERROR_STOP=1'],
        input=sql, text=True, capture_output=True,
    )
    elapsed = time.time() - t0
    if result.returncode != 0:
        print('STDERR:', result.stderr)
        sys.exit(result.returncode)
    print(result.stdout)
    print(f'seed complete in {elapsed:.1f}s')


# ────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true',
                    help='parse + write TSV + preview 10 rows; skip DB seed')
    ap.add_argument('--limit', type=int, default=0,
                    help='limit to N rows (for testing)')
    ap.add_argument('--force-download', action='store_true',
                    help='re-download USDA zip even if cached')
    args = ap.parse_args()

    extract_dir = ensure_download(force=args.force_download)

    print('loading categories…')
    categories = load_categories(extract_dir)
    print(f'  {len(categories)} categories')

    print('loading foods (sr_legacy_food only)…')
    foods = load_foods(extract_dir, categories)
    print(f'  {len(foods)} foods')

    print('loading nutrient facts (this scans ~644k rows)…')
    t0 = time.time()
    facts = load_nutrient_facts(extract_dir, set(foods.keys()))
    print(f'  {len(facts)} foods with nutrient facts in {time.time() - t0:.1f}s')

    print('building rows…')
    rows = build_rows(foods, facts)
    if args.limit:
        rows = rows[: args.limit]
        print(f'  --limit {args.limit} → {len(rows)} rows')
    print(f'  {len(rows)} rows ready')

    # sanity: category breakdown
    from collections import Counter
    cat_hits = Counter(r[13] or '(null)' for r in rows)
    print('  category breakdown:')
    for cat, n in cat_hits.most_common():
        print(f'    {cat:>16}  {n}')

    WORKING_DIR.mkdir(parents=True, exist_ok=True)
    tsv = WORKING_DIR / 'usda_foods.tsv'
    write_tsv(rows, tsv)
    tsv_mb = tsv.stat().st_size / (1024 * 1024)
    print(f'wrote {tsv} ({tsv_mb:.1f} MB)')

    print('preview (first 10):')
    for r in rows[:10]:
        # id | name | kcal | p | c | f | category
        print(f'  {r[0]:>16}  kcal={r[5]:>6.1f}  p={r[6]:>5.1f}  c={r[7]:>5.1f}  '
              f'f={r[8]:>5.1f}  [{r[13] or "-":>7}]  {r[1][:60]}')

    if args.dry_run:
        print('\n--dry-run: skipping DB seed')
        return

    env = load_env(REPO_ROOT / 'apps' / 'web' / '.env.local')
    db_url = build_db_url(env)
    print(f'\nseeding to Supabase pooler…')
    run_seed(db_url, tsv)


if __name__ == '__main__':
    main()
