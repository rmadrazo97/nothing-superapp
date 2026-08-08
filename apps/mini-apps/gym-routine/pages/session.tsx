'use client';

/**
 * Live session — the actual workout logger.
 *
 * State model:
 *   - `session` is the server-authoritative snapshot loaded on mount.
 *   - `entries` is the local editable copy. Every set-toggle patches the
 *     server via PATCH /sessions/[id] and refreshes local state from the
 *     server response — so a mid-session tab-switch + return picks up the
 *     latest completed_at stamps without special-casing.
 *   - `restStartedAt` (ms since epoch) drives RestTimer. Set when a set is
 *     marked complete; cleared on skip or when timer hits 0.
 *
 * Cross-tab safety: on mount we drop this session's id into sessionStorage
 * so the home page's "Resume workout" banner can jump straight back in
 * even without a network round-trip. The server GET /sessions/live is the
 * cross-device source of truth.
 */
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SessionEntry, WorkoutSession } from '@nothing/shared';
import * as api from '../lib/api.ts';
import { ApiError } from '../lib/api.ts';
import { cardStyle, ghostButtonStyle, inputStyle, primaryButtonStyle } from '../lib/ui.ts';
import { durationLabel, totalSetsCompleted, totalVolumeKg } from '../lib/format.ts';
import RestTimer from '../components/RestTimer.tsx';

