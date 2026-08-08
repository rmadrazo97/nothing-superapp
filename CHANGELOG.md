# Changelog

All notable changes to Nothing Superapp. Dates are ISO-8601; the format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely.

## [0.3.1] — 2026-08-08 — Polish

Feel pass — no new features, but 6 tracks of craft.

### Added
- **Loading / 404 / OG / robots / sitemap** — Next.js file conventions. Root + `/app/*` `loading.tsx` skeletons, `not-found.tsx` (global + mini-app-scoped), `robots.ts`, `sitemap.ts`, `opengraph-image.tsx` (dynamic 1200x630 social card via `next/og`).
- **Motion** — home-grid tile stagger fade-up (capped at 200ms so 20-tile grids finish inside 220ms), entitlement-resolving pulse (no more "flash locked → flash unlocked" for paying users), copilot message slide-up on freshly-appended messages. All gated on `prefers-reduced-motion: no-preference`.
- **Toast integration** — ~20 error paths across every mini-app + copilot + settings + paywall wired to `useToast()`. HTTP-status-tiered: 401 silent, 402 info, 429 info, 5xx/network → error.
- **Keyboard shortcuts** — `⌘K` anywhere → copilot with composer focus, `/` on exercises browser → search focus, `?` → hint overlay. Typing-guarded — never fires from inputs.
- **Loading skeletons** — `Skeleton`/`SkeletonCard`/`SkeletonGrid` primitives in `components/ui/`. Replaces "Loading..." text on exercises browser.
- **Copy-to-clipboard** on assistant messages — hover-reveal ghost button on desktop, always visible on coarse pointers. Toggles to ✓ for 900ms.

### Changed
- `apps/web/src/components/home/HomeGrid.tsx` — tile classes gain `--tile-index` inline var for the stagger; `tile-entitlement-pending` for the loading pulse.
- Mini-apps import `useToast` via relative path to the shell's toast context (bundler dedupes). Documented as a coupling smell in each import site; acceptable for v0.3.

### E2E
- 14 Playwright specs still pass in ~42 s (SKIP_STRIPE=1).

## [0.3.0] — 2026-08-08 — First release candidate

**The prod-grade pass.** Everything that stood between v0.2 and something a first user could hit.

### Added
- **PWA installability**: `manifest.ts` with icons + shortcuts, minimal pass-through service worker at `/sw.js`, theme-color meta, apple-touch-icon.
- **Toast + error boundary system** (`apps/web/src/lib/toast/*`, `apps/web/src/components/toast/*`, `apps/web/src/components/shell/AppErrorBoundary.tsx`). Global `useToast()` hook with info/success/error variants. Boundary placed inside `<Shell>` so mini-app crashes don't take down the TabBar.
- **Empty states across every mini-app**: shared `EmptyState` component in `packages/mini-apps-runtime` (dashed outline, Doto glyph, Space Mono title, primary + secondary actions). Calorie, gym, pomodoro all get zero-data guidance.
- **First-run hint** on `/app` below the grid ("New here? Tap Assistant..."), dismissable + persisted in localStorage.
- **Legal pages** at `/legal/terms` and `/legal/privacy`. Linked from the login footer.
- **Rate limiting** on `/api/copilot` — sliding-window 30 req/hour per user, in-memory (swap for Upstash in multi-instance prod).
- **README.md** with prerequisites, setup, env vars, deploy guide, "adding a new mini-app in 6 lines".
- **`apps/web/.env.local.example`** — the canonical env template.
- **`scripts/seed-exercises.py`** — one-shot seeder for the 1,324-row exercises reference table.
- **`VERSION`** file + this `CHANGELOG.md`.

### Fixed
- **Stripe webhook race** — duplicate `stripe_customer_id` constraint violations. Handler now tries update-by-customer_id first, falls back to upsert-by-user_id, and swallows the concurrent-race 23505 as a warning instead of a 500.

### Changed
- Home landing (`/app`) now greets the user by display name + time of day.
- Tile hover / active / focus states polished (globals.css `.tile` / `.tile-locked`).
- Copilot system prompt names every mini-app's data key so Kimi K2 cites by name in responses.

### E2E
- 14 Playwright specs pass in ~31 s (extended coverage to include pomodoro + gym-routine gate).
- Golden path (`signup → subscribe → mini-app → chat with copilot → sign out`) passes end-to-end against live Supabase + Stripe test-mode + Kimi in ~1.7 min.

### Known limitations (v1.0 targets)
- Google OAuth is wired client-side but the provider requires a config in the Supabase dashboard (see `README.md#4-supabase-production-checks`). Magic-link works out of the box.
- Rate limiter is in-memory per instance — swap for Upstash on multi-region deploys.
- Copilot is read-only — no tool-use / write-back.
- Copilot messages are ephemeral (not persisted). Each session starts fresh.
- No Sentry / analytics — server logs only.
- No native shells yet — Capacitor wrap is v0.4.
- Legal pages are v0.3 placeholders; formal legal review before v1.0.

---

## [0.2.0] — 2026-08-08 — Three top-tier mini-apps

### Added
- **Gym mini-app** (`◈ /app/gym-routine`) — 1,324 exercises seeded from hasaneyldrm/exercises-dataset. Browse by 10 body parts, search, exercise detail with animated GIFs (Gym Visual attribution baked in), routine builder, live session with rest timer, history.
- **Pomodoro mini-app** (`◔ /app/pomodoro`) — 25/5/15 cycle with Date.now-accurate timer that survives tab switch, WebAudio beep (Safari-autoplay-safe), sessionStorage recovery, dot streak.
- **Calorie Lite v2** (`◐ /app/calorie-lite`) — surfaced macros (P/C/F) in Add + Today + History views, streak counter with morning-grace, 7-day sparkline (inline SVG, no chart deps).
- **Copilot upgrade** — now reads across all 4 mini-apps (workout sessions + saved routines + pomodoro summary added to the JSON context assembler). System prompt names each mini-app's data key.
- **Growth artifacts** at `services/growth/campaigns/nothing-superapp/` — landing.html + slides.html (12-slide deck) + report.html + ship-log.md.

### Migrations
- `002_pomodoro_and_gym.sql` — pomodoro_sessions
- `003_gym_and_exercises.sql` — exercises + workout_routines + workout_sessions

---

## [0.1.0] — 2026-08-07 — Harness

Initial 14-task harness build. See `docs/dev-loop/superapp-harness/progress.md` for the full lab notebook.
