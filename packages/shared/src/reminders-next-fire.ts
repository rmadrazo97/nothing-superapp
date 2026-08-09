/**
 * next-fire — compute the next `next_fire_at` timestamp for a reminder.
 *
 * Given a reminder's schedule shape + a reference "from" time (usually
 * either the current wall clock, or the moment a reminder just fired),
 * returns the ISO string of the next scheduled fire.
 *
 * Timezones: schedules like "daily 08:00" are USER LOCAL. We use the
 * reminder's `timezone` (IANA) to resolve the local wall clock into UTC.
 * The implementation avoids extra deps by using Intl.DateTimeFormat +
 * a small round-trip trick to get a UTC epoch for a given local wall
 * clock.
 *
 * Cron: only for `schedule_kind === 'cron'`. We parse a permissive 5-
 * or 6-field POSIX-style cron string and step forward one minute at a
 * time (bounded by 366 days). Not the fastest possible impl but zero
 * deps, correct, and fine at 5-minute tick cadence.
 *
 * Returns `null` when the schedule has no future occurrence (e.g. a
 * `once` reminder whose `schedule_at` already passed).
 */

import type { ScheduleKind } from './schemas/reminders.ts';

export interface ReminderScheduleInput {
  schedule_kind: ScheduleKind;
  schedule_at?: string | null;
  schedule_time?: string | null; // HH:MM
  schedule_dow?: number[] | null; // 0=Sun..6=Sat
  schedule_dom?: number | null; // 1-31
  schedule_cron?: string | null;
  timezone?: string | null; // IANA
}

const MAX_LOOKAHEAD_DAYS = 366;

/**
 * Compute the next fire, in UTC, at or after `from`. Returns ISO string.
 */
export function computeNextFireAt(
  reminder: ReminderScheduleInput,
  from: Date = new Date(),
): string | null {
  const tz = reminder.timezone || 'UTC';

  switch (reminder.schedule_kind) {
    case 'once': {
      if (!reminder.schedule_at) return null;
      const at = new Date(reminder.schedule_at);
      if (Number.isNaN(at.getTime())) return null;
      return at.getTime() >= from.getTime() ? at.toISOString() : null;
    }

    case 'daily': {
      if (!reminder.schedule_time) return null;
      const [hh, mm] = parseHhMm(reminder.schedule_time);
      if (hh == null || mm == null) return null;
      return nextDailyAtTz(hh, mm, tz, from);
    }

    case 'weekly': {
      if (!reminder.schedule_time || !reminder.schedule_dow?.length) return null;
      const [hh, mm] = parseHhMm(reminder.schedule_time);
      if (hh == null || mm == null) return null;
      const dowSet = new Set(reminder.schedule_dow);
      return nextWeeklyAtTz(hh, mm, dowSet, tz, from);
    }

    case 'monthly': {
      if (reminder.schedule_dom == null) return null;
      // Default fire at 09:00 local when no time provided.
      const [hh, mm] = reminder.schedule_time
        ? parseHhMm(reminder.schedule_time)
        : [9, 0];
      if (hh == null || mm == null) return null;
      return nextMonthlyAtTz(reminder.schedule_dom, hh, mm, tz, from);
    }

    case 'cron': {
      if (!reminder.schedule_cron) return null;
      return nextCronAtTz(reminder.schedule_cron, tz, from);
    }
  }
}

// ─── time parsing ─────────────────────────────────────────────────────────

function parseHhMm(s: string): [number | null, number | null] {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!m) return [null, null];
  return [Number(m[1]), Number(m[2])];
}

// ─── timezone-aware "next occurrence" helpers ─────────────────────────────
//
// The trick: `new Date()` and friends only know the OS timezone. To compute
// "next Tuesday 07:00 America/Mexico_City → UTC", we iterate day-by-day,
// formatting each candidate as {year, month, day, hour, minute} in the user's
// tz using Intl.DateTimeFormat, matching the target hh:mm, then converting
// that wall clock back to UTC via the inverse trick (walk seconds in UTC
// until the formatter reports the target local wall clock — bounded to a
// binary search across 48h so it's O(1) per lookup).

