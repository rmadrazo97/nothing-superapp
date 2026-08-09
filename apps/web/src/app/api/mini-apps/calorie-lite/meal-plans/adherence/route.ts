/**
 * GET  /api/mini-apps/calorie-lite/meal-plans/adherence — list adherence rows
 * POST /api/mini-apps/calorie-lite/meal-plans/adherence — upsert one row
 *
 * Adherence rows are the tracking log: "I ate meal X, option N, on date D".
 * Kept as a separate table (not merged into app_calorie_entries) so the plan
 * view can render "which option did I pick today?" without scanning entries.
 *
 * Query params on GET:
 *   ?date=YYYY-MM-DD          — single day
 *   ?from=YYYY-MM-DD&to=..    — inclusive range
 *   (default: last 30 days)
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { mealPlanAdherenceInsertSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT_COLUMNS =
  'id, user_id, meal_plan_id, date, meal_id, option_selected, substitutions, notes, free_meal_used, water_litres, bodyweight_kg, created_at, updated_at';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
    return NextResponse.json({ error: 'payment_required', entitlement }, { status: 402 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  let query = supabase
    .from('meal_plan_adherence')
    .select(SELECT_COLUMNS)
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('meal_id', { ascending: true })
    .limit(500);

  if (dateParam) {
    const parsed = dateSchema.safeParse(dateParam);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
    }
    query = query.eq('date', parsed.data);
  } else if (fromParam || toParam) {
    if (fromParam) {
      const parsed = dateSchema.safeParse(fromParam);
      if (!parsed.success) {
        return NextResponse.json({ error: 'invalid_from' }, { status: 400 });
      }
      query = query.gte('date', parsed.data);
    }
    if (toParam) {
      const parsed = dateSchema.safeParse(toParam);
      if (!parsed.success) {
        return NextResponse.json({ error: 'invalid_to' }, { status: 400 });
      }
      query = query.lte('date', parsed.data);
    }
  } else {
    // Default window — 30 days back.
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    query = query.gte('date', from);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ adherence: data ?? [] });
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

  const parsed = mealPlanAdherenceInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Verify the plan belongs to the caller before letting the row point at it.
  const { data: plan, error: planErr } = await supabase
    .from('meal_plans')
    .select('id')
    .eq('id', body.meal_plan_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (planErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!plan) {
    return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('meal_plan_adherence')
    .upsert(
      {
        user_id: user.id,
        meal_plan_id: body.meal_plan_id,
        date: body.date,
        meal_id: body.meal_id,
        option_selected: body.option_selected ?? null,
        substitutions: body.substitutions ?? null,
        notes: body.notes ?? null,
        free_meal_used: body.free_meal_used ?? false,
        water_litres: body.water_litres ?? null,
        bodyweight_kg: body.bodyweight_kg ?? null,
      },
      { onConflict: 'user_id,date,meal_id' },
    )
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error', message: error?.message }, { status: 500 });
  }

  return NextResponse.json({ adherence: data }, { status: 201 });
}
