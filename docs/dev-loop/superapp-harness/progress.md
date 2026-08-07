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
