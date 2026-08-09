/**
 * GET  /api/mini-apps/calorie-lite/custom-meals
 * POST /api/mini-apps/calorie-lite/custom-meals
 *
 * User-owned reusable meal templates ("MY MEALS" panel in calorie-lite TODAY).
 *
 *   GET  — returns the caller's meals, newest-first (updated_at DESC).
 *   POST — creates a new meal. Nutrition totals are trusted from the client
 *          because the client already computed them from selected foods with
 *          snapshotted grams; the DB is the store of record, not the calculator.
 *
 * Auth-gated (401) + entitlement-gated (402). RLS on `custom_meals` enforces
 * owner-only access; the explicit `.eq('user_id', user.id)` filter is a belt-
 * and-suspenders guard.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { customMealInsertSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, name, meal_slot, components, kcal, protein_g, carbs_g, fat_g, created_at, updated_at';

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

  const { data, error } = await supabase
    .from('custom_meals')
    .select(SELECT_COLUMNS)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ meals: data ?? [] });
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

  const parsed = customMealInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const insert = {
    user_id: user.id,
    name: parsed.data.name,
    meal_slot: parsed.data.meal_slot ?? null,
    components: parsed.data.components,
    kcal: parsed.data.kcal,
    protein_g: parsed.data.protein_g,
    carbs_g: parsed.data.carbs_g,
    fat_g: parsed.data.fat_g,
  };

  const { data, error } = await supabase
    .from('custom_meals')
    .insert(insert)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ meal: data }, { status: 201 });
}
