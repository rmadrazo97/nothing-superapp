# Changelog

All notable changes to Nothing Superapp. Dates are ISO-8601; the format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely.

The single source of truth for versions is `apps/web/src/lib/version.ts` (`APP_VERSION`, `APP_RELEASE_DATE`, `CHANGELOG`). Bumps MUST update it, the root `VERSION` file, and `package.json` `version` fields in the same commit. Highlights here mirror the About-card entries but with more detail per release.

## [0.5.2] — 2026-08-10 — Sub-app settings framework + gym HOW-TO + body-comp tracker + PLAN redesign + assistant race fix

Framework wave. Two new reusable component surfaces (`<MiniAppSettingsPanel>` + `<SwipeableRow>`), one new tracked metric (body composition), one meaningful redesign (Fitness Pal PLAN), and one critical assistant bug fixed at the root.

### Added
- **In-sub-app settings framework** at `apps/web/src/components/mini-app-settings/` — `<MiniAppSettingsPanel>`, `<SettingsSection>`, `<SettingsField>`, `<SettingsSelect>`, `<SettingsToggle>`, `<SettingsButton>`, and a `useMiniAppSettings<T>(slug, defaults)` hook. Backing table `mini_app_settings(user_id, slug, settings jsonb)` via migration 020, owner-only RLS, API at `/api/mini-app-settings/[slug]`. Debounced-optimistic writes. Fitness Pal (823 → 554 LoC, 33% shorter) and Reminders (178 → 139) refactored onto it as proof.
- **Gym settings** — new SECTION 01 · UNITS with WEIGHT (LBS/KG) + LENGTH (IN/CM) pill selectors. First-flip couples KG↔CM and LBS↔IN; independent after that.
- **Gym in-session HOW TO** — every exercise card on the active session gets a small `ⓘ` pill that opens a bottom-sheet with the drawn animation + step-by-step instructions + muscle tags. Shared `<ExerciseDetail>` render now backs both the sheet AND the standalone `/exercises/[id]` route.
- **Body composition tracker** — new `MEASUREMENTS` tab in Gym. Weekly log for Glutes / Waist (at navel) / Chest / Thighs / Biceps / Weight (English translation of the Spanish spreadsheet from the user). Migration 021, canonical integer storage (mm + g) so unit-flip round-trips are lossless. Table view (latest 4 weeks + SHOW ALL) + BottomSheet entry form. Copilot gets auto-generated `gym_routine_body_metrics_{list,get,create,update,delete}` tools via the mini-app resource framework.
- **Fitness Pal PLAN redesign** — LIST view (`+ NEW PLAN` chip, swipeable plan cards, ACTIVE/ARCHIVED pills, sort active-first), DETAIL view (redesigned header, action row `SET ACTIVE · EDIT · DUPLICATE · ⋯`), CREATE/EDIT form (single scroll, plan name, target kcal + inline TDEE helper, macro-split presets Balanced / High-P / Keto / Custom, meal→option→ingredient repeaters using the existing food search, freeform rules textarea). Users can now build plans end-to-end without touching the assistant.
- **`<SwipeableRow>` component** at `apps/web/src/components/shell/` — swipe-left OR long-press → reveal `EDIT` / `DELETE` actions with `⋯` affordance at 40% opacity. Destructive actions route through a shared `<UndoSnackbar>` provider (5s window). Keyboard fallback via a visually-hidden but focus-visible menu button. Wired to the assistant thread drawer, meal-plan cards, and measurement entries; more rollouts to come in v0.5.3.
- **`<UndoSnackbar>` provider** — portal-rendered snackbar stack with shrinking progress bar; imperative `useUndoSnackbar()` API.
- **Shared `<BottomSheet>`** at `apps/web/src/components/shell/BottomSheet.tsx` — touch-drag close (~80px threshold), dim scrim, Escape/backdrop dismiss. Now used by the gym HOW TO sheet and the measurements entry form.

