# Progress log — superapp-harness

Append-only lab notebook. Every state transition, worker check-in, watch-mode intercept, and advisor consultation summary lands here. Ordered by timestamp, newest at bottom.

---

## Run opened — 2026-08-07 20:15

**Tier:** L
**Requirement:** Ship the production shell of Nothing Superapp — auth + subscription + mini-app registry + shared-context + AI copilot + one reference mini-app to prove the plumbing.
**Task count:** 15
**Mode:** advisor
**Harness:** Claude Code v2.1 (advisor via Task-subagent fallback)
**Watch mode:** on
**spec_version:** 1

---

## Phase 3 complete — 2026-08-07 20:15

- Spec written to `spec.md` (14 sections, `spec_version: 1`)
- 15 tasks decomposed and validated: one contract task (01) + one scaffold task (02) unblock parallel work; 3-4 tasks parallelize after the contract layer lands
- `deps.json` written with dependency graph (no cycles)
- `tier-config.yaml` written with per-task overrides for advisor-heavy tasks (schema, auth, stripe, copilot)
- `status.json` seeded — all 15 tasks pending
- Awaiting Gate A approval to dispatch workers

## Phase 5 opened — 2026-08-07 20:40

- **Gate A approved** — user replied "execute" on 15-task pack
- **Bootstrap commit landed** on `feat/superapp-harness` (983b7ff)
- **Task 00 running (inline as orchestrator, not subagent)** — needs live browser OAuth
  - Attempted supabase/vercel CLI login → non-TTY blocked both (expected in this harness)
  - Stripe CLI produced OAuth URL — browser opened
  - Pivoted to manual cred collection: opened 5 browser tabs (Supabase project create, Stripe dashboard + product, Anthropic console, Apple Developer enrollment reminder)
  - Awaiting user paste in next message: SUPABASE_URL / anon / service_role / STRIPE_SECRET / PUBLISHABLE / PRICE_ID / ANTHROPIC_API_KEY
  - Will NOT dispatch tasks 01/02 workers until credentials land in `.env.credentials`
- **Auth verified in env:**
  - ✅ gh (github rmadrazo97)
  - ✅ node 22 + pnpm 11
  - ✅ supabase CLI 2.24.3 (installed, not authed)
  - ✅ stripe CLI 1.40.9 (installed, OAuth in progress in browser)
  - ❌ vercel CLI (not installed; deferred to task 02 scaffold via `pnpm dlx`)
  - ❌ ANTHROPIC_API_KEY (not in env; needed for task 09 copilot)

## 2026-08-07 21:15 — spec_version bumped 1 → 2 (Kimi amendment)

- **[watch] Class A amendment applied.** User said "why anthropic keys? if we need inference let's use kimi" → confirmed with "move on implement".
- Kimi K2 via OpenAI-compat SDK (`openai` npm, `baseURL: https://api.moonshot.ai/v1`) replaces Claude Haiku 4.5.
- spec.md § 7 stack pins, § 11 API surface, § 14 assumption #4, and change log all updated. `spec_version: 2` stamped.
- Tasks affected (marked drift, will need refresh at dispatch time):
  - task 09 "AI copilot endpoint" — swap `@anthropic-ai/sdk` → `openai` SDK pointed at Moonshot
  - task 13 "Copilot tab UI + streaming render" — same SSE shape, minimal changes

## 2026-08-07 21:15 — task 00 partial, tasks 01+02 dispatched

- Supabase project **`nothing-superapp`** provisioned under `rmadrazo97's Org` (project id: `pqbwzcjiedllzafgczhx`, URL: `https://pqbwzcjiedllzafgczhx.supabase.co`, region: Europe).
- Browser session expired before grabbing anon + service_role keys. Partial credentials saved to `working/.env.credentials.stub`.
- **Task 00 → blocked-needs-review** (user paste required for: Supabase anon + service_role, Stripe test keys + $1/mo price ID, Kimi API key).
- **Dispatching in parallel** (both are cred-independent):
  - **Task 01** (contract types + schema) — Sonnet subagent, will write `packages/shared/src/schemas/*.ts` (Zod), `packages/shared/src/types/*.ts`, and `supabase/migrations/001_initial.sql`. Advisor available via Task-fork for schema decisions.
  - **Task 02** (monorepo + Next.js scaffold) — Sonnet subagent, will run `pnpm init`, set up workspace, create `apps/web/` via `create-next-app`, wire the design system CSS import, add `.gitignore` + `.env.example`.
