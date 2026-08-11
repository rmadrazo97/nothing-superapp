/**
 * Flatten a v2 plan day into v1-shape session entries so the existing
 * session UI can log against them.
 *
 * Extracted from routine-editor.tsx's startV2Day so both routines.tsx
 * (day-picker START-from-card) and routine-editor.tsx (day-card START)
 * share one code path. The v1 session entry shape is what
 * `createSession` accepts + what `session.tsx` renders.
 *
 * Rules:
 *   - `superset` structure → each component becomes its own sibling entry.
 *   - `straight` / `top_set_backoff` → blocks flatten into a single entry
 *     with sets sized to the reps.max of each block (reps.max is the
 *     "target for the day"; user can adjust in-session).
 *   - Exercise ids fall back to `{plan.id}.c{order}` for components
 *     without a linked catalog exercise, and `{plan.id}` for orphan
 *     top-level exercises. The session render layer already resolves
 *     display names from the exercise catalog, so this is only a stable
 *     key for the session_entries payload.
 */
import type { PlanDay } from '@nothing/shared';

export interface FlatEntry {
  exercise_id: string;
  name: string;
  sets: Array<{ reps: number; weight_kg: number | null; completed_at: null }>;
}

export interface SessionFromDay {
  entries: FlatEntry[];
  block_role: 'straight' | 'top_set' | 'superset';
  plan_exercise_id: string | null;
}

export function sessionFromDay(day: PlanDay): SessionFromDay {
  const entries: FlatEntry[] = [];
  for (const ex of day.exercises) {
    if (ex.structure === 'superset') {
      for (const c of ex.components) {
        entries.push({
          exercise_id: c.exercise_id ?? `${ex.id}.c${c.order}`,
          name: c.name_en ?? c.name_es ?? '(component)',
          sets: Array.from({ length: c.sets }, () => ({
            reps: c.reps.max,
            weight_kg: null,
            completed_at: null,
          })),
        });
      }
    } else {
      const flat = ex.blocks.flatMap((b) =>
        Array.from({ length: b.sets }, () => ({
          reps: b.reps.max,
          weight_kg: null,
          completed_at: null,
        })),
      );
      entries.push({
        exercise_id: ex.exercise_id ?? ex.id,
        name: ex.name_en ?? ex.name_es ?? '(exercise)',
        sets: flat,
      });
    }
  }

  const firstEx = day.exercises[0];
  const block_role: SessionFromDay['block_role'] = day.exercises.some(
    (e) => e.structure === 'superset',
  )
    ? 'superset'
    : firstEx?.structure === 'top_set_backoff'
      ? 'top_set'
      : 'straight';

  return {
    entries,
    block_role,
    plan_exercise_id: firstEx?.id ?? null,
  };
}

/** Human label for a day pill: prefers `name_en` → `name_es` → "Day N". */
export function dayLabel(day: PlanDay): string {
  return day.name_en ?? day.name_es ?? `Day ${day.day}`;
}
