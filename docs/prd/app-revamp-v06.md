# PRD — App Revamp v0.6

**Status:** in progress · **Branch:** `feat/app-revamp-v06` · **Tier:** L (cross-cutting)

## Problem

Three complaints:

1. Current exercise GIFs (gymvisual.com) don't match the Nothing OS aesthetic — busy, colored, off-brand.
2. Moving between mini-apps feels **slow**: user clicks a tile and stares at a blank screen for ~1s.
3. Small polish issues app-wide: undefined design tokens, undersized tap targets, hard-coded colors, dead classes, missing empty states.

## Non-goals

- No schema changes to `exercises` table (illustration is a client-side lookup).
- No routing framework migration; stay on Next 16 app router.
- No new mini-apps.
- No service-worker cache overhaul (deferred).
- No dark/light theme toggle work (locked dark).

## Scope

### Track A — Exercise illustrations (`@bryllim/workout-guide`)

- Install `@bryllim/workout-guide` in the gym-routine mini-app package.
- Assets are 30 MB — **do not bundle**. Serve from jsDelivr:
  `https://cdn.jsdelivr.net/npm/@bryllim/workout-guide@1.0.0/`
- New component `<ExerciseIllustration slug fps />` cycles 3 PNG frames (`frame-1|2|3.png`) at ~2 fps (500 ms/frame). Fallback to `gif_url` if slug is null.
- Add `workout_guide_slug` field to the routine fixture (`fixtures/jam-v1.json`) for every exercise. Mapping already computed at `/tmp/exercise-slug-mapping.json`: 9 exact / 3 fuzzy / 0 no-match.
- Attribution: CC BY-SA 4.0. Show "Illustrations by Bryl Lim — CC BY-SA 4.0" once on the Exercise detail page.
- Replace `<img src={exercise.gif_url}>` in `ExerciseDetail.tsx` and `ExerciseCard.tsx` with `<ExerciseIllustration>`.

### Track B — Mobile UI/UX polish

Fix the S1s + top S2s from the audit. All fixes are additive/token-swaps; no shape changes.

- **S1 — undefined tokens** (silent 0-space bugs):
  - `--space-5` → `--space-4` or `--space-6` in gym-routine home, habits home.
  - `--radius-input` → `--radius-compact` in journal, habits, calorie-lite.
  - `--radius-pill` → `--radius-button` in calorie-lite.
- **S1 — dead code**: pomodoro `.no-scroll` class missing → define it in `globals.css`.
- **S1 — session info button** (gym-routine session `ⓘ`): 20×20 → 44×44.
- **S2 — global tap target sweep**: chips, tabs, small buttons — all `min-height: 44px`. Files touched:
  - `pomodoro/page.tsx` (gear + TabButton)
  - `reminders/page.tsx` (TabButton)
  - `habits/page.tsx` (CHIP_* patterns)
  - `journal/page.tsx` (chip patterns)
  - `gym-routine/page.tsx`, `pages/session.tsx`, `pages/routines.tsx`, `pages/routine-editor.tsx`, `measurements/page.tsx`
  - `calorie-lite/page.tsx` (meal slot chips + edit/delete row action)
- **S2 — off-token colors**: search `rgba(0, 0, 0, 0.5)` → `var(--color-surface)`; use `var(--color-accent-subtle)` for accent-tinted backgrounds; use `.elev-md` shadow token where applicable.
- **S2 — launcher tile icons**: 24 px → 44–48 px (`var(--text-display-md)`).
- **S2 — loading skeleton mismatch**: `apps/web/src/app/app/loading.tsx` grid must mirror `repeat(2, minmax(0,1fr))` so hydration doesn't reshuffle.
- **S2 — Shell padding**: `padding-bottom: 170px` → `calc(72px + env(safe-area-inset-bottom) + var(--space-8))`.
- **S2 — copy fix**: `coming-soon` "NEXT UP · CALORIE-LITE" is stale — remove or rotate.
- **S2 — empty states**: gym home and reminders home need first-run cards.

### Track C — App-to-app navigation perf

- **P1** — `apps/web/src/app/app/layout.tsx:76-88`: sequential Supabase queries → `Promise.all()`. Est. 300 ms saved.
- **P1** — Add `loading.tsx` under every mini-app route folder (`apps/web/src/app/app/{gym-routine,calorie-lite,pomodoro,habits,journal,reminders,coming-soon}/loading.tsx`) with a skeleton matching that mini-app's header shape.
- **P2 (stretch)** — Wrap mini-app page imports in `next/dynamic` where the mini-app entry re-exports a large component. Only if time.

## Assumptions

1. Supabase `exercises` table stays as-is; new `workout_guide_slug` lives client-side in the fixture / mapping.
2. jsDelivr serves `@bryllim/workout-guide@1.0.0` assets under the standard NPM CDN path — verified via WebFetch by research agent.
3. Package's `frames[i].path` field or its `getAssetUrl(slug, i)` returns a working relative path.
4. Existing tap-target minimum on `.btn` is 44 px per the design system — extending this to chips/tabs will not break layouts (they will grow, not shrink).
5. Adding `loading.tsx` files does not break existing SSR data flow (Next 16 pattern: layout streams; loading.tsx renders during the Suspense boundary).
6. Mini-app entry pages are Client Components — SSR data fetch not viable this pass; skeletons cover the gap.

## Acceptance criteria

- [ ] `pnpm build` passes (typecheck + lint).
- [ ] Every routine exercise in `jam-v1.json` renders an animated `<ExerciseIllustration>` with 3 cycling frames.
- [ ] Exercise detail page matches the visual reference (dark bg, centered line-drawing illustration, Space Mono heading).
- [ ] Attribution line visible on exercise detail.
- [ ] Layout loads in `Promise.all()` mode.
- [ ] Every mini-app route has a `loading.tsx` skeleton (blank screen on nav becomes skeleton).
- [ ] `grep -R "var(--space-5)" apps/` returns 0 results.
- [ ] `grep -R "var(--radius-input)" apps/` returns 0 results.
- [ ] Playwright screenshot pass: launcher, gym exercise detail, gym session, calorie-lite look right.
- [ ] VERSION bumped, CHANGELOG updated, PR opened.

## Rollout

- Trunk-based: merge to main → auto-deploy to prod (PWA on Vercel).
- Feature is not behind a flag — visual improvement, low regression risk.
- If workout-guide CDN fails, `<ExerciseIllustration>` falls back to existing `gif_url` (guarded).
