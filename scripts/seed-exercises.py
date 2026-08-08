#!/usr/bin/env python3
"""
seed-exercises.py — one-shot seeder for the `exercises` reference table.

Downloads the compact English-only projection of the hasaneyldrm/exercises-
dataset (MIT-licensed data, Gym Visual-licensed media) and COPYs it into
Postgres via psql. Idempotent — truncates + reseeds.

Prerequisites:
  - psql on PATH
  - apps/web/.env.local populated with SUPABASE_URL, SUPABASE_PROJECT_ID,
    SUPABASE_DB_PASSWORD, and access to the aws-1-<region>.pooler.supabase.com
    Supavisor endpoint
  - migration 003_gym_and_exercises.sql already applied

Usage:
  python3 scripts/seed-exercises.py
  python3 scripts/seed-exercises.py --refresh   # re-download the source JSON

Attribution: media in the dataset is © Gym visual (https://gymvisual.com/).
Rendered surfaces must display the attribution — see apps/mini-apps/gym-
routine/components/AttributionFooter.tsx.
"""
from __future__ import annotations
import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKING_DIR = REPO_ROOT / 'working' / 'exercises'
SOURCE_URL = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json'
IMG_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main'


def load_env(path: Path) -> dict[str, str]:
    """Minimal .env parser — no interpolation, no export prefix."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip()
    return env


def pg_array_literal(items: list[str]) -> str:
    """Format Python list as Postgres text[] literal, escaping " and \\."""
    def esc(s: str) -> str:
        return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
    return '{' + ','.join(esc(str(x)) for x in items) + '}'


def download_source(refresh: bool) -> Path:
    WORKING_DIR.mkdir(parents=True, exist_ok=True)
    dst = WORKING_DIR / 'exercises.json'
    if dst.exists() and not refresh:
        return dst
    print(f'Downloading {SOURCE_URL}...')
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as resp:
        dst.write_bytes(resp.read())
    print(f'  → {dst} ({dst.stat().st_size // 1024} KB)')
    return dst


def transform_to_tsv(source: Path, dst: Path) -> int:
    print(f'Transforming {source} → {dst}...')
    data = json.loads(source.read_text(encoding='utf-8'))
    with dst.open('w', encoding='utf-8') as f:
        for e in data:
            row = [
                e['id'],
                e['name'].replace('\t', ' '),
                e['body_part'],
                e['target'],
                e['equipment'],
                e['muscle_group'],
                pg_array_literal(e['secondary_muscles']),
                pg_array_literal(e['instruction_steps']['en']),
                f"{IMG_BASE}/{e['image']}",
                f"{IMG_BASE}/{e['gif_url']}",
            ]
            row = [str(x).replace('\t', ' ').replace('\r', ' ').replace('\n', ' ') for x in row]
            f.write('\t'.join(row) + '\n')
    return len(data)


def build_db_url(env: dict[str, str]) -> str:
    project_ref = env.get('SUPABASE_PROJECT_ID')
    password = env.get('SUPABASE_DB_PASSWORD')
    if not project_ref or not password:
        sys.exit('Missing SUPABASE_PROJECT_ID or SUPABASE_DB_PASSWORD in .env.local')
    region = env.get('SUPABASE_POOLER_REGION', 'aws-1-eu-west-1')
    encoded_pwd = urllib.parse.quote(password)
    return f'postgresql://postgres.{project_ref}:{encoded_pwd}@{region}.pooler.supabase.com:6543/postgres'


def seed(db_url: str, tsv: Path):
    print('Applying via psql \\copy...')
    sql = (
        'truncate exercises;\n'
        f"\\copy exercises (id, name, body_part, target, equipment, muscle_group, "
        f"secondary_muscles, instruction_steps, image_url, gif_url) "
        f"from '{tsv}' with (format csv, delimiter E'\\t', quote E'\\b');\n"
        "select count(*) as rows_seeded, count(distinct body_part) as body_parts, "
        "count(distinct equipment) as equipment_types from exercises;\n"
    )
    result = subprocess.run(
        ['psql', db_url, '-v', 'ON_ERROR_STOP=1'],
        input=sql, text=True, capture_output=True,
    )
    if result.returncode != 0:
        print('STDERR:', result.stderr)
        sys.exit(result.returncode)
    print(result.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refresh', action='store_true', help='re-download source JSON')
    args = ap.parse_args()

    env = load_env(REPO_ROOT / 'apps' / 'web' / '.env.local')
    if not env:
        sys.exit('apps/web/.env.local not found — see README.md for setup')

    source = download_source(args.refresh)
    tsv = WORKING_DIR / 'exercises.tsv'
    count = transform_to_tsv(source, tsv)
    print(f'  → {count} rows written to {tsv}')

    db_url = build_db_url(env)
    seed(db_url, tsv)


if __name__ == '__main__':
    main()
