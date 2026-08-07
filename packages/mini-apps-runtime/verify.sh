#!/usr/bin/env bash
# Verify @nothing/mini-apps-runtime: typecheck + runtime smoke test.
# Exit 0 = green; anything else = broken.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# 1. Install deps locally if missing (idempotent, quiet).
#    We install workspace-aware so @nothing/shared + react types resolve.
if [ ! -x "node_modules/.bin/tsc" ] || [ ! -d "node_modules/@nothing/shared" ] || [ ! -d "node_modules/@types/react" ]; then
  echo "[verify] installing dependencies..."
  if command -v pnpm >/dev/null 2>&1; then
    # Install from workspace root so pnpm links @nothing/shared correctly.
    (cd ../.. && pnpm install --silent)
  else
    npm install --silent --no-audit --no-fund
  fi
fi

# 2. Typecheck (noEmit).
echo "[verify] tsc --noEmit"
./node_modules/.bin/tsc --noEmit

# 3. Runtime smoke test — Node 22+ can strip TS types natively.
#    We test the pure-TS modules (event-bus, manifest, registry).
#    shared-context.tsx needs a React runtime + JSX transform, so we only
#    typecheck it, not runtime-import it here.
echo "[verify] runtime import smoke test"
node --experimental-strip-types --input-type=module -e "
import { createEventBus } from './src/event-bus.ts';
import { defineMiniApp } from './src/manifest.ts';
import { filterByRoute, requiresSubscription } from './src/registry.ts';

// event bus: emit + subscribe + unsubscribe
const bus = createEventBus();
let heard = null;
const unsub = bus.subscribe('calorie.entry.added', (p) => { heard = p; });
bus.emit('calorie.entry.added', { kcal: 100 });
if (!heard || heard.kcal !== 100) { throw new Error('event bus emit/subscribe broken'); }
if (bus._handlerCount('calorie.entry.added') !== 1) { throw new Error('handler count wrong'); }
unsub();
if (bus._handlerCount('calorie.entry.added') !== 0) { throw new Error('unsubscribe broken'); }

// manifest: happy path
const m = defineMiniApp({
  slug: 'calorie-lite',
  name: 'Calorie',
  icon: '<svg/>',
  route: '/app/calorie',
});
if (m.requiresSubscription !== true) { throw new Error('defineMiniApp default requiresSubscription broken'); }

// manifest: rejects bad slug
let threw = false;
try { defineMiniApp({ slug: 'Bad_Slug', name: 'x', icon: 'x', route: '/app/x' }); }
catch { threw = true; }
if (!threw) { throw new Error('defineMiniApp should reject bad slug'); }

// manifest: rejects bad route
threw = false;
try { defineMiniApp({ slug: 'ok', name: 'x', icon: 'x', route: '/wrong/x' }); }
catch { threw = true; }
if (!threw) { throw new Error('defineMiniApp should reject bad route'); }

// registry helpers
const reg = [m];
const found = filterByRoute(reg, '/app/calorie');
if (!found || found.slug !== 'calorie-lite') { throw new Error('filterByRoute broken'); }
if (filterByRoute(reg, '/app/missing') !== undefined) { throw new Error('filterByRoute should return undefined'); }
if (requiresSubscription(m) !== true) { throw new Error('requiresSubscription default broken'); }
if (requiresSubscription({ ...m, requiresSubscription: false }) !== false) { throw new Error('requiresSubscription false-case broken'); }

console.log('ok');
" || { echo "[verify] runtime smoke test failed"; exit 1; }

echo "[verify] all checks passed"
