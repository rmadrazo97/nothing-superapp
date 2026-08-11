/**
 * PATCH  /api/mini-apps/habits/habits/[id] — update a habit
 * DELETE /api/mini-apps/habits/habits/[id] — delete a habit (cascades completions)
 */
import { NextResponse } from 'next/server';
import { habitUpdateSchema } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT = 'id, user_id, name, emoji, target_days_per_week, active, created_at, updated_at';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }

  const parsed = habitUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return jsonError('empty_patch', 400);
  }

  const { data, error } = await gated.supabase
    .from('habits')
    .update(parsed.data)
    .eq('id', id)
    .eq('user_id', gated.user.id)
    .select(SELECT)
    .single();

  if (error) return jsonError('db_error', 500);
  if (!data) return jsonError('not_found', 404);
  return NextResponse.json({ habit: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { error } = await gated.supabase
    .from('habits')
    .delete()
    .eq('id', id)
    .eq('user_id', gated.user.id);

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ ok: true });
}
