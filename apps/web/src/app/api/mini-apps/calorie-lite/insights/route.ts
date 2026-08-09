/**
 * GET /api/mini-apps/calorie-lite/insights
 *
 * Server-computed "insight cards" — small observations about the caller's
 * last 7 days derived from `calorie_daily_totals` + preferences. Each
 * insight is one row the TODAY view renders as a stacked card.
 *
 * Rules currently implemented (skip if the rule doesn't apply — no noise):
 *   1. PROTEIN SHORT   — avg protein last 7 days < 80% of goal grams (warn)
 *   2. STAY UNDER TARGET — avg kcal within +/-10% of goal (good)
 *   3. SUGAR SPIKE     — avg sugar > 50g/day (warn)
 *   4. STREAK MILESTONE — current streak is a positive multiple of 7 (good)
 *
 * Response:
 *   { insights: Insight[] }
 *   Insight = { id, tone: 'good' | 'warn' | 'info', title, body, metric? }
 *
 * Auth-gated (401) + entitlement-gated (402).
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type InsightTone = 'good' | 'warn' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  metric?: string;
}

interface DailyRow {
  day: string;
  total_kcal: number;
  total_protein_g: number;
  total_sugar_g: number;
}

const DEFAULT_KCAL_GOAL = 2000;
const DEFAULT_PROTEIN_PCT = 30; // % of calories from protein — matches
                                // preferences default macro_goal_pct.

/** YYYY-MM-DD for a Date in UTC. */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD key by `deltaDays` (UTC). */
function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return utcDateKey(dt);
}

/** Same current-streak semantics as the /streak endpoint. */
function computeCurrentStreak(days: Set<string>, today: string): number {
  if (days.size === 0) return 0;
  let cursor = today;
  if (!days.has(cursor)) {
    const yesterday = shiftDateKey(today, -1);
    if (!days.has(yesterday)) return 0;
    cursor = yesterday;
  }
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return count;
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

  // Pull the last 14 days of daily rollups (only need 7 for insights, but
  // the extra week gives us headroom for "trend vs. prior week" rules
  // without another round-trip).
  const now = new Date();
  const today = utcDateKey(now);
  const windowStart = shiftDateKey(today, -13);

  const [dailyRes, prefRes, allDaysRes] = await Promise.all([
    supabase
      .from('calorie_daily_totals')
      .select('day, total_kcal, total_protein_g, total_sugar_g')
      .eq('user_id', user.id)
      .gte('day', windowStart)
      .order('day', { ascending: true }),
    supabase
      .from('preferences')
      .select('daily_calorie_goal, macro_goal_pct')
      .eq('user_id', user.id)
      .maybeSingle(),
    // Full history for the streak-milestone rule. Just the `day` column so
    // the payload stays small even for power users.
    supabase
      .from('calorie_daily_totals')
      .select('day')
      .eq('user_id', user.id),
  ]);

  if (dailyRes.error || allDaysRes.error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // Normalise the last-7-days window into a per-day array. Days without
  // entries contribute zero — averaging across 7 calendar days (not just
  // days-with-data) so "avg/day" matches how the Reports view shows it.
  const dailyByKey = new Map<string, DailyRow>();
  for (const row of dailyRes.data ?? []) {
    const key = String((row as { day: string | Date }).day).slice(0, 10);
    dailyByKey.set(key, {
      day: key,
      total_kcal: Number(row.total_kcal ?? 0),
      total_protein_g: Number(row.total_protein_g ?? 0),
      total_sugar_g: Number(row.total_sugar_g ?? 0),
    });
  }
  const last7: DailyRow[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const key = shiftDateKey(today, -i);
    last7.push(
      dailyByKey.get(key) ?? {
        day: key,
        total_kcal: 0,
        total_protein_g: 0,
        total_sugar_g: 0,
      },
    );
  }

  const daysWithData = last7.filter((d) => d.total_kcal > 0).length;
  const avgKcal = last7.reduce((a, d) => a + d.total_kcal, 0) / 7;
  const avgProtein = last7.reduce((a, d) => a + d.total_protein_g, 0) / 7;
  const avgSugar = last7.reduce((a, d) => a + d.total_sugar_g, 0) / 7;

  const goalKcal = prefRes.data?.daily_calorie_goal ?? DEFAULT_KCAL_GOAL;
  const macroPct = (prefRes.data?.macro_goal_pct ?? { protein: DEFAULT_PROTEIN_PCT }) as {
    protein?: number;
  };
  const proteinPct = typeof macroPct.protein === 'number' ? macroPct.protein : DEFAULT_PROTEIN_PCT;
  // Grams of protein implied by the calorie goal × macro %, at 4 kcal/g.
  const proteinGoalG = (goalKcal * (proteinPct / 100)) / 4;

  // Full-history days set for the streak-milestone rule.
  const allDays = new Set<string>();
  for (const row of allDaysRes.data ?? []) {
    allDays.add(String((row as { day: string | Date }).day).slice(0, 10));
  }
  const currentStreak = computeCurrentStreak(allDays, today);

  const insights: Insight[] = [];

  // ── Rule 1 — PROTEIN SHORT ──────────────────────────────────────────────
  // Only trigger if there's enough data to be meaningful (≥3 days logged)
  // AND a non-trivial goal to be short of.
  if (daysWithData >= 3 && proteinGoalG > 20 && avgProtein < proteinGoalG * 0.8) {
    const shortPct = Math.round((1 - avgProtein / proteinGoalG) * 100);
    insights.push({
      id: 'protein-short',
      tone: 'warn',
      title: 'PROTEIN SHORT',
      body: `Protein ${shortPct}% below target — try Greek yogurt or a scoop of whey.`,
      metric: `${Math.round(avgProtein)}G AVG`,
    });
  }

  // ── Rule 2 — STAY UNDER TARGET ─────────────────────────────────────────
  // Within ±10% of goal, averaged across the week. Days-with-data check
  // filters out the "5 days of zeros pulls avg down" false positive.
  if (daysWithData >= 4 && goalKcal > 0) {
    const ratio = avgKcal / goalKcal;
    if (ratio >= 0.9 && ratio <= 1.1) {
      const daysOnTarget = last7.filter(
        (d) => d.total_kcal > 0 && Math.abs(d.total_kcal - goalKcal) / goalKcal <= 0.15,
      ).length;
      insights.push({
        id: 'on-target',
        tone: 'good',
        title: 'STAY UNDER TARGET',
        body: `You're on-target — ${daysOnTarget} of last 7 days within your calorie window.`,
        metric: `${Math.round(avgKcal)} AVG`,
      });
    }
  }

  // ── Rule 3 — SUGAR SPIKE ───────────────────────────────────────────────
  if (daysWithData >= 3 && avgSugar > 50) {
    insights.push({
      id: 'sugar-spike',
      tone: 'warn',
      title: 'SUGAR SPIKE',
      body: `Avg ${Math.round(avgSugar)}g sugar/day — consider swapping one sweet snack for fruit.`,
      metric: `${Math.round(avgSugar)}G AVG`,
    });
  }

  // ── Rule 4 — STREAK MILESTONE ──────────────────────────────────────────
  if (currentStreak > 0 && currentStreak % 7 === 0) {
    insights.push({
      id: 'streak-milestone',
      tone: 'good',
      title: 'STREAK MILESTONE',
      body: `${currentStreak}-day streak — you're building the habit.`,
      metric: `${currentStreak}D`,
    });
  }

  return NextResponse.json({ insights });
}
