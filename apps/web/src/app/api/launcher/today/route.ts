/**
 * GET /api/launcher/today
 *
 * Cross-mini-app TODAY aggregation for the launcher summary card. Reads the
 * caller's current-day state from every relevant mini-app table in ONE
 * parallel batch and returns a compact snapshot the launcher can render at
 * a glance. This is the first surface that reaches into multiple mini-apps'
 * data at once — think of it as the "home screen today widget" for the
 * whole superapp.
 *
 * Response shape:
 *   {
 *     date: "YYYY-MM-DD" (local),
 *     kcal:    { current: number, target: number },
 *     workout: { logged_today: boolean, session_id: string | null },
 *     habits:  { done_today: number, active_total: number },
 *     journal: { has_entry: boolean, mood: string | null }
 *   }
 *
 * Gates:
 *   401 — no session
 *   402 — session exists but not entitled (client hides the card)
 *
 * The endpoint is DB-only and cheap; no third-party calls, no LLM. Safe to
 * fetch client-side on every launcher mount.
 *
 * Timezone notes:
 *   - `habit_completions.completed_on` and `journal_entries.entered_on` are
 *     stored as `date` (already-normalized local day) — we compare against
 *     the server's local YYYY-MM-DD.
 *   - `app_calorie_entries.entered_at` and `workout_sessions.started_at`
 *     are `timestamptz` — we build a [dayStart, dayEnd) window in the same
 *     local timezone and range-filter to avoid off-by-one issues.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** YYYY-MM-DD for `now` in the server's local timezone. */
function todayLocalISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Local midnight → next-local-midnight as ISO strings. Used to range-filter
 * timestamptz columns without relying on Postgres `at time zone` incantations
 * (which would tie the query to the server's TZ config anyway).
 */
function localDayWindow(): { startIso: string; endIso: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export interface LauncherTodaySummary {
  date: string;
  kcal: { current: number; target: number };
  workout: { logged_today: boolean; session_id: string | null };
  habits: { done_today: number; active_total: number };
  journal: { has_entry: boolean; mood: string | null };
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

  const today = todayLocalISODate();
  const { startIso, endIso } = localDayWindow();

  // Fire every mini-app query in parallel — this is the whole point of the
  // aggregate endpoint. Any single-table failure degrades to zeros for that
  // slice rather than 500ing the whole card (the launcher stays useful).
  const [
    kcalRes,
    prefRes,
    workoutRes,
    habitsActiveRes,
    habitsDoneRes,
    journalRes,
  ] = await Promise.all([
    supabase
      .from('app_calorie_entries')
      .select('kcal')
      .eq('user_id', user.id)
      .gte('entered_at', startIso)
      .lt('entered_at', endIso),
    supabase
      .from('preferences')
      .select('daily_calorie_goal')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('workout_sessions')
      .select('id')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .gte('started_at', startIso)
      .lt('started_at', endIso)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('habits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('active', true),
    supabase
      .from('habit_completions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('completed_on', today),
    supabase
      .from('journal_entries')
      .select('id, mood')
      .eq('user_id', user.id)
      .eq('entered_on', today)
      .limit(1)
      .maybeSingle(),
  ]);

  const kcalCurrent = (kcalRes.data ?? []).reduce(
    (sum, row) => sum + Number((row as { kcal: number | null }).kcal ?? 0),
    0,
  );
  const kcalTarget = Number(prefRes.data?.daily_calorie_goal ?? 0);

  const workoutRow = workoutRes.data as { id: string } | null;

  const journalRow = journalRes.data as { id: string; mood: string | null } | null;

  const summary: LauncherTodaySummary = {
    date: today,
    kcal: { current: kcalCurrent, target: kcalTarget },
    workout: {
      logged_today: !!workoutRow,
      session_id: workoutRow?.id ?? null,
    },
    habits: {
      done_today: habitsDoneRes.count ?? 0,
      active_total: habitsActiveRes.count ?? 0,
    },
    journal: {
      has_entry: !!journalRow,
      mood: journalRow?.mood ?? null,
    },
  };

  return NextResponse.json(summary);
}