const partsFmtCache = new Map<string, Intl.DateTimeFormat>();
function getPartsFormatter(tz: string): Intl.DateTimeFormat {
  const key = tz;
  let fmt = partsFmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    partsFmtCache.set(key, fmt);
  }
  return fmt;
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number;
  dow: number; // 0=Sun..6=Sat
}

function toLocalParts(d: Date, tz: string): LocalParts {
  const parts = getPartsFormatter(tz).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayStr = get('weekday');
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const hourRaw = get('hour');
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    // Intl sometimes emits '24' for midnight — normalise.
    hour: (Number(hourRaw) === 24 ? 0 : Number(hourRaw)),
    minute: Number(get('minute')),
    second: Number(get('second')),
    dow: dowMap[weekdayStr] ?? 0,
  };
}

/**
 * Given a target local wall clock (Y-M-D H:M) in `tz`, return the UTC Date.
 * Works even for DST spring-forward gaps by clamping to the closest valid
 * instant (the "same hour local" invariant is best-effort).
 */
function wallClockTzToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  // Start guess: treat inputs as if they were UTC.
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let low = guessMs - 24 * 3600_000;
  let high = guessMs + 24 * 3600_000;

  // Iterate a bounded number of times — 48h window with minute resolution
  // needs at most 12 halvings for minute-precision. Keep it simple.
  for (let i = 0; i < 24; i++) {
    const mid = Math.floor((low + high) / 2 / 60000) * 60000;
    const parts = toLocalParts(new Date(mid), tz);
    const localMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
    );
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    if (localMs < targetMs) low = mid + 60000;
    else if (localMs > targetMs) high = mid - 60000;
    else return new Date(mid);
  }
  // Converged close enough — return the low bound.
  return new Date(low);
}

function nextDailyAtTz(hh: number, mm: number, tz: string, from: Date): string {
  const start = toLocalParts(from, tz);
  for (let offset = 0; offset < MAX_LOOKAHEAD_DAYS; offset++) {
    const dayGuess = new Date(
      Date.UTC(start.year, start.month - 1, start.day + offset, 12, 0, 0),
    );
    const parts = toLocalParts(dayGuess, tz);
    const candidate = wallClockTzToUtc(parts.year, parts.month, parts.day, hh, mm, tz);
    if (candidate.getTime() > from.getTime()) return candidate.toISOString();
  }
  return from.toISOString();
}

function nextWeeklyAtTz(
  hh: number,
  mm: number,
  dowSet: Set<number>,
  tz: string,
  from: Date,
): string {
  const start = toLocalParts(from, tz);
  for (let offset = 0; offset < 14; offset++) {
    const dayGuess = new Date(
      Date.UTC(start.year, start.month - 1, start.day + offset, 12, 0, 0),
    );
    const parts = toLocalParts(dayGuess, tz);
    if (!dowSet.has(parts.dow)) continue;
    const candidate = wallClockTzToUtc(parts.year, parts.month, parts.day, hh, mm, tz);
    if (candidate.getTime() > from.getTime()) return candidate.toISOString();
  }
  return from.toISOString();
}

function nextMonthlyAtTz(
  dom: number,
  hh: number,
  mm: number,
  tz: string,
  from: Date,
): string {
  const start = toLocalParts(from, tz);
  // Try current month + up to 12 future months to cover Feb 30 → Mar edge.
  for (let offset = 0; offset < 13; offset++) {
    const targetMonthIndex = start.month - 1 + offset;
    const y = start.year + Math.floor(targetMonthIndex / 12);
    const m = ((targetMonthIndex % 12) + 12) % 12; // 0-11
    // Cap dom to the last day of the target month.
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const effectiveDom = Math.min(dom, lastDay);
    const candidate = wallClockTzToUtc(y, m + 1, effectiveDom, hh, mm, tz);
    if (candidate.getTime() > from.getTime()) return candidate.toISOString();
  }
  return from.toISOString();
}

// ─── minimal cron ─────────────────────────────────────────────────────────
// Supports 5-field (m h dom mon dow) or 6-field (s m h dom mon dow) syntax.
// Field grammar: * | */step | val | val-val | val,val,val.
// Reasonable for scheduling; we advance minute-by-minute (or second for 6f)
// bounded to 1 year. Timezone-aware: schedule is evaluated against the
// reminder's local time.

