/**
 * week-summary.ts — home-page aggregation.
 *
 * Home shows a THIS WEEK data card: 7-day volume bar + 4 KPIs (volume, sets,
 * sessions, streak). This module is the pure aggregator; the page fetches
 * `listSessions(N)` and hands the rows to `weekSummary()`.
 *
 * Kept separate from `progression-query.ts` because home summarizes ONE week
 * daily, whereas the PROGRESSION tab summarizes 8 weeks by-week + 4-week vs
 * 4-week deltas. Sharing helpers would over-abstract for now.
 */

import type { SessionEntry, SessionSet, WorkoutSession } from '@nothing/shared';

export interface DayBucket {
  /** Short display label — "M" / "T" / etc. */
  label: string;
  /** Total kg lifted that day (rounded). */
  kg: number;
  /** True if this is today's bucket (client TZ). */
  isToday: boolean;
}

export interface WeekKpi {
  current: number;
  delta: number;
  period: string;
}

export interface WeekSummary {
  volume_by_day: DayBucket[]; // exactly 7, Monday → Sunday
  kpis: {
    volume_kg: WeekKpi;
    sets: WeekKpi;
    sessions: WeekKpi;
    streak: WeekKpi;
  };
  /** True if the caller has zero completed sessions ever — used to swap in the empty-state onboarding. */
  isEmpty: boolean;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function totalVolumeKgFromEntries(entries: SessionEntry[] | null | undefined): number {
  if (!entries) return 0;
  let sum = 0;
  for (const e of entries) {
    for (const s of e.sets ?? []) {
      const reps = Number(s.reps ?? 0);
      const kg = Number(s.weight_kg ?? 0);
      if (reps > 0 && kg > 0) sum += reps * kg;
    }
  }
  return Math.round(sum);
}

function totalSetsCompletedFromEntries(entries: SessionEntry[] | null | undefined): number {
  if (!entries) return 0;
  let n = 0;
  for (const e of entries) {
    for (const s of e.sets ?? []) {
      if ((s as SessionSet).completed_at) n += 1;
    }
  }
  return n;
}

/**
 * Monday of the ISO week containing `d`. Returns a fresh Date pinned to
 * 00:00:00 local time.
 */
function isoWeekStart(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // JS getDay() → 0 = Sunday. ISO week starts Monday. Days from Monday:
  const jsDay = out.getDay();
  const daysFromMonday = (jsDay + 6) % 7; // Mon → 0, Tue → 1, …, Sun → 6
  out.setDate(out.getDate() - daysFromMonday);
  return out;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── main ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function weekSummary(sessions: WorkoutSession[], now: Date = new Date()): WeekSummary {
  const finished = sessions.filter((s) => s.ended_at != null);
  const isEmpty = finished.length === 0;

  const thisWeekMonday = isoWeekStart(now);
  const lastWeekMonday = new Date(thisWeekMonday);
  lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);

  // Bucket by local day of the week for the CURRENT week only.
  const buckets: DayBucket[] = DAY_LABELS.map((label, i) => {
    const day = new Date(thisWeekMonday);
    day.setDate(day.getDate() + i);
    return { label, kg: 0, isToday: sameLocalDay(day, now) };
  });

  let thisWeekVolume = 0;
  let thisWeekSets = 0;
  const thisWeekSessionDates = new Set<string>();
  let lastWeekVolume = 0;
  let lastWeekSets = 0;
  const lastWeekSessionDates = new Set<string>();

  // For streak: collect the set of unique local dates that have any finished
  // session. Then count backwards from today (or yesterday if today has none)
  // until we hit a gap.
  const sessionDates = new Set<string>();

  for (const s of finished) {
    const startedAt = new Date(s.started_at);
    const vol = totalVolumeKgFromEntries(s.entries);
    const sets = totalSetsCompletedFromEntries(s.entries);
    const dateKey = startedAt.toISOString().slice(0, 10);
    sessionDates.add(dateKey);

    if (startedAt >= thisWeekMonday) {
      const dayIdx = Math.floor((startedAt.getTime() - thisWeekMonday.getTime()) / (24 * 60 * 60 * 1000));
      if (dayIdx >= 0 && dayIdx < 7) {
        buckets[dayIdx].kg += vol;
      }
      thisWeekVolume += vol;
      thisWeekSets += sets;
      thisWeekSessionDates.add(dateKey);
    } else if (startedAt >= lastWeekMonday && startedAt < thisWeekMonday) {
      lastWeekVolume += vol;
      lastWeekSets += sets;
      lastWeekSessionDates.add(dateKey);
    }
  }

  // Round bucket volumes so trigram noise doesn't produce fractional bars.
  for (const b of buckets) b.kg = Math.round(b.kg);

  // Streak calculation
  let streak = 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // Anchor: today if today has a session; else yesterday.
  const todayKey = today.toISOString().slice(0, 10);
  let anchor = new Date(today);
  if (!sessionDates.has(todayKey)) {
    anchor.setDate(anchor.getDate() - 1);
  }
  while (true) {
    const key = anchor.toISOString().slice(0, 10);
    if (sessionDates.has(key)) {
      streak += 1;
      anchor.setDate(anchor.getDate() - 1);
    } else {
      break;
    }
  }
  // Prior-week streak: recompute as if today were 7 days ago, purely for the
  // delta chip. Cheaper approximation: last-week session-day count.
  const lastWeekStreak = lastWeekSessionDates.size;

  return {
    volume_by_day: buckets,
    kpis: {
      volume_kg: {
        current: thisWeekVolume,
        delta: thisWeekVolume - lastWeekVolume,
        period: 'vs last week',
      },
      sets: {
        current: thisWeekSets,
        delta: thisWeekSets - lastWeekSets,
        period: 'vs last week',
      },
      sessions: {
        current: thisWeekSessionDates.size,
        delta: thisWeekSessionDates.size - lastWeekSessionDates.size,
        period: 'vs last week',
      },
      streak: {
        current: streak,
        delta: streak - lastWeekStreak,
        period: 'days',
      },
    },
    isEmpty,
  };
}
