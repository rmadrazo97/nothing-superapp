/**
 * POST /api/mini-apps/calorie-lite/meal-plans/[id]/activate — set the caller's
 * preferences.active_meal_plan_id to this plan (or DELETE to clear).
 *
 * Owner-only: the plan must belong to the caller (verified by RLS on the
 * initial select). Fails with 404 if not.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const idSchema = z.string().uuid();

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
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

  // Verify ownership BEFORE the upsert — otherwise we'd happily point the
  // preferences row at somebody else's plan (RLS on preferences allows the
  // write; RLS on meal_plans would just refuse the eventual join).
  const { data: plan, error: planErr } = await supabase
    .from('meal_plans')
    .select('id')
    .eq('id', idParsed.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (planErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!plan) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('preferences')
    .upsert(
      { user_id: user.id, active_meal_plan_id: idParsed.data },
      { onConflict: 'user_id' },
    )
    .select('active_meal_plan_id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ active_meal_plan_id: data.active_meal_plan_id });
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

  // ctx.params isn't used for clear — the caller's active pointer is unset
  // regardless of which plan id they hit. We still await it so the harness
  // doesn't warn about an unused Promise.
  await ctx.params;

  const { data, error } = await supabase
    .from('preferences')
    .upsert(
      { user_id: user.id, active_meal_plan_id: null },
      { onConflict: 'user_id' },
    )
    .select('active_meal_plan_id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ active_meal_plan_id: null });
}
