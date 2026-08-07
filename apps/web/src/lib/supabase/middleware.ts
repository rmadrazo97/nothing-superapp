/**
 * Session-refresh helper for the Next.js Proxy (formerly Middleware in Next 15
 * and earlier — renamed in Next 16, same functionality).
 *
 * Called from `src/proxy.ts` on every non-static request:
 *   1. Instantiates a server-side Supabase client bound to the incoming
 *      request cookies + outgoing response cookies.
 *   2. Calls `getUser()`, which triggers Supabase's automatic access-token
 *      refresh if the current cookie is stale — the new cookie is written
 *      onto the outgoing `NextResponse`.
 *   3. Enforces route protection: unauth users hitting `/app/*` are
 *      redirected to `/login`; auth users hitting `/login` bounce to `/app`.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_HOME = '/app';
const LOGIN_PATH = '/login';

// Prefixes that require an authenticated session.
const PROTECTED_PREFIXES = ['/app'];

// Public paths that a signed-in user should be bounced off of.
const AUTHED_ONLY_BOUNCE = ['/login'];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthedOnlyBounce(pathname: string) {
  return AUTHED_ONLY_BOUNCE.includes(pathname);
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

  return response;
}
