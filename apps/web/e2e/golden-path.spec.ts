/**
 * The golden-path e2e — proves the whole superapp actually works end-to-end,
 * against LIVE Supabase + Stripe test-mode + Kimi K2. This is the final
 * acceptance test for the whole harness (spec v3 §DoD).
 *
 * ── PRE-REQUISITE ──────────────────────────────────────────────────────────
 * Stripe's webhook needs to reach your local server to flip
 * subscriptions.status → 'active' after checkout. Run this in a second
 * terminal, keep it open for the duration of the test:
 *
 *     stripe listen --forward-to localhost:3000/api/stripe/webhook
 *
 * On first run it prints a `whsec_…` — paste it into apps/web/.env.local as
 * STRIPE_WEBHOOK_SECRET (see task 06 notes).
 *
 * ── OPT-OUT for CI runs without a card ──────────────────────────────────────
 * SKIP_STRIPE=1 pnpm --filter @nothing/web e2e
 * ⇒ this file is skipped entirely. The other three specs still run.
 *
 * ── COST ────────────────────────────────────────────────────────────────────
 * One test run = $1.00 charged to the test-mode Stripe balance (free money,
 * but you'll see it in the dashboard). If you re-run 20 times before cleanup,
 * you'll have 20 test-mode subscriptions in the account — the test tries to
 * cancel via admin cleanup, but Stripe subscriptions persist independently
 * of Supabase rows. Prune them from the Stripe dashboard periodically.
 *
 * ── STEPS ──────────────────────────────────────────────────────────────────
 *  1. Fresh sign-up ⇒ /paywall (unentitled by default)
 *  2. Click Subscribe ⇒ Stripe Checkout, fill 4242…
 *  3. Redirect back to /app?checkout=success
 *  4. Poll DB for subscriptions.status = 'active' (webhook must land)
 *  5. /app grid: calorie-lite tile is not dimmed
 *  6. Add a meal, verify it appears + total updates
 *  7. Ask copilot "what did I eat today?" — assert Kimi mentions the meal
 *  8. Settings: email visible, subscription card = subscribed
 *  9. Sign out ⇒ landing page
 */
import { test, expect } from '@playwright/test';
import {
  signUpFreshUser,
  cleanupUser,
  adminClient,
  type TestUser,
} from './helpers/auth';

const SKIP = process.env.SKIP_STRIPE === '1';

