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
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Exercise, SessionEntry, WorkoutSession } from '@nothing/shared';
import { EmptyState } from '@nothing/mini-apps-runtime';
import * as api from '../lib/api.ts';
import { ApiError, toastForError } from '../lib/api.ts';
import { useToast } from '../../../web/src/lib/toast/context';
import { cardStyle, ghostButtonStyle, inputStyle, primaryButtonStyle } from '../lib/ui.ts';
import { durationLabel, totalSetsCompleted, totalVolumeKg } from '../lib/format.ts';
import RestTimer from '../components/RestTimer.tsx';
import ExerciseInfoSheet from '../components/ExerciseInfoSheet.tsx';
import { useMiniAppSettings } from '../../../web/src/components/mini-app-settings';
import {
  GYM_SETTINGS_DEFAULTS,
  isBodyWeightEquipment,
  type GymSettings,
} from '../lib/settings.ts';

const DEFAULT_REST_SEC = 90;

/** "AUG 12" for the last-set reference chip. Empty string on parse fail. */
function formatLastDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

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
  // v0.5.12 — allow patching an ENDED session (user reported missing data
  // after a workout). Toggled via the "EDIT" button that appears in the
  // header when isLive is false; all set inputs unlock, save PATCHes the
  // usual /sessions/[id] endpoint.
  const [editMode, setEditMode] = useState(false);
  // Map of exercise_id → its catalog row (holds `equipment`, used to
  // decide whether the weight column is "body weight" or a real
  // number field). Hydrated lazily as entries load.
  const [exerciseMeta, setExerciseMeta] = useState<Record<string, Exercise>>({});
  // Bottom-sheet state for the ⓘ HOW-TO drawer. We track the name too so
  // the API can fall back to ILIKE lookup when the routine's opaque id
  // ("d5e1") doesn't hit a catalog PK.
  const [infoExercise, setInfoExercise] = useState<
    { id: string; name: string } | null
  >(null);
  // Focus mode: when set, render only entries[focusedExIndex] in a
  // wider card. Lets the user zero in on one exercise at a time
  // (Strong / Hevy-style focused logger).
  const [focusedExIndex, setFocusedExIndex] = useState<number | null>(null);
  // "Last time you did this exercise" reference — keyed by lowercased
  // exercise name so it survives routine-swap and opaque local ids.
  // Populated once from the last 30 completed sessions.
  const [lastByName, setLastByName] = useState<
    Record<string, { reps: number; weight_kg: number | null; ended_at: string }>
  >({});
  const { toast } = useToast();

  // Per-mini-app settings — weight/length units. Debounced-optimistic.
  const { settings: gymSettings } = useMiniAppSettings<GymSettings>(
    'gym-routine',
    GYM_SETTINGS_DEFAULTS,
  );
  const weightUnitLabel = useMemo(
    () => (gymSettings.weightUnit === 'kg' ? 'KG' : 'LBS'),
    [gymSettings.weightUnit],
  );

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
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // v0.5.17 — one-shot fetch of recent completed sessions so each
  // exercise card can show "last time you did this" as a reference.
  // Matches by lowercased name (stable across routines + opaque ids).
  // If the exercise's session has multiple completed sets, we pick the
  // heaviest as the reference — most useful "beat this" number for the
  // user. Silent on failure — the reference is optional polish, not
  // critical path.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const { sessions } = await api.listSessions(30);
        if (cancelled) return;
        const map: Record<
          string,
          { reps: number; weight_kg: number | null; ended_at: string }
        > = {};
        // Newest → oldest so the first hit per exercise wins.
        const sorted = sessions
          .filter((s) => s.ended_at)
          .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
        for (const s of sorted) {
          if (s.id === id) continue; // Skip the current session itself.
          for (const entry of s.entries) {
            const key = entry.name.trim().toLowerCase();
            if (!key || map[key]) continue;
            const doneSets = entry.sets.filter((set) => set.completed_at);
            if (doneSets.length === 0) continue;
            // Prefer the heaviest completed set of that session as the
            // reference number. Falls back to the last set for BW.
            const withWeight = doneSets.filter(
              (set) => set.weight_kg != null && set.weight_kg > 0,
            );
            const top =
              withWeight.length > 0
                ? withWeight.reduce((a, b) =>
                    (b.weight_kg ?? 0) > (a.weight_kg ?? 0) ? b : a,
                  )
                : doneSets[doneSets.length - 1];
            map[key] = {
              reps: top.reps,
              weight_kg: top.weight_kg ?? null,
              ended_at: s.ended_at ?? '',
            };
          }
        }
        setLastByName(map);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, id]);

  // Hydrate exercise catalog rows for every entry we haven't seen yet.
  // One-shot per id — the exercise catalog is public/immutable so we
  // never invalidate. Failures are silent; the row just doesn't get an
  // "is body weight" hint (falls back to showing the weight field with
  // the current unit label).
  useEffect(() => {
    const missing = entries
      .map((e) => e.exercise_id)
      .filter((id) => id && !exerciseMeta[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      // Pass the entry's display name so routines with opaque local ids
      // ("d5e1") still resolve to a catalog row via ILIKE — this hydrates
      // `equipment` so isBW works and unblocks the ⓘ HOW-TO drawer.
      const nameById = new Map<string, string>();
      for (const e of entries) {
        if (e.exercise_id && e.name) nameById.set(e.exercise_id, e.name);
      }
      const results = await Promise.allSettled(
        missing.map((id) => api.getExercise(id, nameById.get(id) ?? undefined)),
      );
      if (cancelled) return;
      setExerciseMeta((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            next[missing[i]] = r.value.exercise;
          }
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, exerciseMeta]);

  const persistEntries = useCallback(
    async (next: SessionEntry[]) => {
      setSaving(true);
      try {
        const { session: updated } = await api.updateSession(id, { entries: next });
        setSession(updated);
        setEntries(updated.entries);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not save.');
        const t = toastForError(e);
        if (t) toast[t.variant](t.message);
      } finally {
        setSaving(false);
      }
    },
    [id, toast],
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
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
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
  // `editable` unlocks the set inputs. Live sessions are always editable;
  // ended sessions become editable when the user opts in via the EDIT
  // button in the header (v0.5.12 feedback: allow patching ENDED for
  // missed data).
  const editable = isLive || editMode;
  const setsDone = totalSetsCompleted(entries);
  const totalPlanned = entries.reduce((s, e) => s + e.sets.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">
          SESSION{isLive ? ' · LIVE' : editMode ? ' · EDITING' : ' · ENDED'}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {!isLive && (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className="caption"
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border-visible)',
                color: editMode ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
                borderRadius: 'var(--radius-button)',
                padding: '0 var(--space-3)',
                minHeight: 28,
                cursor: 'pointer',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-label)',
              }}
              aria-pressed={editMode}
            >
              {editMode ? 'DONE' : 'EDIT'}
            </button>
          )}
          <Link href="/app/gym-routine" style={{ textDecoration: 'none' }}>
            <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
              ← Home
            </span>
          </Link>
        </div>
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-heading)',
            fontWeight: 500,
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-display)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
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
        // Sticky so the timer stays visible while the user scrolls through
        // exercise cards to log sets. z-index above the exercise cards;
        // background matches the shell canvas so cards don't peek through
        // the semi-transparent RestTimer card as they scroll under it.
        <div
          style={{
            position: 'sticky',
            top: 'var(--space-2)',
            zIndex: 20,
            background: 'var(--color-bg)',
            paddingBottom: 'var(--space-2)',
            marginBottom: 'calc(var(--space-2) * -1)',
          }}
        >
          <RestTimer
            runningSince={restStartedAt}
            durationSec={restDurationSec}
            onFinish={() => setRestStartedAt(null)}
            onSkip={() => setRestStartedAt(null)}
            onAddSec={(sec) => setRestDurationSec((v) => Math.max(15, v + sec))}
          />
        </div>
      )}

      {focusedExIndex != null && entries[focusedExIndex] && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            FOCUS · {focusedExIndex + 1}/{entries.length}
          </span>
          <button
            type="button"
            onClick={() => setFocusedExIndex(null)}
            style={{
              ...ghostButtonStyle,
              minHeight: 36,
              padding: '0 var(--space-3)',
            }}
          >
            ← Show all
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon="◈"
          title="Empty routine"
          body="Add exercises from the browser to start logging sets."
          primaryAction={{
            label: 'Browse exercises',
            href: '/app/gym-routine/exercises',
          }}
        />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {(focusedExIndex != null && entries[focusedExIndex]
            ? [{ entry: entries[focusedExIndex], exIdx: focusedExIndex }]
            : entries.map((entry, exIdx) => ({ entry, exIdx }))
          ).map(({ entry, exIdx }) => {
            const doneCount = entry.sets.filter((s) => s.completed_at).length;
            const active = isLive && doneCount < entry.sets.length;
            const meta = exerciseMeta[entry.exercise_id];
            const isBW = meta ? isBodyWeightEquipment(meta.equipment) : false;
            const lastRef = lastByName[entry.name.trim().toLowerCase()];
            const isFocused = focusedExIndex === exIdx;
            // Grid columns collapse when we hide the weight input for BW
            // exercises — reps takes the full inner span.
            const gridCols = isBW
              ? '36px 1fr auto'
              : '36px 1fr 1fr auto';
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
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--color-text-display)',
                          fontSize: 'var(--text-body)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setInfoExercise({ id: entry.exercise_id, name: entry.name })
                        }
                        aria-label={`How to do ${entry.name}`}
                        title="How to"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--color-border-visible)',
                          color: 'var(--color-text-secondary)',
                          borderRadius: '999px',
                          width: 20,
                          height: 20,
                          minWidth: 20,
                          padding: 0,
                          fontSize: 12,
                          lineHeight: 1,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {'ⓘ'}
                      </button>
                      {isBW && (
                        <span
                          style={{
                            border: '1px solid var(--color-border-visible)',
                            color: 'var(--color-text-secondary)',
                            padding: '0 var(--space-2)',
                            borderRadius: 'var(--radius-button)',
                            fontFamily: 'var(--font-label)',
                            fontSize: 'var(--text-label)',
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            lineHeight: '20px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Body weight
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="data"
                        style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}
                      >
                        {doneCount}/{entry.sets.length} DONE
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFocusedExIndex((v) => (v === exIdx ? null : exIdx))
                        }
                        aria-label={isFocused ? 'Collapse' : 'Focus this exercise'}
                        title={isFocused ? 'Collapse' : 'Focus'}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--color-border-visible)',
                          color: 'var(--color-text-secondary)',
                          borderRadius: 'var(--radius-compact)',
                          width: 32,
                          height: 32,
                          minWidth: 32,
                          padding: 0,
                          fontSize: 14,
                          lineHeight: 1,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          touchAction: 'manipulation',
                        }}
                      >
                        {isFocused ? '⤡' : '⤢'}
                      </button>
                    </div>
                  </div>

                  {lastRef && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        fontFamily: 'var(--font-label)',
                        fontSize: 'var(--text-label)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-secondary)',
                        paddingBottom: 'var(--space-1)',
                      }}
                    >
                      <span style={{ opacity: 0.7 }}>LAST</span>
                      <span style={{ color: 'var(--color-text-display)' }}>
                        {lastRef.weight_kg != null && lastRef.weight_kg > 0
                          ? `${lastRef.weight_kg}${gymSettings.weightUnit === 'kg' ? 'KG' : 'LBS'} × ${lastRef.reps}`
                          : `${lastRef.reps} REPS`}
                      </span>
                      <span style={{ opacity: 0.5 }}>·</span>
                      <span style={{ opacity: 0.7 }}>
                        {formatLastDate(lastRef.ended_at)}
                      </span>
                    </div>
                  )}

                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {entry.sets.map((set, setIdx) => {
                      const done = set.completed_at != null;
                      return (
                        <li
                          key={setIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: gridCols,
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
                            disabled={!editable}
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
                          {!isBW && (
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={1000}
                              step={0.5}
                              value={set.weight_kg ?? ''}
                              placeholder={weightUnitLabel}
                              disabled={!editable}
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
                              aria-label={`Weight (${weightUnitLabel}) for set ${setIdx + 1}`}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => void toggleSetComplete(exIdx, setIdx)}
                            disabled={!editable || saving}
                            aria-pressed={done}
                            aria-label={done ? `Un-mark set ${setIdx + 1}` : `Mark set ${setIdx + 1} complete`}
                            style={{
                              width: 56,
                              height: 56,
                              minWidth: 56,
                              borderRadius: 'var(--radius-compact)',
                              background: done ? 'var(--color-accent)' : 'transparent',
                              border: `2px solid ${done ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
                              color: done ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
                              cursor: editable ? 'pointer' : 'default',
                              fontSize: 24,
                              lineHeight: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              touchAction: 'manipulation',
                            }}
                          >
                            {done ? '✓' : ''}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {editable && (
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

      <ExerciseInfoSheet
        exerciseId={infoExercise?.id ?? null}
        exerciseName={infoExercise?.name ?? null}
        open={infoExercise != null}
        onClose={() => setInfoExercise(null)}
      />
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
