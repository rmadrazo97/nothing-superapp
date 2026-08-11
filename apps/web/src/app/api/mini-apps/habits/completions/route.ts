/**
 * GET  /api/mini-apps/habits/completions?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   — list caller's completions in the given window (defaults to last 30 days).
 *
 * POST /api/mini-apps/habits/completions
 *   — toggle today's completion for a habit. Body: { habit_id, completed_on? }.
 *   If a row already exists for (habit_id, completed_on), we DELETE it
 *   (idempotent uncheck). Otherwise we INSERT. Returns { toggled_to: 'on' | 'off' }.
 */
import { NextResponse } from 'next/server';
import { habitCompletionToggleSchema } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT = 'id, habit_id, user_id, completed_on, created_at';

function todayLocalISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(request: Request) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const isDate = (s: string | null) => s != null && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const fromDate = isDate(from) ? from! : defaultFrom.toISOString().slice(0, 10);
  const toDate = isDate(to) ? to! : todayLocalISODate();

  const { data, error } = await gated.supabase
    .from('habit_completions')
    .select(SELECT)
    .eq('user_id', gated.user.id)
    .gte('completed_on', fromDate)
    .lte('completed_on', toDate)
    .order('completed_on', { ascending: false });

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ completions: data ?? [] });
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

  const parsed = habitCompletionToggleSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { habit_id, completed_on } = parsed.data;
  const date = completed_on ?? todayLocalISODate();

  // Verify the habit belongs to the caller. RLS already enforces this on
  // insert (auth.uid()=user_id) but returning a clean 404 is friendlier
  // than a 42501 permission denied.
  const { data: habit, error: habitErr } = await gated.supabase
    .from('habits')
    .select('id')
    .eq('id', habit_id)
    .eq('user_id', gated.user.id)
    .maybeSingle();
  if (habitErr) return jsonError('db_error', 500);
  if (!habit) return jsonError('habit_not_found', 404);

  // Idempotent toggle: if a completion row exists for (habit, date), delete
  // it; otherwise insert one. Two-step keeps the intent obvious in logs.
  const { data: existing } = await gated.supabase
    .from('habit_completions')
    .select('id')
    .eq('habit_id', habit_id)
    .eq('completed_on', date)
    .maybeSingle();

  if (existing) {
    const { error: delErr } = await gated.supabase
      .from('habit_completions')
      .delete()
      .eq('id', existing.id)
      .eq('user_id', gated.user.id);
    if (delErr) return jsonError('db_error', 500);
    return NextResponse.json({ toggled_to: 'off', habit_id, completed_on: date });
  }

  const { error: insErr } = await gated.supabase
    .from('habit_completions')
    .insert({ habit_id, user_id: gated.user.id, completed_on: date });
  if (insErr) return jsonError('db_error', 500);
  return NextResponse.json({ toggled_to: 'on', habit_id, completed_on: date });
}
