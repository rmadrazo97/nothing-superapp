/**
 * Shared helpers for gym-routine route handlers.
 *
 * Every handler under /api/mini-apps/gym-routine/* runs the same two gates:
 *   1. Authentication — `supabase.auth.getUser()` returns 401 if the caller
 *      has no active session cookie.
 *   2. Entitlement — `getEntitlement()` returns 402 (payment_required) if
 *      the caller's subscription is not `active` or `trialing`. The Proxy
 *      already redirects unentitled users away from `/app/gym-routine`, so
 *      this is defence-in-depth for a subscription that lapsed while the
 *      tab was open.
 *
 * Bundling the gate into `requireEntitledUser` keeps every handler two
 * lines shorter and rules out a copy-paste drift where one endpoint forgot
 * the paywall.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

export type Gated =
  | { ok: true; user: { id: string; email: string | null }; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; response: NextResponse };

export async function requireEntitledUser(): Promise<Gated> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }

  const { entitlement } = await getEntitlement(user.id, supabase);
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'payment_required', entitlement },
        { status: 402 },
      ),
    };
  }

  return { ok: true, user: { id: user.id, email: user.email ?? null }, supabase };
}

export const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });
