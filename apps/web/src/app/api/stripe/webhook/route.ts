/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook receiver. Verifies the signature, then updates the
 * `subscriptions` table via the service_role Supabase client (bypasses RLS).
 *
 * SIGNATURE VERIFICATION IS THE ENTIRE SECURITY MODEL — do not skip it, and
 * always read the raw body BEFORE any JSON parsing. `req.text()` in the App
 * Router gives us the raw body natively; no bodyParser opt-out needed
 * (that's Pages Router only).
 *
 * All handlers are idempotent — Stripe retries on non-2xx, and events can
 * fire more than once. We use `upsert` keyed on the primary key (`user_id`).
 *
 * Attribution: we look up the target user via, in order:
 *   1. `session.client_reference_id` (populated in POST /api/stripe/checkout)
 *   2. `customer.metadata.supabase_user_id` (populated when we created the customer)
 *   3. `subscription.metadata.supabase_user_id` (populated on session creation)
 * If none resolve, we log and return 200 (unknown user — nothing to do; do
 * not 4xx or Stripe will retry forever).
 */
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';
import { supabaseService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Map Stripe subscription status → our internal enum */
function mapStatus(stripeStatus: Stripe.Subscription.Status): string {
  // Our subscriptions.status column accepts:
  //   trialing | active | past_due | canceled | incomplete
  // Stripe adds a few extras — normalize the outliers into the closest bucket.
  switch (stripeStatus) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
      return stripeStatus;
    case 'incomplete_expired':
      return 'canceled';
    case 'unpaid':
      return 'past_due';
    case 'paused':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

/** Unix seconds → ISO string (timestamptz-compatible), null-safe */
function toIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/** Resolve the Supabase user id for a Stripe subscription or session. */
async function resolveUserId(
  subscription: Stripe.Subscription | null,
  session: Stripe.Checkout.Session | null,
): Promise<string | null> {
  // 1. Checkout Session's client_reference_id (most reliable)
  if (session?.client_reference_id) return session.client_reference_id;

  // 2. Subscription metadata
  const subMeta = subscription?.metadata?.supabase_user_id;
  if (subMeta) return subMeta;

  // 3. Customer metadata — fetch customer if we only have an id string
  const customerRef = subscription?.customer ?? session?.customer ?? null;
  if (!customerRef) return null;

  const customerId =
    typeof customerRef === 'string' ? customerRef : customerRef.id;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    return customer.metadata?.supabase_user_id ?? null;
  } catch (err) {
    console.error('[stripe/webhook] failed to retrieve customer:', err);
    return null;
  }
}

/**
 * Upsert a full subscription row. Called on both `checkout.session.completed`
 * (with the fresh session in hand) and `customer.subscription.*` events.
 */
async function upsertSubscriptionRow(params: {
  userId: string;
  subscription: Stripe.Subscription;
}) {
  const { userId, subscription } = params;
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const admin = supabaseService();
  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: mapStatus(subscription.status),
      current_period_end: toIso(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('[stripe/webhook] upsert failed:', error);
    throw error;
  }
}

/** Patch just the status (+ related fields), keyed on stripe_subscription_id. */
async function patchSubscriptionByStripeId(params: {
  stripeSubscriptionId: string;
  patch: Record<string, unknown>;
}) {
  const { stripeSubscriptionId, patch } = params;
  const admin = supabaseService();
  const { error } = await admin
    .from('subscriptions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', stripeSubscriptionId);
  if (error) {
    console.error('[stripe/webhook] patch failed:', error);
    throw error;
  }
}

// ─── handler ────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not set');
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  // CRITICAL: raw body BEFORE any JSON parsing — signature is over these bytes.
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new NextResponse('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    // Signature failure — return 400 so Stripe surfaces it, but don't leak the
    // reason (could aid an attacker probing for the secret).
    console.error('[stripe/webhook] signature verification failed:', err);
    return new NextResponse('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Only handle subscription-mode sessions.
        if (session.mode !== 'subscription') break;

        if (!session.subscription) {
          console.warn('[stripe/webhook] session.completed with no subscription id');
          break;
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id;

        // Fetch the full subscription — we need current_period_end etc.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        const userId = await resolveUserId(subscription, session);
        if (!userId) {
          console.error(
            '[stripe/webhook] could not resolve user id for session',
            session.id,
          );
          // 200 — no point retrying, we still don't know the user.
          break;
        }

        await upsertSubscriptionRow({ userId, subscription });
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(subscription, null);
        if (!userId) {
          console.error(
            '[stripe/webhook] could not resolve user id for subscription',
            subscription.id,
          );
          break;
        }
        await upsertSubscriptionRow({ userId, subscription });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        // Prefer patch-by-stripe-id — row already exists.
        await patchSubscriptionByStripeId({
          stripeSubscriptionId: subscription.id,
          patch: {
            status: 'canceled',
            cancel_at_period_end: subscription.cancel_at_period_end ?? false,
            current_period_end: toIso(subscription.current_period_end),
          },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        // Invoice.subscription can be string | Subscription | null in some
        // API versions; guard both.
        const subRef = (invoice as unknown as { subscription: string | Stripe.Subscription | null }).subscription;
        if (!subRef) break;
        const subscriptionId = typeof subRef === 'string' ? subRef : subRef.id;
        await patchSubscriptionByStripeId({
          stripeSubscriptionId: subscriptionId,
          patch: { status: 'past_due' },
        });
        break;
      }

      default:
        // Not an event we care about — acknowledge to stop retries.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe/webhook] handler error for event', event.id, err);
    // 500 with generic body — Stripe will retry, which is what we want on
    // transient DB failures.
    return new NextResponse('Handler error', { status: 500 });
  }
}
