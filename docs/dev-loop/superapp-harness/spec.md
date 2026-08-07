# Spec — Nothing Superapp harness (v1)

> **Version:** v1 · `spec_version: 3` · **Date:** 2026-08-07 · **Status:** Locked at Phase 2 · **Feature slug:** `superapp-harness`
> **Loop:** `docs/dev-loop/superapp-harness/`
> **Source of truth:** this document. When decisions change (via watch mode or manual edits), bump `spec_version`.

## 1. Concrete outcome (one sentence)

Ship the production-ready **shell / OS** of Nothing Superapp — a Next.js 16 PWA that a new user can sign up for, subscribe to (Stripe, $1/mo), and use to launch code-split mini-apps that share a single user session, a 3-tier shared-context surface, and a Claude-Haiku-backed AI copilot that reads across all mini-app data — with ONE reference mini-app included to prove the plumbing works.

## 2. User stories

1. As a new visitor, I want to sign up with Google, Apple, or an email magic link so I can start using the superapp in one tap.
2. As a signed-in but unpaid user, I want to see a clear paywall on protected routes with the subscription option so I understand the value gate.
3. As a subscriber ($1/mo Stripe), I want to land on a home grid of app tiles so I can pick which mini-app to use.
4. As a user opening a mini-app, I want it to load in <500ms with my shared session already available so I don't re-authenticate per app.
5. As a user of the AI copilot tab, I want to ask "how many X did I do this week" and get a natural-language answer synthesized from my actual data across mini-apps.
6. As a user signing in on a second device, I want my data to appear (multi-device sync), because the source of truth is Supabase, not localStorage.
7. As a signed-in user, I want to change my language / notification preferences in one settings surface and have all mini-apps respect them.
8. As a canceling user, I want subscription-cancel to immediately gate protected routes back to the paywall, with my data preserved (server-side) in case I resubscribe.

## 3. Acceptance criteria (assertion | verification-method pairs)

Each item: `assertion | verification`. Verification is one of: `unit` / `e2e` / `manual` / `grep` / `dod`.

- [ ] **Fresh browser → landing → Google OAuth → Supabase user row created** · `e2e` (Playwright)
- [ ] **Fresh browser → landing → Apple Sign In → Supabase user row created** · `e2e`
- [ ] **Fresh browser → landing → email magic link → session established** · `e2e`
- [ ] **Signed-in-but-unpaid user hitting `/app` is redirected to `/paywall`** · `e2e`
- [ ] **Stripe Checkout completes → webhook fires → user's `subscriptions.status = 'active'` → next request to `/app` succeeds** · `e2e`
- [ ] **Home grid at `/app` renders one tile per registered mini-app (auto-loaded from `apps/mini-apps/*/manifest.ts`)** · `unit` + `e2e`
- [ ] **Clicking a tile lazy-loads the mini-app bundle (verified: separate JS chunk in Network tab)** · `e2e` + `manual`
- [ ] **Inside a mini-app, `useSharedContext()` returns `{ user, preferences, events }` with correct types** · `unit`
- [ ] **A mini-app calling `events.emit('foo.bar', payload)` is received by a subscriber in another mini-app** · `unit`
- [ ] **AI copilot: user types "how many X" → POST `/api/copilot` → Claude Haiku response streams back, referencing user's actual data** · `e2e`
- [ ] **AI copilot NEVER writes to the database in v1 (grep for `.insert(` / `.update(` in copilot code = 0 hits)** · `grep`
- [ ] **Signing out clears localStorage cache; signing in on a different browser loads server state** · `e2e`
- [ ] **Cancel subscription (webhook) → next request to `/app` returns paywall** · `e2e`
- [ ] **Offline (network off) → open app → shows last-known cached read, disables writes with an inline banner** · `manual` + `e2e`
- [ ] **All UI uses design-system tokens (grep for hex color literals in `apps/web/src/**/*.tsx` = 0 hits)** · `grep`
- [ ] **`pnpm test apps/web` exits 0** · `dod`
- [ ] **`pnpm lint apps/web` exits 0** · `dod`
- [ ] **`pnpm typecheck apps/web` exits 0** · `dod`
- [ ] **Playwright suite exits 0** · `dod`