interface CronSpec {
  seconds: Set<number> | null; // null == wildcard
  minutes: Set<number> | null;
  hours: Set<number> | null;
  daysOfMonth: Set<number> | null;
  months: Set<number> | null; // 1-12
  daysOfWeek: Set<number> | null; // 0-6 (Sun=0)
  hasSeconds: boolean;
}

function parseCronField(
  raw: string,
  min: number,
  max: number,
): Set<number> | null {
  if (raw === '*') return null;
  const values = new Set<number>();
  for (const part of raw.split(',')) {
    const stepMatch = /^(.+)\/(\d+)$/.exec(part);
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    const range = stepMatch ? stepMatch[1] : part;
    let start = min;
    let end = max;
    if (range !== '*') {
      const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(range);
      if (!rangeMatch) throw new Error(`bad_cron_range:${range}`);
      start = Number(rangeMatch[1]);
      end = rangeMatch[2] ? Number(rangeMatch[2]) : (stepMatch ? max : start);
    }
    for (let v = start; v <= end; v += step) values.add(v);
  }
  return values;
}

function parseCron(expr: string): CronSpec {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) {
    throw new Error(`bad_cron_field_count:${fields.length}`);
  }
  const hasSeconds = fields.length === 6;
  const secondsRaw = hasSeconds ? fields[0] : '0';
  const [minRaw, hrRaw, domRaw, monRaw, dowRaw] = hasSeconds
    ? [fields[1], fields[2], fields[3], fields[4], fields[5]]
    : [fields[0], fields[1], fields[2], fields[3], fields[4]];
  return {
    seconds: parseCronField(secondsRaw, 0, 59),
    minutes: parseCronField(minRaw, 0, 59),
    hours: parseCronField(hrRaw, 0, 23),
    daysOfMonth: parseCronField(domRaw, 1, 31),
    months: parseCronField(monRaw, 1, 12),
    daysOfWeek: parseCronField(dowRaw === '7' ? '0' : dowRaw, 0, 6),
    hasSeconds,
  };
}

function cronMatches(spec: CronSpec, parts: LocalParts): boolean {
  if (spec.seconds && !spec.seconds.has(parts.second)) return false;
  if (spec.minutes && !spec.minutes.has(parts.minute)) return false;
  if (spec.hours && !spec.hours.has(parts.hour)) return false;
  if (spec.months && !spec.months.has(parts.month)) return false;
  // DOM + DOW: match if EITHER is *, otherwise the union (POSIX cron behaviour).
  const domOk = !spec.daysOfMonth || spec.daysOfMonth.has(parts.day);
  const dowOk = !spec.daysOfWeek || spec.daysOfWeek.has(parts.dow);
  const domWild = spec.daysOfMonth == null;
  const dowWild = spec.daysOfWeek == null;
  if (domWild && dowWild) return true;
  if (domWild) return dowOk;
  if (dowWild) return domOk;
  return domOk || dowOk;
}

function nextCronAtTz(expr: string, tz: string, from: Date): string | null {
  let spec: CronSpec;
  try {
    spec = parseCron(expr);
  } catch {
    return null;
  }

  const stepMs = spec.hasSeconds ? 1000 : 60_000;
  // Start at the next tick boundary strictly after `from`.
  let cursor = Math.ceil((from.getTime() + 1) / stepMs) * stepMs;
  const limit = from.getTime() + MAX_LOOKAHEAD_DAYS * 86_400_000;
  while (cursor <= limit) {
    const parts = toLocalParts(new Date(cursor), tz);
    if (cronMatches(spec, parts)) return new Date(cursor).toISOString();
    cursor += stepMs;
    // Fast-forward on hour/day mismatches to keep the loop bounded even for
    // sparse crons (e.g. "0 0 1 1 *" = once a year).
    if (spec.hours && !spec.hours.has(parts.hour)) {
      cursor += (60 - parts.minute) * 60_000;
    }
  }
  return null;
}
