/**
 * Formatting helpers shared across every gym-routine screen.
 *
 * Weight is stored in kg on the wire (see workoutRoutineSchema.sets.weight_kg).
 * `formatWeight` returns a display string — kg for now; a future prefs toggle
 * for lb would live here so no screen renders raw numbers.
 */

/** Pretty-print a weight in kg. Null / undefined → "BW" (bodyweight). */
export function formatWeight(weight_kg: number | null | undefined): string {
  if (weight_kg == null) return 'BW';
  // Trim trailing .0 for round numbers so "60kg" reads cleaner than "60.0kg".
  const rounded = Math.round(weight_kg * 10) / 10;
  const num = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${num}kg`;
}

/** Seconds → mm:ss (used by the rest timer). Negative values clamp to 0. */
export function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Total training volume for a session — Σ reps × weight_kg. Sets with a null
 * weight (bodyweight moves) contribute zero, which matches the standard gym
 * definition of "tonnage".
 */
export function totalVolumeKg(
  entries: { sets: { reps: number; weight_kg?: number | null }[] }[],
): number {
  let sum = 0;
  for (const entry of entries) {
    for (const set of entry.sets) {
      if (set.weight_kg == null) continue;
      sum += set.reps * set.weight_kg;
    }
  }
  return Math.round(sum);
}

/** Count of completed sets across every exercise in a session. */
export function totalSetsCompleted(
  entries: { sets: { completed_at?: string | null }[] }[],
): number {
  let count = 0;
  for (const entry of entries) {
    for (const set of entry.sets) {
      if (set.completed_at) count += 1;
    }
  }
  return count;
}

/** "MON · MAR 03" — short, upper, sits inside Space Mono nicely. */
export function toDateLabel(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  const month = d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  return `${weekday} · ${month} ${day}`;
}

/** ISO week key "2026-W32" — used to bucket history by week. */
export function isoWeekKey(iso: string): string {
  const d = new Date(iso);
  // Copy so we don't mutate the caller's date.
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Human label for an ISO week key: "WEEK OF MAR 03". */
export function weekLabel(iso: string): string {
  const d = new Date(iso);
  // Monday of that week
  const dayNum = d.getDay() || 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dayNum - 1));
  return `WEEK OF ${monday.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }).toUpperCase()}`;
}

/**
 * Duration between two ISO timestamps in "1h 24m" form. If ended is null,
 * we treat it as "ongoing" and use `now`.
 */
export function durationLabel(startedIso: string, endedIso: string | null): string {
  const start = Date.parse(startedIso);
  const end = endedIso ? Date.parse(endedIso) : Date.now();
  const mins = Math.max(0, Math.floor((end - start) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
