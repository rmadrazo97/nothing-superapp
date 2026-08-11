/**
 * GET /api/mini-apps/gym-routine/progression
 *
 * Aggregation endpoint for the PROGRESSION tab (v0.5.8, task W10). Returns
 * four KPI scalars, an 8-week volume bucket series, and up to four
 * per-exercise top-set histories — see
 * `apps/mini-apps/gym-routine/lib/progression-query.ts` for the pure
 * aggregator this route wraps.
 *
 * Why aggregate server-side instead of shipping raw sessions to the client:
 *   - The last-90-day payload for a heavy lifter can be > 1 MB of jsonb.
 *   - Every PROGRESSION tab visit would otherwise re-parse hundreds of sets
 *     in the browser main thread. Aggregating on the server means the wire
 *     shape is bounded (~4KB) and the render is instant.
 *   - Same gate as every other gym-routine endpoint (auth + entitlement) —
 *     the aggregator returns 402 to a lapsed subscriber so a client with a
 *     stale bundle can't dodge the paywall.
 */
import { NextResponse } from 'next/server';
import { requireEntitledUser, jsonError } from '../_lib';
import {
  computeProgression,
  emptyProgression,
  PROGRESSION_LOOKBACK_DAYS,
  type SessionRow,
} from '@nothing-mini-apps/gym-routine/lib/progression-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const now = new Date();
  const since = new Date(
    now.getTime() - PROGRESSION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Only pull the columns the aggregator reads. `entries` is jsonb — the DB
  // returns it as a parsed JS array already so no JSON.parse here.
  const { data, error } = await gated.supabase
    .from('workout_sessions')
    .select('id, started_at, ended_at, entries')
    .eq('user_id', gated.user.id)
    .not('ended_at', 'is', null)
    .gte('started_at', since)
    .order('started_at', { ascending: true });

  if (error) return jsonError('db_error', 500);

  const rows = (data ?? []) as SessionRow[];
  const payload = rows.length === 0
    ? emptyProgression(now)
    : computeProgression(rows, now);

  return NextResponse.json(payload);
}
