/**
 * GET /api/entitlement
 *
 * Auth-gated read of the caller's normalized entitlement + raw subscription
 * row. Consumed by the `useEntitlement` client hook so client components
 * (home grid tile-locks, settings billing card, upsell CTAs) can render
 * subscription-aware UI without duplicating the DB shape.
 *
 * 401 if no session. Never leaks another user's data (RLS + explicit user_id
 * filter in getEntitlement).
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { entitlement, subscription } = await getEntitlement(user.id, supabase);
  return NextResponse.json({ entitlement, subscription });
}
