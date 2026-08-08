/**
 * Entitlement gate smoke test.
 *
 * A signed-in-but-UNENTITLED user:
 *   - `/app/calorie-lite` → redirect to `/paywall`
 *   - `/app/coming-soon`  → redirect to `/paywall`
 *   - `/app/assistant`    → allowed (spec: chat is always reachable)
 *   - `/app/settings`     → allowed (billing lives here — must be reachable)
 *   - `/paywall`          → allowed, shows the Subscribe CTA
 *
 * The Proxy owns these decisions (see apps/web/src/lib/supabase/middleware.ts
 * → `requiresEntitlement` + `ENTITLEMENT_EXEMPT_APP_SUBPATHS`). If someone
 * moves the exempt list, this spec will red-flag it.
 */
import { test, expect } from '@playwright/test';
import { signUpFreshUser, cleanupUser, type TestUser } from './helpers/auth';

let user: TestUser | undefined;

test.afterEach(async () => {
  await cleanupUser(user?.id);
  user = undefined;
});

test('unentitled user is bounced off gated mini-apps but keeps assistant + settings', async ({ page }) => {
  user = await signUpFreshUser(page);

  // Gated: calorie-lite
  await page.goto('/app/calorie-lite', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/paywall$/);

  // Gated: coming-soon (placeholder mini-app is still requiresSubscription true)
  await page.goto('/app/coming-soon', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/paywall$/);

  // Gated: pomodoro (v0.2 mini-app, requiresSubscription: true)
  await page.goto('/app/pomodoro', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/paywall$/);

  // Gated: gym-routine (v0.2 mini-app, requiresSubscription: true) — and its subroutes
  await page.goto('/app/gym-routine', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/paywall$/);
  await page.goto('/app/gym-routine/exercises', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/paywall$/);
  await page.goto('/app/gym-routine/routines', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/paywall$/);

  // /app grid is also entitlement-gated per the Proxy.
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/paywall$/);

  // Exempt: assistant
  await page.goto('/app/assistant', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/app\/assistant$/);
  await expect(page.getByRole('heading', { name: /assistant/i })).toBeVisible();

  // Exempt: settings
  await page.goto('/app/settings', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByRole('heading', { name: /^settings$/i })).toBeVisible();
  // The email of the just-created test user should be visible in the readonly
  // profile field.
  await expect(page.getByLabel(/email/i)).toHaveValue(user.email);

  // /paywall itself renders the Subscribe CTA.
  await page.goto('/paywall', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/paywall$/);
  await expect(page.getByRole('button', { name: /subscribe.*\$1/i })).toBeVisible();
});
