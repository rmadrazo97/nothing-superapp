/**
 * Shared server-side gates for tool `execute()` fns.
 *
 * Every WRITE tool must:
 *   1. Re-check entitlement (defence-in-depth — the route already gated at the
 *      top of the request, but a malicious tool loop shouldn't leak writes
 *      after a subscription lapses mid-stream).
 *   2. Consume a second, tighter rate-limit budget so a runaway agent loop
 *      can't fill the DB. 10 writes / user / hour is generous for real usage
 *      (a heavy day of logging is ~5 meals + water + weight = 7) but tight
 *      enough to cap damage.
 *
 * READ tools skip the write gate — they only re-check auth (already done by
 * the route) implicitly by using the caller's session Supabase client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { limitPerKey } from '@/lib/rate-limit';

export const COPILOT_WRITE_LIMIT_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

export interface GateFailure {
  ok: false;
  status: 'unauthorized' | 'payment_required' | 'rate_limited';
  error: string;
  retryAfterSeconds?: number;
}

export type GateResult = { ok: true } | GateFailure;

/**
 * Re-verify the caller is entitled to write. Returns a structured failure so
 * the tool can surface it to the LLM (which then explains it to the user).
 */
export async function assertEntitled(
  userId: string,
  supabase: SupabaseClient,
): Promise<GateResult> {
  const { entitlement } = await getEntitlement(userId, supabase);
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      status: 'payment_required',
      error: `Subscription ${entitlement} — the user must be on an active plan to write data.`,
    };
  }
  return { ok: true };
}

/** Second rate-limit budget scoped to WRITE tool calls only. */
export function assertWriteBudget(userId: string): GateResult {
  const gate = limitPerKey(
    `copilot-write:${userId}`,
    COPILOT_WRITE_LIMIT_PER_HOUR,
    HOUR_MS,
  );
  if (!gate.ok) {
    return {
      ok: false,
      status: 'rate_limited',
      error: `Write rate limit hit (${COPILOT_WRITE_LIMIT_PER_HOUR}/hour). Try again in ${gate.retryAfterSeconds}s.`,
      retryAfterSeconds: gate.retryAfterSeconds,
    };
  }
  return { ok: true };
}
