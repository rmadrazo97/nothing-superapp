/**
 * API entitlement-gate smoke test.
 *
 * The `/api/mini-apps/*` routes enforce entitlement independently of the
 * Proxy (defence in depth — a client that bypasses the redirect still can't
 * write). This spec:
 *
 *   - unauth POST → 401
 *   - auth-but-unentitled POST → 402
 *   - auth + force-entitled POST → 201 (or 200/204 — whatever the route
 *     returns; we assert 2xx)
 *
 * The 402 is the load-bearing assertion: it proves the entitlement check
 * survives even if the UI dims the wrong tile or the Proxy is bypassed.
 */
import { test, expect } from '@playwright/test';
import { signUpFreshUser, cleanupUser, forceEntitle, type TestUser } from './helpers/auth';

const ENDPOINT = '/api/mini-apps/calorie-lite/entries';

test.describe('POST /api/mini-apps/calorie-lite/entries', () => {
  let user: TestUser | undefined;

  test.afterEach(async () => {
    await cleanupUser(user?.id);
    user = undefined;
  });

  test('unauthenticated → 401', async ({ playwright }) => {
    // Fresh isolated context — no auth cookies at all.
    const ctx = await playwright.request.newContext();
    const res = await ctx.post(ENDPOINT, {
      data: { meal: 'breakfast', kcal: 100 },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('signed-in but not subscribed → 402', async ({ page }) => {
    user = await signUpFreshUser(page);
    // Use the browser context's request client so the sb-* cookies we just
    // injected are attached — this proves the endpoint checks BOTH auth AND
    // entitlement, not just auth.
    const res = await page.request.post(ENDPOINT, {
      data: { meal: 'lunch', kcal: 350, raw_input: 'e2e-402-probe' },
    });
    expect(res.status()).toBe(402);
  });

  test('signed-in AND entitled → 2xx', async ({ page }) => {
    user = await signUpFreshUser(page);
    await forceEntitle(user.id);
    const res = await page.request.post(ENDPOINT, {
      data: { meal: 'dinner', kcal: 500, raw_input: 'e2e-entitled-probe' },
    });
    // The route returns 200/201/204 depending on impl — accept the 2xx range.
    expect(res.status(), `expected 2xx, got ${res.status()}: ${await res.text().catch(() => '')}`).toBeGreaterThanOrEqual(200);
    expect(res.status()).toBeLessThan(300);
  });
});