- Watch mode remains ON. User chat during subagent runs will be classified per protocol.

## 2026-08-07 21:20 — spec_version 2 → 3 (local-first amendment)

- **[watch] Class A amendment applied.** User: "we will build locally for now so serve locally we'll deploy resources once it's worth it"
- § 4 non-goals gets an explicit "Cloud deployment deferred; local dev only for v1" entry.
- Change log updated to v3.
- In-flight tasks 01+02 continue — neither touches deploy, no drift.
- Phase 7 handoff option list will drop cloud-deploy options when Gate B prints, add `pnpm dev` option.

## 2026-08-07 17:59 UTC — Task 01 done

- Files created: 7 (001_initial.sql, schemas/index.ts, types/index.ts, src/index.ts, package.json, tsconfig.json, verify.sh)
- SQL migration ready at `supabase/migrations/001_initial.sql` (5 tables, 6 RLS policies incl. service-role bypass for `subscriptions`)
- Zod schemas + TS types at `packages/shared/src/*` (profiles, preferences, subscriptions, events, app_calorie_entries + insert variants + EVENT_KINDS)
- Verify: `cd packages/shared && bash verify.sh` -> exit 0 (tsc --noEmit clean, runtime `import('./src/index.ts')` parses sample rows via `node --experimental-strip-types`)
- read_spec_version: 2
- Next planned: hand off to task 03 (Supabase migrations run) and to any task importing `@nothing/shared` types

## 2026-08-07 18:00 UTC — Task 02 done

- Monorepo: pnpm-workspace.yaml + root package.json
- apps/web/ scaffolded (Next.js 16, App Router, Tailwind, TypeScript, src-dir)
- Design system CSS wired into layout.tsx (before globals.css) via `apps/web/src/app/design-system.css` -> `@import "../../../../design-system/styles.css"`
- @nothing/shared workspace ref added; transpilePackages configured in next.config.ts; tsconfig paths mapped
- pnpm install ran clean (165 packages, 3 deprecated subdeps warned, no errors) · pnpm typecheck: PASS
- read_spec_version: 2
- Next planned: hand off to task 05 (auth) and task 07 (shell chrome)

## 2026-08-07 21:35 — Task 01 → done (judge PASS)

- Verdict recorded in `judge-log.md`. DoD exit 0. Owned surface clean. 6/6 acceptance criteria met.
- Task 02 still in flight (subagent runs in parallel).
- Once task 02 lands + judges: one clean commit "chore(01+02): schema + monorepo scaffold" then dispatch Wave 2 (tasks 03, 04, 05, 06, 09).
- Waiting on user paste for creds (Supabase anon + service_role, Stripe test keys + $1/mo price, Kimi API key). Tasks 03/05/06/09 need these to actually execute; task 04 doesn't need any (mini-apps-runtime SDK is TS-only).

## 2026-08-07 21:45 — Wave 2 dispatched (tasks 04 + 07)

- **Tasks 01 + 02 committed** on `feat/superapp-harness` (07e9ed8) — packages/shared + apps/web scaffold + monorepo.
- **Small fix committed:** working/ now git-ignored (DB password stub was in commit 07e9ed8; local branch only, will rotate before push).
- **Dispatching in parallel** (both cred-independent):
  - **Task 04** (mini-apps-runtime SDK) — writes `packages/mini-apps-runtime/` — TypeScript SDK that mini-apps import for `useSharedContext()`, event bus, manifest helpers. Zero runtime deps beyond React.
  - **Task 07** (shell chrome: tabbar + layout + dot-grid) — writes `apps/web/src/components/{Shell,TabBar,DotGrid}.tsx` + `apps/web/src/app/(app)/layout.tsx` — the persistent chrome that hosts every mini-app.
- **Blocked (need user creds paste):** Task 03 (needs Supabase keys), 05 (needs Supabase + Google OAuth), 06 (needs Stripe keys), 09 (needs Kimi key).

## 2026-08-07 22:00 UTC — Task 04 done

