/**
 * GET /api/mini-apps/gym-routine/exercises/[id]
 *
 * Single-exercise fetch for the detail view. `id` is a 4-digit string
 * ("0001".."1324") — the source dataset zero-pads them.
 */
import { NextResponse } from 'next/server';
import { requireEntitledUser, jsonError } from '../../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, name, body_part, target, equipment, muscle_group, secondary_muscles, instruction_steps, image_url, gif_url, attribution';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const { id } = await ctx.params;
  // Belt-and-suspenders — the DB check constraint enforces this, but we
  // reject early on obviously-malformed ids so the query isn't wasted.
  if (!/^[0-9a-zA-Z_-]{1,12}$/.test(id)) {
    return jsonError('invalid_id', 400);
  }

  const { data, error } = await gated.supabase
    .from('exercises')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) return jsonError('db_error', 500);
  if (!data) return jsonError('not_found', 404);

  return NextResponse.json(
    { exercise: data },
    {
      headers: {
        // Individual exercise rows are immutable in v1 — cache longer.
        'Cache-Control': 'private, max-age=3600',
      },
    },
  );
}