const DEFAULT_REST_SEC = 90;

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [restDurationSec, setRestDurationSec] = useState(DEFAULT_REST_SEC);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { session } = await api.getSession(id);
      setSession(session);
      setEntries(session.entries);
      try {
        sessionStorage.setItem('gym-routine.sessionId', session.id);
      } catch {
        /* private mode — non-fatal */
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load session.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistEntries = useCallback(
    async (next: SessionEntry[]) => {
      setSaving(true);
      try {
        const { session: updated } = await api.updateSession(id, { entries: next });
        setSession(updated);
        setEntries(updated.entries);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not save.');
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const toggleSetComplete = async (exIdx: number, setIdx: number) => {
    const next = entries.map((entry, i) => {
      if (i !== exIdx) return entry;
      return {
        ...entry,
        sets: entry.sets.map((s, j) => {
          if (j !== setIdx) return s;
          return {
            ...s,
            completed_at: s.completed_at ? null : new Date().toISOString(),
          };
        }),
      };
    });
    // Optimistic — the RestTimer feels bad if we wait for the network.
    const nowCompleted = next[exIdx].sets[setIdx].completed_at != null;
    setEntries(next);
    if (nowCompleted) setRestStartedAt(Date.now());
    await persistEntries(next);
  };

  const updateSetField = (
    exIdx: number,
    setIdx: number,
    patch: { reps?: number; weight_kg?: number | null },
  ) => {
    setEntries((prev) => {
      const next = prev.map((entry, i) => {
        if (i !== exIdx) return entry;
        return {
          ...entry,
          sets: entry.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)),
        };
      });
      return next;
    });
  };

  const commitField = async () => {
    // Called on blur of an input — persist the current local state.
    await persistEntries(entries);
  };

  const addSetToEntry = async (exIdx: number) => {
    const next = entries.map((entry, i) => {
      if (i !== exIdx) return entry;
      const last = entry.sets[entry.sets.length - 1];
      return {
        ...entry,
        sets: [...entry.sets, { reps: last?.reps ?? 10, weight_kg: last?.weight_kg ?? null, completed_at: null }],
      };
    });
    setEntries(next);
    await persistEntries(next);
  };

  const endSession = async () => {
    setEnding(true);
    try {
      await api.updateSession(id, { end: true, entries });
      try {
        sessionStorage.removeItem('gym-routine.sessionId');
      } catch {
        /* non-fatal */
      }
      router.push(`/app/gym-routine/history`);
    } catch (e) {
      setEnding(false);
      setError(e instanceof ApiError ? e.message : 'Could not end session.');
    }
  };

  if (!session) {
    return (
      <div style={{ paddingTop: 'var(--space-6)' }}>
        {error ? (
          <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>{error}</p>
        ) : (
          <p className="caption">Loading session…</p>
        )}
      </div>
    );
  }

  const isLive = session.ended_at == null;
  const setsDone = totalSetsCompleted(entries);
  const totalPlanned = entries.reduce((s, e) => s + e.sets.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">SESSION{isLive ? ' · LIVE' : ' · ENDED'}</span>
        <Link href="/app/gym-routine" style={{ textDecoration: 'none' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            ← Home
          </span>
        </Link>
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h1 className="display-md" style={{ margin: 0 }}>
          {session.name ?? 'Workout'}
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <MetricBlock label="ELAPSED" value={durationLabel(session.started_at, session.ended_at)} />
          <MetricBlock label="SETS" value={`${setsDone} / ${totalPlanned}`} />
          <MetricBlock label="VOLUME · KG" value={totalVolumeKg(entries).toLocaleString()} />
        </div>
      </div>

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      {isLive && (
        <RestTimer
          runningSince={restStartedAt}
          durationSec={restDurationSec}
          onFinish={() => setRestStartedAt(null)}
          onSkip={() => setRestStartedAt(null)}
          onAddSec={(sec) => setRestDurationSec((v) => Math.max(15, v + sec))}
        />
      )}

      {entries.length === 0 ? (
        <div style={{ ...cardStyle, borderStyle: 'dashed', textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
            No exercises yet. Add one from the browser.
          </p>
          <Link href="/app/gym-routine/exercises" style={{ textDecoration: 'none' }}>
            <span style={primaryButtonStyle}>Browse exercises</span>
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {entries.map((entry, exIdx) => {
            const doneCount = entry.sets.filter((s) => s.completed_at).length;
            const active = isLive && doneCount < entry.sets.length;
            return (
              <li key={`${entry.exercise_id}-${exIdx}`}>
                <div
                  style={{
                    ...cardStyle,
                    borderColor: active ? 'var(--color-text-display)' : 'var(--color-border-visible)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-body)' }}>
                      {entry.name}
                    </span>
                    <span
                      className="data"
                      style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}
                    >
                      {doneCount}/{entry.sets.length} DONE
                    </span>
                  </div>

                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {entry.sets.map((set, setIdx) => {
                      const done = set.completed_at != null;
                      return (
                        <li
                          key={setIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '36px 1fr 1fr auto',
                            gap: 'var(--space-2)',
                            alignItems: 'center',
                          }}
                        >
                          <span
                            className="data"
                            style={{
                              color: done ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
                            }}
                          >
                            {String(setIdx + 1).padStart(2, '0')}
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={999}
                            value={set.reps}
                            disabled={!isLive}
                            onChange={(e) => updateSetField(exIdx, setIdx, { reps: Number(e.target.value) || 0 })}
                            onBlur={() => void commitField()}
                            style={{
                              ...inputStyle,
                              padding: 'var(--space-2)',
                              minHeight: 44,
                              opacity: done ? 0.7 : 1,
                            }}
                            aria-label={`Reps for set ${setIdx + 1}`}
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={1000}
                            step={0.5}
                            value={set.weight_kg ?? ''}
                            placeholder="BW"
                            disabled={!isLive}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateSetField(exIdx, setIdx, { weight_kg: v === '' ? null : Number(v) });
                            }}
                            onBlur={() => void commitField()}
                            style={{
                              ...inputStyle,
                              padding: 'var(--space-2)',
                              minHeight: 44,
                              opacity: done ? 0.7 : 1,
                            }}
                            aria-label={`Weight for set ${setIdx + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => void toggleSetComplete(exIdx, setIdx)}
                            disabled={!isLive || saving}
                            aria-pressed={done}
                            aria-label={done ? `Un-mark set ${setIdx + 1}` : `Mark set ${setIdx + 1} complete`}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 'var(--radius-compact)',
                              background: done ? 'var(--color-accent)' : 'transparent',
                              border: `1px solid ${done ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
                              color: done ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
                              cursor: isLive ? 'pointer' : 'default',
                              fontSize: 'var(--text-body)',
                              lineHeight: 1,
                            }}
                          >
                            {done ? '✓' : ''}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {isLive && (
                    <button
                      type="button"
                      onClick={() => void addSetToEntry(exIdx)}
                      style={{ ...ghostButtonStyle, alignSelf: 'flex-start' }}
                    >
                      + Add set
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isLive && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Link href="/app/gym-routine/exercises" style={{ textDecoration: 'none' }}>
            <span style={ghostButtonStyle}>+ Add exercise</span>
          </Link>
          {confirmEnd ? (
            <>
              <button
                type="button"
                onClick={endSession}
                disabled={ending}
                style={{
                  ...primaryButtonStyle,
                  opacity: ending ? 0.6 : 1,
                }}
              >
                {ending ? 'Ending…' : 'Confirm end'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                style={ghostButtonStyle}
              >
                Keep going
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              style={{
                ...ghostButtonStyle,
                borderColor: 'var(--color-accent)',
                color: 'var(--color-accent)',
              }}
            >
              End session
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <span className="label">{label}</span>
      <span
        className="data"
        style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-subheading)', fontWeight: 700 }}
      >
        {value}
      </span>
    </div>
  );
}