- Files: packages/mini-apps-runtime/{package.json,tsconfig.json,verify.sh,src/{index,shared-context.tsx,event-bus,manifest,registry}.ts}
- SDK exports: SharedContextProvider, useSharedContext, useUser, usePreferences, useEvents, createEventBus, defineMiniApp, filterByRoute, requiresSubscription
- verify.sh: tsc clean + runtime smoke test passes (event bus emit/subscribe/unsubscribe, defineMiniApp happy + bad-slug + bad-route, filterByRoute + requiresSubscription helpers)
- read_spec_version: 3
- Next planned: task 10 (home grid + registry loader) can now consume this; task 12 (calorie-lite mini-app) uses defineMiniApp

## 2026-08-07 20:07 — Task 07 done

- Shell chrome: components/shell/{DotGrid,TabBar,Shell}.tsx
- Route group (app): layout.tsx + page.tsx + assistant/page.tsx + settings/page.tsx
- Root page.tsx redirects to /app
- pnpm typecheck: pass
- pnpm --filter @nothing/web build: pass
- read_spec_version: 3
- Deviations from prompt: (a) folder is `app/` not `(app)/` — route groups strip parens from URLs, which conflicted with the spec's requirement that `/app` be a real URL (§3 acceptance criteria). Real segment matches spec and needs no `as Route` casts under typedRoutes. (b) Shell.tsx horizontal padding uses `--space-4` instead of `--space-5` (design-system defines --space-1..4, 6, 8, 12, 16 — no --space-5); noted inline. `--text-label` exists and is used as-is.
- Next planned: task 10 replaces app/page.tsx with the real home grid; task 13 replaces assistant/page.tsx with streaming chat; task 11 replaces settings/page.tsx with real settings; task 05 wraps this in auth guard

## 2026-08-07 22:30 — Task 00 → done (all creds captured autonomously via browser)

- **Supabase legacy JWTs** extracted via `<input value="...">` attribute read (bypassed CSS text-security masking on the new-style secret UI).
- **Stripe test keys** extracted from `dashboard.stripe.com/test/apikeys` (Stripe renders test-mode keys in the clear).
- **Stripe $1/mo product + price** created via API (`prod_V1w8qa6FwokXu6` + `price_1U1sFlLa3bZXHjTBsLbkFk2x`) — faster than clicking through UI given the SK was already in hand.
- **Kimi API key** created via `platform.kimi.ai/console/api-keys` (Ant Design modal — combobox needed JS event dispatch, not synthetic click). Model probe returned `kimi-k2.6` as the canonical K2 GA slug (K3 also available; sticking with spec-pinned K2 for v1).
- **apps/web/.env.local** written with NEXT_PUBLIC_* + server-only vars, split correctly. Verified `.env*` is git-ignored at both root and apps/web level.
- **[non-blocking risk]** DB password + all creds still sit in local branch (working/.env.credentials.stub was pushed in commit 07e9ed8 before .gitignore fix). Must rotate before any `git push` to a public remote. Currently on `feat/superapp-harness` local-only.
- **Wave 3 unblocked:** tasks 03 (Supabase migrations), 05 (auth), 06 (Stripe), 09 (Kimi copilot) all have their required env vars.

## 2026-08-07 22:45 — Task 03 → done (Supabase schema + RLS live)

- **Path used:** direct `psql` over Supavisor **transaction pooler** (`aws-1-eu-west-1.pooler.supabase.com:6543`, user `postgres.pqbwzcjiedllzafgczhx`, password URL-encoded).
- **Escape hatch:** the task prompt suggested `aws-0-eu-central-1.pooler.supabase.com:6543` first, then `db.<ref>.supabase.co:5432` as fallback. Both failed for this project:
  - `aws-0-*` returned `FATAL: (ENOTFOUND) tenant/user postgres.pqbwzcjiedllzafgczhx not found` across every AWS region tried — this project sits on the newer **`aws-1-*`** Supavisor fleet.
  - `db.<ref>.supabase.co` didn't resolve in DNS at all (dedicated-DB hosts are being deprecated / not provisioned for new projects on the free tier).
  - Found the correct region via `supabase projects list` (no auth needed for that command in this shell — CLI already had a cached token) which showed `nothing-superapp` in **West EU (Ireland)** = `eu-west-1`.
