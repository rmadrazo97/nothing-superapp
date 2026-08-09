/**
 * GET /api/mini-apps/calorie-lite/streak
 *
 * Server-computed streak + habit metrics for the caller. Runs against the
 * `calorie_daily_totals` VIEW (see migration 008) so we don't have to pull
 * every entry into Node just to count consecutive days.
 *
 * Response:
 *   {
 *     current_streak_days: number,   // consecutive days ending today OR
 *                                    // yesterday (morning-grace so a fresh
 *                                    // day before breakfast doesn't reset it)
 *     longest_streak_days: number,
 *     days_logged_this_month: number, // this calendar month, UTC-anchored
 *     total_days_logged: number
 *   }
 *
 * Auth-gated (401) + entitlement-gated (402). All days are UTC-anchored to
 * match the view's `day` column; per-user tz support is a future extension.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface StreakResponse {
  current_streak_days: number;
  longest_streak_days: number;
  days_logged_this_month: number;
  total_days_logged: number;
}

/** YYYY-MM-DD for a Date in UTC. */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add `deltaDays` to a YYYY-MM-DD key, returning another YYYY-MM-DD key. */
function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return utcDateKey(dt);
}

/**
 * Given a set of days-with-entries, walk backwards from `today` counting
 * consecutive days. If today has no entry we allow yesterday to seed the
 * streak — a user's streak shouldn't flicker to 0 every morning until they
 * log breakfast. Mirrors the client-side `computeStreak` semantics.
 */
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

/** Longest run of consecutive days across the full history. */
function computeLongestStreak(days: Set<string>): number {
  if (days.size === 0) return 0;
  const sorted = Array.from(days).sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (shiftDateKey(sorted[i - 1], 1) === sorted[i]) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
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

  const { data, error } = await supabase
    .from('calorie_daily_totals')
    .select('day')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const now = new Date();
  const today = utcDateKey(now);

  // Rows come back with `day` as either a Date-serialized string or a raw
  // ISO date depending on the client — normalise to YYYY-MM-DD.
  const days = new Set<string>();
  for (const row of data ?? []) {
    const raw = String((row as { day: string | Date }).day);
    days.add(raw.slice(0, 10));
  }

  // Days logged this calendar month (UTC). Cheap enough to compute in-Node
  // — never more than 31 entries in the set for the current month.
  const monthPrefix = today.slice(0, 7); // YYYY-MM
  let daysLoggedThisMonth = 0;
  for (const d of days) {
    if (d.startsWith(monthPrefix)) daysLoggedThisMonth += 1;
  }

  const body: StreakResponse = {
    current_streak_days: computeCurrentStreak(days, today),
    longest_streak_days: computeLongestStreak(days),
    days_logged_this_month: daysLoggedThisMonth,
    total_days_logged: days.size,
  };

  return NextResponse.json(body);
}
