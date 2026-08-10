# Pairing serve-sim-nsa with the dev-loop skill

The `dev-loop` skill drives autonomous multi-slice implementation loops (edit → typecheck → build → commit → push → deploy → verify → next slice). serve-sim-nsa slots in at the **verify** step for anything user-visible.

## The augmented loop

```
1. Pick next slice from the task list.
2. Implement.
3. pnpm --filter @nothing/web typecheck + build.
4. git commit + push.
5. Deploy: cd apps/web && npx vercel@latest --prod --yes --scope rmadrazo97s-projects
6. Wait ~30 s for the deploy to promote.
7. ── serve-sim-nsa step ──
   scripts/snap.sh              # capture the current frame
   Read /tmp/nsa-<epoch>.png    # you see the pixels
   Compare against the intent — does the UI reflect what you shipped?
   If no: file a follow-up slice describing the delta.
8. Loop.
```

## When the verify step MUST run

- Any change to `apps/web/src/components/**` (shell, copilot, mini-app-runtime UI).
- Any change to `apps/mini-apps/*/page.tsx` or `apps/mini-apps/*/components/**`.
- Any change to `apps/web/src/app/globals.css` or `design-system.css`.
- Any change to viewport meta / service worker / manifest.
- Any migration that adds a user-visible column (empty state changes shape).

## When the verify step can skip

- Pure server-only changes (API route, tool implementation, DB migration on a table with no UI mount).
- Zod schema additions in `@nothing/shared` that aren't yet consumed.
- Copilot tool wiring that isn't user-facing yet.
- CI or infra config.

## Convention — screenshot naming

`scripts/snap.sh` uses `nsa-<epoch>.png`. For a manual before/after, add a suffix by hand:

```sh
mv /tmp/nsa-1786320000.png /tmp/nsa-launcher-before-2col.png
# ← ship the change →
scripts/snap.sh
mv /tmp/nsa-1786320900.png /tmp/nsa-launcher-after-2col.png
```

Reference these paths in your commit or PR description so a reviewer can see the diff without booting a sim themselves.

## When verification fails — file a follow-up, don't hot-patch

If a screenshot reveals the shipped change didn't render correctly:

1. Note the discrepancy in one sentence.
2. `TaskCreate` a follow-up slice with the observation.
3. Continue the outer loop — do NOT get stuck fixing on the current slice unless the outer task explicitly demands pixel-perfect verification.

Rationale: dev-loop's power comes from momentum. A verify-failure loop that stalls the whole run costs more than a follow-up ticket. The user prefers "shipped 8 slices, 1 needs polish" over "shipped 4 slices, all pixel-perfect."

Exception: **destructive UI regressions** (button unclickable, whole view blank, tap-target ≤10px). Fix immediately — those are more expensive to leave broken than to fix now.

## PWA cache trap

After a deploy, an installed PWA on the sim caches aggressively. If the screenshot shows the OLD bundle:

1. On the sim: swipe up from bottom to app-switcher → swipe up on the PWA card to kill it.
2. Tap the icon on the home screen to relaunch.
3. Re-screenshot.

Or bump `SW_VERSION` in `apps/web/public/sw.js` in the same commit — the SW invalidates on activation. This is why the release-broadcast workflow expects the SW to match `APP_VERSION`.

## When to use browser Safari on the sim vs the installed PWA

- **Browser Safari** — for a route that hasn't been "Added to Home Screen" yet, or for testing changes that don't need PWA context (theme color, splash, standalone-mode safe-area). Use `xcrun simctl openurl booted <url>`.
- **Installed PWA** — for anything that only appears in standalone mode (safe-area padding above Dynamic Island, no Safari chrome, push notifications actually delivering). Manually add-to-home-screen the first time in a session.

## Multiple deploys, one sim session

If you're iterating fast on a UI change (edit → deploy → screenshot × N), keep the sim + serve-sim + Safari tab all open. Each deploy takes ~30s; between deploys you don't need to relaunch anything. Just:

```sh
# in Safari inside the sim
# pull-to-refresh (swipe from top when at scrollTop=0)
# OR
xcrun simctl openurl booted "$SAME_URL"   # force a reload
scripts/snap.sh
```
