/**
 * Session-refresh + gate helper for the Next.js Proxy (formerly Middleware in
 * Next 15 and earlier — renamed in Next 16, same functionality).
 *
 * Called from `src/proxy.ts` on every non-static request:
 *   1. Instantiates a server-side Supabase client bound to the incoming
 *      request cookies + outgoing response cookies.
 *   2. Calls `getUser()`, which triggers Supabase's automatic access-token
 *      refresh if the current cookie is stale — the new cookie is written
 *      onto the outgoing `NextResponse`.
 *   3. Enforces route protection:
 *        - Unauthed users hitting any auth-gated path → /login?next=…
 *        - Authed users hitting /login → bounced to /app
 *        - Authed-but-unentitled users hitting a mini-app route
 *          (/app, /app/anything except /app/assistant and /app/settings) →
 *          redirected to /paywall.
 *
 * The entitlement check runs AFTER the auth check and uses the same Supabase
 * client (RLS enforces owner-scoping; getEntitlement also filters on user_id
 * explicitly). The assistant and settings tabs are intentionally always
 * accessible to signed-in users so that (a) an unsubscribed user can chat
 * with the copilot about upgrading, and (b) billing controls live on the
 * settings tab and must reachable even when entitlement is inactive.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

const AUTH_HOME = '/app';
const LOGIN_PATH = '/login';
const PAYWALL_PATH = '/paywall';

// Prefixes that require an authenticated session. `/paywall` is included so
// unauthenticated visitors get bounced to /login instead of hitting a page
// that would immediately try to POST to the auth-gated Stripe endpoint.
const PROTECTED_PREFIXES = ['/app', '/paywall'];

// Public paths that a signed-in user should be bounced off of.
const AUTHED_ONLY_BOUNCE = ['/login'];

// Paths under /app that stay reachable for signed-in-but-unentitled users.
// - /app/assistant: the copilot must remain reachable so users can chat about
//   upgrading (spec-level product requirement).
// - /app/settings: hosts the billing surface — locking it behind the paywall
//   would create a dead-end for anyone who wants to manage/cancel.
const ENTITLEMENT_EXEMPT_APP_SUBPATHS = ['/app/assistant', '/app/settings'];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthedOnlyBounce(pathname: string) {
  return AUTHED_ONLY_BOUNCE.includes(pathname);
}

/**
 * True when the path is inside `/app` AND is NOT one of the exempt tabs.
 * The paywall page itself is deliberately excluded from the entitlement gate
 * (otherwise an unentitled user would loop trying to reach it).
 */
function requiresEntitlement(pathname: string): boolean {
  if (!(pathname === AUTH_HOME || pathname.startsWith(`${AUTH_HOME}/`))) {
    return false;
  }
  return !ENTITLEMENT_EXEMPT_APP_SUBPATHS.some(
    (exempt) => pathname === exempt || pathname.startsWith(`${exempt}/`),
  );
}

export async function updateSession(request: NextRequest) {
  // A single mutable response we can attach refreshed cookies to.
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Fail open — the Proxy shouldn't hard-crash the whole app. Downstream
    // Server Components will throw a clearer error.
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Triggers cookie refresh as a side effect if the JWT is stale.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = LOGIN_PATH;
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthedOnlyBounce(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = AUTH_HOME;
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  // Entitlement gate — runs only for signed-in users on paid app routes.
  // A DB blip here should NOT hard-fail the request; getEntitlement already
  // returns 'inactive' on missing rows, and any thrown exception falls back
  // to letting the request through (downstream page can render a soft
  // "connect to billing" state rather than 500ing on a cookie check).
  if (user && requiresEntitlement(pathname)) {
    try {
      const { entitlement } = await getEntitlement(user.id, supabase);
      if (!isEntitled(entitlement)) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = PAYWALL_PATH;
        redirectUrl.search = '';
        return NextResponse.redirect(redirectUrl);
      }
    } catch (err) {
      // Fail open — see rationale above.
      console.error('[proxy] entitlement check failed:', err);
    }
  }

  return response;
}
