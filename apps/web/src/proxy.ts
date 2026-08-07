/**
 * Next.js 16 Proxy (renamed from Middleware in 15 and earlier).
 *
 * Runs on every non-static request; refreshes the Supabase session cookie
 * and enforces the auth gate. See `lib/supabase/middleware.ts` for the
 * refresh/redirect logic.
 */
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip Next internals, static assets, favicon, and the Stripe webhook
  // (Stripe posts server-to-server and must not be redirected on auth).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|otf|map)$).*)',
  ],
};