### Fixed
- **Assistant first-message race (CRITICAL)** — sending the first message in a threadless session was aborting its own SSE stream. Root cause was `<CopilotChat key={threadId ?? 'new'}>` in `AssistantClient.tsx`: when `ensureThreadForFirstMessage` set `threadId` from `null` → `uuid`, the `key` flip caused React to unmount + remount `CopilotChat`, aborting the in-flight `useChat` transport and hydrating an empty thread over the user's just-sent bubble. Fix removes the `key` prop entirely and adds a `selfCreatedThreadsRef` guard so the hydrate effect skips ids the client itself just created (would otherwise refetch an empty row over the live stream). SDK inspection confirmed passing `id` to `useChat` would have the same problem — the internal `Chat` instance is recreated on `id` change. Fail-rate observed as ~1:5 in the deep-test session; now 0.
- **Markdown tables render as raw pipes** — appended a rule to the copilot system prompt telling the model to use paragraphs / bullets instead. `markdown-lite.tsx` intentionally excludes tables; renderer support deferred to v0.5.3.
- **Composer send button collided with header `+ NEW CHAT`** — removed the header duplicate entirely. The drawer's `+ NEW CHAT` remains the sole entry point.
- **`BW` placeholder confusion** — every exercise's weight input showed `BW` regardless of equipment type. Now body-weight exercises hide the weight input entirely and show a compact "Body weight" pill next to the exercise name; weighted exercises show `LBS` or `KG` as placeholder (from gym settings).

### Docs
- Assistant deep-test report — `services/growth/campaigns/nothing-superapp/reports/assistant-deep-test-v0.5.1.md` (test matrix, latency findings, 6 bug diagnoses with file:line refs, prioritized punch-list).
- v0.5.2 ship note — `services/growth/campaigns/nothing-superapp/ship-log/0.5.2.md`.

### Deferred to v0.5.3
- Markdown table renderer in `markdown-lite.tsx` (system-prompt rule is the interim mitigation).
- Tool-card rehydration verification post-deploy — code paths reconcile on inspection but a pre-v0.5 row shape may still be in the wild. Filed as #94.
- Orphan-thread periodic cleanup cron. One-shot cleanup SQL in #94.
- `pnpm --filter web lint` restoration after Next 15 dropped `next lint`. Filed as #92.
- Copilot mini-app-context injection for gym body-metrics (auto tools ship the write path; ambient "last 4 weeks" snapshot deferred).

## [0.5.1] — 2026-08-10 — Bug sweep + emoji tile icons + Fitness Pal rename + nav SVGs + REQUEST APP

A polish + small-features release. No new mini-apps; a lot more feel.

### Added
- **Public marketing landing at `/`** — signed-out visitors now see product + tile list + Sign in CTA rather than the bare magic-link form. Signed-in users still bounce straight to `/app`.
- **REQUEST AN APP** — dashed-outline strip below the launcher opens a modal for user asks. Backed by migration 019 (`app_requests` — owner-only INSERT, no SELECT policy; reads via Supabase Studio). API route `/api/app-requests` POST, rate-limited to 5/day/user via `lib/rate-limit.ts`. Confirmation state ("Thanks — noted. Alex reviews these weekly.") auto-closes after 4s.
- **Ingredient resolver** (`apps/web/src/lib/foods/resolve-ingredient.ts`, migration 018 `food_aliases`) — three-pass Spanish→English + pg_trgm fuzzy lookup. Wired into `log-meal` so plan ingredients without a `food_id` still land with real macros. Seeds cover the Diet Jam v1 planner vocabulary.
- **Unresolved calorie-entry affordance** — rows that landed at 0 kcal + no macros now render an "◐ NO MACROS" tag with a cadmium accent border on the left, plus an explicit hint to tap ✎ EDIT. Replaces the silent-blank-right-side that made users think the row was mid-load.

