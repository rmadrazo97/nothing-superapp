/**
 * PATCH  /api/mini-apps/calorie-lite/custom-meals/[id]
 * DELETE /api/mini-apps/calorie-lite/custom-meals/[id]
 *
 * Owner-only edits and deletes for a saved meal template. RLS on `custom_meals`
 * enforces owner-only writes at the DB layer; the explicit `.eq('user_id',
 * user.id)` filter is defence-in-depth so a leaking ID + broken policy still
 * fails closed.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { mealComponentSchema, mealEnum } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, name, meal_slot, components, kcal, protein_g, carbs_g, fat_g, created_at, updated_at';

// PATCH accepts a partial — all fields optional, but at least one required.
// We build our own schema (rather than `.partial()` the insert one) so the
// meal_slot `null` semantics stay explicit and every field validates.
const customMealPatchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    meal_slot: mealEnum.nullable().optional(),
    components: z.array(mealComponentSchema).optional(),
    kcal: z.number().nonnegative().optional(),
    protein_g: z.number().nonnegative().optional(),
    carbs_g: z.number().nonnegative().optional(),
    fat_g: z.number().nonnegative().optional(),
  })
  .strict();

const idSchema = z.string().uuid();

/** Next 15 handler signature — the second arg carries the async params. */
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
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

  const { id } = await ctx.params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = customMealPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('custom_meals')
    .update(parsed.data)
    .eq('id', idParsed.data)
    .eq('user_id', user.id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!data) {
    // Row missing OR RLS blocked the update — either way, not found from the
    // caller's perspective (never leak whether the ID exists for another user).
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ meal: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
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

  const { id } = await ctx.params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const { error, count } = await supabase
    .from('custom_meals')
    .delete({ count: 'exact' })
    .eq('id', idParsed.data)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (count === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
