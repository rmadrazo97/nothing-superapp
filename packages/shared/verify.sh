#!/usr/bin/env bash
# Verify @nothing/shared: typecheck + runtime import resolution.
# Exit 0 = green; anything else = broken.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# 1. Install deps locally if missing (idempotent, quiet).
if [ ! -d "node_modules/zod" ] || [ ! -x "node_modules/.bin/tsc" ]; then
  echo "[verify] installing dependencies (zod + typescript)..."
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --silent --ignore-workspace
    [ -x "node_modules/.bin/tsc" ] || pnpm add -D typescript@^5.4.0 --silent --ignore-workspace
  else
    npm install --silent --no-audit --no-fund
    [ -x "node_modules/.bin/tsc" ] || npm install --silent --no-audit --no-fund --save-dev typescript@^5.4.0
  fi
fi

# 2. Typecheck (noEmit).
echo "[verify] tsc --noEmit"
./node_modules/.bin/tsc --noEmit

# 3. Runtime import — Node 22+ can strip TS types natively.
echo "[verify] runtime import smoke test"
node --experimental-strip-types --input-type=module -e "
import('./src/index.ts').then((m) => {
  if (!m.EVENT_KINDS) { throw new Error('EVENT_KINDS missing'); }
  if (m.EVENT_KINDS.calorie_entry_added !== 'calorie.entry.added') {
    throw new Error('EVENT_KINDS.calorie_entry_added wrong');
  }
  m.profileSchema.parse({
    id: '00000000-0000-0000-0000-000000000000',
    display_name: null,
    locale: 'EN',
    created_at: '2026-08-07T00:00:00Z',
    updated_at: '2026-08-07T00:00:00Z'
  });
  m.calorieEntrySchema.parse({
    id: '11111111-1111-1111-1111-111111111111',
    user_id: '00000000-0000-0000-0000-000000000000',
    entered_at: '2026-08-07T00:00:00Z',
    meal: 'breakfast',
    raw_input: 'oatmeal',
    kcal: 350,
    protein_g: 10,
    carbs_g: 60,
    fat_g: 8
  });
  console.log('ok');
}).catch((e) => { console.error(e); process.exit(1); });
"

echo "[verify] all checks passed"
