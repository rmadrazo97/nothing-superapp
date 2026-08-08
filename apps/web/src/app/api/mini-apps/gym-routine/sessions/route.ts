/**
 * GET  /api/mini-apps/gym-routine/sessions — recent sessions (last N)
 * POST /api/mini-apps/gym-routine/sessions — start a new session
 *
 * Sessions are the source of truth for what the user actually did. The
 * `entries` jsonb column holds a snapshot of exercise names + sets so that
 * a later routine edit doesn't rewrite history.
 *
 * POST is idempotent-ish — if the caller already has a live session
 * (ended_at is null) we return that one with 200 rather than opening a
 * second concurrent live session. The `workout_sessions_live_idx` partial
 * index makes the check cheap.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { workoutSessionInsertSchema } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, routine_id, name, started_at, ended_at, entries, created_at';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function GET(request: Request) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return jsonError('invalid_query', 400);

  const { data, error } = await gated.supabase
    .from('workout_sessions')
    .select(SELECT_COLUMNS)
    .eq('user_id', gated.user.id)
    .order('started_at', { ascending: false })
    .limit(parsed.data.limit);

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ sessions: data ?? [] });
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
  const parsed = workoutSessionInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // If there's already a live session, return it — don't open a second.
  const { data: existing, error: existingErr } = await gated.supabase
    .from('workout_sessions')
    .select(SELECT_COLUMNS)
    .eq('user_id', gated.user.id)
    .is('ended_at', null)
    .maybeSingle();
  if (existingErr) return jsonError('db_error', 500);
  if (existing) {
    return NextResponse.json({ session: existing }, { status: 200 });
  }

  const { data, error } = await gated.supabase
    .from('workout_sessions')
    .insert({
      user_id: gated.user.id,
      routine_id: parsed.data.routine_id ?? null,
      name: parsed.data.name ?? null,
      entries: parsed.data.entries ?? [],
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) return jsonError('db_error', 500);
  return NextResponse.json({ session: data }, { status: 201 });
}
