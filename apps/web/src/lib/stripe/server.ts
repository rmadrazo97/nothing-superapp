/**
 * Server-only Stripe client — lazy singleton.
 *
 * Instantiates on FIRST access, not at module load. That matters for
 * `next build` which walks route handlers to collect page data; a hard
 * throw at import time would fail the build even though the server-only
 * key is only needed at request time.
 *
 * Uses the SDK's pinned `LatestApiVersion` so we upgrade in lockstep with the
 * installed package types — avoids drift between runtime string and TS types.
 *
 * Import ONLY from server-side code (route handlers, server components, RSC
 * data fetchers). Do not import from client components.
 */
import Stripe from 'stripe';

let cached: Stripe | null = null;

function build(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    typescript: true,
  });
}

/**
 * Lazily-instantiated singleton. Access via `stripe.customers...` — the
 * Proxy trap defers the `build()` call until first property read, so a
 * missing env at build time doesn't fail static analysis.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    if (!cached) cached = build();
    const value = Reflect.get(cached as object, prop, receiver);
    return typeof value === 'function' ? value.bind(cached) : value;
  },
});
