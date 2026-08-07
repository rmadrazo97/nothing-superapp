# Nothing Superapp — end-to-end tests

Playwright suite that drives the whole stack against **live services**:

- **Supabase** — real project `pqbwzcjiedllzafgczhx` (Europe-West-1). We
  create a fresh test user for each run via the admin API, then delete it.
- **Stripe** — test mode. Real checkout, real webhook, real `$1/mo`
  subscription (test-mode $ = free but flag it).
- **Kimi K2** — live inference against `api.moonshot.ai/v1`, model
  `kimi-k2.6`. Streams real SSE frames.

There are no mocks. If any of the three services is down, the tests will fail
— that's the point.

## Quick start

```bash
# From the repo root:
pnpm install
pnpm --filter @nothing/web e2e:install   # first-time — installs chromium
pnpm --filter @nothing/web e2e           # run everything
pnpm --filter @nothing/web e2e:ui        # Playwright UI, great for triage
```

Or scope to a single file:

```bash
pnpm --filter @nothing/web exec playwright test auth-required.spec.ts --reporter=list
```

## Suite layout

| Spec | What it proves | Needs `stripe listen`? |
|---|---|---|
| `auth-required.spec.ts` | Every `/app*` + `/paywall` bounces unauth users to `/login`. | No |
| `paywall-gate.spec.ts` | Signed-in-but-unentitled users are redirected to `/paywall` for gated tiles; `/app/assistant` + `/app/settings` stay reachable. | No |
| `api-entitlement.spec.ts` | `POST /api/mini-apps/calorie-lite/entries` returns 401 unauth, 402 auth-but-unentitled, 2xx auth+entitled. Defence-in-depth beyond the Proxy. | No |
| `golden-path.spec.ts` | Full journey: signup → subscribe (real Stripe checkout with test card) → home grid → add meal → ask copilot about it (real Kimi stream mentions the meal or its kcal) → settings → sign out. | **Yes** |

## Golden-path setup

The webhook has to reach your local server before `subscriptions.status`
flips to `active` — the test polls for it and will time out otherwise.

**Step 1** — in a second terminal:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The first line it prints looks like:

```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxx
```

Copy that value into `apps/web/.env.local`:

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```

**Step 2** — leave `stripe listen` running and:

```bash
pnpm --filter @nothing/web e2e
```

## Skipping the paid leg

For CI or quick local iteration (no card entry, no webhook), skip just the
golden-path test:

```bash
SKIP_STRIPE=1 pnpm --filter @nothing/web e2e
```

The three shorter specs still run and cover ~85% of the surface area.

## How auth works in the tests

Magic-link OTP is the only production sign-in path, but piping every test
through an inbox reader is expensive and flaky. The tests take the standard
Playwright-vs-Supabase shortcut, in `helpers/auth.ts`:

1. Call `supabase.auth.admin.createUser({email, password, email_confirm: true})`
   — bypasses the confirmation email.
2. POST directly to `/auth/v1/token?grant_type=password` to get an access +
   refresh token pair as JSON.
3. Encode the session the way `@supabase/ssr` does (base64url + `base64-`
   prefix, chunked at 3180 bytes) and inject as `sb-<ref>-auth-token` cookies
   via `context.addCookies`.
4. The Next Proxy reads the same cookies via `@supabase/ssr` on the next
   request — indistinguishable from a real magic-link session.

`cleanupUser(id)` afterwards deletes the user + owned rows. Stripe test-mode
customers created by the golden path are **not** auto-cancelled; prune them
from the Stripe dashboard if the account fills up.

## Cost per run

- **Free specs** — 3 short specs = ~15s wall time on a warm dev server.
- **Golden path** — one `$1/mo` test-mode subscription = $1 of test-mode
  charge. Test mode Stripe balance is free; you'll see the charge in the
  dashboard but no real card is ever hit.

## Debugging tips

- `PWDEBUG=1 pnpm --filter @nothing/web e2e` — opens the inspector.
- `pnpm --filter @nothing/web e2e:ui` — Playwright UI, best for iterating on
  a failing selector.
- Videos + traces of failed runs land in `apps/web/test-results/`
  (git-ignored).
- HTML report: `pnpm --filter @nothing/web exec playwright show-report`.
