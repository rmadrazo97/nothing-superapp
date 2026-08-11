/**
 * GET  /api/mini-apps/habits/habits — list caller's habits
 * POST /api/mini-apps/habits/habits — create a new habit
 *
 * user_id is server-set from the session. RLS on `habits` enforces owner
 * access; the explicit `.eq('user_id', ...)` is defence-in-depth.
 */
import { NextResponse } from 'next/server';
import { habitInsertSchema } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT = 'id, user_id, name, emoji, target_days_per_week, active, created_at, updated_at';

export async function GET() {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { data, error } = await gated.supabase
    .from('habits')
    .select(SELECT)
    .eq('user_id', gated.user.id)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ habits: data ?? [] });
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

  const parsed = habitInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data, error } = await gated.supabase
    .from('habits')
    .insert({ ...parsed.data, user_id: gated.user.id })
    .select(SELECT)
    .single();

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ habit: data });
}
