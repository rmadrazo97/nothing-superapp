/**
 * GET  /api/mini-apps/calorie-lite/favorites
 * POST /api/mini-apps/calorie-lite/favorites
 *
 * v3 MFP-tier Wave 2-B: star-favorite foods.
 *
 *   GET  — return the caller's favorites, joined to the public `foods` row OR
 *          the user's `custom_foods` row so the client renders them exactly
 *          the same way as a search result (identical Food shape + `_source`).
 *          Newest first.
 *   POST — favorite a public food (body: `{ food_id }`) or a custom food
 *          (body: `{ custom_food_id }`). XOR enforced by Zod + DB CHECK.
 *          Idempotent: if the row already exists (unique index), we return
 *          200 with the existing row instead of 500ing on the constraint.
 *
 * Auth-gated (401) + entitlement-gated (402), mirroring `entries/route.ts`.
 * RLS on `food_favorites` is owner-only; explicit `.eq('user_id', user.id)`
 * on reads is belt-and-suspenders. Writes rely on RLS + server-set `user_id`
 * so a client can never favorite on behalf of another account.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { foodFavoriteInsertSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Columns we hydrate for each favorite. Match what FoodSearch renders so the
// client doesn't need a second lookup.
const FOOD_COLUMNS =
  'id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, category';
const CUSTOM_FOOD_COLUMNS =
  'id, user_id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, created_at';

const FAVORITE_COLUMNS = 'id, user_id, food_id, custom_food_id, created_at';

type FavoriteRow = {
  id: string;
  user_id: string;
  food_id: string | null;
  custom_food_id: string | null;
  created_at: string;
};

export async function GET() {
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

  const { data: favRows, error: favErr } = await supabase
    .from('food_favorites')
    .select(FAVORITE_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (favErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const favorites = (favRows ?? []) as FavoriteRow[];
  if (favorites.length === 0) {
    return NextResponse.json({ favorites: [] });
  }

  // Split into two id sets and hydrate in two round-trips (a Postgres RPC or
  // JSON-agg would be one trip, but with ~100-row cap the two `in()` selects
  // are simpler and still comfortably under one edge budget).
  const publicIds = favorites
    .filter((f) => f.food_id != null)
    .map((f) => f.food_id as string);
  const customIds = favorites
    .filter((f) => f.custom_food_id != null)
    .map((f) => f.custom_food_id as string);

  const publicMap = new Map<string, Record<string, unknown>>();
  if (publicIds.length > 0) {
    const { data: publicFoods, error: publicErr } = await supabase
      .from('foods')
      .select(FOOD_COLUMNS)
      .in('id', publicIds);
    if (publicErr) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    for (const row of publicFoods ?? []) {
      publicMap.set((row as { id: string }).id, row as Record<string, unknown>);
    }
  }

  const customMap = new Map<string, Record<string, unknown>>();
  if (customIds.length > 0) {
    const { data: customFoods, error: customErr } = await supabase
      .from('custom_foods')
      .select(CUSTOM_FOOD_COLUMNS)
      .eq('user_id', user.id)
      .in('id', customIds);
    if (customErr) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    for (const row of customFoods ?? []) {
      customMap.set((row as { id: string }).id, row as Record<string, unknown>);
    }
  }

  // Preserve created_at DESC order from the favorites query. Drop favorites
  // whose target row disappeared between the two queries (rare — the FK is
  // ON DELETE CASCADE, so the favorite should have gone with it — but a race
  // between two DELETEs could leave a stub here).
  type HydratedFavorite = {
    id: string;
    kind: 'public' | 'custom';
    food: Record<string, unknown> & { _source: 'public' | 'custom' };
    created_at: string;
  };
  const hydrated: HydratedFavorite[] = [];
  for (const fav of favorites) {
    if (fav.food_id) {
      const food = publicMap.get(fav.food_id);
      if (!food) continue;
      hydrated.push({
        id: fav.id,
        kind: 'public',
        food: { ...food, _source: 'public' },
        created_at: fav.created_at,
      });
    } else if (fav.custom_food_id) {
      const food = customMap.get(fav.custom_food_id);
      if (!food) continue;
      hydrated.push({
        id: fav.id,
        kind: 'custom',
        food: { ...food, _source: 'custom' },
        created_at: fav.created_at,
      });
    }
  }

  return NextResponse.json({ favorites: hydrated });
}


export async function POST(request: Request) {
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = foodFavoriteInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const foodId = parsed.data.food_id ?? null;
  const customFoodId = parsed.data.custom_food_id ?? null;

  // Idempotency: if a favorite for this target already exists for this user,
  // return it as a 200. The DB unique index is the ultimate guarantor — this
  // just spares us the round-trip on the constraint violation and lets the
  // client treat POST as safe-to-retry.
  let existingQ = supabase
    .from('food_favorites')
    .select(FAVORITE_COLUMNS)
    .eq('user_id', user.id)
    .limit(1);
  if (foodId) existingQ = existingQ.eq('food_id', foodId);
  else if (customFoodId) existingQ = existingQ.eq('custom_food_id', customFoodId);

  const { data: existing, error: existingErr } = await existingQ.maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ favorite: existing }, { status: 200 });
  }

  const insert = {
    user_id: user.id,
    food_id: foodId,
    custom_food_id: customFoodId,
  };

  const { data, error } = await supabase
    .from('food_favorites')
    .insert(insert)
    .select(FAVORITE_COLUMNS)
    .single();

  if (error || !data) {
    // Handle race: another request just inserted the same favorite. Fetch and
    // return it as if we won.
    let raceQ = supabase
      .from('food_favorites')
      .select(FAVORITE_COLUMNS)
      .eq('user_id', user.id)
      .limit(1);
    if (foodId) raceQ = raceQ.eq('food_id', foodId);
    else if (customFoodId) raceQ = raceQ.eq('custom_food_id', customFoodId);
    const { data: raceRow } = await raceQ.maybeSingle();
    if (raceRow) return NextResponse.json({ favorite: raceRow }, { status: 200 });
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ favorite: data }, { status: 201 });
}
