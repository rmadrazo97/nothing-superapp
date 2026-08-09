/**
 * GET /api/mini-apps/calorie-lite/reports
 *
 * Aggregates the caller's calorie entries over the last 14 days into a shape
 * the Reports view can render directly — no client-side re-aggregation needed
 * beyond simple comparisons. Server bucketing uses the caller's UTC day for
 * simplicity; the client can re-key by local day if it needs to.
 *
 * Response shape:
 *   {
 *     this_week: { total_kcal, avg_kcal, days_with_data,
 *                  avg_protein_g, avg_carbs_g, avg_fat_g,
 *                  avg_fiber_g, avg_sugar_g, avg_sodium_mg, avg_cholesterol_mg },
 *     last_week: { …same shape… },
 *     daily:     [{ date, kcal, protein_g, carbs_g, fat_g,
 *                   fiber_g, sugar_g, sodium_mg, cholesterol_mg }]
 *   }
 *
 * Auth-gated (401) AND entitlement-gated (402), matching the entries route.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface DailyBucket {
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  cholesterol_mg: number;
}

interface WeekSummary {
  total_kcal: number;
  avg_kcal: number;
  days_with_data: number;
  avg_protein_g: number;
  avg_carbs_g: number;
  avg_fat_g: number;
  avg_fiber_g: number;
  avg_sugar_g: number;
  avg_sodium_mg: number;
  avg_cholesterol_mg: number;
}

/** UTC YYYY-MM-DD key from an ISO timestamp. */
function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Empty daily bucket for a specific date. */
function emptyDaily(date: string): DailyBucket {
  return {
    date,
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
    cholesterol_mg: 0,
  };
}

/** Compute per-day averages across the 7 calendar days in the window. */
function summarize(days: DailyBucket[]): WeekSummary {
  const daysWith = days.filter((d) => d.kcal > 0).length;
  const totalKcal = days.reduce((a, d) => a + d.kcal, 0);
  // Average across 7 calendar days (not just days-with-data) so "avg/day"
  // matches how MFP-tier apps show it — a zero day still counts as a zero.
  const denom = days.length || 1;
  return {
    total_kcal: Math.round(totalKcal),
    avg_kcal: Math.round(totalKcal / denom),
    days_with_data: daysWith,
    avg_protein_g: Math.round(days.reduce((a, d) => a + d.protein_g, 0) / denom),
    avg_carbs_g: Math.round(days.reduce((a, d) => a + d.carbs_g, 0) / denom),
    avg_fat_g: Math.round(days.reduce((a, d) => a + d.fat_g, 0) / denom),
    avg_fiber_g: Math.round(days.reduce((a, d) => a + d.fiber_g, 0) / denom),
    avg_sugar_g: Math.round(days.reduce((a, d) => a + d.sugar_g, 0) / denom),
    avg_sodium_mg: Math.round(days.reduce((a, d) => a + d.sodium_mg, 0) / denom),
    avg_cholesterol_mg: Math.round(days.reduce((a, d) => a + d.cholesterol_mg, 0) / denom),
  };
}

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

  // 14-day window. `>= start` because we want inclusive-of-today.
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startMs = now - 14 * dayMs;
  const startIso = new Date(startMs).toISOString();

  const { data, error } = await supabase
    .from('app_calorie_entries')
    .select(
      'entered_at, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg',
    )
    .eq('user_id', user.id)
    .gte('entered_at', startIso)
    .order('entered_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Seed 14 empty days keyed by UTC date so a day with no entries still shows
  // up as a zero bar in the chart.
  const daily: DailyBucket[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(now - i * dayMs);
    daily.push(emptyDaily(d.toISOString().slice(0, 10)));
  }
  const byDate = new Map(daily.map((d) => [d.date, d]));

  for (const row of data ?? []) {
    const key = utcDateKey(row.entered_at as string);
    const bucket = byDate.get(key);
    if (!bucket) continue; // outside window (shouldn't happen given filter)
    bucket.kcal += Number(row.kcal ?? 0);
    bucket.protein_g += Number(row.protein_g ?? 0);
    bucket.carbs_g += Number(row.carbs_g ?? 0);
    bucket.fat_g += Number(row.fat_g ?? 0);
    bucket.fiber_g += Number(row.fiber_g ?? 0);
    bucket.sugar_g += Number(row.sugar_g ?? 0);
    bucket.sodium_mg += Number(row.sodium_mg ?? 0);
    bucket.cholesterol_mg += Number(row.cholesterol_mg ?? 0);
  }

  // Last 7 days (index 7-13) = this week, first 7 (index 0-6) = last week.
  const lastWeekDays = daily.slice(0, 7);
  const thisWeekDays = daily.slice(7, 14);

  return NextResponse.json({
    this_week: summarize(thisWeekDays),
    last_week: summarize(lastWeekDays),
    daily,
  });
}
