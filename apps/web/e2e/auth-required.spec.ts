/**
 * Auth gate smoke test.
 *
 * Every `/app*` route must bounce an unauthenticated visitor to `/login`.
 * The Proxy owns this behaviour (see apps/web/src/lib/supabase/middleware.ts);
 * this test is the tripwire that catches a regression where a new route
 * slipped outside the gate (e.g. someone added `/app-preview` and forgot to
 * update the PROTECTED_PREFIXES list).
 *
 * We deliberately do NOT test /login-while-signed-in ⇒ /app here — that
 * belongs in a separate spec and needs a session, which requires the
 * `signUpFreshUser` helper (kept out of this file to keep it dependency-free).
 */
import { test, expect } from '@playwright/test';

// /paywall no longer redirects signed-out users to /login — since v0.5.1 it
// renders the public marketing landing (with a bigger price CTA). Sign-in
// starts from the landing's SIGN IN button. So /paywall is intentionally
// omitted from this list.
//
// `/app/coming-soon` DOES still redirect — it's a placeholder mini-app under
// the /app umbrella so the auth gate applies.
const APP_ROUTES = [
  '/app',
  '/app/assistant',
  '/app/settings',
  '/app/calorie-lite',
  '/app/coming-soon',
  '/app/pomodoro',
  '/app/gym-routine',
  '/app/gym-routine/exercises',
  '/app/gym-routine/routines',
];

for (const route of APP_ROUTES) {
  test(`unauthenticated ${route} → /login?next=${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    // Proxy fires a 307/308 → /login with `next` preserved as a searchParam.
    // The path in `next=` comes back percent-encoded (`/` → `%2F`) so we
    // match on either shape rather than trying to normalise.
    const encoded = encodeURIComponent(route);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=(?:${encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${route.replace(/\//g, '\\/')})$`));
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
}
