/**
 * GET /api/mini-apps/calorie-lite/foods
 *
 * Search the shared `foods` reference table (153 seeded items), optionally
 * merging in the caller's own `custom_foods`. Powers the SEARCH tab in the
 * Add Meal flow.
 *
 * Query params:
 *   - `q`              case-insensitive name substring (ILIKE %q%)
 *   - `category`       one of foodCategoryEnum values
 *   - `limit`          default 30, max 100
 *   - `offset`         default 0
 *   - `include_custom` `1` → merge in user's custom_foods before pagination
 *
 * Response shape:
 *   { foods: (Food | CustomFood & { _source: 'public' | 'custom' })[], total: number }
 *
 * Auth-gated (401) + entitlement-gated (402), mirroring `entries/route.ts`.
 * RLS on `foods` requires `authenticated` role; RLS on `custom_foods` is
 * owner-only. The user's session Supabase client enforces both — the
 * explicit `.eq('user_id', user.id)` on custom_foods is belt-and-suspenders.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { rankFoodRows } from '@/lib/foods/score-row';
import { foodCategoryEnum } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// v0.5.3 (#97): select rank_penalty + is_canonical so the JS-side sort has
// the columns it needs. Not surfaced in the response — the client only cares
// about display fields.
const FOOD_COLUMNS =
  'id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, category, rank_penalty, is_canonical';

const CUSTOM_FOOD_COLUMNS =
  'id, user_id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, created_at';

// Ranking helpers (`scoreRow`, `similarity`, `trigrams`, `rankFoodRows`) live
// in `@/lib/foods/score-row` so they're unit-testable without pulling in this
// whole Next.js route module.

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: foodCategoryEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  include_custom: z.enum(['0', '1']).default('0'),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { entitlement } = await getEntitlement(user.id, supabase);
  if (!isEntitled(entitlement)) {
    return NextResponse.json(
      { error: 'payment_required', entitlement },
      { status: 402 },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
    include_custom: url.searchParams.get('include_custom') ?? '0',
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_query', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { q, category, limit, offset, include_custom } = parsed.data;
  const includeCustom = include_custom === '1';

  // ── Public foods ─────────────────────────────────────────────────────────
  // We `select('...', { count: 'exact' })` so pagination controls know the
  // total. `ilike` uses the `foods_name_lower_idx` index for case-insensitive
  // prefix/substring lookups.
  //
  // v0.5.3 (#97): when the caller passes `q`, we can no longer sort by
  // `name asc` at the DB — that ignores rank_penalty + the query-relative
  // similarity/prefix boost. Fetch a WIDE window (up to 200 rows) ordered
  // by (rank_penalty asc, name asc) so canonical-ish rows arrive first,
  // then re-sort in JS by (similarity * boost) DESC before paginating.
  //
  // Without `q` the old `name asc` path still applies — no meaningful
  // ranking to do, and the DB index covers it cheaply.
  let publicQuery = supabase
    .from('foods')
    .select(FOOD_COLUMNS, { count: 'exact' });

  if (q && q.length > 0) {
    // Escape %/_ so a user typing them doesn't get wildcard results.
    const safe = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    publicQuery = publicQuery.ilike('name', `%${safe}%`);
  }
  if (category) {
    publicQuery = publicQuery.eq('category', category);
  }

  const hasQuery = !!(q && q.length > 0);
  // Wide fetch when we need to re-rank; otherwise page directly.
  const publicFetch = hasQuery
    ? publicQuery
        .order('rank_penalty', { ascending: true })
        .order('name', { ascending: true })
        .limit(200)
    : includeCustom
      ? publicQuery.order('name', { ascending: true }).limit(limit + offset + 50)
      : publicQuery
          .order('name', { ascending: true })
          .range(offset, offset + limit - 1);

  const { data: publicFoods, error: publicError, count: publicCount } =
    await publicFetch;
  if (publicError) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  type PublicRow = NonNullable<typeof publicFoods>[number] & {
    _source?: 'public';
    rank_penalty?: number | null;
    is_canonical?: boolean | null;
  };
  let publicRows: PublicRow[] = (publicFoods ?? []).map((row) => ({
    ...row,
    _source: 'public' as const,
  }));

  // JS-side re-ranking. Mirrors the ORDER BY described in migration 023:
  //   (similarity * boost) DESC, rank_penalty ASC, name ASC
  // where `boost` is 3× if the query is a prefix of the name, 2× if any
  // word starts with the query, 1× otherwise. Similarity is a cheap Jaccard
  // trigram approximation — good enough to sort within a ranked bucket
  // without pulling in a full pg_trgm client.
  if (hasQuery) {
    const qLower = q!.toLowerCase();
    publicRows = rankFoodRows(publicRows, qLower);
  }

  if (!includeCustom) {
    // With a query we fetched a wide window + re-ranked; paginate now that
    // the ordering is stable. Without a query, the DB already returned the
    // right page via .range().
    const page = hasQuery
      ? publicRows.slice(offset, offset + limit)
      : publicRows;
    return NextResponse.json({
      foods: page,
      total: publicCount ?? publicRows.length,
    });
  }

  // ── Custom foods (owner-only via RLS) ────────────────────────────────────
  let customQuery = supabase
    .from('custom_foods')
    .select(CUSTOM_FOOD_COLUMNS, { count: 'exact' })
    .eq('user_id', user.id);

  if (q && q.length > 0) {
    const safe = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    customQuery = customQuery.ilike('name', `%${safe}%`);
  }
  // Note: `custom_foods` has no `category` column; category filter only
  // applies to the public catalog. This matches how MFP behaves — user
  // customs live in their own bucket.

  const { data: customFoods, error: customError } = await customQuery
    .order('name', { ascending: true })
    .limit(limit + offset + 50);
  if (customError) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  type CustomRow = NonNullable<typeof customFoods>[number] & {
    _source?: 'custom';
  };
  const customRows: CustomRow[] = (customFoods ?? []).map((row) => ({
    ...row,
    _source: 'custom' as const,
  }));

  // Customs first — MFP shows "my foods" above the shared catalog when a
  // search matches both. Then paginate the merged list.
  const merged: Array<PublicRow | CustomRow> = [...customRows, ...publicRows];
  const total = (publicCount ?? publicRows.length) + customRows.length;
  const page = merged.slice(offset, offset + limit);

  return NextResponse.json({ foods: page, total });
}
