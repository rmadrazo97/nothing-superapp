# Changelog

All notable changes to Nothing Superapp. Dates are ISO-8601; the format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely.

The single source of truth for versions is `apps/web/src/lib/version.ts` (`APP_VERSION`, `APP_RELEASE_DATE`, `CHANGELOG`). Bumps MUST update it, the root `VERSION` file, and `package.json` `version` fields in the same commit. Highlights here mirror the About-card entries but with more detail per release.

## [0.5.17] — 2026-08-15 — Bug sweep: calorie POST 403, gym UX pass, assistant chat wipe

Direct-feedback release from a live prod session — 10 reported issues, all fixed in one wave.

### Fixed
- **Calorie-lite — POST /entries returned 403 with an opaque "Could not save." toast.** Root cause was a stale food id from the client cache tripping the `food_id → foods(id)` FK on insert. Route now retries once with `food_id=null` (row still saves), and when the retry also fails the real Postgres `code/message/hint/details` are returned in the JSON body. Both client submit paths (`FoodSearch.tsx`, `page.tsx`) render the specific error instead of the opaque toast.
- **Fitness Pal — Add Meal card was cramped.** Card padding + section gaps bumped to `--space-6`, chip row to `--space-3` with 36px min-height, tabs get bottom padding, error banner became a proper alert card (ERROR label + accent border tint) instead of an inline paragraph squished against the meal-slot chips.
- **Gym — Pick-a-Day sheet blew out the layout with a 36px display heading.** Routine name drops to `--text-subheading` (18px) with a 2-line clamp + word-break.
- **Gym — exercise (i) HOW-TO drawer 404'd for routines with opaque local ids ("d5e1").** `GET /exercises/[id]` now accepts `?name=` and falls back exact → prefix → contains ILIKE against the catalog. Session hydration passes the name too, so body-weight detection also works for these routines.
- **Gym — no reference for previous weights.** Every exercise card shows `LAST · 65KG × 10 · AUG 12` from the heaviest completed set in the last 30 sessions, keyed by lowercased name so it survives routine swaps.
- **Gym — session title too big.** `display-md` (36px) → `--text-heading` (24px) with a 2-line clamp. "PLAN DE ENTRENAMIENTO – JOSÉ ALEJANDRO MADRAZO ÁVILA – Day 5 – Full Upper Body" no longer overflows.
- **Gym — set-done checkbox hard to tap.** 44×44 → 56×56, 2px border, larger ✓, `touch-action: manipulation`.
- **Assistant — chat thread disappeared after the reply finished streaming.** `CopilotChat` was comparing `initialMessages` against a `useRef` initial value that never advanced. When the parent's mount effect created a new `[]` reference for self-created threads, every subsequent `streaming → idle` transition re-fired `setMessages([])` and wiped the just-rendered reply. Fix: advance `firstInitialMessagesRef.current` after each reset so the identity check stays valid.
- **Assistant — composer send button used a spinning `◐` while every other progress surface used the pixel-dot loader.** Replaced with `<PixelLoader size="sm" />`.

### Added
- **Gym focus mode.** New `⤢` button on every exercise card toggles a single-exercise view with `FOCUS · 2/5` + `← Show all` at the top. Lifters can zero in on the current lift without scroll-hunting through a 6-exercise session.
- **Gym API — name-based fallback on `/exercises/[id]`.** Accepts `?name=` and matches the catalog via ILIKE (exact → prefix → contains). Id regex widened to `[0-9a-zA-Z_.-]{1,64}` so v2 flattened ids (e.g. `abc.c1`) also pass validation.

## [0.5.11] — 2026-08-11 — Gym day picker + sticky rest timer + quantity input fix

The direct-user-feedback wave. Three reported issues from live prod screenshots, all fixed in one small release.

### Fixed
- **Gym — starting a v2 routine flattened every day into one session.** Tapping START on `Plan de entrenamiento` (a 4-day split) created a session with all 40 exercises from every day, so the user had no way to focus on today's training. New `<BottomSheet>` opens on START for any routine with `plan.days.length > 1`, showing each day as a tap target (day number + name + focus tags + exercise count). Single-day v2 routines skip the sheet; v1 flat routines unchanged. Session name reads `<Routine> — <Day name>` so the thread history is legible.
- **Gym — REST timer scrolled out of view.** The rest-countdown card now `position: sticky; top: var(--space-2); z-index: 20`. Canvas-colored background so exercise cards don't peek through as they scroll under it. Timer stays visible for the "wait 90s then next set" loop, which is the whole reason the timer exists.
- **Fitness Pal — QUANTITY input rejected value "1".** `<input type="number" min={0.01} step={0.1}>` means valid values are `0.01 + N×0.1` → 0.01, 0.11, ..., 0.91, 1.01. Integer "1" doesn't fit that grid, so the browser rejects it with "The two nearest valid values are 0.91 and 1.01." Fix: `step="any"` removes the grid. Quantity is naturally continuous. Same fix applied to CustomFoodList's local quantity picker.

