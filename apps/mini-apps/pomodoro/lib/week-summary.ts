/**
 * week-summary.ts — home-page aggregation for the Pomodoro THIS WEEK card.
 *
 * The mini-app already fetches recent pomodoro rows via
 * `/api/mini-apps/pomodoro/sessions` (see `page.tsx` → `loadSessions`). This
 * module is the pure aggregator that turns those rows into the 4 KPIs
 * shown in the PixelCard hero:
 *
 *   FOCUS   — total minutes of work-phase focus this ISO week (delta vs last).
 *   CYCLES  — count of completed work sessions this week (delta vs last).
 *   STREAK  — consecutive prior days with ≥1 completed work session, walked
 *             back from today (or yesterday if today has none).
 *   AVG DAY — average minutes per DAY that had ≥1 work session this week.
 *
 * WORK-only. Break rows are receipts of rest, not focus — including them in
 * "focus" minutes would obviously wrong. Rows must have actual_seconds > 0
 * (a 0-second row is either an aborted-instantly session or noise).
 *
 * Kept separate from the History view logic because History renders daily
 * groups over the last 7 calendar days regardless of ISO week boundaries;
 * this file summarizes THIS week (Mon–Sun) + LAST week for the delta chip.
 */

import type { PomodoroSession } from '@nothing/shared';

export interface WeekSummary {
  weekLabel: string; // "AUG 12 → AUG 18"
  minutesThisWeek: number;
  minutesLastWeek: number;
  cyclesThisWeek: number;
  cyclesLastWeek: number;
  dailyStreakDays: number;
  avgMinutesPerActiveDay: number;
  isEmpty: boolean; // cyclesThisWeek === 0 && cyclesLastWeek === 0
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Monday of the ISO week containing `d`. Returns a fresh Date pinned to
 * 00:00:00 local time. Nothing OS convention: week starts Monday.
 */
function isoWeekStart(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const jsDay = out.getDay(); // 0 = Sunday
  const daysFromMonday = (jsDay + 6) % 7;
  out.setDate(out.getDate() - daysFromMonday);
  return out;
}

/** Local YYYY-MM-DD from a Date, in the caller's TZ. */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "AUG 12" style short label. */
function shortLabel(d: Date): string {
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return `${month} ${d.getDate()}`;
}

// ─── main ───────────────────────────────────────────────────────────────────

export function weekSummary(
  sessions: PomodoroSession[],
  now: Date = new Date(),
): WeekSummary {
  // WORK phase only, with actual work happening on the clock. `completed`
  // is intentionally NOT required — a user who skipped 20 minutes in still
  // did 20 minutes of focus; that should count toward FOCUS minutes.
  const workRows = sessions.filter(
    (s) => s.phase === 'work' && s.actual_duration_seconds > 0,
  );

  const thisWeekMonday = isoWeekStart(now);
  const thisWeekSunday = new Date(thisWeekMonday);
  thisWeekSunday.setDate(thisWeekSunday.getDate() + 6);
  const lastWeekMonday = new Date(thisWeekMonday);
  lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);

  const weekLabel = `${shortLabel(thisWeekMonday)} → ${shortLabel(thisWeekSunday)}`;

  let secondsThisWeek = 0;
  let secondsLastWeek = 0;
  let cyclesThisWeek = 0;
  let cyclesLastWeek = 0;
  // Track unique local days with ≥1 work session this week — used for AVG DAY.
  const thisWeekActiveDays = new Set<string>();
  // All local dates with a work session — used for streak walkback.
  const workDates = new Set<string>();

  for (const row of workRows) {
    const started = new Date(row.started_at);
    workDates.add(localDateKey(started));

    if (started >= thisWeekMonday) {
      // Cap at end of this week so a stray future timestamp doesn't leak
      // into next week's bucket. Sessions can't be in the future in practice,
      // but the schema doesn't enforce it.
      secondsThisWeek += row.actual_duration_seconds;
      cyclesThisWeek += 1;
      thisWeekActiveDays.add(localDateKey(started));
    } else if (started >= lastWeekMonday && started < thisWeekMonday) {
      secondsLastWeek += row.actual_duration_seconds;
      cyclesLastWeek += 1;
    }
  }

  const minutesThisWeek = Math.round(secondsThisWeek / 60);
  const minutesLastWeek = Math.round(secondsLastWeek / 60);

  const activeDayCount = thisWeekActiveDays.size;
  const avgMinutesPerActiveDay =
    activeDayCount === 0 ? 0 : Math.round(minutesThisWeek / activeDayCount);

  // Streak walkback. Anchor: today if today has a work session, else
  // yesterday (matches gym-routine's rule — a fresh morning shouldn't
  // reset yesterday's streak).
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = localDateKey(today);
  const anchor = new Date(today);
  if (!workDates.has(todayKey)) {
    anchor.setDate(anchor.getDate() - 1);
  }
  let dailyStreakDays = 0;
  while (workDates.has(localDateKey(anchor))) {
    dailyStreakDays += 1;
    anchor.setDate(anchor.getDate() - 1);
  }

  return {
    weekLabel,
    minutesThisWeek,
    minutesLastWeek,
    cyclesThisWeek,
    cyclesLastWeek,
    dailyStreakDays,
    avgMinutesPerActiveDay,
    isEmpty: cyclesThisWeek === 0 && cyclesLastWeek === 0,
  };
}