### Changed
- **Rename Calorie Lite → Fitness Pal** — manifest `name`, in-app header label, copilot scope label, and Settings sheet title. Slug + route + API paths stay `calorie-lite` so live user bookmarks + copilot memories still work.
- **Launcher tile icons standardized on emoji** — 🍽️ Fitness Pal, 🏋️ Gym, 🍅 Pomodoro, ⏰ Reminders (already), ✨ More soon. Chrome (nav bar) stays SVG. This is a locked design direction — see `feedback_ns_tile_icons_use_emoji.md`.
- **Nav bar SVG icons** in `apps/web/src/components/shell/TabBar.tsx` — inline 16×16 `currentColor` icons: 4-point spark for Assistant, 2×2 dot grid for Home, 3 horizontal sliders with dot knobs for Settings. Replaces the tiny cadmium underline dot.
- **MORE SOON tile** — full-width dashed-outline strip at the bottom of the launcher grid (was a locked square in the corner). ✨ emoji.
- **`+ NEW ROUTINE` and `+ NEW REMINDER`** — shrunk from cadmium-fill hero CTAs to compact cadmium-ghost variants (`padding: var(--space-2) var(--space-4)`, `minHeight: 36`, caption-size text). Copy uppercased.
- **`← Back` → `← BACK`** everywhere (gym-routine routines, exercises, exercise-detail, routine-editor, history).
- **Pomodoro + MiniAppSettings cog** — `⚙` swapped for `⚙︎` (U+FE0E variation-selector-15) so Safari renders a text glyph instead of the macOS colored gear graphic.
- **Auth `?next=` preservation** — login page now reads `?next` from the URL and threads it through both `signInWithOtp.emailRedirectTo` and `signInWithOAuth.redirectTo`. `safeNext` allow-list defends the callback against open-redirects. Middleware already preserved `pathname + search` in the redirect to `/login`.
- **`/paywall` public** — no longer bounces signed-out visitors to `/login`; renders the marketing view + Subscribe CTA. Auth still required for the Stripe checkout API.
- **Privacy page** — reflects that copilot chats ARE persisted (with RLS + a delete affordance in the thread drawer), version + effective date sourced from `APP_VERSION`.

