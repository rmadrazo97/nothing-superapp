'use client';

/**
 * Routines list — user's saved routine templates.
 *
 * v0.5.3 (task #98) — cards are now the primary START surface:
 *   • Tap the card body → starts a new session using this routine as the
 *     template (or resumes the live session if one is already running
 *     against this routine — matches the gym home banner shape).
 *   • Top-right `START →` chip is the affordance signal so the tap target
 *     reads as intentional, not accidental.
 *   • EDIT + DELETE moved into the swipe drawer (or the keyboard-only ⋯
 *     fallback that `<SwipeableRow>` ships). DELETE goes through the
 *     `<UndoSnackbar>` so a mis-swipe is recoverable.
 *   • The live-session state (LIVE · IN PROGRESS · Resume →) mirrors the
 *     gym home page so the pattern is one thing, not two.
 *
 * "+ NEW routine" empty-state creates an empty routine and jumps straight
 * into the editor. Same as before.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RoutineExercise, WorkoutRoutine, WorkoutSession } from '@nothing/shared';
import { EmptyState } from '@nothing/mini-apps-runtime';
import * as api from '../lib/api.ts';
import { ApiError, toastForError } from '../lib/api.ts';
import { useToast } from '../../../web/src/lib/toast/context';
import { SwipeableRow } from '../../../web/src/components/shell/SwipeableRow';
import { cardStyle, ghostButtonStyle } from '../lib/ui.ts';
import { toDateLabel } from '../lib/format.ts';

export default function RoutinesPage() {
  const router = useRouter();
  const [routines, setRoutines] = useState<WorkoutRoutine[] | null>(null);
  const [live, setLive] = useState<WorkoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ routines }, { session }] = await Promise.all([
        api.listRoutines(),
        api.getLiveSession(),
      ]);
      setRoutines(routines);
      setLive(session);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load routines.');
      setRoutines([]);
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const createNew = async () => {
    setBusy(true);
    try {
      const { routine } = await api.createRoutine({ name: 'New routine', exercises: [] });
      router.push(`/app/gym-routine/routines/${routine.id}`);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : 'Could not create routine.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    }
  };

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.deleteRoutine(id);
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not delete.');
        const t = toastForError(e);
        if (t) toast[t.variant](t.message);
      }
    },
    [load, toast],
  );

  const startFromRoutine = useCallback(
    async (r: WorkoutRoutine) => {
      // Resume path — if a live session is already tied to this routine,
      // jump straight into it instead of starting a new one. Matches the
      // gym home banner's Resume affordance.
      if (live && live.routine_id === r.id) {
        router.push(`/app/gym-routine/session/${live.id}`);
        return;
      }
      setStartingId(r.id);
      try {
        // Flatten routine exercises → session entries (v1 shape). Mirrors
        // the routine-editor's own "start session" flow so behaviour is
        // consistent — pre-planned sets pre-fill, weight/completed_at are
        // filled in-session.
        // Routine rows only carry exercise_id + sets — no snapshot name.
        // Fall back to exercise_id for the session snapshot; the session UI
        // already resolves display names from the exercise dictionary at
        // render time, so nothing user-facing suffers.
        const entries = (r.exercises as RoutineExercise[]).map((it) => ({
          exercise_id: it.exercise_id,
          name: it.exercise_id,
          sets: (it.sets ?? []).map((s) => ({
            reps: s.reps,
            weight_kg: s.weight_kg ?? null,
            completed_at: null,
          })),
        }));
        const { session } = await api.createSession({
          routine_id: r.id,
          name: r.name,
          entries,
        });
        try {
          sessionStorage.setItem('gym-routine.sessionId', session.id);
        } catch {
          /* private-mode Safari — non-fatal */
        }
        router.push(`/app/gym-routine/session/${session.id}`);
      } catch (e) {
        setStartingId(null);
        setError(e instanceof ApiError ? e.message : 'Could not start session.');
        const t = toastForError(e);
        if (t) toast[t.variant](t.message);
      }
    },
    [live, router, toast],
  );

  const liveByRoutine = useMemo(() => {
    const map = new Map<string, WorkoutSession>();
    if (live && live.routine_id) map.set(live.routine_id, live);
    return map;
  }, [live]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">ROUTINES</span>
        <Link href="/app/gym-routine" style={{ textDecoration: 'none' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            ← BACK
          </span>
        </Link>
      </div>

      {/* v0.5.1: shrunk to ghost variant with tight padding — see history
          comment above; kept as-is in v0.5.3. */}
      <button
        type="button"
        onClick={createNew}
        disabled={busy}
        style={{
          ...ghostButtonStyle,
          alignSelf: 'flex-start',
          padding: 'var(--space-2) var(--space-4)',
          minHeight: 36,
          fontSize: 'var(--text-caption)',
          color: 'var(--color-accent)',
          borderColor: 'var(--color-accent)',
        }}
      >
        + NEW ROUTINE
      </button>

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      {routines === null ? (
        <p className="caption">Loading…</p>
      ) : routines.length === 0 ? (
        <EmptyState
          icon="◈"
          title="No saved routines"
          body="Save exercises as routines to re-use them across sessions."
          primaryAction={{
            label: '+ NEW ROUTINE',
            onClick: () => void createNew(),
            ariaLabel: 'Create a new routine',
          }}
        />
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {routines.map((r) => {
            const liveHere = liveByRoutine.get(r.id) ?? null;
            const isStarting = startingId === r.id;
            return (
              <li key={r.id}>
                <SwipeableRow
                  ariaLabel={r.name}
                  actions={[
                    {
                      label: 'Edit',
                      kind: 'primary',
                      onSelect: () =>
                        router.push(`/app/gym-routine/routines/${r.id}`),
                    },
                    {
                      label: 'Delete',
                      kind: 'destructive',
                      undoLabel: `Deleted "${r.name}"`,
                      onSelect: () => void remove(r.id),
                    },
                  ]}
                >
                  <RoutineCard
                    routine={r}
                    liveSession={liveHere}
                    starting={isStarting}
                    onStart={() => void startFromRoutine(r)}
                  />
                </SwipeableRow>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * RoutineCard — the sliding content layer inside each `<SwipeableRow>`.
 *
 * Whole card body is the primary tap target (start / resume). Top-right
 * chip announces the action so the surface doesn't read as "just a card
 * with metadata" like it did through v0.5.2.
 */
function RoutineCard({
  routine,
  liveSession,
  starting,
  onStart,
}: {
  routine: WorkoutRoutine;
  liveSession: WorkoutSession | null;
  starting: boolean;
  onStart: () => void;
}) {
  const summary = useMemo(() => {
    // v2 routines carry a `plan` blob; count days + exercises there.
    // v1 routines list exercises + sets directly.
    const plan = (routine as unknown as { plan?: { days?: Array<{ exercises?: unknown[] }> } }).plan;
    if (plan && Array.isArray(plan.days) && plan.days.length > 0) {
      const exCount = plan.days.reduce(
        (n, d) => n + (Array.isArray(d.exercises) ? d.exercises.length : 0),
        0,
      );
      return `V2 · ${plan.days.length} day${plan.days.length === 1 ? '' : 's'} · ${exCount} exercises`;
    }
    return `${routine.exercises.length} exercise${routine.exercises.length === 1 ? '' : 's'} · ${routine.exercises.reduce(
      (s, e) => s + e.sets.length,
      0,
    )} sets`;
  }, [routine]);

  const isLive = liveSession !== null;

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={starting}
      aria-label={
        isLive
          ? `Resume live session for ${routine.name}`
          : `Start a session from ${routine.name}`
      }
      style={{
        ...cardStyle,
        // Reset button chrome so the card renders identically to the old
        // <div>-shaped card — only the affordances change.
        appearance: 'none',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        width: '100%',
        cursor: starting ? 'wait' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        // Live cards get the accent border to match the gym home banner.
        borderColor: isLive ? 'var(--color-accent)' : undefined,
        // Reserve room for the swipe affordance dot at the right edge.
        paddingRight: 'var(--space-6)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
        <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-subheading)' }}>
          {routine.name}
        </span>
        <StartChip live={isLive} starting={starting} />
      </div>

      {isLive && (
        <span
          className="label"
          style={{
            color: 'var(--color-accent)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          LIVE · IN PROGRESS · Resume →
        </span>
      )}

      <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        {summary}
      </span>

      <span
        className="data"
        style={{
          color: 'var(--color-text-disabled)',
          fontSize: 'var(--text-caption)',
          alignSelf: 'flex-end',
        }}
      >
        Updated {toDateLabel(routine.updated_at)}
      </span>
    </button>
  );
}

function StartChip({ live, starting }: { live: boolean; starting: boolean }) {
  const label = starting ? 'STARTING…' : live ? 'RESUME →' : 'START →';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 24,
        padding: '0 var(--space-3)',
        borderRadius: 'var(--radius-button)',
        border: `1px solid ${live ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
        color: live ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: 'transparent',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
