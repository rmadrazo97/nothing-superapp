'use client';

/**
 * Exercise detail — big animated GIF, numbered steps, muscle chips, and
 * the two "Add to routine / Add to session" actions.
 *
 * The GIF is the ONLY place we load `gif_url` — see ExerciseCard for why
 * the browse grid uses the static `image_url` instead. Lazy-loaded so a
 * user who navigates here from a deep link doesn't block on the animation
 * before the rest of the page renders.
 */
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Exercise, WorkoutRoutine } from '@nothing/shared';
import * as api from '../lib/api.ts';
import { ApiError, toastForError } from '../lib/api.ts';
import { useToast } from '../../../web/src/lib/toast/context';
import { cardStyle, ghostButtonStyle, primaryButtonStyle } from '../lib/ui.ts';
import ExerciseDetail from '../components/ExerciseDetail.tsx';

export default function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRoutinePicker, setShowRoutinePicker] = useState(false);
  const [routines, setRoutines] = useState<WorkoutRoutine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    api
      .getExercise(id)
      .then(({ exercise }) => {
        if (!cancelled) setExercise(exercise);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? 'Exercise not found.'
            : 'Could not load exercise.',
        );
        // 404 is already surfaced inline as its own screen — don't
        // duplicate as a toast.
        if (!(e instanceof ApiError) || e.status !== 404) {
          const t = toastForError(e);
          if (t) toast[t.variant](t.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, toast]);

  const openRoutinePicker = useCallback(async () => {
    setShowRoutinePicker(true);
    if (routines === null) {
      try {
        const resp = await api.listRoutines();
        setRoutines(resp.routines);
      } catch (e) {
        setRoutines([]);
        const t = toastForError(e);
        if (t) toast[t.variant](t.message);
      }
    }
  }, [routines, toast]);

  const addToRoutine = async (routine: WorkoutRoutine) => {
    if (!exercise) return;
    setBusy(true);
    try {
      const nextExercises = [
        ...routine.exercises,
        {
          exercise_id: exercise.id,
          sets: [{ reps: 10, weight_kg: null }, { reps: 10, weight_kg: null }, { reps: 10, weight_kg: null }],
        },
      ];
      await api.updateRoutine(routine.id, {
        name: routine.name,
        exercises: nextExercises,
      });
      setShowRoutinePicker(false);
      router.push(`/app/gym-routine/routines/${routine.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add to routine.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    } finally {
      setBusy(false);
    }
  };

  const addToNewRoutine = async () => {
    if (!exercise) return;
    setBusy(true);
    try {
      const { routine } = await api.createRoutine({
        name: `Routine with ${exercise.name}`,
        exercises: [
          {
            exercise_id: exercise.id,
            sets: [{ reps: 10, weight_kg: null }, { reps: 10, weight_kg: null }, { reps: 10, weight_kg: null }],
          },
        ],
      });
      router.push(`/app/gym-routine/routines/${routine.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create routine.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
      setBusy(false);
    }
  };

  const addToLiveSession = async () => {
    if (!exercise) return;
    setBusy(true);
    try {
      const { session } = await api.getLiveSession();
      if (session) {
        const nextEntries = [
          ...session.entries,
          {
            exercise_id: exercise.id,
            name: exercise.name,
            sets: [
              { reps: 10, weight_kg: null, completed_at: null },
              { reps: 10, weight_kg: null, completed_at: null },
              { reps: 10, weight_kg: null, completed_at: null },
            ],
          },
        ];
        await api.updateSession(session.id, { entries: nextEntries });
        router.push(`/app/gym-routine/session/${session.id}`);
      } else {
        // No live session — start one containing just this exercise.
        const { session: created } = await api.createSession({
          name: null,
          entries: [
            {
              exercise_id: exercise.id,
              name: exercise.name,
              sets: [
                { reps: 10, weight_kg: null, completed_at: null },
                { reps: 10, weight_kg: null, completed_at: null },
                { reps: 10, weight_kg: null, completed_at: null },
              ],
            },
          ],
        });
        router.push(`/app/gym-routine/session/${created.id}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add to session.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div style={{ paddingTop: 'var(--space-6)' }}>
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
        <Link href="/app/gym-routine/exercises" style={{ textDecoration: 'none' }}>
          <span style={ghostButtonStyle}>← BACK TO EXERCISES</span>
        </Link>
      </div>
    );
  }
  if (!exercise) {
    return <p className="caption" style={{ paddingTop: 'var(--space-6)' }}>Loading…</p>;
  }

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
        <span className="label">EXERCISE · {exercise.id}</span>
        <Link href="/app/gym-routine/exercises" style={{ textDecoration: 'none' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            ← BACK
          </span>
        </Link>
      </div>

      {/* Shared render — same component the in-session HOW-TO bottom-sheet uses. */}
      <ExerciseDetail exercise={exercise} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={openRoutinePicker}
          disabled={busy}
          style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
        >
          Add to routine
        </button>
        <button
          type="button"
          onClick={addToLiveSession}
          disabled={busy}
          style={{ ...ghostButtonStyle, opacity: busy ? 0.6 : 1 }}
        >
          Add to session
        </button>
      </div>

      {showRoutinePicker && (
        <section
          aria-label="Pick a routine"
          style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="label">CHOOSE ROUTINE</span>
            <button
              type="button"
              onClick={() => setShowRoutinePicker(false)}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--text-body)',
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {routines === null ? (
            <p className="caption">Loading…</p>
          ) : routines.length === 0 ? (
            <>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                No routines yet.
              </p>
              <button
                type="button"
                onClick={addToNewRoutine}
                disabled={busy}
                style={primaryButtonStyle}
              >
                Create routine with this exercise
              </button>
            </>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {routines.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => void addToRoutine(r)}
                      disabled={busy}
                      style={{
                        ...ghostButtonStyle,
                        width: '100%',
                        justifyContent: 'flex-start',
                        display: 'flex',
                        gap: 'var(--space-3)',
                        alignItems: 'baseline',
                      }}
                    >
                      <span>{r.name}</span>
                      <span
                        className="data"
                        style={{
                          color: 'var(--color-text-disabled)',
                          fontSize: 'var(--text-caption)',
                          marginLeft: 'auto',
                        }}
                      >
                        {r.exercises.length} EX
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={addToNewRoutine}
                disabled={busy}
                style={ghostButtonStyle}
              >
                + Create new routine
              </button>
            </>
          )}
        </section>
      )}

    </div>
  );
}
