#!/usr/bin/env python3
"""
seed-reference-meal-plan.py — insert the reference nutritionist plan
(diet-jam-v1) into meal_plans for jmadrazo7@gmail.com.

Reads apps/mini-apps/calorie-lite/fixtures/diet-jam-v1.json, looks up the
user by email from auth.users, and inserts one row into meal_plans (or
updates if a plan with the same name already exists for that user).

The plan is NOT auto-activated — the user picks "Activate" from the PLAN
tab so onboarding is intentional.

Usage:  python3 scripts/seed-reference-meal-plan.py
"""
from __future__ import annotations
import json
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE = REPO_ROOT / 'apps' / 'mini-apps' / 'calorie-lite' / 'fixtures' / 'diet-jam-v1.json'
EMAIL = 'jmadrazo7@gmail.com'
PLAN_NAME = 'Diet Jam v1'


def load_env(path: Path) -> dict[str, str]:
    env = {}
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
    ref = env.get('SUPABASE_PROJECT_ID')
    pwd = env.get('SUPABASE_DB_PASSWORD')
    if not ref or not pwd:
        sys.exit('Missing SUPABASE_PROJECT_ID or SUPABASE_DB_PASSWORD in apps/web/.env.local')
    return f'postgresql://postgres.{ref}:{urllib.parse.quote(pwd)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'


def seed(db_url: str, plan: dict) -> None:
    # Serialize the fixture once for pg parameter binding.
    plan_json = json.dumps(plan['plan'], ensure_ascii=False)
    source_json = json.dumps(plan.get('source', {}), ensure_ascii=False)
    athlete_json = json.dumps(plan.get('athlete', {}), ensure_ascii=False)
    notes = plan.get('parsing_notes', [])
    # Escape single quotes for text[] literal — the fixture text is safe but be
    # defensive.
    notes_pg = 'ARRAY[' + ','.join(
        "'" + n.replace("'", "''") + "'" for n in notes
    ) + ']::text[]' if notes else "'{}'::text[]"

    sql = f"""
begin;

with target as (
  select id from auth.users where email = '{EMAIL}' limit 1
)
insert into meal_plans (user_id, name, schema_version, plan, source, athlete, parsing_notes)
select
  target.id,
  '{PLAN_NAME}',
  '1.0',
  $mp${plan_json}$mp$::jsonb,
  $ms${source_json}$ms$::jsonb,
  $ma${athlete_json}$ma$::jsonb,
  {notes_pg}
from target
on conflict do nothing
returning id, name;

-- If a plan with that name already exists for the user, refresh its jsonb so
-- re-runs pick up fixture edits.
with target as (
  select id from auth.users where email = '{EMAIL}' limit 1
)
update meal_plans set
  plan = $mp${plan_json}$mp$::jsonb,
  source = $ms${source_json}$ms$::jsonb,
  athlete = $ma${athlete_json}$ma$::jsonb,
  parsing_notes = {notes_pg}
from target
where meal_plans.user_id = target.id and meal_plans.name = '{PLAN_NAME}'
returning meal_plans.id, meal_plans.name;

select count(*) as user_plans from meal_plans
where user_id = (select id from auth.users where email = '{EMAIL}');

commit;
"""
    result = subprocess.run(
        ['psql', db_url, '-v', 'ON_ERROR_STOP=1'],
        input=sql, text=True, capture_output=True,
    )
    if result.returncode != 0:
        print('STDERR:', result.stderr)
        sys.exit(result.returncode)
    print(result.stdout)


def main():
    env = load_env(REPO_ROOT / 'apps' / 'web' / '.env.local')
    db_url = build_db_url(env)
    plan = json.loads(FIXTURE.read_text(encoding='utf-8'))
    seed(db_url, plan)


if __name__ == '__main__':
    main()
