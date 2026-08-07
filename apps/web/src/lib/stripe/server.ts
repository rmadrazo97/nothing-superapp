/**
 * Server-only Stripe client.
 *
 * Uses the SDK's pinned `LatestApiVersion` so we upgrade in lockstep with the
 * installed package types — avoids drift between runtime string and TS types.
 *
 * Import ONLY from server-side code (route handlers, server components, RSC
 * data fetchers). Do not import from client components.
 */
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

// LatestApiVersion is a type alias in the SDK — assert to satisfy the ctor.
export const stripe = new Stripe(secretKey, {
  apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
  typescript: true,
});
