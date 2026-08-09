/**
 * GET  /api/mini-apps/calorie-lite/meal-plans — list the caller's meal plans
 * POST /api/mini-apps/calorie-lite/meal-plans — create a new plan
 *
 * Both handlers are auth-gated (401) + entitlement-gated (402). RLS on
 * `meal_plans` enforces owner-only access; the explicit `.eq('user_id', ...)`
 * is defence-in-depth.
 *
 * POST body: mealPlanInsertSchema (the full nutritionist plan). The DB row's
 * `name` column is derived from body.name → source.title → plan.id → "Plan".
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { mealPlanInsertSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, name, schema_version, plan, source, athlete, is_template, parsing_notes, created_at, updated_at';

const LIST_SELECT_COLUMNS =
  'id, user_id, name, schema_version, source, athlete, is_template, parsing_notes, plan, created_at, updated_at';

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
    return NextResponse.json({ error: 'payment_required', entitlement }, { status: 402 });
  }

  const { data, error } = await supabase
    .from('meal_plans')
    .select(LIST_SELECT_COLUMNS)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ meal_plans: data ?? [] });
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
    return NextResponse.json({ error: 'payment_required', entitlement }, { status: 402 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = mealPlanInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rowName =
    parsed.data.name?.trim() ||
    parsed.data.source?.title?.trim() ||
    parsed.data.plan.id?.trim() ||
    'Meal plan';

  const { data, error } = await supabase
    .from('meal_plans')
    .insert({
      user_id: user.id,
      name: rowName,
      schema_version: parsed.data.schema_version,
      plan: parsed.data.plan,
      source: parsed.data.source ?? null,
      athlete: parsed.data.athlete ?? null,
      is_template: parsed.data.is_template ?? false,
      parsing_notes: parsed.data.parsing_notes ?? [],
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error', message: error?.message }, { status: 500 });
  }

  return NextResponse.json({ meal_plan: data }, { status: 201 });
}
