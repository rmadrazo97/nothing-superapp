/**
 * GET    /api/mini-apps/calorie-lite/meal-plans/[id] — fetch one plan
 * PATCH  /api/mini-apps/calorie-lite/meal-plans/[id] — rename or replace plan
 * DELETE /api/mini-apps/calorie-lite/meal-plans/[id] — delete a plan
 *
 * Owner-only via RLS + explicit user_id filter (defence-in-depth). If the
 * deleted plan was the user's active_meal_plan_id, the FK's ON DELETE SET
 * NULL clears the pointer automatically.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { mealPlanPlanSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, name, schema_version, plan, source, athlete, is_template, parsing_notes, created_at, updated_at';

const idSchema = z.string().uuid();

type Ctx = { params: Promise<{ id: string }> };

// PATCH is intentionally narrow: rename + replace-plan + toggle-template.
// Full plan overwrites go through this same field so the copilot can edit a
// plan without deleting + recreating.
const mealPlanPatchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    plan: mealPlanPlanSchema.optional(),
    is_template: z.boolean().optional(),
  })
  .strict();

export async function GET(_request: Request, ctx: Ctx) {
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
    return NextResponse.json({ error: 'payment_required', entitlement }, { status: 402 });
  }

  const { id } = await ctx.params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('meal_plans')
    .select(SELECT_COLUMNS)
    .eq('id', idParsed.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ meal_plan: data });
}

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
    return NextResponse.json({ error: 'payment_required', entitlement }, { status: 402 });
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

  const parsed = mealPlanPatchSchema.safeParse(raw);
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
    .from('meal_plans')
    .update(parsed.data)
    .eq('id', idParsed.data)
    .eq('user_id', user.id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({ meal_plan: data });
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
    return NextResponse.json({ error: 'payment_required', entitlement }, { status: 402 });
  }

  const { id } = await ctx.params;
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const { error, count } = await supabase
    .from('meal_plans')
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