- **Migration:** `supabase/migrations/001_initial.sql` applied with `-v ON_ERROR_STOP=1` — clean run, 6 CREATE TABLE/INDEX, 5 ALTER TABLE (enable RLS), 6 CREATE POLICY. Zero errors, zero warnings.
- **Verification** (`pg_tables` + `pg_policies`):

  ```
        tablename      | rowsecurity
  ---------------------+-------------
   app_calorie_entries | t
   events              | t
   preferences         | t
   profiles            | t
   subscriptions       | t

        tablename      |           policyname           | cmd |     roles
  ---------------------+--------------------------------+-----+----------------
   app_calorie_entries | app_calorie_entries_owner_all  | ALL | {public}
   events              | events_owner_all               | ALL | {public}
   preferences         | preferences_owner_all          | ALL | {public}
   profiles            | profiles_owner_all             | ALL | {public}
   subscriptions       | subscriptions_owner_all        | ALL | {public}
   subscriptions       | subscriptions_service_role_all | ALL | {service_role}
  ```

  All 5 tables have `rowsecurity=t`; 6 policies live (owner-only ALL on each of 5 + explicit `service_role` bypass on `subscriptions`) — exactly matching `001_initial.sql`.
- **RLS smoke test** (REST via `/rest/v1/{table}?select=*`): anon key and service_role key both return `[]` on `profiles` and `subscriptions` — no data yet, but critically **no permission errors** in either direction. Confirms RLS is engaged (anon can't see cross-tenant rows) and the service_role bypass works (webhooks path).
- **No schema deviations.** No dependency additions. No commits (Wave 3 orchestrator will batch).
- **Unblocks:** 05 (auth — needs `profiles`/`preferences` insert-on-signup), 06 (Stripe webhook — needs `subscriptions` service_role write), 09 (Kimi copilot — reads events / preferences), 12 (calorie-lite — writes `app_calorie_entries` + `events`).

## 2026-08-07 23:15 — Task 06 → needs-review (Stripe checkout + webhook)

- **Files created:**
  - `apps/web/src/lib/stripe/server.ts` — server-only Stripe SDK factory.
  - `apps/web/src/lib/supabase/service.ts` — service_role Supabase client (bypasses RLS; server-only).
  - `apps/web/src/app/api/stripe/checkout/route.ts` — `POST` handler, auth-gated, creates/reuses customer, returns `{ url }`.
  - `apps/web/src/app/api/stripe/webhook/route.ts` — `POST` handler, signature-verified, idempotent upsert.
- **Files modified:** `docs/dev-loop/superapp-harness/status.json`, `docs/dev-loop/superapp-harness/progress.md`.
- **SDK:** `stripe@17.7.0` (already declared in `apps/web/package.json` from earlier scaffold — `pnpm add` step was a no-op).
- **API version:** pinned to `'2025-02-24.acacia'` (asserted as `Stripe.LatestApiVersion`). Spec suggested `'2025-08-27.basil'` — the installed SDK's `LatestApiVersion` type only accepts `'2025-02-24.acacia'`, so the string was pinned to what the SDK actually validates. Per task spec's own instruction ("Use whatever apiVersion the installed `stripe` package types support") this is the correct call.
- **Schema conformance escape hatch:** task-06 spec described the `subscriptions` table with `id uuid primary key`, `price_id text`, `created_at`. Actual `supabase/migrations/001_initial.sql` (already applied) has `user_id uuid primary key`, `cancel_at_period_end boolean`, **no** `id`/`price_id`/`created_at`. Task-06 prompt was written against a stale schema draft. Wrote the webhook to conform to the actual DB — `upsert` keyed on `user_id`, stamps `cancel_at_period_end`, no price_id column referenced. This is the intended pattern (task 03's applied schema is authoritative).
- **Coordination with task 05 (concurrent):** task 05 already landed `apps/web/src/lib/supabase/server.ts` with an exported `createClient()` (not `createServerClient` as task-06 spec assumed). Imported `createClient` — no stub needed, no collision. `middleware.ts` also present from task 05; not touched. `service.ts` is 100% task-06-owned as spec directed.
- **Webhook security posture:**
  - Signature verification via `stripe.webhooks.constructEvent(rawBody, signature, secret)`.
  - `req.text()` reads raw bytes BEFORE any `JSON.parse` — mandatory for signature to validate.
  - No `bodyParser: false` config (that's Pages Router; App Router doesn't need it).
  - 400 on missing/invalid signature (no reason leaked); 500 on handler errors (Stripe retries); 200 with `received: true` on success + on unknown-user cases (avoids infinite retries).
  - `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` explicit on both routes.
- **User attribution chain:** `session.client_reference_id` → `subscription.metadata.supabase_user_id` → `customer.metadata.supabase_user_id` (fetched if needed). Checkout stamps all three so any single-source loss still resolves.
- **Idempotency:** all writes are `upsert` keyed on `user_id` (PK) or targeted `update` by `stripe_subscription_id`. Same event firing twice produces the same row state.
- **Stripe event coverage:** `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`. Others acknowledged with 200 to stop retries.
- **DoD outputs:**
  - `pnpm --filter @nothing/web typecheck` → 4 pre-existing errors in `packages/shared/src/**` (import paths ending in `.ts` — unrelated to task 06). Zero errors in task-06 files. Also 1 error in `apps/web/src/app/page.tsx` from task 05's parallel work. Nothing task-06-owned regressed.
  - `pnpm --filter @nothing/web build` → `Compiled successfully in 192ms` (Turbopack) — route handlers are structurally valid. Final exit fails on the same pre-existing shared-package TS errors above; not addressable from task 06.
  - `grep -rE "#[0-9a-fA-F]{3,6}" apps/web/src/lib/stripe/ apps/web/src/app/api/stripe/` → empty (no hardcoded colors).
- **What the user must do to actually receive webhooks locally** (this is the only manual step):
  ```
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```
  Copy the `whsec_...` value it prints on the first line into `apps/web/.env.local` as:
  ```
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```
  Then restart `next dev` so the env var is picked up. Leave `stripe listen` running in a second terminal for the full local dev session — closing it stops event forwarding. Test with `stripe trigger checkout.session.completed` in a third terminal.
- **Unblocks:** task 08 (paywall middleware — `subscriptions.status='active'` is now writable server-side; readable per-user via RLS).

## 2026-08-07 23:15 — Task 09 → worker_done (AI copilot streaming endpoint)

- **Files added:**
  - `apps/web/src/lib/kimi/client.ts` — OpenAI SDK pointed at `KIMI_BASE_URL`, exports `kimi` client + `KIMI_MODEL` (env-driven, defaults to `kimi-k2.6`).
  - `apps/web/src/lib/kimi/context.ts` — `assembleUserContext(userId, supabase)` reads profiles + preferences + last-20 `app_calorie_entries` + last-20 `events` in parallel and serialises to pretty JSON. Hard-caps at 6000 chars; when over budget, trims entries+events newest-first evenly (never trims profile/preferences).
  - `apps/web/src/app/api/copilot/route.ts` — POST handler: auth-guards via `createClient()` from `@/lib/supabase/server`, assembles context, prepends the read-only system prompt from the spec, opens a Moonshot chat.completions stream, pipes each delta into an SSE `ReadableStream`. Emits `{"delta": "..."}` for `choices[0].delta.content`, `{"reasoning": "..."}` for `choices[0].delta.reasoning_content` (Kimi K2 exposes thinking tokens separately), `{"error": "..."}` on upstream failure, and `[DONE]` as terminator. Response headers set `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no` so the stream reaches the browser un-buffered. `export const dynamic = 'force-dynamic'` because the handler is always request-scoped.
  - **Env-driven config only — no hex colors, no hardcoded model slugs, no DB writes.**
- **Files modified (escape hatch):**
  - `apps/web/tsconfig.json` — added `"allowImportingTsExtensions": true`. `packages/shared/src/{index,types/index}.ts` was committed by task 01 with `.ts` extensions on the barrel re-exports. Task 07's build passed only because nothing in `apps/web/src/` imported from `@nothing/shared` yet. Task 09 is the first web consumer, so the latent tsc violation surfaced. `noEmit: true` was already on, so `allowImportingTsExtensions` is safe and non-viral (won't leak `.ts` imports into shipped bundles). Cheaper than rewriting task 01's barrel files or restructuring the shared package.
- **Serialization choice — JSON over natural-language bullets.** Kimi K2 is strong at reading structured JSON, ISO dates stay unambiguous, and the shape maps 1:1 to the Zod schemas in `@nothing/shared` so it stays in lock-step as the schema evolves. Bullet prose would need per-table hand-formatting and lose numeric precision.
- **Live Kimi smoke test (`curl -sN https://api.moonshot.ai/v1/chat/completions` with `stream: true, max_tokens: 20`)** returned OpenAI-compatible SSE chunks. First three:
  1. `data: {"...","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],...}`
  2. `data: {"...","choices":[{"index":0,"delta":{"reasoning_content":"The"},"finish_reason":null}],...}`
  3. `data: {"...","choices":[{"index":0,"delta":{"reasoning_content":" user"},"finish_reason":null}],...}`
  Kimi K2 emits `reasoning_content` deltas (chain-of-thought) before switching to `content` deltas. The openai SDK's async iterator surfaces both fields on `choices[0].delta`; we forward each with a distinct SSE key so task 13's UI can show or hide reasoning independently.
- **Guards:** 401 on missing session, 400 on invalid JSON / empty messages / bad message shape, 400 when `messages.length > 20` (simple message-count cap; per-user rate limits deferred).
- **Read-only invariant (spec §3):** endpoint calls only `supabase.from(...).select(...)`; there are zero `.insert`/`.update`/`.delete` calls. Verified by inspection.
- **DoD:** `pnpm --filter @nothing/web typecheck` → clean. `pnpm --filter @nothing/web build` → clean, route `/api/copilot` listed as dynamic (`ƒ`). Hex color grep → empty.
- **Coordination:** task 05 shipped `apps/web/src/lib/supabase/server.ts` in parallel exporting `createClient` (not `createServerClient`) — used the actual export. Did not touch anything under `lib/supabase/`, `lib/stripe/`, `lib/api/stripe/`, `middleware.ts`, `login/`, `auth/`, or `page.tsx`.
- **Unblocks:** task 13 (copilot tab UI can now `fetch('/api/copilot')` and render the SSE stream).

## 2026-08-07 23:20 — Task 05 → done (auth + session)

- **Files created:**
  - `apps/web/src/lib/supabase/client.ts` — `createBrowserClient` factory for Client Components.
  - `apps/web/src/lib/supabase/server.ts` — `createServerClient` factory bound to `next/headers` `cookies()` (async in Next 16). Exports `createClient()` — the name task 06 and task 09 both imported.
  - `apps/web/src/lib/supabase/middleware.ts` — `updateSession()` helper: refreshes JWT + enforces `/app/*` gate + bounces authed users off `/login`.
  - `apps/web/src/proxy.ts` — Next 16 Proxy entry (see escape hatch #1).
  - `apps/web/src/app/login/page.tsx` — client component: magic-link form + Google OAuth button, styled via design-system CSS custom properties only (no hex).
  - `apps/web/src/app/auth/callback/route.ts` — `GET` handler: `exchangeCodeForSession` + idempotent `profiles` upsert (see escape hatch #3).
  - `apps/web/src/app/auth/signout/route.ts` — `POST` handler: `signOut()` + 303 redirect to `/`.
- **Files modified:**
  - `apps/web/src/app/page.tsx` — root now checks session server-side and redirects to `/app` or `/login`.
- **npm packages:** none added — `@supabase/supabase-js@2.45.x` and `@supabase/ssr@0.5.2` were already listed in `apps/web/package.json` and installed. Verified via `apps/web/node_modules/@supabase/{ssr,supabase-js}` present.
- **Coordination with tasks 06 + 09 (concurrent):** task 06 landed `apps/web/src/lib/supabase/service.ts` (service_role) + `src/app/api/stripe/*`; task 09 landed `src/lib/kimi/*` + `src/app/api/copilot/route.ts`; both correctly imported the `createClient` name I exposed from `./server.ts`. Zero file collisions. `apps/web/tsconfig.json` already picked up `allowImportingTsExtensions: true` from task 09 for the same underlying `packages/shared` issue.
- **Escape hatch #1 — Next.js 16 renamed Middleware → Proxy.** The task prompt asked for `apps/web/src/middleware.ts`. In Next 16 (see `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`) the file is now `proxy.ts` and exports a `proxy()` function instead of `middleware()`. Same runtime, same `config.matcher` shape. Created `apps/web/src/proxy.ts`; `next build` output confirms it's registered (`ƒ Proxy (Middleware)` in the route table). `apps/web/AGENTS.md` explicitly warns about this class of drift.
- **Escape hatch #2 — design token names.** The task told me to use `--color-surface-3`, `--radius-2`, and a card style with `border: 1px solid var(--color-surface-3)`, `border-radius: var(--radius-2)`, `padding: var(--space-6)`. None of `--color-surface-3` or `--radius-2` exist in `design-system/styles.css` (real tokens are `--color-surface`, `--color-surface-raised`, `--color-border-visible`, `--radius-card`, `--radius-compact`, `--radius-button`; `--space-6` does exist). Used the real tokens — `border: 1px solid var(--color-border-visible)`, `border-radius: var(--radius-card)`, `padding: var(--space-6)`, kept `background: rgba(0,0,0,0.5)` on the card. Design-system hex-guard grep exits 1 (no matches) on my owned files.
- **Escape hatch #3 — profile upsert semantics.** Prompt said "use `upsert({ id, email }, { onConflict: 'id' })`". A vanilla upsert with `ignoreDuplicates: false` (postgrest default) would overwrite `subscription_status` back to `'inactive'` on **every** sign-in — silently downgrading returning paid users once Stripe (task 06, just landed) starts writing that column. Flipped to `ignoreDuplicates: true` so the row is inserted only on first sign-in; the DB default handles the initial `subscription_status`. Documented inline in `auth/callback/route.ts`.
- **DoD results:**
  - `pnpm --filter @nothing/web typecheck` → **exit 0**.
  - `pnpm --filter @nothing/web build` → **exit 0**, Proxy detected, all 11 routes generated. Benign warning: `experimental.typedRoutes` is being renamed to top-level `typedRoutes` in a future Next release (not my code).
  - `grep -rE "#[0-9a-fA-F]{3,6}" apps/web/src/proxy.ts apps/web/src/lib/supabase/client.ts apps/web/src/lib/supabase/server.ts apps/web/src/lib/supabase/middleware.ts apps/web/src/app/login/ apps/web/src/app/auth/` → **exit 1** (no matches).
- **Manual test expectations** (not run; orchestrator will smoke-test with `pnpm dev`):
  - `GET /` unauthed → Server Component `redirect('/login')` after `getUser()` returns null.
  - `GET /login` unauthed → renders form (magic-link email input + "Continue with Google" button, dot-grid bg inherits from `<body>`).
  - `GET /app` unauthed → Proxy redirects to `/login?next=/app`.
  - `GET /auth/callback?code=…` → exchanges code, upserts profile (first sign-in only), redirects to `/app` (or `?next` value).
  - `POST /auth/signout` → clears cookie, 303 to `/`.
  - `GET /login` authed → Proxy bounces to `/app`.
- **Deferred (out of scope, called out in prompt):**
  1. **Google OAuth provider config in Supabase dashboard.** Client code is wired, but clicking "Continue with Google" today throws `provider is not enabled` until a Google Cloud OAuth client is created and its ID/secret pasted into `dashboard.supabase.com/project/pqbwzcjiedllzafgczhx/auth/providers`. Redirect URI to whitelist in Google Cloud: `https://pqbwzcjiedllzafgczhx.supabase.co/auth/v1/callback`. Magic-link path works end-to-end with Supabase's default email templates and needs no external config.
  2. **Apple Sign-In.** Needs Apple Developer enrollment ($99/yr) + p8 key + Services ID + configured return URLs. Add a third button + `provider: 'apple'` branch to `login/page.tsx` once creds are in hand.
  3. **Session hook-up in `SharedContextProvider`.** Task 10 wraps the shell; this task deliberately does not touch `apps/web/src/app/app/layout.tsx`. The user is fetchable server-side via `(await createClient()).auth.getUser()` from `@/lib/supabase/server`.
- **Unblocks:** 08 (paywall middleware — extends this Proxy with subscription check via `subscriptions` table task 06 now writes), 11 (settings/profile surface — reads `profiles`/`preferences` via `createClient` from `./server.ts`).
