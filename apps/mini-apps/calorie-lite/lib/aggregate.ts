/**
 * Pure aggregation helpers for calorie-lite v2.
 *
 * All functions here are pure — no I/O, no React, no Date.now() called from
 * inside (callers pass `today` explicitly so tests + SSR stay deterministic).
 *
 * Grouping key = LOCAL YYYY-MM-DD from `entered_at`. Streak semantics are
 * built on the same local-day key, so a meal logged at 23:59 counts on the
 * same day it was entered, matching what users see in the history view.
 */
import type { CalorieEntry } from '@nothing/shared';

/**
 * Calorie density per gram of each macro. Standard Atwater factors —
 * intentionally centralised so any future refinement (fibre-adjusted carbs,
 * alcohol at 7 kcal/g, etc.) has exactly one edit site.
 */
export const KCAL_PER_G = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const;

export interface DailyTotal {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: number;
}

/** YYYY-MM-DD for the caller's local timezone (not UTC). */
export function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Bucket entries into per-local-day totals. Missing macro fields (v1 rows
 * before the columns were surfaced) count as 0 grams — they still contribute
 * their `kcal` to the day total, they just don't add to the macro breakdown.
 */
export function dailyTotals(entries: CalorieEntry[]): Record<string, DailyTotal> {
  const out: Record<string, DailyTotal> = {};
  for (const e of entries) {
    const key = toLocalDateKey(e.entered_at);
    const bucket = out[key] ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, entries: 0 };
    bucket.kcal += e.kcal ?? 0;
    bucket.protein += e.protein_g ?? 0;
    bucket.carbs += e.carbs_g ?? 0;
    bucket.fat += e.fat_g ?? 0;
    bucket.entries += 1;
    out[key] = bucket;
  }
  return out;
}

/**
 * Add `deltaDays` to a YYYY-MM-DD key, returning another YYYY-MM-DD key.
 * Uses local-time Date math so DST transitions don't drift the count.
 */
function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Compute the caller's current and best streak of consecutive logging days.
 *
 * "Current" walks backwards from `today` while each day has at least one
 * entry. If today has no entry yet, we also allow yesterday to seed the
 * streak — otherwise a user's streak would flicker to 0 every morning until
 * they log breakfast. "Best" scans all logged days once.
 *
 * `today` is passed in explicitly (YYYY-MM-DD, local) so this function
 * remains pure — callers derive it from `new Date()` at their own layer.
 */
export function computeStreak(
  entries: CalorieEntry[],
  today: string,
): { current: number; best: number } {
  if (entries.length === 0) return { current: 0, best: 0 };

  const days = new Set<string>();
  for (const e of entries) days.add(toLocalDateKey(e.entered_at));

  // Current streak: start at today, or yesterday if today is empty (so an
  // untouched morning doesn't reset a real streak).
  let cursor = today;
  if (!days.has(cursor)) {
    const yesterday = shiftDateKey(today, -1);
    if (!days.has(yesterday)) {
      // No entry today or yesterday — streak is definitively broken.
      // Still compute `best` from historic data.
      const best = computeBest(days);
      return { current: 0, best };
    }
    cursor = yesterday;
  }
  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  const best = Math.max(current, computeBest(days));
  return { current, best };
}

function computeBest(days: Set<string>): number {
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
