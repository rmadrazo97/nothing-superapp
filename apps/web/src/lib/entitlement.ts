/**
 * Entitlement helper — the single source of truth for "is this user allowed
 * into paid features right now?".
 *
 * The DB `subscriptions.status` column is a raw Stripe-shaped enum
 * (trialing / active / past_due / canceled / incomplete). Product code should
 * NOT branch on that directly — it should ask this helper for a normalized
 * verdict ('active' | 'trialing' | 'inactive') that already accounts for the
 * `current_period_end` window.
 *
 * Behaviour:
 *   - status IN ('active', 'trialing') AND (current_period_end is null OR
 *     current_period_end > now)  →  entitlement = status
 *   - anything else (including no row)  →  entitlement = 'inactive'
 *
 * A canceled subscription that hasn't yet hit `current_period_end` keeps
 * Stripe status = 'active' with `cancel_at_period_end = true`, so this helper
 * correctly retains access through the paid-through date.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subscription } from '@nothing/shared';

export type Entitlement = 'active' | 'trialing' | 'inactive';

export interface EntitlementResult {
  entitlement: Entitlement;
  subscription: Subscription | null;
}

/**
 * Read the caller's subscription row and normalize it into an entitlement
 * verdict. Pass a Supabase client that is scoped to the user's session (RLS
 * will filter to the owner row) OR a service_role client for trusted server
 * paths — either works because we also filter on `user_id` explicitly.
 */
export async function getEntitlement(
  userId: string,
  supabase: SupabaseClient,
): Promise<EntitlementResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { entitlement: 'inactive', subscription: null };
  }

  const subscription = data as Subscription;
  const entitlement = deriveEntitlement(subscription);
  return { entitlement, subscription };
}

/**
 * Pure derivation — exported so callers that already hold a Subscription row
 * (e.g. after a webhook write) can classify it without a second DB round-trip.
 */
export function deriveEntitlement(subscription: Subscription | null): Entitlement {
  if (!subscription) return 'inactive';
  const { status, current_period_end } = subscription;
  if (status !== 'active' && status !== 'trialing') return 'inactive';
  if (current_period_end) {
    const endMs = Date.parse(current_period_end);
    if (Number.isFinite(endMs) && endMs <= Date.now()) return 'inactive';
  }
  return status;
}

/** Convenience: entitled = 'active' OR 'trialing'. */
export function isEntitled(entitlement: Entitlement): boolean {
  return entitlement === 'active' || entitlement === 'trialing';
}
