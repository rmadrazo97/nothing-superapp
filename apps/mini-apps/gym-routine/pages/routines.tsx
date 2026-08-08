'use client';

/**
 * Routines list — user's saved routine templates.
 *
 * "+ New routine" creates an empty routine and jumps straight into the
 * editor. Delete is a two-step confirm (no destructive silent taps).
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WorkoutRoutine } from '@nothing/shared';
import { EmptyState } from '@nothing/mini-apps-runtime';
import * as api from '../lib/api.ts';
import { ApiError } from '../lib/api.ts';
import { cardStyle, ghostButtonStyle, primaryButtonStyle } from '../lib/ui.ts';
import { toDateLabel } from '../lib/format.ts';

export default function RoutinesPage() {
  const router = useRouter();
  const [routines, setRoutines] = useState<WorkoutRoutine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { routines } = await api.listRoutines();
      setRoutines(routines);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load routines.');
      setRoutines([]);
    }
  }, []);

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
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.deleteRoutine(id);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">ROUTINES</span>
        <Link href="/app/gym-routine" style={{ textDecoration: 'none' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            ← Back
          </span>
        </Link>
      </div>

      <button
        type="button"
        onClick={createNew}
        disabled={busy}
        style={{ ...primaryButtonStyle, alignSelf: 'flex-start' }}
      >
        + New routine
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
            label: '+ New routine',
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
          {routines.map((r) => (
            <li key={r.id}>
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-subheading)' }}>
                    {r.name}
                  </span>
                  <span
                    className="data"
                    style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-caption)' }}
                  >
                    {toDateLabel(r.updated_at)}
                  </span>
                </div>
                <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
                  {r.exercises.length} exercise{r.exercises.length === 1 ? '' : 's'} ·{' '}
                  {r.exercises.reduce((s, e) => s + e.sets.length, 0)} sets
                </span>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Link href={`/app/gym-routine/routines/${r.id}`} style={{ textDecoration: 'none' }}>
                    <span style={ghostButtonStyle}>Edit</span>
                  </Link>
                  {pendingDelete === r.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void remove(r.id)}
                        disabled={busy}
                        style={{
                          ...ghostButtonStyle,
                          borderColor: 'var(--color-accent)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                        style={ghostButtonStyle}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(r.id)}
                      style={{ ...ghostButtonStyle, color: 'var(--color-text-secondary)' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
