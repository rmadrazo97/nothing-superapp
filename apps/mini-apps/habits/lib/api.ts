/**
 * Fetch helpers for the Habits mini-app.
 *
 * Keeps every call site DRY: same fetch options (credentials, JSON header,
 * status branching), same 402 short-circuit, same shape for the returned
 * error. The page never talks to Supabase directly — everything flows
 * through the auth+entitlement-gated Next route handlers.
 */
import type { Habit, HabitCompletion, HabitInsert, HabitUpdate } from '@nothing/shared';

const HABITS_URL = '/api/mini-apps/habits/habits';
const COMPLETIONS_URL = '/api/mini-apps/habits/completions';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

// ─── habits CRUD ──────────────────────────────────────────────────────────

export async function listHabits(): Promise<Habit[]> {
  const res = await fetch(HABITS_URL, { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const body = (await res.json()) as { habits: Habit[] };
  return body.habits;
}

export async function createHabit(input: HabitInsert): Promise<Habit> {
  const res = await fetch(HABITS_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const body = (await res.json()) as { habit: Habit };
  return body.habit;
}

export async function updateHabit(id: string, patch: HabitUpdate): Promise<Habit> {
  const res = await fetch(`${HABITS_URL}/${id}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const body = (await res.json()) as { habit: Habit };
  return body.habit;
}

export async function deleteHabit(id: string): Promise<void> {
  const res = await fetch(`${HABITS_URL}/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
}

// ─── completions ──────────────────────────────────────────────────────────

/** Fetch completions in `[fromDate, toDate]` inclusive (YYYY-MM-DD). */
export async function listCompletions(
  fromDate: string,
  toDate: string,
): Promise<HabitCompletion[]> {
  const params = new URLSearchParams({ from: fromDate, to: toDate });
  const res = await fetch(`${COMPLETIONS_URL}?${params.toString()}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const body = (await res.json()) as { completions: HabitCompletion[] };
  return body.completions;
}

export type ToggleOutcome =
  | { action: 'created'; completion: HabitCompletion }
  | { action: 'deleted'; habit_id: string; completed_on: string };

/**
 * Toggle today's (or a given date's) completion for a habit. Server does
 * the insert-or-delete decision atomically based on whether the row exists.
 */
export async function toggleCompletion(
  habitId: string,
  completedOn?: string,
): Promise<ToggleOutcome> {
  const res = await fetch(COMPLETIONS_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      completedOn
        ? { habit_id: habitId, completed_on: completedOn }
        : { habit_id: habitId },
    ),
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return (await res.json()) as ToggleOutcome;
}

// ─── local-date helpers ───────────────────────────────────────────────────

export function todayLocal(): string {
  const d = new Date();
  return formatLocalDate(d);
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return the last `n` local dates (inclusive of today), newest first. */
export function lastNDates(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(formatLocalDate(d));
  }
  return out;
}

/**
 * Streak = number of consecutive prior days (including today if done)
 * where a completion exists. Missing days break the walk.
 */
export function computeStreak(dates: Set<string>, from: Date = new Date()): number {
  let streak = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  // Special case: if today isn't done yet, still count backward from
  // yesterday so an untapped morning doesn't show streak: 0d for a
  // habit that ran 30 days straight.
  if (!dates.has(formatLocalDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dates.has(formatLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** ISO week Monday–Sunday range containing `d`. Returns [monday, sunday]. */
export function weekRange(d: Date = new Date()): { from: string; to: string; label: string } {
  const day = d.getDay(); // 0..6, Sun..Sat
  // Monday-anchored week (Nothing OS convention).
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${x.getDate()}`;
  return {
    from: formatLocalDate(monday),
    to: formatLocalDate(sunday),
    label: `${fmt(monday)} – ${fmt(sunday)}`,
  };
}
