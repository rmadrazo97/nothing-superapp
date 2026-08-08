/**
 * GET  /api/mini-apps/gym-routine/routines — list caller's routines
 * POST /api/mini-apps/gym-routine/routines — create a new routine
 *
 * `user_id` is server-set from the session cookie; never trusted from the
 * client. RLS on `workout_routines` enforces owner-only access; the explicit
 * `.eq('user_id', ...)` filter on POST-then-select is belt-and-suspenders.
 */
import { NextResponse } from 'next/server';
import { workoutRoutineInsertSchema } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, name, exercises, created_at, updated_at';

export async function GET() {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { data, error } = await gated.supabase
    .from('workout_routines')
    .select(SELECT_COLUMNS)
    .eq('user_id', gated.user.id)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ routines: data ?? [] });
}

export async function POST(request: Request) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }

  const parsed = workoutRoutineInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await gated.supabase
    .from('workout_routines')
    .insert({
      user_id: gated.user.id,
      name: parsed.data.name,
      exercises: parsed.data.exercises ?? [],
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) return jsonError('db_error', 500);
  return NextResponse.json({ routine: data }, { status: 201 });
}
