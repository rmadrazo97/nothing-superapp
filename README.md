# Nothing Superapp

**One app. One subscription. Everything.**

A centralized application that leverages decentralized information from every mini-app you touch. Nutrition tracking, gym routines, focus timer, and an AI copilot that reads across all of it — for $1/mo.

Currently v0.3 (first release). Design: dark, cadmium red accents, Doto + Space Grotesk + Space Mono. Nothing OS-inspired.

---

## What's inside

| Mini-app | Route | What it does |
|---|---|---|
| ◐ **Calorie Lite** | `/app/calorie-lite` | Log meals, track macros, weekly trend + streak. |
| ◈ **Gym** | `/app/gym-routine` | 1,324 exercises w/ form GIFs, custom routines, live sessions with rest timer. |
| ◔ **Pomodoro** | `/app/pomodoro` | 25/5/15 cycle, tab-switch-safe timer, WebAudio beep, streak dots. |
| ◊ **Copilot** | `/app/assistant` | Kimi K2 streaming chat, reads across every mini-app. |

Plus the shell: `/login` (magic-link + Google OAuth), `/paywall` ($1/mo Stripe checkout), `/app/settings` (profile + preferences + Stripe billing portal).

---

## Repo layout

```
apps/
  web/                    Next.js 16 App Router shell + all API route handlers
  mini-apps/              Auto-discovered mini-app workspaces
    calorie-lite/
    gym-routine/
    pomodoro/
    coming-soon/          placeholder — proves the registry
packages/
  shared/                 Zod schemas + inferred TS types
  mini-apps-runtime/      SDK mini-apps import (useSharedContext, useUser, useEvents, defineMiniApp, EmptyState)
supabase/
  migrations/             001_initial, 002_pomodoro_and_gym, 003_gym_and_exercises
design-system/            Portable design tokens (CSS custom properties + component classes)
docs/dev-loop/            Durable state on disk for the build loop
services/growth/          Campaign log, launch.html, slides.html, report.html
```

---

## Prerequisites

- **Node** 22.x
- **pnpm** 11.x (`npm install -g pnpm@11`)
- **Supabase CLI** 2.24.3+ (for migrations)
- **Stripe CLI** 1.40.9+ (for webhook forwarding during dev)
- **Postgres client** (`psql`)

Accounts you'll need:
- Supabase project (Postgres + Auth + Storage)
- Stripe account in test mode (create a $1/mo recurring price)
- Moonshot AI account for a Kimi K2 API key
- (Optional) Google Cloud OAuth client for Google Sign-In

---

## Local dev setup

```bash
# 1. Install deps
pnpm install

# 2. Copy env template + fill in
cp apps/web/.env.local.example apps/web/.env.local
# Fill: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#       STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_PRICE_ID,
#       STRIPE_WEBHOOK_SECRET, KIMI_API_KEY

# 3. Apply migrations (needs psql + your Supabase pooler URL)
DB_URL="postgresql://postgres.<project-ref>:<url-encoded-pwd>@aws-1-<region>.pooler.supabase.com:6543/postgres"
for f in supabase/migrations/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# 4. Seed the exercise dataset (1,324 rows, ~1s)
curl -sL https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json \
  -o working/exercises/exercises.json
python3 scripts/seed-exercises.py       # see scripts/ for the transform + copy

# 5. Run
pnpm --filter @nothing/web dev            # localhost:3000

# 6. In a second terminal — forward Stripe webhooks to local
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Paste the printed whsec_… into apps/web/.env.local as STRIPE_WEBHOOK_SECRET, restart dev.
```

---

## Environment variables

`apps/web/.env.local` — see `apps/web/.env.local.example` for the exact set.

**Public** (safe on client):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (new-style Supabase publishable key)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_PRICE_ID` (the $1/mo price id)
- `NEXT_PUBLIC_APP_URL` (`http://localhost:3000` in dev)

**Server-only**:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`
- `STRIPE_SECRET_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_PRODUCT_ID`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- `KIMI_API_KEY`, `KIMI_BASE_URL` (default `https://api.moonshot.ai/v1`), `KIMI_MODEL` (default `kimi-k2.6`)

**OAuth providers** are configured in the Supabase dashboard (`auth/providers`), not in `.env.local`. Google needs a redirect URI of `https://<project-ref>.supabase.co/auth/v1/callback`.

---

