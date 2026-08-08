/**
 * GET /api/mini-apps/gym-routine/sessions/live
 *
 * Returns the caller's currently-live session (ended_at is null), or
 * `{ session: null }` if none. Used by the home page to render the
 * "Resume workout" banner, and by exercise-detail to know whether
 * "Add to session" should append to an existing session or start one.
 *
 * The partial index `workout_sessions_live_idx` on `(user_id) where
 * ended_at is null` keeps this a single-row lookup even for users with
 * thousands of historical sessions.
 */
import { NextResponse } from 'next/server';
import { requireEntitledUser, jsonError } from '../../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, routine_id, name, started_at, ended_at, entries, created_at';

export async function GET() {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { data, error } = await gated.supabase
    .from('workout_sessions')
    .select(SELECT_COLUMNS)
    .eq('user_id', gated.user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ session: data ?? null });
}
