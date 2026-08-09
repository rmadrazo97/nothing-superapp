/**
 * GET    /api/mini-apps/gym-routine/sessions/[id]
 * PATCH  /api/mini-apps/gym-routine/sessions/[id]  — update entries or end
 * DELETE /api/mini-apps/gym-routine/sessions/[id]
 *
 * The live-session UI PATCHes on every set toggle; we validate the shape
 * every time (cheap) rather than trust the client's JSON. `end: true`
 * causes the server to stamp `ended_at = now()` — the client cannot forge
 * an `ended_at` value.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { workoutSessionUpdateSchema } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, routine_id, name, started_at, ended_at, entries, plan_day, plan_exercise_id, block_role, created_at';

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
    .from('workout_sessions')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .eq('user_id', gated.user.id)
    .maybeSingle();

  if (error) return jsonError('db_error', 500);
  if (!data) return jsonError('not_found', 404);
  return NextResponse.json({ session: data });
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
  const parsed = workoutSessionUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.entries !== undefined) patch.entries = parsed.data.entries;
  // Client signals "end this session" with `end: true`. Server owns the
  // timestamp — no way for a bad client to forge a specific `ended_at`.
  if (parsed.data.end === true) patch.ended_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) {
    return jsonError('empty_patch', 400);
  }

  const { data, error } = await gated.supabase
    .from('workout_sessions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', gated.user.id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return jsonError('db_error', 500);
  if (!data) return jsonError('not_found', 404);
  return NextResponse.json({ session: data });
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
    .from('workout_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', gated.user.id);

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ ok: true });
}