### Fixed
- **Streak chip overflow** (Bug #7) — on ≤430px viewports, LONGEST / N/30 sub-rows collapse via a11y-only clipping so the ⚙ cog stays on-screen. Cog gets `flex-shrink: 0`; streak chip is the shrinkable member.

### Ship note
- Filed at `services/growth/campaigns/nothing-superapp/ship-log/0.5.1.md` — includes the emoji-direction pivot as a lesson (worker attempted to unify to flat glyphs; user reversed).

## [0.5.0] — 2026-08-10 — Assistant + Reminders + agent loops

Copilot becomes a real chat, and reminders become agent loops.

### Added
- **Assistant rebuild** — persistent chat threads (`copilot_threads` + `copilot_messages`, migration 015, owner-only RLS), streaming `▊` cursor, markdown-lite renderer (bold/italic/lists/code, zero new deps), Copy · Regenerate · Continue actions on hover, retry chip on stream failure, right-aligned cadmium user bubbles, left-aligned dark assistant bubbles, empty-state prompt cards.
- **ThreadDrawer** (`apps/web/src/components/copilot/ThreadDrawer.tsx`) — slide-in from left, `+ NEW CHAT`, per-row rename + delete (two-tap confirm), cadmium left-border on active thread.
- **URL binding** — `?t=<uuid>` deep-linkable, browser-back friendly, key-by-thread-id remount.
- **Route body extension** — `POST /api/copilot` now accepts optional `thread_id` + `context: 'calorie-lite'`. `onFinish` persists both turns (text + tool-invocation + reasoning parts) via the shared assistant-content normalizer. Auto-title from first user message truncated to 60 chars.
- **Reminders mini-app** (`apps/mini-apps/reminders/`, migration 017) — new launcher tile with UPCOMING · ALL · HISTORY tabs. Reminder `kind` is either `notify` (push at time) or `agent_loop` (autonomous copilot prompt on a schedule). Six schedule shapes: `once`, `daily`, `weekly`, `monthly`, `cron`. Timezone-aware. `next_fire_at` denormalized for cheap due-scans.
- **Agent-loop runtime** (`apps/web/src/lib/ai/agent-loops.ts`) — service-role Supabase client + `runAgentLoop(reminder)` using `streamText` with `maxSteps = 5` and the full copilot tool surface, RLS-scoped via explicit `user_id` filters. Result saved to `reminder_runs.agent_summary`, push fired via existing infra.
- **Tick endpoint** (`POST /api/reminders/tick`) — Bearer `CRON_SECRET` gated. Fetches due reminders, processes each via `notify` or `agent_loop`, updates `last_fired_at + next_fire_at`. Also `POST /api/reminders/trigger` for session-authed "▶ Run now".
- **GitHub Actions cron** (`.github/workflows/reminders-tick.yml`) — every 5 min. Vercel Hobby caps crons at daily; GHA has no such limit. Same tick endpoint, same `CRON_SECRET` bearer.
- **Six canned templates** — 3 notify (drink water, log lunch, weekly weigh-in) + 3 agent loops (weekly meal review, gym adherence, grocery list from active plan).
- **Copilot tools** — `create_reminder`, `list_reminders`, `toggle_reminder`, `trigger_reminder_now` (+ framework auto-CRUD via the resources declaration).
- **Meal-plan entry grouping** (migration 016) — `app_calorie_entries.meal_group_id` (nullable uuid) + `meal_group_label`. `log_meal_from_plan` stamps every ingredient row with the same group id. TODAY view renders one `MealGroupCard` per group: header with total kcal + macros + × Delete group (two-tap, batch DELETE per row + emit event). Expand → per-ingredient rows with existing edit/delete. `sessionStorage` persists collapsed state per group.
- **Calorie entry inline edit + delete** — tap any TODAY row to reveal `✎ Edit` (form for name/kcal/P·C·F/meal slot, PATCH via framework endpoint) + `× Delete` (two-tap confirm, 3s auto-disarm). Uses `/api/mini-apps/calorie-lite/resources/entries/[id]` under the hood.
- **Meal-plan delete + gym-routine delete** — two-tap confirm chips on plan header (when active) + on each row in the chooser. Deleting the active plan cascades to `preferences.active_meal_plan_id = null` via the FK, then reloads.

### Changed
- **Launcher grid** — `HomeGrid` locked to `repeat(2, minmax(0, 1fr))` on every viewport. Was `auto-fill, minmax(140px, 1fr)` which collapsed to 1 col on narrow iPhones once safe-area ate horizontal space.
- **Viewport meta** — `maximumScale: 1, userScalable: false, interactiveWidget: 'resizes-content'`. Inline script blocks Safari's `gesturestart` family + double-tap-zoom (300ms `touchend` guard). `touch-action: pan-x pan-y` on `<body>`. Feels native on iOS home-screen installs.
- **Service worker bumped** to `v0.4.0` then `v0.5.0` so installed PWAs pick up the new bundle without a full app kill.

### Fixed
- User messages weren't rendering in the standalone assistant page (only tool-call cards + reasoning showed). Fixed as part of the assistant rebuild.
- Reasoning parts now render BELOW the answer disclosure, not above it.

### Infra notes
- Vercel git-push auto-deploy is flaky on this project — after landing user-visible slices we run `cd apps/web && npx vercel@latest --prod --yes --scope rmadrazo97s-projects` from the repo root (there's also a stale `apps/web/.vercel/project.json` risk — always deploy from repo root).
- Migration slots 015 (copilot_threads), 016 (meal_group_id), 017 (reminders + reminder_runs) all applied to prod via `psql` (env `SUPABASE_PROJECT_ID` + `SUPABASE_DB_PASSWORD` in `apps/web/.env.local`).
- `CRON_SECRET` set in Vercel prod env AND GitHub Actions secrets — both required for the tick workflow to fire successfully.

## [0.4.0] — 2026-08-09 — Real agent + multimodal + meal plans + gym v2 + USDA + framework

The day the copilot became an agent and the food DB grew 50×.

### Added
- **Copilot → Vercel AI SDK v5** — swapped hand-rolled Moonshot SSE for `streamText()` + `toUIMessageStreamResponse()`. `@ai-sdk/react` `useChat` on the client, `@ai-sdk/openai-compatible` on the server pointed at Moonshot's OpenAI-shaped endpoint. Kimi K2.6 stays default; provider config lives in one place for a future OpenRouter swap.
- **19 hand-written tools** across nutrition (log_calorie_entry, log_water, log_weight, search_foods, get_daily_summary, get_streak, get_gym_history, start_pomodoro) + gym v2 (create_gym_routine, get_gym_routine, list_gym_routines) + meal plans (create_meal_plan, get_meal_plan, list_meal_plans, log_meal_from_plan) + smart nutrition (find_equivalent_food, suggest_from_menu, extract_macros_from_text). Every write auth+entitlement+rate-limited (10 writes/hr per user) and audited to `copilot_tool_calls` (migration 010).
- **Mini-app resource framework** — declare `resources.ts` per mini-app; framework auto-generates REST at `/api/mini-apps/<slug>/resources/<name>` (list/get/create/update/delete), 32 copilot tools (`<slug>_<resource>_<op>`), and a `useResource()` runtime hook. Coexists with hand-written routes. Canaries: calorie-lite + pomodoro.
- **In-app copilot drawer** — bottom-sheet drawer accessible via `◐ ASK` chip in calorie-lite header. Route accepts `context: 'calorie-lite'` → injects <2KB CALORIE LITE SNAPSHOT (today's macros, remaining, active plan) into system prompt.
- **Multimodal composer** — image attachments (jpeg/png/webp, ≤5MB, up to 3) + voice input via `webkitSpeechRecognition`. Provider routes to `KIMI_VISION_MODEL` when messages carry image parts (default `moonshot-v1-8k-vision-preview`; unset falls back to `KIMI_MODEL`).
- **Meal plans v2** (migration 012) — nutritionist-style structured plans with `plan.meals[].options[]`, per-meal macro targets, ingredients with `free`/`generic` flags, `plan.rules` block (weighing, free_meal, hydration, vegetables, option_interchangeability, protein_source_swap). `meal_plan_adherence` tracking table. Real Diet Jam v1 seeded as fixture under owner account.
- **Gym routine v2** (migration 011) — top-set/back-off blocks, RIR ranges (`{min,max}`), rep ranges, supersets with components, unilateral + `reps_per_side`, bilingual (`name_es`/`name_en`), alternatives, cardio prescriptions, coach conventions (`sets_notation`, `rir_definition`, etc). `workout_sessions` gained `plan_day` + `plan_exercise_id` + `block_role`.
- **USDA SR Legacy ingestion** (migration 014) — `foods` grew from 153 curated → 7,946 rows. `foods_name_trgm_idx` (pg_trgm GIN) for fast ILIKE. `usda_fdc_id` + `source` columns added; curated rows never overwritten (`WHERE foods.source <> 'curated'` guard on the UPSERT).
- **In-app settings cog per mini-app** — reusable pattern: mini-app declares `settings: { title }` in its manifest, exports a `settings.tsx`. `MiniAppSettingsSheet` right-side drawer lazily loads it via `next/dynamic({ ssr: false })`. Calorie-lite's nutrition prefs (macros/water/weight/body profile) moved OUT of main Settings into the cog.
- **ABOUT card in main Settings** — version + release date + native `<details>` changelog disclosure, sourced from `apps/web/src/lib/version.ts` `CHANGELOG`.
- **PWA safe-area** — Shell top padding + horizontal padding include `env(safe-area-inset-*)`. OnboardingWizard + MiniAppSettingsSheet get full-inset padding.

### Changed
- `preferences` extended: `macro_goal_pct`, `water_goal_ml`, `weight_goal_kg`, `weight_unit`, `volume_unit`, `sex`, `age_years`, `height_cm`, `activity_level`, `goal_direction`, `onboarded_at`, `active_meal_plan_id`.

## [0.3.2] — 2026-08-09 — Web Push

Reach users when the tab is closed.

### Added
- **Web Push infrastructure** — VAPID keypair, `web-push@3.6.7` server library (`apps/web/src/lib/push/server.ts`) with 410-Gone auto-cleanup. Service worker (`apps/web/public/sw.js`) gains `push` + `notificationclick` handlers.
- **Migration 009** — `push_subscriptions` (unique on `endpoint`), `push_deliveries` audit trail, `push_broadcasts` with `unique(topic, version)` dedupe. Extends `preferences` with `push_enabled` + `push_topics text[]`.
- **API endpoints** — `POST /api/push/subscribe`, `POST /api/push/unsubscribe`, `POST /api/push/test`, `POST /api/admin/broadcast` (admin-email OR `X-Admin-Secret` gated).
- **Opt-in banner** — deferred 30s past first-load, respects a 24h "not now" snooze, mounted in `/app/*` layout.
- **Settings → Notifications** — turn on/off, per-topic checkboxes (Releases, Insights), Send test button.
- **Release broadcaster** — `pnpm --filter @nothing/web broadcast:release` for manual sends; `.github/workflows/broadcast-on-version-bump.yml` fires automatically when `APP_VERSION` changes on main.

### Blocked
- Vercel env vars (`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ADMIN_USER_EMAILS`, `ADMIN_BROADCAST_SECRET`) need to be pasted into the project settings — see root `BLOCKED.md`.

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