## Testing

```bash
# Type check
pnpm -r typecheck

# Build
pnpm --filter @nothing/web build

# Playwright e2e (14 specs)
pnpm --filter @nothing/web exec playwright install chromium
pnpm --filter @nothing/web e2e           # runs all
SKIP_STRIPE=1 pnpm --filter @nothing/web e2e     # skip the golden path
```

The golden path spec (`e2e/golden-path.spec.ts`) requires `stripe listen` running in a second terminal + `STRIPE_WEBHOOK_SECRET` set. It costs $1 of test-mode Stripe balance per run (which is free).

---

## Deploy to production

### 1. Rotate credentials

The initial development branch has commits with sensitive test-tier credentials in git history. **Rotate before pushing to any public remote:**

- Regenerate the Supabase database password (Settings → Database → Reset password)
- Regenerate the Supabase service_role key (Settings → API → Rotate)
- Regenerate the Stripe test secret key (Developers → API keys → Roll)
- Regenerate the Kimi API key (Kimi console → API Keys → Delete + Create)

Or start a clean branch from `main` and cherry-pick post-leak commits.

### 2. Vercel

```bash
pnpm dlx vercel login
pnpm dlx vercel link            # in apps/web/
pnpm dlx vercel env pull        # confirms wiring
pnpm dlx vercel --prod          # deploy
```

Set the env vars from your `.env.local` into Vercel's project settings. `NEXT_PUBLIC_APP_URL` should point to your production domain.

### 3. Stripe webhook (production)

- Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://your-domain.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Copy the signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`

### 4. Supabase production checks

- RLS is enabled on all user tables — verify via SQL editor: `select tablename, rowsecurity from pg_tables where schemaname='public';`
- Auth redirect URLs (Settings → Auth → URL Configuration) should include your production domain
- Storage buckets: none in v0.3

### 5. Verifying migrations are applied to prod

Every `.sql` file in `supabase/migrations/` uses `IF NOT EXISTS` guards, which means the SQL happily runs on a stale prod without complaint even if a migration was never applied. To catch that drift, run:

```bash
node scripts/verify-migrations-applied.mjs
```

