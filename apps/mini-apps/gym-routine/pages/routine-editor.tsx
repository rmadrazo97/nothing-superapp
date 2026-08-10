'use client';

/**
 * Routine editor — edit name, reorder exercises, tune sets/reps/weight.
 *
 * We keep local optimistic state and only PATCH on explicit "Save" — this
 * mini-app is offline-tolerant by design (a spotty gym wifi is the target
 * environment) and inline saves on every keystroke would be needlessly
 * chatty. "Start session" uses the current in-memory state, so an unsaved
 * routine still becomes a usable session snapshot.
 *
 * Reorder is up/down arrow buttons — drag-and-drop is nicer on desktop but
 * finicky on mobile without a helper lib (we're not adding one for v1).
 */
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Exercise, Plan, PlanDay, RoutineExercise, WorkoutRoutine } from '@nothing/shared';
import { planSchema } from '@nothing/shared';
import * as api from '../lib/api.ts';
import { ApiError, toastForError } from '../lib/api.ts';
import { useToast } from '../../../web/src/lib/toast/context';
import { cardStyle, ghostButtonStyle, inputStyle, primaryButtonStyle } from '../lib/ui.ts';
import { PlanDayCard } from '../components/PlanDayCard.tsx';
import { PlanConventionsCard } from '../components/PlanConventionsCard.tsx';
import { PlanCardioCard } from '../components/PlanCardioCard.tsx';

