/**
 * GET /api/mini-apps/gym-routine/exercises/[id]
 *
 * Single-exercise fetch for the detail view. `id` is a 4-digit catalog
 * string ("0001".."1324"), OR a routine-local id like "d5e1" that the
 * plan-generator invents when it can't match a catalog row cleanly.
 * For local ids we fall back to a case-insensitive name match via the
 * `?name=` query — routines always store the human-readable name, so
 * "Incline dumbbell press" resolves to catalog row 0402 even when the
 * id itself is opaque.
 */
import { NextResponse } from 'next/server';
import { requireEntitledUser, jsonError } from '../../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, name, body_part, target, equipment, muscle_group, secondary_muscles, instruction_steps, image_url, gif_url, attribution';

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const nameHint = url.searchParams.get('name')?.trim() ?? '';

  // Widened from the old 12-char PK regex so v2 routines and superset
  // flattening (e.g. "abc.c1") still pass validation — the name-based
  // fallback below is what actually resolves those to catalog rows.
  if (!/^[0-9a-zA-Z_.-]{1,64}$/.test(id)) {
    return jsonError('invalid_id', 400);
  }

  const direct = await gated.supabase
    .from('exercises')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (direct.data) {
    return NextResponse.json(
      { exercise: direct.data },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  }

  if (nameHint) {
    const trimmed = nameHint.slice(0, 120);
    const exact = await gated.supabase
      .from('exercises')
      .select(SELECT_COLUMNS)
      .ilike('name', trimmed)
      .limit(1)
      .maybeSingle();
    if (exact.data) {
      return NextResponse.json(
        { exercise: exact.data },
        { headers: { 'Cache-Control': 'private, max-age=3600' } },
      );
    }
    const prefix = await gated.supabase
      .from('exercises')
      .select(SELECT_COLUMNS)
      .ilike('name', `${trimmed}%`)
      .limit(1)
      .maybeSingle();
    if (prefix.data) {
      return NextResponse.json(
        { exercise: prefix.data },
        { headers: { 'Cache-Control': 'private, max-age=3600' } },
      );
    }
    const contains = await gated.supabase
      .from('exercises')
      .select(SELECT_COLUMNS)
      .ilike('name', `%${trimmed}%`)
      .limit(1)
      .maybeSingle();
    if (contains.data) {
      return NextResponse.json(
        { exercise: contains.data },
        { headers: { 'Cache-Control': 'private, max-age=3600' } },
      );
    }
  }

  if (direct.error) return jsonError('db_error', 500);
  return jsonError('not_found', 404);
}