The script parses each migration for `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, and `CREATE INDEX` statements, then queries prod via `psql` and reports `[OK]` / `[MISS]` per object. Exits `1` on any miss. Reads `apps/web/.env.local` for `SUPABASE_PROJECT_ID` + `SUPABASE_DB_PASSWORD`, or takes them from the shell env.

CI runs this automatically on every push to `main` (job `verify-migrations-applied` in `.github/workflows/ci.yml`) — required secrets: `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`. Missing secrets → the script no-ops with `[SKIP]` and exits `0`, so it never blocks a legitimate ship.

Requires `psql` on PATH (preinstalled on `ubuntu-latest`; `brew install libpq` on macOS).

**Sibling check — RPC definitions** (`scripts/verify-rpcs-defined.mjs`): the migrations-applied check only introspects tables/columns/indexes. It cannot catch client code that calls `supabase.rpc('foo', …)` where `foo` was never defined in any migration (v0.5.8 lesson 1 — passes 3+4 of the food resolver were silent no-ops for months). This script greps `apps/web/src` + `apps/mini-apps/**` for `.rpc(<literal>, …)` call-sites, then queries prod `pg_proc` for each name and reports `[OK]` / `[MISS]`. Same skip-on-missing-creds behaviour; wired as a chained CI job (`verify-rpcs-defined`) after `verify-migrations-applied`.

### 6. Splinter security-advisor scan

The Supabase Studio "Security Advisor" runs the [Splinter](https://github.com/supabase/splinter) lint suite (RLS-disabled tables, mutable `search_path` functions, extensions in `public`, `auth.users` leakage, etc.). The CLI doesn't ship the scan, so we invoke the same lints via the Management API:

```bash
node scripts/security-advisor-scan.mjs           # pretty output
node scripts/security-advisor-scan.mjs --json    # CI-parseable summary on stdout
```

Reads `SUPABASE_MANAGEMENT_TOKEN` + `SUPABASE_PROJECT_ID` from the shell (or falls back to `apps/web/.env.local`). The management token is a personal access token (starts `sbp_...`) from https://supabase.com/dashboard/account/tokens — **not** the service-role JWT. On macOS the `supabase` CLI stashes yours in the login keychain:

```bash
export SUPABASE_MANAGEMENT_TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
```

Exits `1` on any WARN or ERROR-level finding (ERROR = RLS off, security-definer view, auth.users exposed; WARN = mutable search_path, extension in public). INFO findings (e.g. RLS-on with zero policies) do not fail. Missing secrets → `[SKIP]` + exit `0`.

CI runs this on every push to `main` and daily at 06:00 UTC (`.github/workflows/security-advisor.yml`). On failure it posts a commit comment with the finding summary and uploads the full JSON as an artifact. Required GitHub secrets: `SUPABASE_MANAGEMENT_TOKEN`, `SUPABASE_PROJECT_ID`.

---

## Architecture

**Frontend**: Next.js 16 App Router. Server Components read the mini-app registry from the filesystem at build time; Client Components handle interaction. Middleware (`proxy.ts` in Next 16) handles auth + entitlement gating before any route renders.

**Database**: Supabase Postgres with row-level security on every user-owned table. Service-role bypass only for the Stripe webhook. Migrations are hand-written SQL applied via `psql`.

**Auth**: Supabase Auth. Magic-link works out of the box. Google OAuth requires a provider config in the dashboard. Session cookie is refreshed via `@supabase/ssr` in every proxy pass.

**Payments**: Stripe Checkout for signup, Stripe Billing Portal for cancel/update, webhook for status transitions. Webhook is idempotent — dual-conflict handling (update-by-customer_id, fallback upsert-by-user_id).

**AI**: Kimi K2 via OpenAI-compat SDK pointed at Moonshot's endpoint. Context assembler reads from all mini-app tables (calorie, gym, pomodoro, events, profile) with round-robin truncation at 6000 chars. Rate-limited to 30 req/hour per user.

**Mini-app registry**: file-convention. Any `apps/mini-apps/<slug>/manifest.ts` that default-exports a `MiniAppManifest` gets auto-discovered. See `apps/web/src/lib/mini-apps/registry.ts` for the fs-scan + paren-balanced source parse (Turbopack can't bundle runtime `import()` of dynamic paths).

**Testing**: Playwright against live Supabase + Stripe test-mode + Kimi. 14 specs. Golden path in 1.7 min.

---

## Adding a new mini-app

```bash
# 1. Copy the template (or coming-soon)
cp -r apps/mini-apps/coming-soon apps/mini-apps/my-new-app

# 2. Edit apps/mini-apps/my-new-app/manifest.ts:
#    slug: 'my-new-app', name: 'My App', icon: '◇', route: '/app/my-new-app',
#    requiresSubscription: true (or false for a free mini-app)

# 3. One-line re-export at apps/web/src/app/app/my-new-app/page.tsx:
mkdir -p apps/web/src/app/app/my-new-app
echo "export { default } from '@nothing-mini-apps/my-new-app/page';" > apps/web/src/app/app/my-new-app/page.tsx

# 4. Register in apps/web/src/lib/mini-apps/client-registry.ts (one entry)
# 5. Add to apps/web/next.config.ts transpilePackages array
# 6. Add workspace dep in apps/web/package.json

pnpm install
pnpm --filter @nothing/web dev
```

If it needs to persist data, add a migration to `supabase/migrations/00N_my_app.sql` with your table + RLS policies, and add an API handler at `apps/web/src/app/api/mini-apps/my-new-app/*/route.ts` following the pattern in `calorie-lite/entries/route.ts`.

---

## Contributing

- No hex color codes anywhere in shipped code — use `--color-*` tokens from `design-system/styles.css`
- Space scale intentionally skips `--space-5` and `--space-7` — use `--space-4` or `--space-6` instead
- Server owns all timestamps (`created_at`, `entered_at`, `ended_at`) — never trust client clocks
- Every API handler that touches user data must be auth-gated (401 without session) AND entitlement-gated (402 if `requiresSubscription` mini-app and user isn't entitled)
- Every commit must pass `pnpm -r typecheck` + `pnpm --filter @nothing/web build`

---

## License

Application code: MIT. Exercise data © Gym Visual (see [gymvisual.com](https://gymvisual.com/)) — attribution required on any UI surface that renders the media.

---

## Credits

- Exercise dataset: [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT data, Gym Visual media)
- Kimi K2 via [Moonshot AI](https://platform.moonshot.ai/)
- Built with [Claude Code](https://claude.com/claude-code)
