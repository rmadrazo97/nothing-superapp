/**
 * PATCH  /api/mini-apps/calorie-lite/custom-foods/[id]
 * DELETE /api/mini-apps/calorie-lite/custom-foods/[id]
 *
 * Update or remove a caller's custom food. Ownership is enforced by RLS
 * (`custom_foods_owner_all`); the explicit `.eq('user_id', user.id)` is
 * belt-and-suspenders in case RLS is ever misconfigured.
 *
 * A successful DELETE cascades in the DB — `app_calorie_entries.custom_food_id`
 * is `on delete set null`, so historical log rows keep their snapshotted
 * kcal/macros but lose the pointer. That is intentional: we never rewrite
 * past nutrition when a template is removed.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { customFoodInsertSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CUSTOM_FOOD_COLUMNS =
  'id, user_id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, created_at';

const idSchema = z.string().uuid();

// PATCH accepts any subset of the insert schema — everything is optional.
const patchSchema = customFoodInsertSchema.partial();

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await ctx.params;
  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

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

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Whitelist patch keys — never let the client set `user_id`, `id`, or
  // `created_at`.
  const patch: Record<string, unknown> = {};
  for (const key of [
    'name',
    'brand',
    'serving_g',
    'serving_label',
    'kcal',
    'protein_g',
    'carbs_g',
    'fat_g',
    'fiber_g',
    'sugar_g',
    'sodium_mg',
    'cholesterol_mg',
  ] as const) {
    const v = (parsed.data as Record<string, unknown>)[key];
    if (v !== undefined) patch[key] = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('custom_foods')
    .update(patch)
    .eq('id', idParsed.data)
    .eq('user_id', user.id)
    .select(CUSTOM_FOOD_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not_found_or_db_error' }, { status: 404 });
  }

  return NextResponse.json({ custom_food: data });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await ctx.params;
  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

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

  const { error } = await supabase
    .from('custom_foods')
    .delete()
    .eq('id', idParsed.data)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
