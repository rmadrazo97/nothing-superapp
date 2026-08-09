/**
 * GET  /api/mini-apps/gym-routine/routines — list caller's routines
 * POST /api/mini-apps/gym-routine/routines — create a new routine
 *
 * Two accepted body shapes on POST:
 *   1. v1 (flat) — `{ name, exercises: [{exercise_id, sets: [...]}] }`
 *   2. v2 (structured) — `{ schema_version: '1.0', plan: {...}, source?, athlete?, parsing_notes? }`
 *
 * The route sniffs on `schema_version === '1.0'` (or the presence of a
 * plausible `plan.days` array) to route to the right validator + insert
 * path. Both shapes coexist on the same `workout_routines` table.
 *
 * `user_id` is server-set from the session cookie; never trusted from the
 * client. RLS on `workout_routines` enforces owner-only access; the explicit
 * `.eq('user_id', ...)` filter on POST-then-select is belt-and-suspenders.
 */
import { NextResponse } from 'next/server';
import {
  workoutRoutineInsertSchema,
  routineV2InsertSchema,
} from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, name, exercises, schema_version, plan, source, athlete, parsing_notes, created_at, updated_at';

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

function looksLikeV2(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as { schema_version?: unknown; plan?: unknown };
  if (r.schema_version === '1.0') return true;
  if (r.plan && typeof r.plan === 'object') {
    const p = r.plan as { days?: unknown };
    return Array.isArray(p.days) && p.days.length > 0;
  }
  return false;
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

  if (looksLikeV2(raw)) {
    const parsed = routineV2InsertSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const v2 = parsed.data;
    // Derive the row's `name` column (used everywhere in the UI list view)
    // from an explicit override, else source.title, else plan.id.
    const rowName =
      v2.name?.trim() ||
      v2.source?.title?.trim() ||
      v2.plan.id;

    const { data, error } = await gated.supabase
      .from('workout_routines')
      .insert({
        user_id: gated.user.id,
        name: rowName,
        // v2 rows keep the flat `exercises` column empty; the whole plan
        // lives in the structured columns.
        exercises: [],
        schema_version: '1.0',
        plan: v2.plan,
        source: v2.source ?? null,
        athlete: v2.athlete ?? null,
        parsing_notes: v2.parsing_notes ?? [],
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error || !data) return jsonError('db_error', 500);
    return NextResponse.json({ routine: data }, { status: 201 });
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
