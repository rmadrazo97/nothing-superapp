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
  },
});
