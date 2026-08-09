/**
 * Playwright config for the Nothing Superapp e2e suite (task 14).
 *
 * Runs against a real Next dev server (spawned by `webServer` below) which in
 * turn talks to the live Supabase project + Stripe test-mode + Kimi live API.
 *
 * Viewport is pinned to a mid iPhone size (390x844) because the app is
 * mobile-first and the shell's max-width column expects that footprint.
 *
 * Only Chromium is exercised — WebKit + Firefox pass rate is not part of the
 * DoD for this harness and each new project multiplies test-time cost.
 */
import { defineConfig, devices } from '@playwright/test';

// Load apps/web/.env.local into process.env so `webServer.command` inherits it
// (Next dev picks .env.local up on its own, but we ALSO need SUPABASE_SERVICE_ROLE_KEY
// visible in the Playwright worker for the auth helper's admin API calls).
import './e2e/helpers/env';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Fail fast on runaway loops but leave enough headroom for the real Kimi
  // stream + Stripe webhook (each can easily take 10-15s).
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // tests share the same Supabase project + Stripe cust
  workers: 1,
  retries: process.env.CI ? 1 : 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 390x844 = iPhone 14 (Pro) portrait, our primary target.
    viewport: { width: 390, height: 844 },
    // Give Kimi's SSE stream + Stripe's redirect chain room to breathe.
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        // Emulate a touch device — matches the primary product form factor.
        hasTouch: true,
        isMobile: false, // isMobile forces devicePixelRatio + meta viewport quirks that
        // trip Stripe's checkout DOM; leave false, keep viewport + touch.
      },
    },
  ],

  webServer: {
    // Next 16's `pnpm dev` (`next dev`) still spawns a Turbopack server on
    // whatever port is available; port 3000 by default. `reuseExistingServer`
    // lets you run the tests against a dev server you already have open.
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    // On CI, `apps/web/.env.local` doesn't exist so Next dev has no env source
    // besides what we pass through here. Forward every env the app reads so a
    // subprocess env drop can't leave `next dev` with blank Supabase URLs.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
      NEXT_PUBLIC_STRIPE_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ?? '',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      SUPABASE_PROJECT_ID: process.env.SUPABASE_PROJECT_ID ?? '',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? '',
      STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID ?? '',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      KIMI_API_KEY: process.env.KIMI_API_KEY ?? '',
      KIMI_BASE_URL: process.env.KIMI_BASE_URL ?? 'https://api.moonshot.ai/v1',
      KIMI_MODEL: process.env.KIMI_MODEL ?? 'kimi-k2.6',
      // Preserve NODE_ENV / PATH etc from parent
      NODE_ENV: process.env.NODE_ENV ?? 'development',
      PATH: process.env.PATH ?? '',
    },
  },
});
