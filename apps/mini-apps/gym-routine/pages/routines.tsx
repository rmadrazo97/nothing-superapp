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
import { ApiError, toastForError } from '../lib/api.ts';
import { useToast } from '../../../web/src/lib/toast/context';
import { cardStyle, ghostButtonStyle } from '../lib/ui.ts';
import { toDateLabel } from '../lib/format.ts';

export default function RoutinesPage() {
  const router = useRouter();
  const [routines, setRoutines] = useState<WorkoutRoutine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const { routines } = await api.listRoutines();
      setRoutines(routines);
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

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.deleteRoutine(id);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
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
            ← BACK
          </span>
        </Link>
      </div>

      {/* v0.5.1: shrunk to ghost variant with tight padding — the primary
          cadmium fill at full padding read as a hero CTA and dominated the
          screen, even though the empty-state also has a "+ NEW ROUTINE"
          button. Ghost + `alignSelf: flex-start` matches the density of the
          reminders header. */}
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
                  {(() => {
                    // v2 rows carry the plan blob; count days + exercises there.
                    const plan = (r as unknown as { plan?: { days?: Array<{ exercises?: unknown[] }> } }).plan;
                    if (plan && Array.isArray(plan.days) && plan.days.length > 0) {
                      const exCount = plan.days.reduce(
                        (n, d) => n + (Array.isArray(d.exercises) ? d.exercises.length : 0),
                        0,
                      );
                      return `V2 · ${plan.days.length} day${plan.days.length === 1 ? '' : 's'} · ${exCount} exercises`;
                    }
                    return `${r.exercises.length} exercise${r.exercises.length === 1 ? '' : 's'} · ${r.exercises.reduce((s, e) => s + e.sets.length, 0)} sets`;
                  })()}
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
