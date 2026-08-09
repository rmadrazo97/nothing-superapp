#!/usr/bin/env python3
"""
apply-migration-015.py — one-shot script that applies 015_copilot_threads.sql
to prod using the same env / psql pattern as seed-foods.py.

Idempotent: the migration uses `create table if not exists` + `drop policy
if exists` throughout, so re-running is safe.
"""
from __future__ import annotations
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        k, _, v = s.partition('=')
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def build_db_url(env: dict[str, str]) -> str:
    ref = env.get('SUPABASE_PROJECT_ID')
    pwd = env.get('SUPABASE_DB_PASSWORD')
    if not ref or not pwd:
        sys.exit('Missing SUPABASE_PROJECT_ID or SUPABASE_DB_PASSWORD in apps/web/.env.local')
    return f'postgresql://postgres.{ref}:{urllib.parse.quote(pwd)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'


def main() -> None:
    env = load_env(REPO_ROOT / 'apps' / 'web' / '.env.local')
    db_url = build_db_url(env)
    migration = REPO_ROOT / 'supabase' / 'migrations' / '015_copilot_threads.sql'
    if not migration.exists():
        sys.exit(f'Migration not found: {migration}')
    result = subprocess.run(
        ['psql', db_url, '-v', 'ON_ERROR_STOP=1', '-f', str(migration)],
        text=True, capture_output=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print('STDERR:', result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
    # Confirm the tables exist.
    verify = subprocess.run(
        ['psql', db_url, '-v', 'ON_ERROR_STOP=1', '-c',
         "select relname, (select count(*) from pg_policies where tablename=relname) as policies "
         "from pg_class where relname in ('copilot_threads','copilot_messages') and relkind='r' "
         "order by relname;"],
        text=True, capture_output=True,
    )
    print(verify.stdout)


if __name__ == '__main__':
    main()