test.describe('golden path (live Supabase + Stripe test-mode + Kimi)', () => {
  test.skip(SKIP, 'SKIP_STRIPE=1 set — skipping the paid Stripe checkout leg.');

  // Wide timeout — Stripe checkout + webhook + Kimi stream all inside one test.
  test.setTimeout(180_000);

  let user: TestUser | undefined;

  test.afterAll(async () => {
    // NOTE: cleanupUser removes the Supabase rows. Stripe test-mode
    // subscriptions/customers are NOT auto-cancelled — the webhook wrote
    // them; there's no reverse path from Supabase.
    await cleanupUser(user?.id);
  });

  test('signup → subscribe → mini-app → copilot → settings → signout', async ({ page }) => {
    // ── Step 1: fresh signup lands on /paywall (unentitled) ────────────────
    user = await signUpFreshUser(page);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/paywall$/);
    await expect(page.getByRole('heading', { name: /unlock everything/i })).toBeVisible();

    // ── Step 2: subscribe → Stripe checkout ────────────────────────────────
    const subscribeCta = page.getByRole('button', { name: /subscribe.*\$1/i });
    await expect(subscribeCta).toBeVisible();
    // Wait for the top-level navigation to Stripe.
    await Promise.all([
      page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 }),
      subscribeCta.click(),
    ]);

    // Fill test card. Stripe Checkout's DOM occasionally shifts between
    // "single-page" and "multi-step" layouts; the field names are stable.
    await page.getByRole('textbox', { name: /email/i }).fill(user.email).catch(() => {
      /* If email is prefilled from customer_email, ignore. */
    });
    await page.getByRole('textbox', { name: /card number/i }).fill('4242 4242 4242 4242');
    await page.getByRole('textbox', { name: /expiration|expiry|mm ?\/ ?yy/i }).fill('12 / 34');
    await page.getByRole('textbox', { name: /(cvc|security code|cvv)/i }).fill('123');
    // Cardholder name (some flows require it, some don't — attempt + swallow).
    await page
      .getByRole('textbox', { name: /(cardholder|name on card)/i })
      .fill('E2E Test')
      .catch(() => {});
    // Postal code (only shown for US billing).
    await page
      .getByRole('textbox', { name: /(postal|zip)/i })
      .fill('94105')
      .catch(() => {});
    // Country selector — leave default (US) if present.

    await Promise.all([
      page.waitForURL(/localhost:3000\/app.*checkout=success/, { timeout: 60_000 }),
      page.getByRole('button', { name: /subscribe|pay/i }).click(),
    ]);

    // ── Step 3: webhook flips subscriptions.status → 'active' ──────────────
    // stripe-cli forwards checkout.session.completed within 1-2s of the
    // redirect, but be generous — poll for up to 30s.
    const subscriptionActive = await waitForSubscription(user!.id, 30_000);
    expect(subscriptionActive, 'subscriptions row never went active — is `stripe listen` running?').toBe(true);

    // ── Step 4: /app grid — calorie-lite tile is unlocked ──────────────────
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/app$/);
    const calorieTile = page.getByRole('link', { name: /^calorie lite$/i });
    await expect(calorieTile).toBeVisible();
    // A dimmed tile has opacity 0.5 (see HomeGrid.tsx). We assert it's visually
    // active — accept either the plain link OR the explicit non-dimmed style.
    const opacity = await calorieTile.evaluate((el) => window.getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.9);

    // ── Step 5: enter calorie-lite, empty state visible ────────────────────
    await calorieTile.click();
    await expect(page).toHaveURL(/\/app\/calorie-lite$/);
    // Either the empty state OR (if a prior run left rows) the entry list.
    // Look for the "Add meal" CTA either way.
    await expect(page.getByRole('button', { name: /add meal|add first meal/i }).first()).toBeVisible();

    // ── Step 6: add a meal ─────────────────────────────────────────────────
    await page.getByRole('button', { name: /add meal|add first meal/i }).first().click();
    // Meal-name is optional per the form — we fill it so the copilot's
    // context assembler has something to echo back in step 7.
    await page.getByRole('textbox').first().fill('Test Breakfast');
    // Fill KCAL — the number input.
    const kcalInput = page.locator('input[type="number"]').first();
    await kcalInput.fill('350');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Back on the Today view — total updated, entry visible.
    await expect(page.getByText(/350/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Test Breakfast/i)).toBeVisible();

    // ── Step 7: copilot cross-references calorie data ──────────────────────
    await page.goto('/app/assistant', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /assistant/i })).toBeVisible();
    const composer = page.getByRole('textbox', { name: /message/i });
    await composer.fill('What did I eat today?');
    await page.getByRole('button', { name: /^send$/i }).click();

    // Wait for a streamed answer to arrive. We accept either the meal name
    // or the kcal number — Kimi may paraphrase.
    await expect(
      page.getByText(/Test Breakfast|350/i).first(),
    ).toBeVisible({ timeout: 45_000 });

    // ── Step 8: settings — email + subscribed ──────────────────────────────
    await page.goto('/app/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel(/email/i)).toHaveValue(user.email);
    await expect(page.getByText(/renews on|subscribed|nothing superapp/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /manage subscription/i })).toBeVisible();

    // ── Step 9: sign out ───────────────────────────────────────────────────
    await Promise.all([
      page.waitForURL(/localhost:3000\/(?:\?.*)?$/, { timeout: 15_000 }).catch(() => {}),
      page.getByRole('button', { name: /^sign out$/i }).click(),
    ]);
    // After sign-out the Proxy allows / (landing) but bounces /app to /login.
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });
});

/**
 * Poll `subscriptions` via service-role until status === 'active' or timeout.
 * Uses the admin client directly — no cookies, no RLS.
 */
async function waitForSubscription(userId: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await adminClient()
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data?.status === 'active') return true;
    if (!error && data?.status === 'trialing') return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
