/**
 * Playwright auth helper for the Nothing Superapp e2e suite.
 *
 * The live app authenticates with magic-link OTP (Supabase Auth). Piping every
 * test through an inbox reader (MailSlurp / MailHog / a real Gmail with an
 * app password) is expensive + flaky, so we take the standard Playwright vs.
 * Supabase shortcut:
 *
 *   1. Use the service-role admin API to create a fresh user with a known
 *      password and `email_confirm: true` (bypasses the confirmation email).
 *   2. Sign in with password against the Supabase auth REST endpoint to obtain
 *      access_token + refresh_token as raw JSON.
 *   3. Serialize the session as `@supabase/ssr` does — base64url(JSON) with a
 *      `base64-` prefix, chunked at 3180 bytes if necessary, cookie name
 *      `sb-<ref>-auth-token(.n)` — and inject via `context.addCookies`.
 *   4. Any subsequent navigation is authenticated: the Next Proxy calls
 *      supabase.auth.getUser() using the cookie we just wrote and either
 *      lets the request through or bounces to /paywall per the entitlement
 *      gate. No app code changes required.
 *
 * Cleanup deletes the user via the admin API. Explicit deletes on our owned
 * tables happen first — the auth.users FK cascade would handle it, but
 * belt-and-suspenders keeps tests idempotent even if the schema drifts.
 */
import './env'; // loads apps/web/.env.local into process.env (idempotent).
import type { Page, BrowserContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    '[e2e] Missing Supabase env — need NEXT_PUBLIC_SUPABASE_URL, ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local',
  );
}


/** Extracted from the URL — used to build the cookie name. */
const PROJECT_REF = new URL(SUPABASE_URL).host.split('.')[0];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
// Matches @supabase/ssr default (MAX_CHUNK_SIZE constant). Anything under
// this threshold is written as a single un-numbered cookie.
const COOKIE_CHUNK_SIZE = 3180;

/** Long-lived admin client. Never expose to the browser. */
let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

function makePassword(): string {
  return `NSA-e2e!${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function makeEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `nsa-e2e-${suffix}@example.com`;
}

/**
 * URL-safe base64 (no padding). Mirrors the encoding
 * @supabase/ssr writes to auth cookies via its `stringToBase64URL` util,
 * which the server-side cookie reader assumes when it sees a `base64-` prefix.
 */
function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Split a `base64-`-prefixed string into cookies that @supabase/ssr's
 * `combineChunks` will re-join server-side. Under threshold ⇒ single cookie
 * named exactly COOKIE_NAME (no `.0`). Over ⇒ named `.0`, `.1`, …
 */
function buildAuthCookies(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: unknown;
  provider_token?: string | null;
  provider_refresh_token?: string | null;
}) {
  const value = 'base64-' + toBase64Url(JSON.stringify(session));
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days

  const base = {
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
    expires,
  };

  if (value.length <= COOKIE_CHUNK_SIZE) {
    return [{ ...base, name: COOKIE_NAME, value }];
  }

  const chunks: { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax'; expires: number }[] = [];
  for (let i = 0, idx = 0; i < value.length; i += COOKIE_CHUNK_SIZE, idx += 1) {
    chunks.push({ ...base, name: `${COOKIE_NAME}.${idx}`, value: value.slice(i, i + COOKIE_CHUNK_SIZE) });
  }
  return chunks;
}

/**
 * POST /auth/v1/token?grant_type=password directly against Supabase Auth.
 * We use `fetch` rather than the JS SDK because the SDK persists to
 * localStorage (browser) or an in-memory adapter (Node) — we want the raw
 * session object, nothing more.
 */
async function passwordSignIn(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[e2e] passwordSignIn HTTP ${res.status}: ${body}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    token_type: string;
    user: unknown;
  };
}

/**
 * Create a fresh user via the admin API (email pre-confirmed) and inject a
 * signed-in session into the given page's browser context. Returns the user.
 *
 * After this returns, the caller must navigate — the cookies are set on
 * `localhost` but the current page (if any) won't re-render on its own.
 */
export async function signUpFreshUser(page: Page): Promise<TestUser> {
  const email = makeEmail();
  const password = makePassword();

  // 1. Admin create — email pre-confirmed so no inbox roundtrip.
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`[e2e] admin createUser failed: ${error?.message ?? 'no user returned'}`);
  }
  const id = data.user.id;

  // 2. The magic-link + Google callback route upserts a `profiles` row.
  //    Password sign-in doesn't hit that route, so mirror the upsert here.
  //    Idempotent (ignoreDuplicates), safe on re-runs.
  await admin()
    .from('profiles')
    .upsert(
      { id, email, subscription_status: 'inactive' },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  // 3. Get real session tokens.
  const session = await passwordSignIn(email, password);

  // 4. Serialize + inject.
  const cookies = buildAuthCookies({
    ...session,
    provider_token: null,
    provider_refresh_token: null,
  });
  await page.context().addCookies(cookies);

  return { id, email, password };
}

/**
 * Sign in as an existing user, no user creation. Useful for tests that stitch
 * multiple sessions together — currently unused but kept for future workflows.
 */
export async function signInAs(context: BrowserContext, email: string, password: string) {
  const session = await passwordSignIn(email, password);
  const cookies = buildAuthCookies({
    ...session,
    provider_token: null,
    provider_refresh_token: null,
  });
  await context.addCookies(cookies);
}

/**
 * Clean up everything owned by a test user. Safe to call on a user that was
 * already deleted — errors are swallowed so afterAll cleanup never masks a
 * real test failure.
 */
export async function cleanupUser(userId: string | undefined | null): Promise<void> {
  if (!userId) return;
  try {
    await admin().from('app_calorie_entries').delete().eq('user_id', userId);
    await admin().from('subscriptions').delete().eq('user_id', userId);
    await admin().from('preferences').delete().eq('user_id', userId);
    await admin().from('events').delete().eq('user_id', userId);
    await admin().from('profiles').delete().eq('id', userId);
  } catch (err) {
    console.warn('[e2e] cleanup table delete failed (continuing):', err);
  }
  try {
    await admin().auth.admin.deleteUser(userId);
  } catch (err) {
    console.warn('[e2e] cleanup deleteUser failed (continuing):', err);
  }
}

/**
 * Force-subscribe a user by directly upserting an active row into
 * `subscriptions`. Used by tests that want to skip the Stripe checkout leg
 * (SKIP_STRIPE=1) but still need to reach entitled routes.
 *
 * Does NOT create a real Stripe customer, so `/api/stripe/portal` will
 * fail for this user. Golden-path test uses the full Stripe flow.
 */
export async function forceEntitle(userId: string): Promise<void> {
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin()
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        status: 'active',
        stripe_customer_id: `cus_e2e_${userId.slice(0, 8)}`,
        stripe_subscription_id: `sub_e2e_${userId.slice(0, 8)}`,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[e2e] forceEntitle failed: ${error.message}`);
}

/** Handy for tests that need to read arbitrary DB state under service role. */
export { admin as adminClient };