## 4. Non-goals (explicitly OUT of scope)

- Any specific mini-app beyond the ONE reference mini-app used to prove the plumbing (the reference is `calorie-lite` — a minimal port of the POC's calorie counter, ~200 LOC, just enough to exercise Supabase + shared context + AI copilot cross-reads).
- Capacitor iOS/Android shells (stack blueprint says these are secondary targets; ship PWA first, add native in v2).
- RevenueCat / in-app-purchase (deferred with native shells).
- Write-actions from AI copilot (v1 is read-only Q&A; write-actions are v2).
- Offline-write with background sync (v1 is online-first with read-cache; offline-write is v2).
- Multi-user features (sharing data with other users, teams, family plans).
- Feature flags / A/B tests (add when there's traffic to A/B against).
- Push notifications (Web Push API — nice to have, not blocking).
- App store / user-installable mini-apps (file-convention registry = solo dev adds via git commit; user-facing app store is way v3).
- Onboarding / first-run wizard beyond the auth + subscribe flow.
- **Cloud deployment (Vercel / Fly / Cloudflare)** — deferred until the harness is worth deploying. **Local dev only for v1** — `pnpm dev` on `http://localhost:3000`. Stripe webhook via `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. No deploy CLI setup in Phase 5.


## 5. Owned surface

New surface this feature creates:

- `apps/web/` — Next.js 16 project (new)
  - `apps/web/src/app/` — route tree
  - `apps/web/src/components/` — shared components + shell chrome
  - `apps/web/src/lib/` — helpers (supabase client, stripe, copilot, event-bus)
  - `apps/web/src/mini-apps/` — file-convention registry root
  - `apps/web/src/hooks/`
  - `apps/web/src/stores/` — Zustand
  - `apps/web/tests/` — Playwright + Vitest
- `packages/shared/` — Zod schemas + shared TS types (new)
- `packages/mini-apps-runtime/` — the SDK mini-apps import to hook into sharedContext + events (new)
- `supabase/migrations/` — schema (new)
- `apps/web/.env.example` — template

Existing surface this feature READS but must not modify:

- `design-system/` — locked
- `stack-blueprint.md` — locked
- `docs/dev-loop/**` (other slugs) — locked

## 6. Immutable surface (MUST NOT change)

- `design-system/**` (locked — the visual layer)
- `stack-blueprint.md` (locked — the architectural decisions)
- `docs/dev-loop/*` OTHER than this slug's folder (locked — other loops' state)
- `support-docs/nothing-poc.html` (locked — the UX reference; read-only)
- `.git/**`, `.claude/**`, `services/**` (repo scaffolding — hands off)

## 7. Stack pins (from stack-blueprint.md)

Every tech choice this feature depends on, cited by blueprint section.

| Layer | Pick | Blueprint § |
|---|---|---|
| Frontend framework | Next.js 16 App Router + React 19 + Tailwind v4 | § 2 Locked decisions |
| Styling | `design-system/styles.css` (Nothing tokens) + Tailwind utilities | § 2 |
| Client state | TanStack Query (server) + Zustand (client) | § 2 |
| Forms | React Hook Form + Zod | § 2 |
| Backend | Next.js Route Handlers (co-located) + Supabase Edge Functions for cron | § 2 |
| Database | Supabase Postgres | § 2 |
| ORM | Drizzle | § 2 |
| Auth | Supabase Auth — Sign in with Apple + Google + email magic link | § 2 |
| Payments | Stripe (PWA) — RevenueCat deferred | § 2 |
| Storage | Supabase Storage | § 2 |
| Email | Resend (magic links + receipts) | § 2 |
| Analytics | PostHog | § 2 |
| Errors | Sentry | § 2 |
| Deploy | Vercel Hobby | § 2 |
| CI | GitHub Actions + Vercel PR previews | § 2 |
| Package manager | pnpm workspaces | § 2 |
| AI copilot | Claude Haiku 4.5 via `@anthropic-ai/sdk` | § 3 rationale, "no Python needed for calorie parsing" |

## 8. Design pins (from `design-system/styles.css`)

Every class / token this feature uses. Task files grep-first these.

- **CSS variables:** `--color-bg` `--color-surface` `--color-surface-raised` `--color-text-display` `--color-text-primary` `--color-text-secondary` `--color-text-disabled` `--color-accent` `--color-border` `--color-border-visible` `--space-1..8` `--radius-card` `--radius-button` `--font-display` `--font-body` `--font-label` `--font-display-weight`
- **Component classes:** `.card` `.card-hero` `.card-accent` `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-destructive` `.fab` `.tag` `.tag-accent` `.tag-outline` `.field` `.input` `.input-boxed` `.radio` `.seg` `.seg-opt` `.nav` `.nav-brand` `.table` `.dialog-backdrop` `.dialog` `.status-line`
- **Type utilities:** `.display-xl` `.display-lg` `.display-md` `.label` `.caption` `.data`
- **Rules from POC (UX patterns to preserve):** dot-grid background · tab-bar with 3 tabs (Assistant / Home / Settings) · sheet bottom-drawer for actions · fade view transitions · doto for hero numbers, mono for labels, grotesk for body.

## 9. Reusable patterns (grep FIRST before writing)

| Pattern | Where | Reuse for |
|---|---|---|
| `.card-hero` display + numeric value | `design-system/components/cards.html` | Every mini-app's home-tile summary |
| `.tag-accent` for "LIVE" / active state | `design-system/components/buttons.html` | Subscription-active indicator |
| `.fab` for primary create action | `design-system/components/buttons.html` | Per-mini-app "+ add" affordance |
| `.dialog-backdrop` + `.dialog` for sheet | `design-system/components/dialog.html` | Add-entry, settings, confirmation modals |
| POC `.tabbar` structure | `support-docs/nothing-poc.html:76-89` | Shell tab-bar (Assistant / Home / Settings) |
| POC `showView()` pattern | `support-docs/nothing-poc.html:596-600` | Reference for shell nav (but we use Next.js routing, not innerHTML swap) |
| POC `state = load()` pattern | `support-docs/nothing-poc.html:563-570` | Reference for the sharedContext store shape |
| POC `state.days[key]` structure | `support-docs/nothing-poc.html:580-582` | Reference for per-app table schema |
| POC event-bus (implicit via `save()`) | `support-docs/nothing-poc.html:576` | Formalize as explicit `events.emit()` in mini-apps-runtime |

## 10. Data-model changes

Drizzle schema — all in `supabase/migrations/` and mirrored in `packages/shared/src/schemas/`:

```sql
-- Core user tables (Supabase Auth auto-creates auth.users)

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'EN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default false,
  theme text not null default 'dark',
  daily_calorie_goal int, -- reference mini-app carry-over
  updated_at timestamptz not null default now()
);

create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text not null, -- trialing | active | past_due | canceled | incomplete
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Event bus (append-only, mini-apps write, others subscribe via realtime)
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, -- e.g. 'calorie.entry.added'
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index events_user_kind_created on events(user_id, kind, created_at desc);

-- Reference mini-app: calorie-lite (~200 LOC to prove plumbing)
create table app_calorie_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entered_at timestamptz not null default now(),
  meal text not null, -- breakfast|lunch|dinner|snacks
  raw_input text, -- optional: what user typed
  kcal int not null,
  protein_g int not null default 0,
  carbs_g int not null default 0,
  fat_g int not null default 0
);
create index app_calorie_entries_user_time on app_calorie_entries(user_id, entered_at desc);
```

RLS policies: every table has `user_id = auth.uid()` policy for read + write. Server-role bypass for webhooks (Stripe → subscriptions table).

## 11. API surface

Route Handlers under `apps/web/src/app/api/`:

- `POST /api/auth/callback` — Supabase OAuth + magic-link callback (delegates to `@supabase/ssr`)
- `POST /api/stripe/checkout` — creates Stripe Checkout Session for `$1/mo` price, returns URL
- `POST /api/webhooks/stripe` — validates signature, updates `subscriptions` table on `customer.subscription.*` + `invoice.payment_*`
- `POST /api/copilot` — accepts `{ query: string }`, streams Kimi K2 response (SSE, OpenAI-compat) with the user's data (last 30d across all `app_*_*` tables) as system context. Rate-limited (10 req/min per user).
- `GET /api/mini-apps` — returns the registry (auto-generated from `apps/web/src/mini-apps/*/manifest.ts` at build time — this is a static list, not a DB query)

TypeScript request/response types shared via `packages/shared/src/schemas/`.

## 12. Definition of done (machine-verifiable)

```bash
# From apps/web/ directory:
pnpm test && \
pnpm lint && \
pnpm typecheck && \
pnpm playwright test && \
# ownership check — every touched file must be inside declared owned surface
git diff --name-only main -- . | grep -Ev '^apps/web/|^packages/shared/|^packages/mini-apps-runtime/|^supabase/migrations/|^apps/web/\.env\.example$|^\.github/workflows/|^pnpm-workspace\.yaml$|^package\.json$|^docs/dev-loop/superapp-harness/' | wc -l | grep -q '^0$'
```

Exit 0 = shipped. Any non-zero exit = task pack has a bug.

## 13. Rollback plan

- **Feature branch only** — no v1 users, so `git branch -D feat/superapp-harness` after merge is enough for code.
- **Stripe:** deactivate the `$1/mo` product in dashboard → new subscribers cannot check out. Existing subs continue until user cancels (they'd get a full refund via Stripe dashboard).
- **Supabase:** DB migrations are additive-only (`create table`) — down-migration is `drop table app_calorie_entries; drop table events; drop table subscriptions; drop table preferences; drop table profiles;` in that order. Auth users survive.
- **Vercel:** rollback to prior deployment via `vercel rollback` — takes 30s.

## 14. Assumptions to verify (Phase 3 checks these against code)

1. **Next.js 16 App Router supports the `next/dynamic` code-splitting we need for lazy mini-app loading.** → verified at Phase 3 by reading Next.js docs OR spinning a minimal test.
2. **`@supabase/ssr` v0.5+ handles the OAuth callback flow via Route Handler cleanly with cookies.** → confirmed by Supabase docs; ref-check the auth-helpers snippet.
3. **Stripe Checkout Session with `mode: 'subscription'` webhook fires `customer.subscription.created` on completion.** → Stripe docs confirmed; verify webhook payload shape in the checkout task.
4. **Kimi K2 supports streaming via `openai` SDK `chat.completions.create({ stream: true })` against `api.moonshot.ai`.** → confirmed by Anthropic docs; verify SDK version in package.json.
5. **The design-system's `.card` / `.btn-*` / `.tab` classes work when the design-system CSS is imported once at `apps/web/src/app/layout.tsx`.** → verify at Phase 3 by writing a minimal test page.
6. **File-convention registry (`apps/web/src/mini-apps/*/manifest.ts`) can be built statically at Next.js build time so `/app` doesn't need a runtime filesystem scan.** → verify by writing a build-time script that reads directories and emits a `mini-apps-registry.generated.ts`.
7. **RLS + Supabase JS client can enforce per-user row isolation without a middleware step in Next.js.** → confirmed by Supabase docs; verify by writing an integration test.

---

## Change log

| Version | Date | What changed | Why |
|---|---|---|---|
| v1 | 2026-08-07 | Initial spec | Phase 2 output from `/dev-loop` after Phase 1 clarification |
| v2 | 2026-08-07 | Swapped Claude Haiku 4.5 → Kimi K2 for the AI copilot (spec_version 2). Same read-only Q&A capability, ~85% cheaper input tokens, 2M context window. Uses `openai` npm SDK with `baseURL: https://api.moonshot.ai/v1`. | User override via watch-mode Class A amendment (`"why anthropic keys? if we need inference let's use kimi"`) — confirmed with `"move on implement"`. |
| v3 | 2026-08-07 | Added local-first non-goal (spec_version 3). No cloud deploy for v1; `pnpm dev` + `stripe listen` cover the full dev loop. Deploy path revisits when harness is worth shipping publicly. | User override via watch-mode Class A amendment ("we will build locally for now so serve locally we'll deploy resources once it's worth it"). |
