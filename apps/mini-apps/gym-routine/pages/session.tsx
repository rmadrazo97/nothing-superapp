'use client';

/**
 * Live session — the actual workout logger.
 *
 * State model (v0.6.3 rewrite — "I have to fill every input twice"):
 *   - `entries` (mirrored in `entriesRef`) is the single source of truth
 *     while the page is open. Every edit goes through `commit()`, which
 *     updates local state synchronously and hands a snapshot to
 *     `useSessionSaver`.
 *   - The saver serializes PATCHes (one in flight, latest wins, retries
 *     on network/5xx) and NEVER writes the server response back into
 *     `entries`. The old code did, so a slow response for set 1 would
 *     overwrite what the user was typing in set 2.
 *   - Nothing is ever disabled while a save runs. The old ✓ button was
 *     `disabled={saving}`, so tapping ✓ right after typing (input blur →
 *     save → disable) swallowed the tap.
 *   - Inputs are <SetNumberField>: text + inputMode, draft-string state,
 *     select-on-focus, comma decimals, values pushed on every keystroke.
 *   - Typing a weight / reps carries forward to the following open sets
 *     that still matched, and ✓ on an empty weight uses the "last time"
 *     hint — so a straight 4×8 is one number typed, four taps.
 *   - `restStartedAt` (ms since epoch) drives the compact RestTimer.
 *
 * Cross-tab safety: on mount we drop this session's id into sessionStorage
 * so the home page's "Resume workout" banner can jump straight back in
 * even without a network round-trip. The server GET /sessions/live is the
 * cross-device source of truth.
 */
import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Exercise, SessionEntry, WorkoutSession } from '@nothing/shared';
import { EmptyState } from '@nothing/mini-apps-runtime';
import * as api from '../lib/api.ts';
import { ApiError, toastForError } from '../lib/api.ts';
import { useToast } from '../../../web/src/lib/toast/context';
import { cardStyle, ghostButtonStyle, primaryButtonStyle } from '../lib/ui.ts';
import { durationLabel, totalSetsCompleted, totalVolumeKg } from '../lib/format.ts';
import { applyRepsEdit, applyWeightEdit, SETS_MAX } from '../lib/set-input.ts';
import { useSessionSaver, type SaveStatus } from '../lib/use-session-saver.ts';
import RestTimer from '../components/RestTimer.tsx';
import SetNumberField from '../components/SetNumberField.tsx';
import ExerciseInfoSheet from '../components/ExerciseInfoSheet.tsx';
import { useMiniAppSettings } from '../../../web/src/components/mini-app-settings';
import {
  GYM_SETTINGS_DEFAULTS,
  isBodyWeightEquipment,
  type GymSettings,
} from '../lib/settings.ts';

const DEFAULT_REST_SEC = 90;
const REST_KEY = 'gym-routine.restSec';

/** "AUG 12" for the last-set reference chip. Empty string on parse fail. */
function formatLastDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