export default function RoutineEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [routine, setRoutine] = useState<WorkoutRoutine | null>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<RoutineExercise[]>([]);
  const [exerciseMap, setExerciseMap] = useState<Record<string, Exercise>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const { routine } = await api.getRoutine(id);
      setRoutine(routine);
      setName(routine.name);
      setItems(routine.exercises);
      // Fetch exercise metadata for names/thumbs, one at a time (small N).
      const map: Record<string, Exercise> = {};
      await Promise.all(
        routine.exercises.map(async (item) => {
          try {
            const { exercise } = await api.getExercise(item.exercise_id);
            map[exercise.id] = exercise;
          } catch {
            /* fine — display exercise_id if lookup fails */
          }
        }),
      );
      setExerciseMap(map);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load routine.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (idx: number, delta: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      const [x] = next.splice(idx, 1);
      next.splice(target, 0, x);
      return next;
    });
    setDirty(true);
  };

  const removeAt = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const updateSet = (exIdx: number, setIdx: number, patch: { reps?: number; weight_kg?: number | null }) => {
    setItems((prev) => {
      const next = prev.map((row, i) => {
        if (i !== exIdx) return row;
        const nextSets = row.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s));
        return { ...row, sets: nextSets };
      });
      return next;
    });
    setDirty(true);
  };

  const addSet = (exIdx: number) => {
    setItems((prev) => {
      const next = prev.map((row, i) => {
        if (i !== exIdx) return row;
        const last = row.sets[row.sets.length - 1];
        return {
          ...row,
          sets: [...row.sets, { reps: last?.reps ?? 10, weight_kg: last?.weight_kg ?? null }],
        };
      });
      return next;
    });
    setDirty(true);
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setItems((prev) => {
      const next = prev.map((row, i) => {
        if (i !== exIdx) return row;
        return { ...row, sets: row.sets.filter((_, j) => j !== setIdx) };
      });
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { routine: updated } = await api.updateRoutine(id, {
        name: name.trim() || 'Untitled routine',
        exercises: items,
      });
      setRoutine(updated);
      setDirty(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    } finally {
      setSaving(false);
    }
  };

  const startSession = async () => {
    setStarting(true);
    setError(null);
    try {
      // If dirty, persist first so the session reflects the intended plan.
      if (dirty) {
        await api.updateRoutine(id, {
          name: name.trim() || 'Untitled routine',
          exercises: items,
        });
      }
      const entries = items.map((it) => ({
        exercise_id: it.exercise_id,
        name: exerciseMap[it.exercise_id]?.name ?? it.exercise_id,
        sets: it.sets.map((s) => ({ reps: s.reps, weight_kg: s.weight_kg ?? null, completed_at: null })),
      }));
      const { session } = await api.createSession({
        routine_id: id,
        name: name.trim() || 'Untitled routine',
        entries,
      });
      try {
        sessionStorage.setItem('gym-routine.sessionId', session.id);
      } catch {
        /* private mode — non-fatal */
      }
      router.push(`/app/gym-routine/session/${session.id}`);
    } catch (e) {
      setStarting(false);
      setError(e instanceof ApiError ? e.message : 'Could not start session.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    }
  };

  const totalSets = useMemo(() => items.reduce((s, r) => s + r.sets.length, 0), [items]);

  // v2 detection — routine.plan is jsonb; if it parses as a Plan, render
  // the read-only structured view instead of the v1 editor. Coach-authored
  // v2 routines aren't editable in v1 of the UI (coming later); this
  // coexistence keeps v1 routines fully editable and v2 routines viewable.
  const v2Plan = useMemo<Plan | null>(() => {
    if (!routine?.plan) return null;
    const parsed = planSchema.safeParse(routine.plan);
    return parsed.success ? parsed.data : null;
  }, [routine]);

  const startV2Day = useCallback(
    async (day: PlanDay) => {
      if (!routine) return;
      setStarting(true);
      setError(null);
      try {
        // Flatten the day's exercises into v1-shape session entries so the
        // existing session UI can log against them. superset components
        // become sibling entries; top_set / backoff blocks flatten into a
        // single entry with concatenated sets sized to reps.max as a
        // starting target.
        const entries: Array<{ exercise_id: string; name: string; sets: Array<{ reps: number; weight_kg: number | null; completed_at: null }> }> = [];
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
        // Pick a representative block_role for the session — 'superset' if
        // the day contains any, else 'top_set' if the day leads with a
        // top set, else 'straight'. plan_exercise_id points at the first
        // exercise so the session UI can highlight it.
        const firstEx = day.exercises[0];
        const rolePref =
          day.exercises.some((e) => e.structure === 'superset')
            ? 'superset' as const
            : firstEx?.structure === 'top_set_backoff'
              ? 'top_set' as const
              : 'straight' as const;
        const { session } = await api.createSession({
          routine_id: id,
          name: `${routine.name} — Day ${day.day}`,
          entries,
          plan_day: day.day,
          plan_exercise_id: firstEx?.id ?? null,
          block_role: rolePref,
        });
        try {
          sessionStorage.setItem('gym-routine.sessionId', session.id);
        } catch {
          /* private mode — non-fatal */
        }
        router.push(`/app/gym-routine/session/${session.id}`);
      } catch (e) {
        setStarting(false);
        setError(e instanceof ApiError ? e.message : 'Could not start session.');
        const t = toastForError(e);
        if (t) toast[t.variant](t.message);
      }
    },
    [id, routine, router, toast],
  );

  if (!routine) {
    return (
      <div style={{ paddingTop: 'var(--space-6)' }}>
        {error ? (
          <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>{error}</p>
        ) : (
          <p className="caption">Loading routine…</p>
        )}
      </div>
    );
  }

  if (v2Plan) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          paddingTop: 'var(--space-6)',
          paddingBottom: 'var(--space-12)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="label">ROUTINE · V2</span>
          <Link href="/app/gym-routine/routines" style={{ textDecoration: 'none' }}>
            <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
              ← BACK
            </span>
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h1 className="display-md" style={{ margin: 0 }}>
            {routine.name}
          </h1>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            {v2Plan.split ?? `${v2Plan.days.length}-day plan`} ·{' '}
            {v2Plan.sessions_per_week ?? v2Plan.days.length}× per week
          </span>
        </div>

        {v2Plan.cardio && <PlanCardioCard cardio={v2Plan.cardio} />}
        {v2Plan.conventions && <PlanConventionsCard conventions={v2Plan.conventions} />}

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {v2Plan.days.map((day, idx) => (
            <li key={day.day}>
              <PlanDayCard
                day={day}
                defaultOpen={idx === 0}
                onStartDay={starting ? undefined : startV2Day}
              />
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
            {error}
          </p>
        )}

        {Array.isArray(routine.parsing_notes) && routine.parsing_notes.length > 0 && (
          <details style={{ ...cardStyle, borderStyle: 'dashed' }}>
            <summary
              className="label"
              style={{ cursor: 'pointer', color: 'var(--color-text-secondary)' }}
            >
              PARSING NOTES ({routine.parsing_notes.length})
            </summary>
            <ul style={{ margin: 'var(--space-3) 0 0', paddingLeft: 'var(--space-4)', color: 'var(--color-text-primary)' }}>
              {routine.parsing_notes.map((n, i) => (
                <li key={i} style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
                  {n}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">ROUTINE</span>
        <Link href="/app/gym-routine/routines" style={{ textDecoration: 'none' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            ← BACK
          </span>
        </Link>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setDirty(true);
        }}
        maxLength={120}
        style={{ ...inputStyle, fontSize: 'var(--text-subheading)' }}
        placeholder="Routine name"
      />

      <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        {items.length} exercise{items.length === 1 ? '' : 's'} · {totalSets} set{totalSets === 1 ? '' : 's'}
      </span>

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      {items.length === 0 && (
        <div style={{ ...cardStyle, borderStyle: 'dashed', textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            No exercises yet.
          </p>
          <Link href="/app/gym-routine/exercises" style={{ textDecoration: 'none' }}>
            <span style={primaryButtonStyle}>Browse exercises</span>
          </Link>
        </div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {items.map((item, exIdx) => {
          const meta = exerciseMap[item.exercise_id];
          return (
            <li key={`${item.exercise_id}-${exIdx}`}>
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
                    <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-body)' }}>
                      {meta?.name ?? item.exercise_id}
                    </span>
                    {meta && (
                      <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>
                        {meta.target.toUpperCase()} · {meta.equipment.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button
                      type="button"
                      onClick={() => move(exIdx, -1)}
                      aria-label="Move up"
                      style={{ ...ghostButtonStyle, minHeight: 36, padding: 'var(--space-2)' }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(exIdx, +1)}
                      aria-label="Move down"
                      style={{ ...ghostButtonStyle, minHeight: 36, padding: 'var(--space-2)' }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAt(exIdx)}
                      aria-label="Remove"
                      style={{ ...ghostButtonStyle, minHeight: 36, padding: 'var(--space-2)', color: 'var(--color-text-secondary)' }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {item.sets.map((set, setIdx) => (
                    <li
                      key={setIdx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '36px 1fr 1fr 36px',
                        gap: 'var(--space-2)',
                        alignItems: 'center',
                      }}
                    >
                      <span className="data" style={{ color: 'var(--color-text-secondary)' }}>
                        {String(setIdx + 1).padStart(2, '0')}
                      </span>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>REPS</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={999}
                          value={set.reps}
                          onChange={(e) => updateSet(exIdx, setIdx, { reps: Number(e.target.value) || 0 })}
                          style={{ ...inputStyle, padding: 'var(--space-2)', minHeight: 36 }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>KG</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={1000}
                          step={0.5}
                          value={set.weight_kg ?? ''}
                          placeholder="BW"
                          onChange={(e) => {
                            const v = e.target.value;
                            updateSet(exIdx, setIdx, { weight_kg: v === '' ? null : Number(v) });
                          }}
                          style={{ ...inputStyle, padding: 'var(--space-2)', minHeight: 36 }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeSet(exIdx, setIdx)}
                        aria-label={`Remove set ${setIdx + 1}`}
                        style={{ ...ghostButtonStyle, minHeight: 36, padding: 'var(--space-2)' }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => addSet(exIdx)}
                  style={{ ...ghostButtonStyle, alignSelf: 'flex-start' }}
                >
                  + Add set
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Link href="/app/gym-routine/exercises" style={{ textDecoration: 'none' }}>
          <span style={ghostButtonStyle}>+ Add exercise</span>
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          style={{
            ...ghostButtonStyle,
            opacity: saving || !dirty ? 0.5 : 1,
            cursor: saving || !dirty ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
        <button
          type="button"
          onClick={startSession}
          disabled={starting || items.length === 0}
          style={{
            ...primaryButtonStyle,
            opacity: starting || items.length === 0 ? 0.5 : 1,
            cursor: starting || items.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {starting ? 'Starting…' : 'Start session'}
        </button>
      </div>
    </div>
  );
}
