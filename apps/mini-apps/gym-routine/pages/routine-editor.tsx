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
import type { Exercise, RoutineExercise, WorkoutRoutine } from '@nothing/shared';
import * as api from '../lib/api.ts';
import { ApiError } from '../lib/api.ts';
import { cardStyle, ghostButtonStyle, inputStyle, primaryButtonStyle } from '../lib/ui.ts';

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
    }
  }, [id]);

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
    }
  };

  const totalSets = useMemo(() => items.reduce((s, r) => s + r.sets.length, 0), [items]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">ROUTINE</span>
        <Link href="/app/gym-routine/routines" style={{ textDecoration: 'none' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            ← Back
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
