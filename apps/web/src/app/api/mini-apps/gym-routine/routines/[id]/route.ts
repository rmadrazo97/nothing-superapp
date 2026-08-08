/**
 * GET    /api/mini-apps/gym-routine/routines/[id]
 * PATCH  /api/mini-apps/gym-routine/routines/[id]
 * DELETE /api/mini-apps/gym-routine/routines/[id]
 *
 * Per-routine CRUD for the caller's own routines. Owner-only via RLS; the
 * explicit `.eq('user_id', ...)` on the write paths is defence-in-depth
 * (belt-and-suspenders — RLS should already block cross-user writes).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { workoutRoutineUpdateSchema } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, name, exercises, created_at, updated_at';

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return jsonError('invalid_id', 400);

  const { data, error } = await gated.supabase
    .from('workout_routines')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .eq('user_id', gated.user.id)
    .maybeSingle();

  if (error) return jsonError('db_error', 500);
  if (!data) return jsonError('not_found', 404);
  return NextResponse.json({ routine: data });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return jsonError('invalid_id', 400);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }
  const parsed = workoutRoutineUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.name != null) patch.name = parsed.data.name;
  if (parsed.data.exercises != null) patch.exercises = parsed.data.exercises;

  if (Object.keys(patch).length === 0) {
    return jsonError('empty_patch', 400);
  }

  const { data, error } = await gated.supabase
    .from('workout_routines')
    .update(patch)
    .eq('id', id)
    .eq('user_id', gated.user.id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return jsonError('db_error', 500);
  if (!data) return jsonError('not_found', 404);
  return NextResponse.json({ routine: data });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return jsonError('invalid_id', 400);

  const { error } = await gated.supabase
    .from('workout_routines')
    .delete()
    .eq('id', id)
    .eq('user_id', gated.user.id);

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ ok: true });
}
