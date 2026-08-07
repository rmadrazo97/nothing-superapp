/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Billing Portal session for the caller and returns `{ url }`.
 * The client then top-level-navigates to that URL. Requires an authenticated
 * Supabase session — 401 otherwise. Returns 400 if the user has never
 * subscribed (no `stripe_customer_id` on the `subscriptions` row).
 */
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: 'Server misconfigured: missing NEXT_PUBLIC_APP_URL' },
      { status: 500 },
    );
  }

  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Look up the caller's Stripe customer id. RLS on `subscriptions`
  //    enforces owner-only reads; the user's session client is fine here.
  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subError) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'no_customer' },
      { status: 400 },
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${appUrl}/app/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/portal] error creating portal session:', err);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 },
    );
  }
}
