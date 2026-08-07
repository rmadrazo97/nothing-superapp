/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for a $1/mo subscription and returns the
 * redirect URL. Requires an authenticated Supabase session — 401 otherwise.
 *
 * If the user doesn't yet have a `stripe_customer_id` on `subscriptions`, a
 * new Stripe Customer is created and stamped with `metadata.supabase_user_id`
 * so the webhook can attribute events back to the correct user even if the
 * `client_reference_id` path fails.
 */
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';

// Force dynamic — this handler must always run per-request (reads cookies +
// hits Stripe). It should never be cached.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const priceId = process.env.STRIPE_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!priceId || !appUrl) {
    return NextResponse.json(
      { error: 'Server misconfigured: missing STRIPE_PRICE_ID or NEXT_PUBLIC_APP_URL' },
      { status: 500 },
    );
  }

  // 1. Auth check — must be signed in
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Look up existing Stripe customer (service_role — subscriptions RLS
    //    lets owners read their own too, but service_role is uniform).
    const admin = supabaseService();
    const { data: existingSub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Note: we intentionally do NOT upsert the subscriptions row here —
      // that's the webhook's job on `checkout.session.completed`, keeping
      // one source of truth for row lifecycle.
    }

    // 3. Create the Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer: customerId,
      client_reference_id: user.id,
      success_url: `${appUrl}/app?checkout=success`,
      cancel_url: `${appUrl}/app?checkout=canceled`,
      // Also stamp the Supabase user id on the session metadata as belt +
      // suspenders alongside client_reference_id.
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Log server-side for debugging; never leak details to client.
    console.error('[stripe/checkout] error creating session:', err);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 },
    );
  }
}
