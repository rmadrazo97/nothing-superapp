/**
 * Shared helpers for habits route handlers — twin of the gym-routine _lib.
 * Bundles auth + entitlement gates. See the gym-routine version for the
 * design rationale (defence-in-depth vs. the Proxy's paywall redirect).
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
