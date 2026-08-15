/**
 * GET /api/mini-apps/gym-routine/exercises/[id]
 *
 * Single-exercise fetch for the detail view. `id` is a 4-digit catalog
 * string ("0001".."1324"), OR a routine-local id like "d5e1" that the
 * plan-generator invents when it can't match a catalog row cleanly.
 * For local ids we fall back to increasingly forgiving name lookups via
 * the `?name=` query: exact → prefix → contains → word-AND → longest-
 * word contains. Catalog names are like "Cable seated row converging
 * machine" while routine names are like "Low row, converging machine",
 * so the multi-word AND (each significant word must appear anywhere)
 * is the only reliable bridge.
 */
import { NextResponse } from 'next/server';
import { requireEntitledUser, jsonError } from '../../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, name, body_part, target, equipment, muscle_group, secondary_muscles, instruction_steps, image_url, gif_url, attribution';

// Words too generic to disambiguate — most exercises are of some flavour
// of these. Kept short; ILIKE fallback still works because we keep at
// least one distinctive word.
const STOPWORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'into', 'per', 'each',
  'left', 'right', 'both', 'set', 'sets', 'rep', 'reps',
]);

function significantWords(hint: string): string[] {
  return hint
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // strip punctuation → spaces
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length); // longest first — most specific
}

async function ok(data: unknown) {
  return NextResponse.json(
    { exercise: data },
    { headers: { 'Cache-Control': 'private, max-age=3600' } },
  );
}

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

  if (direct.data) return ok(direct.data);

  if (nameHint) {
    const trimmed = nameHint.slice(0, 120);

    // Stage 1 — literal ILIKE tiers.
    for (const pattern of [trimmed, `${trimmed}%`, `%${trimmed}%`]) {
      const r = await gated.supabase
        .from('exercises')
        .select(SELECT_COLUMNS)
        .ilike('name', pattern)
        .limit(1)
        .maybeSingle();
      if (r.data) return ok(r.data);
    }

    // Stage 2 — word-AND. "Low row, converging machine" →
    // ilike('name','%converging%').ilike('name','%machine%')… — matches
    // "Cable seated row converging machine" regardless of word order.
    const words = significantWords(trimmed);
    if (words.length > 0) {
      // Try progressively fewer words: all → longest N-1 → longest N-2
      // → … → longest single word. Stops the moment something matches.
      for (let take = words.length; take >= 1; take--) {
        let q = gated.supabase.from('exercises').select(SELECT_COLUMNS);
        for (const w of words.slice(0, take)) {
          q = q.ilike('name', `%${w}%`);
        }
        const r = await q.limit(1).maybeSingle();
        if (r.data) return ok(r.data);
      }
    }
  }

  if (direct.error) return jsonError('db_error', 500);
  return jsonError('not_found', 404);
}
