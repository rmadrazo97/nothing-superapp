'use client';

/**
 * Pomodoro — main mini-app page.
 *
 * Two views inside a single client component:
 *   1. TIMER   — huge Doto mm:ss countdown inside a cadmium-red ring,
 *                phase label above ("FOCUS" / "BREAK" / "LONG BREAK"),
 *                Start/Pause/Resume + Skip/Reset below, dot streak
 *                showing pomodoros-until-long-break.
 *   2. HISTORY — last 7 days of completed pomodoros grouped by day.
 *
 * Timer accuracy: everything is Date.now()-based. `useTimer()` computes
 * `remainingMs = endTs - Date.now()` on every render, and mirrors the
 * running session to sessionStorage so a reload restores it. This means
 * the timer stays accurate across tab-switch, sleep, and reload — the
 * classic "setInterval decrement drifts in background tabs" bug is
 * impossible by construction.
 *
 * Settings: stored per-user in localStorage (keyed on user.id). The
 * prompt suggested `preferences.pomodoro` jsonb, but adding a column to
 * the shared preferences table + threading it through the harness
 * layout would blast well past the mini-app boundary. localStorage is
 * durable enough for v1 and the wire is easy to swap later without any
 * DB migration.
 *
 * All data flows through `/api/mini-apps/pomodoro/sessions` (auth-gated
 * + entitlement-gated). The page never talks to Supabase directly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@nothing/mini-apps-runtime';
// Relative reach into the host app — same module instance as the shell's
// <ToastProvider>, so we push into the same visible container.
import { useToast } from '../../web/src/lib/toast/context';
import type { PomodoroSession } from '@nothing/shared';
import { TimerRing, type RingTone } from './components/TimerRing.tsx';
import { PhaseLabel } from './components/PhaseLabel.tsx';
import { ControlBar } from './components/ControlBar.tsx';
import { DotStreak } from './components/DotStreak.tsx';
import { SettingsDrawer } from './components/SettingsDrawer.tsx';
import { History } from './components/History.tsx';
import { formatMmSs, useTimer } from './hooks/useTimer.ts';
import { useBeep } from './hooks/useBeep.ts';
import {
  advancePhase,
  DEFAULT_SETTINGS,
  durationMsFor,
  loadCycle,
  loadSettings,
  saveCycle,
  saveSettings,
  type Phase,
  type Settings,
} from './lib/phase.ts';

type View = 'timer' | 'history';

export default function PomodoroPage() {
  const user = useUser();

  // ─── Settings (persistent, per-user) ──────────────────────────────
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View>('timer');
  const [sessions, setSessions] = useState<PomodoroSession[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Client-only: read persisted settings + cycle position on mount.
    setSettings(loadSettings(user.id));
    setCycle(loadCycle(user.id));
  }, [user.id]);

  // ─── Cycle state (which phase, how many work sessions this cycle) ─
  const [cycle, setCycle] = useState(() => ({
    currentPhase: 'work' as Phase,
    workCompletedInCycle: 0,
  }));

  useEffect(() => {
    saveCycle(user.id, cycle);
  }, [user.id, cycle]);

  // ─── Timer ────────────────────────────────────────────────────────
  const initialDur = durationMsFor(cycle.currentPhase, settings);
  const [timerState, controls] = useTimer(initialDur);
  const { play: playBeep } = useBeep();

  // ─── Load session history ─────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/mini-apps/pomodoro/sessions', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        if (res.status === 402) {
          setLoadError('Subscription required. Refresh to renew.');
          toast.info("This one's paid. Subscribe on the paywall.");
        } else if (res.status === 401) {
          // Inline banner — proxy handles the redirect.
          setLoadError('Session expired. Sign in again.');
        } else if (res.status >= 500) {
          setLoadError('Could not load history.');
          toast.error("Something broke on our end. We're logging it.");
        } else {
          setLoadError('Could not load history.');
          toast.error('Could not load history.');
        }
        setSessions([]);
        return;
      }
      const body = (await res.json()) as { sessions: PomodoroSession[] };
      setSessions(body.sessions);
    } catch {
      setLoadError('Network error.');
      toast.error("Can't reach the server. Check your connection.");
      setSessions([]);
    }
  }, [toast]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // ─── Log a completed (or aborted) session ─────────────────────────
  const logSession = useCallback(
    async (
      phase: Phase,
      plannedSeconds: number,
      actualSeconds: number,
      completed: boolean,
      startedAt: Date,
    ) => {
      try {
        await fetch('/api/mini-apps/pomodoro/sessions', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            phase,
            planned_duration_seconds: plannedSeconds,
            actual_duration_seconds: actualSeconds,
            completed,
            started_at: startedAt.toISOString(),
            ended_at: new Date().toISOString(),
          }),
        });
        // Re-load in the background so the History view stays fresh.
        void loadSessions();
      } catch {
        // Silently drop — the timer UX shouldn't hiccup if the log write
        // fails. We'll retry on the next session naturally.
      }
    },
    [loadSessions],
  );

  // Track when the current session started so we can compute actual
  // duration + started_at for the log write.
  const sessionStartRef = useRef<Date | null>(null);

  // ─── Phase transition ─────────────────────────────────────────────
  const advance = useCallback(
    (autoStart: boolean) => {
      const next = advancePhase(cycle, settings);
      setCycle(next);
      const nextDur = durationMsFor(next.currentPhase, settings);
      if (autoStart) {
        sessionStartRef.current = new Date();
        controls.start(nextDur);
      } else {
        sessionStartRef.current = null;
        controls.reset(nextDur);
      }
    },
    [cycle, settings, controls],
  );

  // Natural completion handler — fires exactly once per finished session.
  const lastLoggedFinishAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!timerState.finished) return;
    // De-dupe: React can re-run this effect if state churns.
    const now = Date.now();
    if (lastLoggedFinishAtRef.current && now - lastLoggedFinishAtRef.current < 1000) return;
    lastLoggedFinishAtRef.current = now;

    if (settings.soundEnabled) playBeep();

    const startedAt = sessionStartRef.current ?? new Date(now - timerState.totalMs);
    const plannedSec = Math.round(timerState.totalMs / 1000);
    void logSession(cycle.currentPhase, plannedSec, plannedSec, true, startedAt);

    // Auto-advance to next phase but do NOT auto-start — Nothing OS
    // preference is "the machine waits for you".
    advance(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState.finished]);

  // ─── Body-scroll lock while a work session is running ─────────────
  useEffect(() => {
    const shouldLock = timerState.running;
    if (!shouldLock) return;
    document.body.classList.add('no-scroll');
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, [timerState.running]);

  // ─── Controls wiring ──────────────────────────────────────────────
  const onStart = useCallback(() => {
    sessionStartRef.current = new Date();
    controls.start(durationMsFor(cycle.currentPhase, settings));
  }, [controls, cycle.currentPhase, settings]);

  const onSkip = useCallback(() => {
    // Log the partial session (uncompleted) if the user was mid-way.
    const startedAt = sessionStartRef.current;
    if (startedAt) {
      const plannedSec = Math.round(durationMsFor(cycle.currentPhase, settings) / 1000);
      const actualSec = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));
      void logSession(cycle.currentPhase, plannedSec, actualSec, false, startedAt);
    }
    controls.complete();
    advance(false);
  }, [advance, controls, cycle.currentPhase, logSession, settings]);

  const onReset = useCallback(() => {
    // Reset drops the current session on the floor without logging — the
    // user is saying "throw this away, back to a fresh start".
    controls.reset(durationMsFor(cycle.currentPhase, settings));
    sessionStartRef.current = null;
  }, [controls, cycle.currentPhase, settings]);

  const controlKind: 'idle' | 'running' | 'paused' = timerState.running
    ? 'running'
    : timerState.remainingMs < timerState.totalMs && timerState.remainingMs > 0
      ? 'paused'
      : 'idle';

  const ringTone: RingTone = timerState.running
    ? cycle.currentPhase === 'work'
      ? 'work'
      : 'break'
    : 'idle';

  // Save settings + reset the timer if the current phase duration changed.
  const onSaveSettings = useCallback(
    (s: Settings) => {
      setSettings(s);
      saveSettings(user.id, s);
      setSettingsOpen(false);
      // Only reset the timer if we're idle — never yank a running session.
      if (!timerState.running) {
        controls.reset(durationMsFor(cycle.currentPhase, s));
      }
    },
    [user.id, timerState.running, controls, cycle.currentPhase],
  );

  const todayWorkCompleted = useMemo(() => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return (sessions ?? []).filter((s) => {
      if (s.phase !== 'work' || !s.completed) return false;
      const d = new Date(s.started_at);
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dk === key;
    }).length;
  }, [sessions]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-12)',
      }}
    >
      <Header
        view={view}
        onChangeView={setView}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {loadError && (
        <div
          role="alert"
          className="caption"
          style={{
            color: 'var(--color-accent)',
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          {loadError}
        </div>
      )}

      {view === 'timer' && (
        <TimerView
          phase={cycle.currentPhase}
          running={timerState.running}
          remainingMs={timerState.remainingMs}
          progress={timerState.progress}
          ringTone={ringTone}
          controlKind={controlKind}
          onStart={onStart}
          onPause={controls.pause}
          onResume={controls.resume}
          onSkip={onSkip}
          onReset={onReset}
          workCompleted={cycle.workCompletedInCycle}
          pomodorosPerCycle={settings.pomodorosPerCycle}
          todayCount={todayWorkCompleted}
        />
      )}

      {view === 'history' && (
        <History sessions={sessions ?? []} loading={sessions === null} />
      )}

      <SettingsDrawer
        open={settingsOpen}
        initial={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
      />
    </div>
  );
}

// ─── Header + tabs + gear ─────────────────────────────────────────────

function Header({
  view,
  onChangeView,
  onOpenSettings,
}: {
  view: View;
  onChangeView: (v: View) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">POMODORO</span>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-button)',
            width: 32,
            height: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ⚙
        </button>
      </div>
      <div
        role="tablist"
        aria-label="Pomodoro views"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <TabButton active={view === 'timer'} onClick={() => onChangeView('timer')}>
          Timer
        </TabButton>
        <TabButton active={view === 'history'} onClick={() => onChangeView('history')}>
          History
        </TabButton>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 0,
        borderBottom: active
          ? '2px solid var(--color-text-display)'
          : '2px solid transparent',
        color: active ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
        padding: 'var(--space-2) var(--space-3)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ─── Timer view ───────────────────────────────────────────────────────

function TimerView({
  phase,
  running,
  remainingMs,
  progress,
  ringTone,
  controlKind,
  onStart,
  onPause,
  onResume,
  onSkip,
  onReset,
  workCompleted,
  pomodorosPerCycle,
  todayCount,
}: {
  phase: Phase;
  running: boolean;
  remainingMs: number;
  progress: number;
  ringTone: RingTone;
  controlKind: 'idle' | 'running' | 'paused';
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onReset: () => void;
  workCompleted: number;
  pomodorosPerCycle: number;
  todayCount: number;
}) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-6)',
        padding: 'var(--space-6) var(--space-4)',
      }}
    >
      <PhaseLabel phase={phase} running={running} />

      <TimerRing progress={progress} tone={ringTone} size={300} strokeWidth={4}>
        <span
          className="display-xl"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 'var(--font-display-weight)',
            fontSize: 72,
            color: 'var(--color-text-display)',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
          aria-live="polite"
          aria-atomic="true"
        >
          {formatMmSs(remainingMs)}
        </span>
      </TimerRing>

      <ControlBar
        kind={controlKind}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onSkip={onSkip}
        onReset={onReset}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <DotStreak completed={workCompleted} total={pomodorosPerCycle} />
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
          }}
        >
          {todayCount} TODAY
        </span>
      </div>
    </section>
  );
}
