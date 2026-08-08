/**
 * GET /api/mini-apps/gym-routine/exercises
 *
 * Paginated exercise catalog. Reference data — every authenticated caller
 * can read it (RLS `exercises_authenticated_read`), but we still require an
 * entitled session for the mini-app endpoints to keep the paywall metaphor
 * consistent across every gym-routine URL.
 *
 * Query params:
 *   ?body_part=chest         (one of the 10 canonical values)
 *   ?target=abs              (target muscle)
 *   ?equipment=dumbbell      (exact equipment string)
 *   ?q=bench                 (ILIKE against `name`)
 *   ?limit=60&offset=0       (max 100 per page — anti-scraping guard)
 *
 * Returns { exercises: Exercise[], total: number }. Short cache header so a
 * user tapping in and out of the same body-part filter doesn't refetch.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bodyPartEnum } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  body_part: bodyPartEnum.optional(),
  target: z.string().max(60).optional(),
  equipment: z.string().max(60).optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const SELECT_COLUMNS =
  'id, name, body_part, target, equipment, muscle_group, secondary_muscles, instruction_steps, image_url, gif_url, attribution';

export async function GET(request: Request) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return jsonError('invalid_query', 400);

  const { body_part, target, equipment, q, limit, offset } = parsed.data;

  let query = gated.supabase
    .from('exercises')
    .select(SELECT_COLUMNS, { count: 'exact' })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (body_part) query = query.eq('body_part', body_part);
  if (target) query = query.eq('target', target);
  if (equipment) query = query.eq('equipment', equipment);
  if (q) {
    // ILIKE with escaped wildcards — the source strings have no % / _ chars
    // in practice, but we still escape defensively.
    const safe = q.replace(/[%_]/g, '\\$&');
    query = query.ilike('name', `%${safe}%`);
  }

  const { data, count, error } = await query;
  if (error) {
    return jsonError('db_error', 500);
  }

  return NextResponse.json(
    { exercises: data ?? [], total: count ?? 0 },
    {
      headers: {
        // Reference data — same result for the same query across users.
        // Kept short so a body-part filter change round-trips fresh.
        'Cache-Control': 'private, max-age=60',
      },
    },
  );
}