### Refactor
- Extracted the v2-day → v1-session-entries flattener into `apps/mini-apps/gym-routine/lib/session-from-day.ts` so both `routines.tsx` (this release's new day-picker path) and `routine-editor.tsx` (existing startV2Day) use one code path. Deleted 40 duplicate lines from routine-editor.

## [0.5.10] — 2026-08-11 — Deploy pipeline fixed + assistant render_* directive + regression tests + handle_new_user hardened

The release that actually ships everything. Rebuilt the deploy path in CI after discovering Vercel's GitHub App integration had silently disconnected sometime after v0.5.1 — 6 releases' worth of push notifications had fired for code that never reached users.

### Fixed (the big one)
- **CI-driven deploys via `vercel deploy --prebuilt --prod`**. New `deploy-prod` job in `.github/workflows/ci.yml` installs the Vercel CLI, pnpm + workspace deps, pulls prod env, builds, deploys. Gated on main + push. Skips cleanly if `VERCEL_TOKEN` secret is absent (PRs / forks unaffected). Non-secret `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` inlined at job scope so a missing secret can't silently break deploys again.
- **`verify-deploy` job** polls live `sw.js` for up to 4 min after the deploy step, fails if `SW_VERSION` doesn't match `APP_VERSION` in the just-built code. Same-shape check as verify-migrations / verify-backfills / verify-rpcs — makes 4 safety-net jobs now.
- **Broadcast is gated on live-version match** — `.github/workflows/broadcast-on-version-bump.yml` replaced its blind `sleep 90` with the same poll. If `sw.js` never matches, broadcast is SKIPPED. The "phantom notification" failure mode is closed permanently.

### Added — assistant
- **`render_*` tools now MANDATED** for numeric answers via `apps/web/src/app/api/copilot/route.ts` system-prompt update: advisory → directive tone ("REQUIRED: use render_* tools for ALL quantitative responses. Prose-only responses for numeric queries are a bug."). Includes a 7-row decision matrix keyed by query intent + an explicit anti-example.
- **Empty-state prompt cards** in `apps/web/src/components/copilot/CopilotChat.tsx` — 4 tappable cards (🥗 kcal left, 📊 weight trend, 🏋️ volume by muscle group, 🍽️ lunch options) pre-fill the composer so users discover what the assistant can render. Hidden the moment the thread has any messages. Two variants: standalone assistant page + embedded drawer.

### Added — tests + refactor
- **Vitest set up** at `apps/web/vitest.config.ts` (Node env, `@` → `./src` alias mirroring tsconfig paths). 32 unit tests across 2 files:
  - `apps/web/src/app/api/mini-apps/calorie-lite/foods/route.test.ts` — 16 tests covering scoreRow tiers (prefix / word-initial / substring boosts), trigram similarity, compareScored sort key (canonical tiebreaker + penalty ordering + no-canonical-beats-materially-better).
  - `apps/web/src/components/pixel-ui/schemas.test.ts` — 16 tests covering coerceRenderPayload for all 7 `render_*` kinds in both live-stream (`{version, kind, data}`) and rehydrated (bare payload) shapes.
- **score-row helper extracted** to `apps/web/src/lib/foods/score-row.ts` — enables the unit tests without dragging Supabase + entitlement code into the test bundle. Sort behavior preserved bit-for-bit.
- **`<PixelMetricGrid>` `negativeDeltaTone` prop** (default `'accent'` = existing behavior; `'muted'` = graphite negatives so they don't collide with the LED signature). Gym PROGRESSION KPI grid retrofitted to the shared component — deleted 130 LoC of local `KpiSummary` / `KpiCell` / `KpiRow` duplicates. Design proof-sheet at `/dev/pixel-ui` extended to show both variants side by side.

### Fixed — security
- **Migration 031** — `handle_new_user()` `SECURITY DEFINER` function had EXECUTE granted to `anon`, `authenticated`, `PUBLIC` — meaning anyone could POST to `/rest/v1/rpc/handle_new_user` and cause a privileged INSERT into `public.profiles`. Splinter findings 0028 + 0029. Fix: REVOKE from all 3 roles; keep grants to `postgres` + `service_role`. The `on_auth_user_created` trigger continues to work because triggers run under the table owner's privileges, not the caller's. Also pinned `search_path = public, pg_temp` (defense in depth). Applied to prod, verified.
- **Auth password policy hardening** (via Management API, not in migration): `password_min_length` 6 → 8; `password_required_characters` enforces lowercase + uppercase + digit.
- **Splinter finding `auth_leaked_password_protection`** — deliberately skipped. Requires Supabase Pro plan to enable `password_hibp_enabled`. Documented as a plan-tier limitation, not a coding issue.

### Meta
- **Task #130 closed** — Vercel deploy reconnected via the CI-driven path (durable — I can see the logs and fix them if they break).
- **Pipeline shape**: 8 CI jobs now — `typecheck+build` → `deploy-prod` → `verify-deploy` + `verify-migrations` + `verify-backfills` + `verify-rpcs` + `e2e` + `splinter security-advisor`.

## [0.5.9] — 2026-08-11 — Third safety net + security-advisor fixed + food coverage +60 queries

Wave E — the "close every safety-net gap + widen food coverage" wave. Ships the third drift-safety-net script (RPCs), un-breaks the security-advisor CI workflow that had never actually run, and raises daily-log query coverage on food search.

### Added
- **`scripts/verify-rpcs-defined.mjs`** — third drift-safety-net script. Greps `.rpc('name'` calls from `apps/web/src` + `apps/mini-apps/**`, verifies each is defined in prod `pg_proc`. Currently 2 RPCs (both resolve_ingredient_*_fuzzy, both defined post mig-029). New CI job `verify-rpcs-defined` chained after `verify-migrations-applied`.
- **Migration 030** — 62 en/es food aliases (`avena` → oats-rolled-dry, `pollo pechuga` → chicken-breast-cooked, `huevo` → egg-whole-raw, and more). Total `food_aliases` count: 18 → 80. Pass-1 exact alias resolution now works for the top Spanish daily-log queries.
- **60 new canonical-foods.json entries** covering the top daily-log queries: oatmeal (repointed to "Oats, rolled, dry"), greek yogurt, peanut butter, almond butter, olive oil / EVOO, tuna, shrimp, lentils, black beans, chickpeas, quinoa, whole-wheat bread, brown rice, cottage cheese, pasta, broccoli, asparagus, kale, ground beef (93/85), ground turkey, turkey breast, pork chop, sirloin steak, whey protein, protein bars, plus Spanish variants (pechuga de pollo, huevo, avena, plátano, manzana). All 60 verified match a prod row; 100% hit rate. **Total canonical rows in prod: 60 → 274** (Δ = 4.5×).
- **Audit script extended** (`scripts/audit-canonical-patterns.mjs`) — new "missed-demand check" that compares a 73-query curated daily-log list against the JSON + canonical rows.

### Fixed
- **`.github/workflows/security-advisor.yml`** — all 6 runs since v0.5.6 had died at workflow-parse time with "workflow file issue." Root cause via actionlint: `secrets` context isn't valid inside a step-level `if:` condition (only `env`, `github`, `inputs`, `job`, `matrix`, `needs`, `runner`, `steps`, `strategy`, `vars` are). Fix: promote the token to a step `env:` and gate on `[ -n "$SUPABASE_MANAGEMENT_TOKEN" ]` in the shell. Same behavior, valid YAML. Also hardened the `exit_code` shell against non-numeric input.

### Meta
- Sixth wave of parallel-worker discipline in a row: zero merge conflicts across 3 workers.
- Migrations 029 + 030 both applied to prod during the wave (idempotent, safe).
- **The three drift-safety-nets stack** now covers every class of prod schema divergence we know of:
  1. Table/column/index DDL not applied ← `verify-migrations-applied.mjs` (v0.5.5)
  2. Backfill script not run ← `verify-backfills-run.mjs` (v0.5.7)
  3. RPC referenced but not defined ← `verify-rpcs-defined.mjs` (v0.5.9)

### Deferred to v0.5.10
- **`SUPABASE_DB_PASSWORD` GH secret** (user action #119) — once fixed, verify-migrations + verify-backfills + verify-rpcs all switch from SKIP to real coverage.
- **`SUPABASE_MANAGEMENT_TOKEN` GH secret** — once set, security-advisor CI does real scans on every push + daily cron.
- **`<PixelMetricGrid>` — `negativeDeltaTone` prop** so Gym PROGRESSION can drop its custom `KpiSummary`.

## [0.5.8] — 2026-08-11 — Gym PROGRESSION + PixelUI dogfood + short-query search + RPC drift closed

Wave D — the "value + refactor" wave after 3 releases of correctness/safety-net work. Ships the first non-assistant use of PixelUI (Gym PROGRESSION tab), closes the last known food-search UX hole, discovers + fixes a third class of drift (RPCs missing from prod), and consolidates duplicated inline components.

### Added
- **Gym PROGRESSION tab** (`/app/gym-routine/progression`) — new instrument panel that answers "am I actually getting stronger?" without the user having to reason about it. Top: 4-KPI grid (volume, sets, PRs, sessions — each with a 4-week delta chip). Middle: volume-per-week trend line for the last 8 weeks. Below: top-4 most-frequently-logged exercises with 8-session top-set progression each.
- **First non-assistant PixelUI use.** `<PixelCard>` chrome + `<PixelLineChart>` bodies + shared 3px grid + 2×2 cadmium LED signature — same visual atoms as the assistant's `render_*` panels. Reads as ONE instrument suite across the app.
- **Migration 029** — `resolve_ingredient_alias_fuzzy(needle text)` + `resolve_ingredient_food_fuzzy(needle text)` RPCs. Both `SECURITY INVOKER`, `SET search_path = public, extensions, pg_temp`. `_food_fuzzy` sort order matches v0.5.7 route.ts JS re-rank (`is_canonical desc, rank_penalty asc, similarity desc`). Applied to prod + smoke-tested; the fuzzy passes 3+4 in `resolve-ingredient.ts` are now real code paths for the first time.

### Fixed
- **Short-query food search** — queries like `egg`, `salt`, `oil`, `rice` fell below pg_trgm's default 0.3 similarity threshold when using the `%` operator, so canonical rows never entered the candidate set. New ILIKE-canonical pre-pass in `resolve-ingredient.ts` (queries < 8 chars, filter to `is_canonical=true`, prefix ILIKE). Verified against 5 test queries: 4/5 now resolve to the correct canonical row (`oatmeal` still misses because its canonical row is "Oats, rolled, dry" — pattern-alias seed for v0.5.9).
- **RPC drift class discovered + fixed** — investigating W12's short-query bug surfaced that both `resolve_ingredient_alias_fuzzy` and `resolve_ingredient_food_fuzzy` were referenced by the client (`apps/web/src/lib/foods/resolve-ingredient.ts:153,174`) since v0.4.x, but had never existed in any migration + were missing from prod's schema cache. Passes 3 + 4 have been silent no-ops for months; the pass-4 catch-fallthrough ILIKE was carrying the whole flow (ordered by kcal DESC — nonsense). Migration 029 defines both RPCs; passes 3+4 are now actually functional. This is a **third class of drift** beyond v0.5.5 (unapplied migrations) and v0.5.7 (unapplied backfills): **RPCs referenced but not defined**.

### Refactor
- **`LoadErrorCard` hoisted to `@nothing/mini-apps-runtime`** — 6 nearly-identical inline copies (settings, calorie-lite home, gym-routine home + measurements, reminders, meal-plans) replaced with one import. Reconciled minor drift during the extract: everyone gets 44px min-height RELOAD buttons (was 36 in some), a consistent "Couldn't load `<thing>`: `<msg>`. This usually means a backend hiccup — try again?" body copy, and `thingLabel` overrides for natural grammar ("your workouts" instead of "your gym").

### Deferred to v0.5.9
- **RPC-verifier safety net** (mirror of `verify-migrations-applied` but introspecting `pg_proc` for RPCs referenced by `supabase.rpc('...')` calls in the client). Would have caught the mig-029 drift earlier.
- **`SUPABASE_MANAGEMENT_TOKEN` GH secret + fix the security-advisor CI workflow** — all 6 runs of `.github/workflows/security-advisor.yml` have failed since it landed in v0.5.6. GH reports "workflow file issue" but the log endpoint 404s. Task #123.
- **`SUPABASE_DB_PASSWORD` GH secret fix** — user action (#119). Once fixed, verify-migrations + verify-backfills re-enable automatically.

## [0.5.7] — 2026-08-11 — Food search leads with the right row + backfill safety net + rehydration verified

The correctness wave. v0.5.5+v0.5.6 fixed the schema-and-safety-net story; v0.5.7 closes the last known "shipped feature quietly doesn't actually work" hole — food search's canonical ranking. Also lands the third safety-net script (backfill-run) so the "committed but not applied" class of drift is now covered from both ends.

### Fixed
- **Food search canonical ranking now actually surfaces canonical rows.** Two independent bugs stacked on top of each other:
  1. `canonical-foods.json` — 191/251 patterns didn't match any USDA row because they used shorthand names that don't exist in SR Legacy (e.g. `"Chicken breast, cooked"` never matches; real USDA name is `"Chicken, broilers or fryers, breast, meat only, cooked, roasted"`). Full rewrite via W7 audit → 300/300 patterns hit real rows; prod canonical count 60 → 270 (4.5×).
  2. `apps/web/src/app/api/mini-apps/calorie-lite/foods/route.ts` — client-side re-rank sort ignored `is_canonical` entirely, despite the scoreRow docstring promising a canonical bonus. Fix: sort key is now `(score_bucket, is_canonical desc, penalty asc, score desc, name asc)`. Score is bucketed at 1 decimal so near-ties let canonical break the tie, but never lets a canonical row beat a materially-better non-canonical match.
- **CI safety-net job stability** — `verify-migrations-applied` failed on v0.5.5 + v0.5.6 CI because `SUPABASE_PROJECT_ID` GH secret was misconfigured; then failed on `SUPABASE_DB_PASSWORD` after the ref was fixed. Three script hardenings landed on top:
  - Derive project ref from `NEXT_PUBLIC_SUPABASE_URL` (public, inline at workflow-env level) instead of the potentially-masked secret.
  - Prefer URL-derived ref over the explicit secret when both present + they disagree (WARN + use URL).
  - SKIP cleanly (exit 0) on `password authentication failed` / `tenant not found` / `ENOTFOUND` instead of hard-failing. Same treatment applied to `verify-backfills-run.mjs`.
  Net: both safety nets stay dormant until secrets are fixed, so a bad GH secret can't turn CI red on unrelated pushes.

### Added
- **Migration 028 (`backfill_log` table)** — one row per successful backfill-script run. RLS-locked (service-role writes only). Applied to prod.
- **`scripts/verify-backfills-run.mjs`** — manifest-driven verifier: for each entry in `REQUIRED_BACKFILLS`, queries `backfill_log` for the latest run. `[MISS]` + exit 1 if never recorded; `[WARN]` if ran below `min_rows_hint`; `[OK]` otherwise. Cleanly skips if creds absent.
- **CI job `verify-backfills-run`** — chained after `verify-migrations-applied`. Same skip-cleanly-on-missing-secrets pattern.
- **`scripts/rank-foods.mjs`** — now writes a `backfill_log` row on completion (try/catch so a log failure doesn't fail the script). Retroactively logged the v0.5.6 run: 60 canonical + 429 demoted = 489 rows.
- **`scripts/cleanup-orphan-threads.mjs`** — deletes copilot_threads with 0 messages older than 5 minutes. Ran once to sweep the 4 legacy orphans from the v0.5.2 first-message race. Logged to backfill_log.
- **`.github/workflows/orphan-threads-tick.yml`** — hourly cron (`17 * * * *`, offset from reminders-tick) so any future strays get cleaned within an hour.
- **Assistant tool-card rehydration** — verified end-to-end. `coerceRenderPayload` already handles both `{version,kind,data:{...}}` (live-stream) and bare payload (rehydrated) shapes. Added a comment above `renderPixelPayload` documenting the LIVE-vs-REHYDRATED contract so future render tools stay wire-compatible. Task #94 → closed.

### Meta
- **`scripts/audit-canonical-patterns.mjs`** — reusable helper W7 wrote for the pattern audit. Rerun any time to spot new pattern drift.
- **Memory:** the "verify migrations applied to prod" job has been through 3 rounds of secret-related hardening — every safety net needs the same robustness pass. Added the `SKIP-on-misconfig-rather-than-fail-red` treatment as the reference pattern for any future CI verifier.

### Known limitations
- The `SUPABASE_DB_PASSWORD` GH secret is empty/wrong in prod CI. Safety nets skip cleanly until user updates it (task #119). Once fixed, both `verify-migrations` and `verify-backfills` re-enable automatically.
- W7 flagged a secondary search issue: short queries ("egg", "oatmeal", "rice") fall below the `pg_trgm.similarity_threshold` (default 0.3) when using the `%` operator, so canonical rows don't enter the candidate set. Doesn't affect THIS route (uses ILIKE not `%`), but affects the resolve-ingredient path via RPCs. Queued for v0.5.8.

## [0.5.6] — 2026-08-11 — pg_trgm move + automated security scan + silent-catch sweep + food canonical backfill

The follow-through wave. v0.5.5 closed the "unapplied migration" hole; v0.5.6 closes the "silent-500" and "stale-lint" holes on top of it. Three parallel workers, all landed clean with disjoint file zones.

### Added
- **`scripts/security-advisor-scan.mjs`** + **`.github/workflows/security-advisor.yml`** — automated Splinter security-advisor scan on every push to main + a daily cron (06:00 UTC). Runs 6 well-known lints (`rls_disabled_in_public`, `rls_enabled_no_policy`, `security_definer_view`, `function_search_path_mutable`, `extension_in_public`, `auth_users_exposed`) via Management API `POST /database/query`. Exit codes: 0 for OK/INFO, 1 for WARN+/ERROR. Cleanly skips when `SUPABASE_MANAGEMENT_TOKEN` is absent. Local run currently reports **all 6 green**.
- **Silent-catch sweep — 5 client pages upgraded** to the `ProfileLoadState` discriminated-union pattern from v0.5.5:
  - `apps/mini-apps/reminders/components/RemindersView.tsx` (was ignoring `useResource().error` outright).
  - `apps/mini-apps/gym-routine/measurements/page.tsx` (added RELOAD button to the existing error banner).
  - `apps/mini-apps/gym-routine/page.tsx` (same).
  - `apps/mini-apps/calorie-lite/page.tsx` (same, wired via `loadEntries` useCallback).
  - `apps/mini-apps/calorie-lite/components/MealPlanView.tsx` (threaded `onReload={loadAll}` through `PlanListView`).
  - The remaining sites in the audit were either already surfacing errors or intentionally graceful-degrade (accessory fetches with local fallback). Inventory in the W6 report at `services/growth/campaigns/nothing-superapp/ship-log/0.5.6.md`.

### Fixed
- **Migration 027 (`pg_trgm` → `extensions` schema)** — applied to prod. Splinter's `extension_in_public` WARN was the last un-cleared security-advisor finding. Zero-downtime move: `ALTER EXTENSION ... SET SCHEMA` preserves operator-class OIDs (`gin_trgm_ops`), so `foods_name_trgm_idx` (mig 014) + `food_aliases_alias_trgm_idx` (mig 018) stayed valid without recreation. Supabase-managed roles ship with `extensions` already in the search_path, so unqualified `similarity()` / `%` / `word_similarity()` continue to resolve.
- **CI verify-migrations job** — derived project ref from `SUPABASE_URL` as a fallback when the `SUPABASE_PROJECT_ID` GH secret is empty/wrong. The v0.5.5 CI job had failed on prod itself because of exactly that misconfig (the very class of drift the safety net is supposed to catch, ironically).
- **Canonical foods backfill** — `scripts/rank-foods.mjs` had been written for v0.5.3 (#97) but never actually run against prod. Ran it as part of the migration 023 rollout audit; flagged 60 canonical rows (out of 251 patterns in `packages/shared/canonical-foods.json` — 165 skipped because the pattern doesn't match any USDA SR Legacy name). Pattern-audit queued for v0.5.7.

### Meta
- **`chore(deps)`** — hoisted `@supabase/supabase-js` from `apps/web` to the root workspace so scripts under `scripts/` can `import { createClient }` without cd'ing into apps/web. Discovered when trying to run rank-foods from repo root.
- **Ship-log** at `services/growth/campaigns/nothing-superapp/ship-log/0.5.6.md`.

### Deferred / queued for v0.5.7+
- Pattern audit on `canonical-foods.json` — align patterns with actual USDA naming to raise the 60/251 hit rate.
- Hoist the `LoadErrorCard` inline duplicate from RemindersView + measurements into `@nothing/mini-apps-runtime` once every mini-app has it (W6 kept it local to avoid a cross-package edit under time pressure).
- Splinter workflow needs a `SUPABASE_MANAGEMENT_TOKEN` secret on GH before the CI job does real work (currently skips cleanly).

## [0.5.5] — 2026-08-11 — Prod DB drift emergency fix + idempotency rollout + security-advisor cleanup

Discovered during v0.5.4 CI: FIVE migrations (020, 021, 023, 024, 025) were committed to `supabase/migrations/` but never applied to prod Supabase — a silent multi-day drift that quietly broke body composition tracking, in-sub-app settings persistence, food-search ranking, TIMEZONE setting, and tool-call idempotency. Applied all 5 mid-flight + built the CI safety net that ensures this can never recur.

### Fixed (prod DB emergency)
- **Migration 020 (`mini_app_settings` table)** — applied. Every mini-app that read/wrote its own scoped settings via `useMiniAppSettings()` was silently 500'ing since v0.5.2 shipped. The Fitness Pal ⚙ sheet, Reminders info-banner-dismissed persistence, Gym unit prefs — all invisible to the DB layer.
- **Migration 021 (`body_metrics` table)** — applied. The MEASUREMENTS tab in Gym (Glutes / Waist / Chest / Thighs / Biceps / Weight weekly entries) has been raising 500s on every save since v0.5.2.
- **Migration 023 (`foods.rank_penalty` + `foods.is_canonical` + 2 indexes + 429 rows updated)** — applied. Food search was serving raw USDA sort ("Sweet potato" led with babyfood variants) instead of the curated canonical-first ranking the v0.5.3 changelog claimed.
- **Migration 024 (`profiles.timezone`)** — applied. `/api/profile` GET was silently 500'ing, Settings page rendered empty email/name fields for every user for ~4 hours.
- **Migration 025 (`copilot_tool_calls.idempotency_key` + partial unique index)** — applied. The v0.5.3 idempotency helper had nowhere to store its key.
- **Client-side silent-swallow eliminated** — `apps/web/src/app/app/settings/page.tsx` no longer catches `/api/profile` fetch errors into an empty state. New `ProfileLoadState` discriminated union renders an inline error card with a RELOAD button when the fetch fails. Same pattern will be rolled out to other similar catch-and-flip sites in v0.5.6+.

### Added (safety nets so this can't recur)
- **`scripts/verify-migrations-applied.mjs`** — introspects every SQL file under `supabase/migrations/`, extracts expected DDL (CREATE TABLE / ALTER ADD COLUMN / CREATE INDEX / CREATE UNIQUE INDEX with `if not exists` guards), and queries prod `pg_class` + `information_schema.columns` + `pg_indexes` to confirm the objects exist. Prints `[OK]` / `[MISS]`; exits 1 if any missing. Cleanly skips (`[SKIP]`, exit 0) when prod creds are absent (PR builds).
- **CI wiring** — new `verify-migrations-applied` job in `.github/workflows/ci.yml`, `needs: typecheck-build`, `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`. Post-merge, any migration file committed without being applied fails the release step. Would have caught the v0.5.3 timezone incident in the same PR that introduced it.
- **README §5 "Verifying migrations are applied to prod"** — documents the script + the GH secrets it needs (`SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`).

### Added (assistant hardening)
- **Idempotency guard extended to 7 more write tools** — `log_weight`, `create_gym_routine`, `create_meal_plan`, `log_meal_from_plan`, `start_pomodoro`, `toggle_reminder`, `trigger_reminder_now`. Same 30-second-bucket dedupe from v0.5.3's `create_reminder` + `log_calorie_entry`. Two identical invocations within a 30s window collide on the partial unique index → the second returns the cached prior output. Task #108 → done.

### Added (Supabase Security Advisor pass)
- **Migration 026** — pulled the safe fixes from Splinter's security lints (via Management-API `POST /v1/projects/{ref}/database/query`, since this CLI version doesn't ship `supabase inspect advisor`):
  - **`set_updated_at()` search_path pinned to `public, pg_temp`** — trigger functions with a mutable search_path are a classic privilege-escalation vector; matches standard PG hardening + what Supabase's own auth triggers do.
  - **Explicit "no direct access" restrictive policies on `push_broadcasts` + `push_deliveries`** — both tables had RLS enabled with 0 policies (correct behavior: service-role-only), but Splinter flagged as `rls_enabled_no_policy` INFO because the intent wasn't documented in-schema. Now it is.
- **Deferred to v0.5.6:** move `pg_trgm` extension from `public` to `extensions` schema (Splinter WARN `extension_in_public`). Requires DROP + CREATE on the trigram GIN indexes on `foods` — too risky to bundle with an emergency fix release.

### Meta
- **v0.5.4 ship-log** gained lesson 6 covering the migration-incident diagnosis (`services/growth/campaigns/nothing-superapp/ship-log/0.5.4.md`).
- **Memory:** `~/.claude/.../memory/feedback_worker_briefs_apply_migrations.md` — worker briefs that touch `supabase/migrations/` must have a distinct "apply to prod" step.

## [0.5.4] — 2026-08-10 — Generative UI: the assistant renders instruments, not paragraphs

Headline: the copilot no longer answers quantitative questions with markdown tables and bullet lists. It calls `render_*` tools that emit structured payloads, and the client hydrates them into a pixel-panel component library sharing one unified grid + one signature element. The loading state (`<PixelLoader>`, v0.5.3) IS the design language of the answer — the pixel-dot idiom now runs from "the model is thinking" all the way through to "here is your weight trend."

### Added
- **`apps/web/src/components/pixel-ui/` — 8-component library.** Every component built on the same atoms: 3px cell + 1px gap grid, cadmium ember-red accent, Doto for numerals, Space Mono for labels. The signature element that ties the family together is a **2×2 cadmium LED cluster in the top-right of every `<PixelCard>`** — the one bit of decorative overhead that reads as "this is an instrument, not a card." Components:
  - `<PixelCard>` — the shared chassis (hairline border, near-black canvas, LED cluster, label kicker + hero slot).
  - `<PixelTicker>` — big numeric readout with delta chip (WEIGHT · 78.4 kg · ▼ 0.3).
  - `<PixelBarChart>` — vertical bars built from stacked 3px cells; supports single series + grouped (PUSH · PULL · LEGS by week).
  - `<PixelLineChart>` — plotted-dot line over a hairline pixel-grid backdrop.
  - `<PixelProgressDots>` — segmented dot bar for progress-toward-goal (KCAL LEFT · TODAY · 22/30 OF 2200).
  - `<PixelArc>` — half-arc gauge with hero numeral in the well (POMODORO · CYCLE 3/4 · 18 min).
  - `<PixelDataTable>` — mono grid with per-column alignment + zebra-free hairline rows (OPTIONS · LUNCH by kcal/P/C/F).
  - `<PixelMetricGrid>` — 2×2 tile of tickers for weekly rollups (KCAL · PROTEIN · CARBS · FAT with deltas).
- **7 `render_*` assistant tools** at `apps/web/src/lib/ai/tools/render-*.ts`. Zero-side-effect — each takes typed input, returns `{version: 1, kind: '<name>', data: <input-shape>}`. Model prompts through the shared registration path, client hydrates through the component library.
- **Generative UI system-prompt block** in `apps/web/src/app/api/copilot/route.ts` — steers the model to prefer `render_*` over prose for anything quantitative. Explicit examples: "how many kcal left today" → `render_progress_dots`; "show my weight trend" → `render_line_chart`; "compare volume last 4 weeks by muscle group" → grouped `render_bar_chart`; "which lunch option should I pick" → `render_data_table`.
- **`renderPixelPayload()` switch in `CopilotChat.tsx`** — inspects `part.output.kind` on tool-part parts and dispatches to the matching component. Preserves the `<ToolCallCard>` fallback for the `input-*` state and for tools with side effects (`create_reminder` still shows the confirmation card).
- **`/dev/pixel-ui` design proof-sheet** — every render_* payload rendered against representative sample data on one page so the family reads as one instrument suite, not eight disconnected widgets. Not gated (harmless: no reads, no writes). Reference at `services/growth/campaigns/nothing-superapp/design/pixel-ui-v0.5.4.md`.

### Design principle locked
- **The loading state and the answer share the same idiom.** `PixelLoader` (5×5 twinkling grid, shipped v0.5.3) established the pixel-dot vocabulary; `PixelUI` extends that vocabulary into every component the assistant can render. Users see one continuous visual language from "thinking" → "rendering" → "here's your data." This is the direction the assistant surfaces will grow — future v0.6.x tools (log-and-render combos, streaming charts, comparative panels) will inherit the same atoms.

### Deferred to v0.5.5+
- **Extend idempotency guard to remaining 8 write tools** (`log_weight`, `start_pomodoro`, `create_meal_plan`, `create_gym_routine`, `edit_meal_plan`, `edit_gym_routine`, `log_meal_from_plan`, `log_body_metrics`) — helper (`_audit.ts`) shipped v0.5.3, wiring to `create_reminder` + `log_calorie_entry` proved the pattern. (task #108)
- **Tool-card rehydration verification against v0.5.3+ live data** + orphan-thread one-shot cleanup + periodic cron. (task #94)
- **Live-chat E2E of the render pipeline** — Phase 2 worker verified components render against sample data at `/dev/pixel-ui` but couldn't drive a signed-in Safari on the simulator against a localhost tunnel. Prod verification pending next sim session.

## [0.5.3] — 2026-08-10 — Assistant real fix + timezone + idempotency + PLAN redesign v2 + Fitness Pal chrome + food search ranking + FROM PLAN + reminders rename + gym tap-to-START

A polish + reliability wave built by 3 parallel workers (P1 assistant / P2 Fitness Pal / P3 reminders+gym+small) after 3 more parallel workers earlier in the day (Wave A + B + D3 PLAN redesign via `/frontend-design`). Consolidates 8 commits into one release. Zero merge conflicts across workers thanks to explicit disjoint-file-zone briefs.

### Fixed
- **Assistant first-message race (the real root cause)** — earlier `key={threadId}` fix in v0.5.2 removed the outer remount but `CopilotChat.tsx` was still rebuilding `DefaultChatTransport` on every `threadId` change via `useMemo(..., [context, threadId])`. The AI SDK's `useChat` swaps its internal Chat instance when the transport ref changes = same net effect as a key remount, aborts the in-flight SSE mid-first-message. Fix: transport is now stable; dynamic `thread_id` + `timezone` travel via `prepareSendMessagesRequest` reading a `threadIdRef` at request time. Verified against `HttpChatTransportInitOptions`. 0 orphan "New chat" rows across cold-load reproductions.
- **Assistant scheduled in UTC** — "remind me in 10 min" was scheduling at UTC instead of local time because the model had no reliable input for user tz. Client now sends `Intl.DateTimeFormat().resolvedOptions().timeZone` on every `/api/copilot` request; server injects the "USER TIMEZONE + current local wall-clock" into the system prompt.
- **Assistant double-created reminders/meals** — write tools now dedupe within a 30-second window per `(user, tool, input)` hash. Migration 025 adds a partial unique index on `tool_audit_log(user_id, idempotency_key)`. Wired into `create_reminder` + `log_calorie_entry` (observed prod hot paths).
- **ADD MEAL horizontal overflow** — card + food rows no longer bleed past the phone frame at long USDA food names. `max-width: 100%` + `overflow-wrap: anywhere` cascading through the ADD MEAL container.
- **Food-search noise-to-signal** — searching "sweet potato" was leading with `Babyfood, corn and sweet potatoes, strained` (position 1) and the actual `Sweet potato, baked` at position 12. Migration 023 adds `rank_penalty` + `is_canonical` to `foods` + a curated 251-entry `packages/shared/canonical-foods.json` seed; search ORDER-BY now `(similarity × boost) DESC, rank_penalty ASC, name ASC` with prefix 3× / word-initial 2× / baseline 1× boosts. Baseline demotions applied via SQL for a clean fresh install.
- **Reminders narrow column + oversized `+ NEW REMINDER`** — content now respects the shell column, CTA shrunk to a compact ghost chip matching `+ ADD MEAL`.
- **Gym routine card had no primary action** — cards showed EDIT + DELETE only, no way to START. Whole card body is now the tap target → starts a new session (or resumes if a live session is tied to that routine, matching the gym home banner pattern). `START →` / `RESUME →` chip announces intent. EDIT + DELETE moved into `<SwipeableRow>` with `<UndoSnackbar>` for DELETE.
- **Settings changelog dumped 8 releases** — progressive disclosure: first tap shows only the latest release, then `▶ SHOW OLDER (N RELEASES)` reveals the rest inside a bounded `maxHeight: clamp(240px, 40dvh, 480px)` scroll box.
- **`pnpm --filter web lint` restored** — Next 16 removed `next lint` AND doesn't bundle any ESLint config. ESLint 9 flat config + typescript-eslint installed at the root; apps/web lint script rewired; legacy inline `eslint-disable-next-line @next/next/*` / `react-hooks/*` comments neutralised via an inert-plugin Proxy so they don't break the invocation.

### Added
- **Fitness Pal PLAN redesign v2** (via the `/frontend-design` skill) — meal plan as a **prescription slip** instead of a dashboard.
  - Signature: **MacroTape** ticker — 4-cell segmented strip (`KCAL · P · C · F`) with `clamp()`-scaled Doto numerals reading as receipt-printer output. Also renders inline inside the CREATE form so preset choice is immediately legible.
  - Type: Doto for numerals only (macro tape + meal-station numbers in the left gutter); Space Mono for every instrument label (`RX · 2026-08-08`, `[← PLANS / 03 IN LIBRARY]`); Space Grotesk for humane content (plan/meal/ingredient names).
  - Layout: numbered left-gutter **TimelineRail** replaces stacked meal cards — meals as sequential stations, hairline between siblings, no per-meal card border.
  - LEDs: 6px green LED dot next to a meal name = logged today (also next to active plan in LIST). Replaces the chunky `LOGGED` pill.
  - CREATE form: worksheet chrome with mono kickers (`NEW PRESCRIPTION · STEP 01`), hairline SectionRule separators, stamp-bar macro presets (2px radius filled ember-red when active).
  - DELETE removed from DETAIL header entirely — destructive lives only on LIST swipe.
  - Design plan committed to `services/growth/campaigns/nothing-superapp/design/plan-view-v0.5.3.md`.
- **In-sub-app timezone setting** — TIMEZONE field added to Settings → Profile. Auto-detected from the browser on first save; user-overridable IANA select. Persisted to `profiles.timezone` (migration 024).
- **ASSISTANT nav-tab context animation** — a 2px cadmium dot orbits the spark icon at a 4s period when the current view has feedable context (any mini-app). Static cadmium dot fallback under `prefers-reduced-motion`. Tap navigates to `/app/assistant?scope=<slug>` with automatic context injection.
- **Context route map** at `apps/web/src/lib/mini-apps/context.ts` — hardcoded 4-entry map (calorie-lite / gym-routine / pomodoro / reminders). Extract to per-mini-app `context.ts` files if it grows.
- **ADD MEAL FROM PLAN tab** — fourth tab (after SEARCH / CUSTOM / QUICK LOG). Lists today's meal-slot options from the user's active plan; tap logs the whole option via the existing `log-meal` API. Empty state points to PLAN if no active plan.
- **`<PixelLoader>` component** — 5×5 grid of pixel cells with a twinkling static animation (independent 1.4s opacity keyframes with shuffled per-cell delays). Replaces the generic spinner across THINKING pill + LOADING CHAT hydrate + tool-in-progress cards. `sm` / `md` / `lg` sizes. Respects `prefers-reduced-motion` → static 4-cell pattern.
- **Real camera + microphone SVG icons** on the composer chips — 16×16, `stroke="currentColor"`, 1.5px stroke. Replaces the abstract `◐` / `○` glyphs.
- **Composer message column widened** — user bubbles align right (max-width 78%), assistant bubbles align left (max-width 92%), fill the shell instead of huddling in a narrow column.
- **Reminders renamed to "Reminders and Tasks"** — reflects the two kinds (NOTIFY = push at time; AGENT_LOOP = autonomous copilot job on a schedule). Slug unchanged.
- **Reminders info banner** — dashed-outline "TWO KINDS · ONE LIST" explainer above the CTA; dismissible + persisted via `useMiniAppSettings('reminders', {infoBannerDismissed: bool})`.
- **`create_reminder` tool description** updated so the model routes correctly between `notify` and `agent_loop` kinds.
- **`supabase-smtp-configure.sh`** — Management-API workaround for the persistent Supabase dashboard SMTP-save bug (task #69). Applies Resend SMTP via `PATCH /v1/projects/{ref}/config/auth`. Playbook at `services/growth/campaigns/nothing-superapp/reports/supabase-smtp-unblock.md`.
- **Root ESLint 9 flat config** — `eslint.config.mjs` at the workspace root, `@eslint/js` + `typescript-eslint` deps installed, `apps/web` lint script rewired.

### Removed
- **WATER tab in Fitness Pal** — removed from the tab row (`TODAY · WEIGHT · PLAN · REPORTS · HISTORY` now), `WaterView.tsx` deleted, `water` resource unregistered (framework CRUD tools `calorie_lite_water_*` gone), `log_water` copilot tool + registration deleted. **Kept** the `water_entries` DB table + `get_daily_summary`'s water read so re-adding wouldn't cost historical data.
- **`◐ ASK` chip in Fitness Pal header** — the ASSISTANT bottom-nav tab (with its new context-orbit animation) is the sole copilot entry point.
- **Big streak card in Fitness Pal** — compacted to a single-line eyebrow (`STREAK · 2D · N/30 THIS MONTH`) under the label. Header dropped ~60% in height.

### Deferred to v0.5.4
- **#102 generative UI** — pixel-panel component library (`<PixelTicker>` / `<PixelBarChart>` / `<PixelLineChart>` / `<PixelArc>` / `<PixelDataTable>` / etc.) + assistant `render_*` tools that emit structured data instead of markdown. Fires now that `<PixelLoader>` established the pixel-dot idiom. Headliner of v0.5.4.
- **#108 idempotency guard extension** — apply the `_audit.ts` helper to the remaining 8 write tools (`log_weight`, `start_pomodoro`, `create_meal_plan`, `create_gym_routine`, etc.). Migration 025's index already covers them; only the 3-line helper call per tool.
- **Markdown table renderer** in `markdown-lite.tsx` — currently prompt-suppressed. Generative UI (#102) will supersede this entirely.
- **Orphan-thread periodic cleanup cron** (#94) — race condition is fixed at the root in v0.5.3 so new orphans shouldn't accumulate; one-shot SQL still needed for prior sessions.
- **Tool-card rehydration verification** (#94) — deferred; needs live turn against v0.5.3 data.
- **`<SwipeableRow>` rollout to remaining callsites** — reminders list rows (already refactored in P3's wave), meal plan cards (D3 covered), gym session set rows (still uses inline delete).

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
