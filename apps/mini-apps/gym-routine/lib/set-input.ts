/**
 * Pure helpers for the live-session set inputs (v0.6.3).
 *
 * The session logger used to feed `Number(e.target.value)` straight into
 * state from `<input type="number">`. That broke in three ways on phones:
 *   - "22." re-rendered as "22" (the decimal point vanished mid-typing)
 *   - comma-decimal keyboards ("22,5") produced "" → weight wiped to null
 *   - "12.5" reps or a >1000 weight failed server validation, and every
 *     later save of the same entries failed too → values silently lost
 *
 * Inputs now keep a raw draft string and only hand a parsed, clamped,
 * schema-valid number to the entries state. Everything here is pure so it
 * can be unit tested without a DOM.
 */
import type { SessionEntry } from '@nothing/shared';

export type NumberKind = 'int' | 'decimal';

/** Server limits — mirror sessionSetSchema in @nothing/shared. */
export const REPS_MAX = 999;
export const WEIGHT_MAX = 1000;
export const SETS_MAX = 20;

/**
 * Normalise a keystroke-level input value to a draft string, or `null` when
 * the keystroke should be rejected (letters, a second decimal point…).
 * Accepts comma as a decimal separator.
 */
export function normalizeDraft(raw: string, kind: NumberKind): string | null {
  const s = raw.replace(',', '.').replace(/\s+/g, '');
  if (kind === 'int') return /^\d{0,3}$/.test(s) ? s : null;
  return /^\d{0,4}(\.\d{0,2})?$/.test(s) ? s : null;
}

/** Parse a draft to a schema-valid number. Empty / lone "." → null. */
export function parseDraft(draft: string, kind: NumberKind): number | null {
  if (draft === '' || draft === '.') return null;
  const n = Number(draft);
  if (!Number.isFinite(n)) return null;
  if (kind === 'int') return Math.min(REPS_MAX, Math.max(0, Math.round(n)));
  return Math.min(WEIGHT_MAX, Math.max(0, Math.round(n * 100) / 100));
}

/** Display a stored number as an input draft. null → "". */
export function formatDraft(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value);
}

/**
 * Apply a weight edit to one set and carry it forward to the following
 * not-yet-completed sets that were still empty or matched the old value.
 * Straight sets share a weight 90% of the time, so typing it once fills
 * the rest of the exercise — the user only touches the odd one out.
 */
export function applyWeightEdit(
  entry: SessionEntry,
  setIdx: number,
  weight: number | null,
): SessionEntry {
  const old = entry.sets[setIdx]?.weight_kg ?? null;
  return {
    ...entry,
    sets: entry.sets.map((s, j) => {
      if (j === setIdx) return { ...s, weight_kg: weight };
      if (j < setIdx || s.completed_at) return s;
      const cur = s.weight_kg ?? null;
      // Linked while they match — this is what makes per-keystroke edits
      // ("2" → "22", or clear-then-retype) stay in step down the column.
      if (cur === old || (cur == null && weight != null)) return { ...s, weight_kg: weight };
      return s;
    }),
  };
}

/** Same carry-forward rule for reps: only sets that still match the old value. */
export function applyRepsEdit(
  entry: SessionEntry,
  setIdx: number,
  reps: number,
): SessionEntry {
  const old = entry.sets[setIdx]?.reps;
  return {
    ...entry,
    sets: entry.sets.map((s, j) => {
      if (j === setIdx) return { ...s, reps };
      if (j < setIdx || s.completed_at) return s;
      return s.reps === old ? { ...s, reps } : s;
    }),
  };
}

/**
 * Last line of defence before a PATCH: coerce every set into the shape the
 * server accepts so one bad value can never wedge all future saves.
 */
export function sanitizeEntries(entries: SessionEntry[]): SessionEntry[] {
  return entries.map((e) => ({
    exercise_id: e.exercise_id,
    name: e.name,
    sets: e.sets.slice(0, SETS_MAX).map((s) => {
      const reps = Number.isFinite(s.reps)
        ? Math.min(REPS_MAX, Math.max(0, Math.round(s.reps)))
        : 0;
      const w = s.weight_kg;
      const weight_kg =
        w == null || !Number.isFinite(w)
          ? null
          : Math.min(WEIGHT_MAX, Math.max(0, Math.round(w * 100) / 100));
      return { reps, weight_kg, completed_at: s.completed_at ?? null };
    }),
  }));
}
