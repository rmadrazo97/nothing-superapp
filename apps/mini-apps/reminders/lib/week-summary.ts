/**
 * week-summary.ts — home-page aggregation for Reminders.
 *
 * Home shows a THIS WEEK data card at the top: 7-day fire-count bar chart
 * + 4 KPIs (Active, This Week, Tasks, Next Fire). This module is the pure
 * aggregator; the page fetches the reminders list via useResource and
 * hands the rows to `remindersWeekSummary()`.
 *
 * Mirrors the shape of `apps/mini-apps/gym-routine/lib/week-summary.ts`
 * so the two mini-apps read as one family: same ISO week (Mon → Sun),
 * same DAY_LABELS, same isoWeekStart() helper.
 */
import type { Reminder } from '@nothing/shared';

export interface DayBucket {
  /** Short display label — 'M' / 'T' / 'W' / 'T' / 'F' / 'S' / 'S'. */
  label: string;
  /** Fire count for that day. */
  count: number;
  /** True if this is today's bucket (client TZ). */
  isToday: boolean;
}

export interface RemindersWeekSummary {
  /** Reminders with `active === true`. */
  active_count: number;
  /** Reminders with `kind === 'agent_loop'` (task-flavored). */
  agent_loop_count: number;
  /** Reminders with `kind === 'notify'` (push at time). */
  notify_count: number;
  /** How many `next_fire_at` timestamps fall inside the current ISO week. */
  fires_this_week: number;
  /** 7-bucket array Mon → Sun of upcoming fires within the current ISO week. */
  fires_by_day: number[];
  /** Earliest upcoming `next_fire_at` across all active reminders (ISO string), or null. */
  next_fire_at: string | null;
  /** The reminder whose `next_fire_at` matches `next_fire_at` above, or null. */
  next_fire_reminder: Reminder | null;
  /** True when there are zero reminders at all — the caller should skip the hero. */
  isEmpty: boolean;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Monday of the ISO week containing `d`. Fresh Date pinned to 00:00:00 local.
 */
function isoWeekStart(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const jsDay = out.getDay(); // 0 = Sunday
  const daysFromMonday = (jsDay + 6) % 7; // Mon → 0, …, Sun → 6
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

export function remindersWeekSummary(
  reminders: Reminder[],
  now: Date = new Date(),
): RemindersWeekSummary {
  const isEmpty = reminders.length === 0;

  const thisWeekMonday = isoWeekStart(now);
  const nextWeekMonday = new Date(thisWeekMonday);
  nextWeekMonday.setDate(nextWeekMonday.getDate() + 7);

  const buckets: DayBucket[] = DAY_LABELS.map((label, i) => {
    const day = new Date(thisWeekMonday);
    day.setDate(day.getDate() + i);
    return { label, count: 0, isToday: sameLocalDay(day, now) };
  });

  let active_count = 0;
  let agent_loop_count = 0;
  let notify_count = 0;
  let fires_this_week = 0;

  let earliest_ts: number | null = null;
  let earliest_reminder: Reminder | null = null;

  for (const r of reminders) {
    if (r.active) active_count += 1;
    if (r.kind === 'agent_loop') agent_loop_count += 1;
    if (r.kind === 'notify') notify_count += 1;

    if (!r.next_fire_at) continue;
    const fireAt = new Date(r.next_fire_at);
    const fireTs = fireAt.getTime();
    if (Number.isNaN(fireTs)) continue;

    // Bucket into current ISO week if it falls Mon 00:00 → next Mon 00:00.
    if (fireAt >= thisWeekMonday && fireAt < nextWeekMonday) {
      const dayIdx = Math.floor(
        (fireTs - thisWeekMonday.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (dayIdx >= 0 && dayIdx < 7) {
        buckets[dayIdx].count += 1;
      }
      fires_this_week += 1;
    }

    // Earliest upcoming fire across ACTIVE reminders only (past ones ignored).
    if (r.active && fireTs >= now.getTime()) {
      if (earliest_ts == null || fireTs < earliest_ts) {
        earliest_ts = fireTs;
        earliest_reminder = r;
      }
    }
  }

  return {
    active_count,
    agent_loop_count,
    notify_count,
    fires_this_week,
    fires_by_day: buckets.map((b) => b.count),
    next_fire_at: earliest_ts != null ? new Date(earliest_ts).toISOString() : null,
    next_fire_reminder: earliest_reminder,
    isEmpty,
  };
}

/**
 * Compact human-relative label for the "Next fire" metric cell.
 *
 * Returns `{ value, unit }` where `value` is either a number (renders as a
 * big Doto numeral in PixelMetricGrid) or an em-dash string, and `unit` is
 * a short suffix like 'h' / 'd' / 'm' / 'now'.
 *
 * Rules:
 *   - null / farther than 14 days out → { value: '—', unit: '' }
 *   - within 60s → { value: 'NOW', unit: '' }
 *   - < 60 min → { value: minutes, unit: 'm' }
 *   - < 24 h  → { value: hours,   unit: 'h' }
 *   - else     → { value: days,   unit: 'd' }
 */
export function nextFireRelative(
  nextFireIso: string | null,
  now: Date = new Date(),
): { value: number | string; unit: string } {
  if (!nextFireIso) return { value: '—', unit: '' };
  const fireTs = new Date(nextFireIso).getTime();
  if (Number.isNaN(fireTs)) return { value: '—', unit: '' };
  const deltaMs = fireTs - now.getTime();
  if (deltaMs <= 0) return { value: 'NOW', unit: '' };

  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  if (deltaMs > FOURTEEN_DAYS_MS) return { value: '—', unit: '' };

  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return { value: 'NOW', unit: '' };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { value: minutes, unit: 'm' };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: hours, unit: 'h' };
  const days = Math.floor(hours / 24);
  return { value: days, unit: 'd' };
}
