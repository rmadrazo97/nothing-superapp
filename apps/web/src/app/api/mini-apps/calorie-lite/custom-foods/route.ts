/**
 * GET  /api/mini-apps/calorie-lite/custom-foods
 * POST /api/mini-apps/calorie-lite/custom-foods
 *
 *   GET  — list caller's custom foods, newest first.
 *   POST — create a custom food. `user_id` is server-set from the session
 *          cookie and NEVER trusted from the client.
 *
 * Auth-gated (401) + entitlement-gated (402), mirroring `entries/route.ts`.
 * RLS on `custom_foods` is owner-only; explicit `.eq('user_id', user.id)` is
 * belt-and-suspenders.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { customFoodInsertSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CUSTOM_FOOD_COLUMNS =
  'id, user_id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, created_at';

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
    .from('custom_foods')
    .select(CUSTOM_FOOD_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ custom_foods: data ?? [] });
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

  const parsed = customFoodInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const insert = {
    user_id: user.id,
    name: parsed.data.name,
    brand: parsed.data.brand ?? null,
    serving_g: parsed.data.serving_g,
    serving_label: parsed.data.serving_label ?? '100 g',
    kcal: parsed.data.kcal,
    protein_g: parsed.data.protein_g,
    carbs_g: parsed.data.carbs_g,
    fat_g: parsed.data.fat_g,
    fiber_g: parsed.data.fiber_g ?? 0,
    sugar_g: parsed.data.sugar_g ?? 0,
    sodium_mg: parsed.data.sodium_mg ?? 0,
    cholesterol_mg: parsed.data.cholesterol_mg ?? 0,
  };

  const { data, error } = await supabase
    .from('custom_foods')
    .insert(insert)
    .select(CUSTOM_FOOD_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ custom_food: data }, { status: 201 });
}