type LastRef = { reps: number; weight_kg: number | null; ended_at: string };

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const entriesRef = useRef<SessionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [restDurationSec, setRestDurationSec] = useState(DEFAULT_REST_SEC);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // v0.5.12 — allow patching an ENDED session (missed data after a
  // workout). Toggled via the EDIT button in the header when not live.
  const [editMode, setEditMode] = useState(false);
  // exercise_id → catalog row (holds `equipment` for the BW decision).
  const [exerciseMeta, setExerciseMeta] = useState<Record<string, Exercise>>({});
  const requestedMetaRef = useRef<Set<string>>(new Set());
  const [infoExercise, setInfoExercise] = useState<
    { id: string; name: string } | null
  >(null);
  // Focus mode: render only entries[focusedExIndex] (Strong/Hevy-style).
  const [focusedExIndex, setFocusedExIndex] = useState<number | null>(null);
  // Per-entry BW override (catalog meta is often wrong for machine
  // variants). undefined → follow catalog, true → BW, false → weighted.
  const [bwOverride, setBwOverride] = useState<Record<number, boolean>>({});
  const [confirmRemoveExIdx, setConfirmRemoveExIdx] = useState<number | null>(null);
  // "Last time you did this exercise", keyed by lowercased name.
  const [lastByName, setLastByName] = useState<Record<string, LastRef>>({});
  // Re-render once in a while so ELAPSED keeps moving while idle.
  const [, setNow] = useState(0);
  const fieldRefs = useRef(new Map<string, HTMLInputElement>());
  const { toast } = useToast();

  const { settings: gymSettings } = useMiniAppSettings<GymSettings>(
    'gym-routine',
    GYM_SETTINGS_DEFAULTS,
  );
  const weightUnitLabel = useMemo(
    () => (gymSettings.weightUnit === 'kg' ? 'KG' : 'LBS'),
    [gymSettings.weightUnit],
  );

  const onSaveError = useCallback(
    (e: unknown) => {
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    },
    [toast],
  );
  const saver = useSessionSaver(id, onSaveError);

  /** The one way to change entries: local first, then queue a save. */
  const commit = useCallback(
    (
      update: (prev: SessionEntry[]) => SessionEntry[],
      opts?: { immediate?: boolean },
    ) => {
      const next = update(entriesRef.current);
      if (next === entriesRef.current) return;
      entriesRef.current = next;
      setEntries(next);
      saver.save(next, opts);
    },
    [saver],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const { session } = await api.getSession(id);
      setSession(session);
      entriesRef.current = session.entries;
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

  // Remembered rest length — a per-device convenience.
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(REST_KEY));
      if (Number.isFinite(v) && v >= 15 && v <= 600) setRestDurationSec(v);
    } catch {
      /* storage blocked */
    }
  }, []);
  const adjustRest = (delta: number) => {
    setRestDurationSec((v) => {
      const next = Math.min(600, Math.max(15, v + delta));
      try {
        localStorage.setItem(REST_KEY, String(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  };

  const isLive = session != null && session.ended_at == null;
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [isLive]);

  // One-shot fetch of recent completed sessions for the "LAST" reference.
  // Keyed on the session id (not the object) so it doesn't refetch after
  // every save like it used to.
  const loadedId = session?.id ?? null;
  useEffect(() => {
    if (!loadedId) return;
    let cancelled = false;
    (async () => {
      try {
        const { sessions } = await api.listSessions(30);
        if (cancelled) return;
        const map: Record<string, LastRef> = {};
        const sorted = sessions
          .filter((s) => s.ended_at)
          .sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
        for (const s of sorted) {
          if (s.id === loadedId) continue;
          for (const entry of s.entries) {
            const key = entry.name.trim().toLowerCase();
            if (!key || map[key]) continue;
            const doneSets = entry.sets.filter((set) => set.completed_at);
            if (doneSets.length === 0) continue;
            // Heaviest completed set = most useful "beat this" number.
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
  }, [loadedId]);

  // Hydrate catalog rows once per exercise id. Tracks requested ids so a
  // failed lookup isn't retried on every keystroke (it used to be).
  useEffect(() => {
    const missing = Array.from(
      new Set(
        entries
          .map((e) => e.exercise_id)
          .filter((eid) => eid && !requestedMetaRef.current.has(eid)),
      ),
    );
    if (missing.length === 0) return;
    missing.forEach((eid) => requestedMetaRef.current.add(eid));
    const nameById = new Map<string, string>();
    for (const e of entries) {
      if (e.exercise_id && e.name) nameById.set(e.exercise_id, e.name);
    }
    (async () => {
      const results = await Promise.allSettled(
        missing.map((eid) => api.getExercise(eid, nameById.get(eid) ?? undefined)),
      );
      setExerciseMeta((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') next[missing[i]] = r.value.exercise;
        });
        return next;
      });
    })();
  }, [entries]);

  // ── Mutations ────────────────────────────────────────────────────────

  const setWeight = (exIdx: number, setIdx: number, w: number | null) =>
    commit((prev) =>
      prev.map((e, i) => (i === exIdx ? applyWeightEdit(e, setIdx, w) : e)),
    );

  const setReps = (exIdx: number, setIdx: number, r: number | null) => {
    // Cleared reps field → keep the old value (the field reverts on blur).
    if (r == null) return;
    commit((prev) =>
      prev.map((e, i) => (i === exIdx ? applyRepsEdit(e, setIdx, r) : e)),
    );
  };

  const toggleSetComplete = (exIdx: number, setIdx: number, fillWeight: number | null) => {
    const cur = entriesRef.current[exIdx]?.sets[setIdx];
    if (!cur) return;
    const completing = cur.completed_at == null;
    commit(
      (prev) =>
        prev.map((entry, i) => {
          if (i !== exIdx) return entry;
          // ✓ on an empty weight adopts the hint shown in the field.
          const base =
            completing && fillWeight != null && entry.sets[setIdx].weight_kg == null
              ? applyWeightEdit(entry, setIdx, fillWeight)
              : entry;
          return {
            ...base,
            sets: base.sets.map((s, j) =>
              j === setIdx
                ? { ...s, completed_at: completing ? new Date().toISOString() : null }
                : s,
            ),
          };
        }),
      { immediate: true },
    );
    if (completing) {
      buzz(15);
      if (isLive) setRestStartedAt(Date.now());
    }
  };

  const addSetToEntry = (exIdx: number) =>
    commit(
      (prev) =>
        prev.map((entry, i) => {
          if (i !== exIdx || entry.sets.length >= SETS_MAX) return entry;
          const last = entry.sets[entry.sets.length - 1];
          return {
            ...entry,
            sets: [
              ...entry.sets,
              { reps: last?.reps ?? 10, weight_kg: last?.weight_kg ?? null, completed_at: null },
            ],
          };
        }),
      { immediate: true },
    );

  const removeLastSet = (exIdx: number) =>
    commit(
      (prev) =>
        prev.map((entry, i) =>
          // Keep at least one set — remove the exercise instead.
          i !== exIdx || entry.sets.length <= 1
            ? entry
            : { ...entry, sets: entry.sets.slice(0, -1) },
        ),
      { immediate: true },
    );

  const removeExercise = (exIdx: number) => {
    setFocusedExIndex((v) => (v === exIdx ? null : v != null && v > exIdx ? v - 1 : v));
    setConfirmRemoveExIdx(null);
    setBwOverride((prev) => {
      const nextOverrides: Record<number, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        const idx = Number(k);
        if (idx === exIdx) continue;
        nextOverrides[idx > exIdx ? idx - 1 : idx] = v;
      }
      return nextOverrides;
    });
    commit((prev) => prev.filter((_, i) => i !== exIdx), { immediate: true });
  };

  const toggleBw = (exIdx: number, isCurrentlyBw: boolean) => {
    const nextBw = !isCurrentlyBw;
    setBwOverride((prev) => ({ ...prev, [exIdx]: nextBw }));
    // Flipping TO body-weight blanks weight so volume math stays honest.
    if (nextBw) {
      commit(
        (prev) =>
          prev.map((entry, i) =>
            i !== exIdx
              ? entry
              : { ...entry, sets: entry.sets.map((s) => ({ ...s, weight_kg: null })) },
          ),
        { immediate: true },
      );
    }
  };

  const endSession = async () => {
    setEnding(true);
    try {
      // Everything typed must land before we stamp ended_at.
      await saver.flushAll();
      await api.updateSession(id, { end: true, entries: entriesRef.current });
      try {
        sessionStorage.removeItem('gym-routine.sessionId');
      } catch {
        /* non-fatal */
      }
      router.push(`/app/gym-routine/history`);
    } catch (e) {
      setEnding(false);
      setError(
        e instanceof ApiError
          ? e.message
          : 'Some sets are not saved yet. Check your connection and try again.',
      );
      const t = toastForError(e);
      if (t && e instanceof ApiError) toast[t.variant](t.message);
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

  const editable = isLive || editMode;
  const setsDone = totalSetsCompleted(entries);
  const totalPlanned = entries.reduce((s, e) => s + e.sets.length, 0);
  const focused = focusedExIndex != null && entries[focusedExIndex] ? focusedExIndex : null;
  const visible =
    focused != null
      ? [{ entry: entries[focused], exIdx: focused }]
      : entries.map((entry, exIdx) => ({ entry, exIdx }));

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
      <style>{`
        .gym-set-field:focus { border-color: var(--color-accent) !important; background: var(--color-surface-raised) !important; color: var(--color-text-display) !important; }
        .gym-set-field::placeholder { color: var(--color-text-disabled); opacity: 1; }
        .gym-set-field:disabled { opacity: 0.6; }
        .gym-check:active { transform: scale(0.94); }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <span className="label">
            SESSION{isLive ? ' · LIVE' : editMode ? ' · EDITING' : ' · ENDED'}
          </span>
          {editable && <SaveChip status={saver.status} onRetry={saver.retry} />}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexShrink: 0 }}>
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
                padding: '0 var(--space-4)',
                minHeight: 44,
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
          <MetricBlock label={`VOLUME · ${weightUnitLabel}`} value={totalVolumeKg(entries).toLocaleString()} />
        </div>
        {totalPlanned > 0 && (
          <div
            aria-hidden
            style={{ height: 3, background: 'var(--color-border)', borderRadius: 2, overflow: 'hidden' }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((setsDone / totalPlanned) * 100)}%`,
                background: 'var(--color-accent)',
                transition: 'width 200ms ease',
              }}
            />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      {isLive && (
        // Compact + sticky so it stays in view while scrolling cards.
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
            onAddSec={adjustRest}
          />
        </div>
      )}

      {focused != null && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <button
            type="button"
            onClick={() => setFocusedExIndex(Math.max(0, focused - 1))}
            disabled={focused === 0}
            style={{ ...ghostButtonStyle, padding: '0 var(--space-4)', opacity: focused === 0 ? 0.4 : 1 }}
            aria-label="Previous exercise"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setFocusedExIndex(null)}
            style={{ ...ghostButtonStyle, padding: '0 var(--space-4)' }}
          >
            {focused + 1}/{entries.length} · Show all
          </button>
          <button
            type="button"
            onClick={() => setFocusedExIndex(Math.min(entries.length - 1, focused + 1))}
            disabled={focused >= entries.length - 1}
            style={{
              ...ghostButtonStyle,
              padding: '0 var(--space-4)',
              opacity: focused >= entries.length - 1 ? 0.4 : 1,
            }}
            aria-label="Next exercise"
          >
            →
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
          {visible.map(({ entry, exIdx }) => {
            const doneCount = entry.sets.filter((s) => s.completed_at).length;
            const allDone = doneCount === entry.sets.length;
            const active = isLive && !allDone;
            const meta = exerciseMeta[entry.exercise_id];
            const metaBW = meta ? isBodyWeightEquipment(meta.equipment) : false;
            const isBW = bwOverride[exIdx] ?? metaBW;
            const lastRef = lastByName[entry.name.trim().toLowerCase()];
            const lastWeight =
              lastRef?.weight_kg != null && lastRef.weight_kg > 0 ? lastRef.weight_kg : null;
            const isFocused = focused === exIdx;
            const nextOpenIdx = entry.sets.findIndex((s) => !s.completed_at);
            // `minmax(0, 1fr)` keeps the inputs from forcing the row wider
            // than the card on 375-wide phones.
            const gridCols = isBW
              ? '28px minmax(0,1fr) 52px'
              : '28px minmax(0,1fr) minmax(0,1fr) 52px';
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
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 2 }}>
                      <span
                        style={{
                          color: 'var(--color-text-display)',
                          fontSize: 'var(--text-body)',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.name}
                      </span>
                      <span className="label" style={{ color: allDone ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                        {allDone ? '✓ ' : ''}{doneCount}/{entry.sets.length} SETS
                        {lastRef && (
                          <>
                            {' · LAST '}
                            <span style={{ color: 'var(--color-text-primary)' }}>
                              {lastWeight != null
                                ? `${lastWeight}${weightUnitLabel} × ${lastRef.reps}`
                                : `${lastRef.reps} REPS`}
                            </span>
                            {` · ${formatLastDate(lastRef.ended_at)}`}
                          </>
                        )}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0 }}>
                      <IconButton
                        label={`How to do ${entry.name}`}
                        onClick={() => setInfoExercise({ id: entry.exercise_id, name: entry.name })}
                      >
                        ⓘ
                      </IconButton>
                      <IconButton
                        label={isFocused ? 'Show all exercises' : 'Focus this exercise'}
                        onClick={() => setFocusedExIndex((v) => (v === exIdx ? null : exIdx))}
                      >
                        {isFocused ? '⤡' : '⤢'}
                      </IconButton>
                    </div>
                  </div>

                  {/* Column headers — the old grid had none, so KG vs REPS was a guess. */}
                  <div
                    className="label"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: gridCols,
                      gap: 'var(--space-2)',
                      alignItems: 'center',
                      textAlign: 'center',
                      color: 'var(--color-text-disabled)',
                    }}
                  >
                    <span style={{ textAlign: 'left' }}>SET</span>
                    {!isBW && (
                      editable ? (
                        <button
                          type="button"
                          onClick={() => toggleBw(exIdx, isBW)}
                          aria-label="Weighted. Tap to switch to body weight."
                          title="Tap for body weight"
                          style={headerToggleStyle}
                        >
                          {weightUnitLabel} ⇄
                        </button>
                      ) : (
                        <span>{weightUnitLabel}</span>
                      )
                    )}
                    {isBW ? (
                      editable ? (
                        <button
                          type="button"
                          onClick={() => toggleBw(exIdx, isBW)}
                          aria-label="Body weight. Tap to add weight."
                          title="Tap to add weight"
                          style={headerToggleStyle}
                        >
                          BW · REPS ⇄ {weightUnitLabel}
                        </button>
                      ) : (
                        <span>BW · REPS</span>
                      )
                    ) : (
                      <span>REPS</span>
                    )}
                    <span>DONE</span>
                  </div>

                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {entry.sets.map((set, setIdx) => {
                      const done = set.completed_at != null;
                      const isNext = isLive && setIdx === nextOpenIdx;
                      const prevWeight =
                        setIdx > 0 ? entry.sets[setIdx - 1].weight_kg ?? null : null;
                      const weightHint = isBW ? null : prevWeight ?? lastWeight;
                      const wKey = `${exIdx}-${setIdx}-w`;
                      const rKey = `${exIdx}-${setIdx}-r`;
                      return (
                        <li
                          key={setIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: gridCols,
                            gap: 'var(--space-2)',
                            alignItems: 'center',
                            borderRadius: 'var(--radius-compact)',
                            background: done ? 'var(--color-accent-subtle)' : 'transparent',
                            transition: 'background 150ms ease',
                          }}
                        >
                          <span
                            className="data"
                            style={{
                              textAlign: 'center',
                              fontWeight: isNext ? 700 : 400,
                              color: done
                                ? 'var(--color-text-display)'
                                : isNext
                                  ? 'var(--color-accent)'
                                  : 'var(--color-text-secondary)',
                            }}
                          >
                            {setIdx + 1}
                          </span>
                          {!isBW && (
                            <SetNumberField
                              ref={(el) => {
                                if (el) fieldRefs.current.set(wKey, el);
                                else fieldRefs.current.delete(wKey);
                              }}
                              kind="decimal"
                              value={set.weight_kg ?? null}
                              placeholder={weightHint != null ? String(weightHint) : '—'}
                              disabled={!editable}
                              done={done}
                              enterKeyHint="next"
                              onEnter={() => fieldRefs.current.get(rKey)?.focus()}
                              onValue={(v) => setWeight(exIdx, setIdx, v)}
                              ariaLabel={`Weight (${weightUnitLabel}) for set ${setIdx + 1}`}
                            />
                          )}
                          <SetNumberField
                            ref={(el) => {
                              if (el) fieldRefs.current.set(rKey, el);
                              else fieldRefs.current.delete(rKey);
                            }}
                            kind="int"
                            value={set.reps}
                            disabled={!editable}
                            done={done}
                            enterKeyHint="done"
                            onEnter={() => {
                              fieldRefs.current.get(rKey)?.blur();
                              if (!done) toggleSetComplete(exIdx, setIdx, weightHint);
                            }}
                            onValue={(v) => setReps(exIdx, setIdx, v)}
                            ariaLabel={`Reps for set ${setIdx + 1}`}
                          />
                          <button
                            type="button"
                            className="gym-check"
                            onClick={() => toggleSetComplete(exIdx, setIdx, weightHint)}
                            disabled={!editable}
                            aria-pressed={done}
                            aria-label={done ? `Un-mark set ${setIdx + 1}` : `Mark set ${setIdx + 1} complete`}
                            style={{
                              width: 52,
                              height: 48,
                              borderRadius: 'var(--radius-compact)',
                              background: done ? 'var(--color-accent)' : 'transparent',
                              border: `2px solid ${
                                done
                                  ? 'var(--color-accent)'
                                  : isNext
                                    ? 'var(--color-text-display)'
                                    : 'var(--color-border-visible)'
                              }`,
                              color: done
                                ? 'var(--color-text-display)'
                                : isNext
                                  ? 'var(--color-text-primary)'
                                  : 'var(--color-text-disabled)',
                              cursor: editable ? 'pointer' : 'default',
                              fontSize: 22,
                              fontWeight: 700,
                              lineHeight: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              touchAction: 'manipulation',
                              WebkitTapHighlightColor: 'transparent',
                              transition: 'transform 80ms ease, background 150ms ease',
                            }}
                          >
                            ✓
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {editable && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => addSetToEntry(exIdx)}
                        disabled={entry.sets.length >= SETS_MAX}
                        style={{ ...ghostButtonStyle, padding: '0 var(--space-4)' }}
                      >
                        + Set
                      </button>
                      {entry.sets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLastSet(exIdx)}
                          style={{
                            ...ghostButtonStyle,
                            padding: '0 var(--space-4)',
                            color: 'var(--color-text-secondary)',
                          }}
                          aria-label="Remove last set"
                        >
                          − Set
                        </button>
                      )}
                      <div style={{ flex: 1 }} />
                      {confirmRemoveExIdx === exIdx ? (
                        <>
                          <button
                            type="button"
                            onClick={() => removeExercise(exIdx)}
                            style={{
                              ...ghostButtonStyle,
                              padding: '0 var(--space-4)',
                              borderColor: 'var(--color-accent)',
                              color: 'var(--color-accent)',
                            }}
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveExIdx(null)}
                            style={{ ...ghostButtonStyle, padding: '0 var(--space-4)' }}
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveExIdx(exIdx)}
                          style={{
                            ...ghostButtonStyle,
                            padding: '0 var(--space-4)',
                            color: 'var(--color-text-secondary)',
                          }}
                          aria-label={`Remove ${entry.name}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}

                  {isFocused && allDone && focused != null && focused < entries.length - 1 && (
                    <button
                      type="button"
                      onClick={() => setFocusedExIndex(focused + 1)}
                      style={{ ...primaryButtonStyle, width: '100%' }}
                    >
                      Next: {entries[focused + 1].name} →
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
            <span style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center' }}>+ Add exercise</span>
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
                {ending ? 'Saving…' : 'Confirm end'}
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

const headerToggleStyle = {
  background: 'transparent',
  border: 0,
  padding: 0,
  minHeight: 24,
  color: 'var(--color-text-secondary)',
  font: 'inherit',
  letterSpacing: 'inherit',
  textTransform: 'inherit' as const,
  cursor: 'pointer',
  textDecoration: 'underline dotted',
  textUnderlineOffset: 3,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        background: 'transparent',
        border: '1px solid var(--color-border-visible)',
        color: 'var(--color-text-secondary)',
        borderRadius: 'var(--radius-compact)',
        width: 44,
        height: 44,
        padding: 0,
        fontSize: 16,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}

function SaveChip({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'idle') return null;
  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="label"
        style={{
          background: 'transparent',
          border: '1px solid var(--color-accent)',
          color: 'var(--color-accent)',
          borderRadius: 'var(--radius-button)',
          padding: '2px var(--space-2)',
          cursor: 'pointer',
        }}
      >
        Not saved · Retry
      </button>
    );
  }
  const saved = status === 'saved';
  return (
    <span
      className="label"
      role="status"
      style={{ color: saved ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)' }}
    >
      {saved ? '· Saved' : '· Saving…'}
    </span>
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
