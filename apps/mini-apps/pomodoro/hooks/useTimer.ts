'use client';

/**
 * useTimer — Date.now()-based countdown.
 *
 * Why not setInterval-decrement-a-counter? Because browsers throttle timers
 * in background tabs (Chrome clamps to 1s/min after ~5min, Safari clamps
 * even harder). A decrement-per-tick approach silently loses time. By
 * computing `remaining = endTs - Date.now()` on every tick, the timer
 * self-corrects even after a long tab-switch: when we come back we see
 * exactly how much time actually elapsed, not how many ticks fired.
 *
 * State model:
 *   - `endTs` (epoch ms) is the source of truth for a running timer.
 *   - `pausedRemainingMs` holds the remaining time while paused.
 *   - We tick once per animation frame (~250ms via setTimeout is enough for
 *     mm:ss display; RAF would burn battery for no visual benefit).
 *
 * Persistence:
 *   - `sessionStorage` mirror lets a page reload during a running session
 *     restore the same `endTs`. Kept in sessionStorage (NOT localStorage)
 *     so closing the tab ends the session cleanly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'nothing:pomodoro:timer';

type StoredState = {
  endTs: number | null;
  pausedRemainingMs: number | null;
  totalMs: number;
};

export type TimerState = {
  /** Remaining milliseconds; recomputed every tick. */
  remainingMs: number;
  /** True while the timer is actively counting down. */
  running: boolean;
  /** Total length of the current session, in ms. */
  totalMs: number;
  /** 0..1 progress toward completion (1 = finished). */
  progress: number;
  /** True the moment `remainingMs` hits zero for a running timer. */
  finished: boolean;
};

export type TimerControls = {
  /** Start (or resume) counting down `durationMs` from the current instant. */
  start: (durationMs?: number) => void;
  /** Pause — keep remaining time, stop the tick. */
  pause: () => void;
  /** Resume a paused timer. */
  resume: () => void;
  /** Wipe everything back to `initialDurationMs`. */
  reset: (nextDurationMs?: number) => void;
  /** Manually mark the current session finished (used on Skip). */
  complete: () => void;
};

function loadStored(): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (
      typeof parsed.totalMs !== 'number' ||
      (parsed.endTs != null && typeof parsed.endTs !== 'number') ||
      (parsed.pausedRemainingMs != null && typeof parsed.pausedRemainingMs !== 'number')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(s: StoredState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // sessionStorage may be unavailable (Safari private mode, quota). Not
    // fatal — the in-memory state still works, we just can't survive reloads.
  }
}

function clearStored(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * `initialDurationMs` is only used to seed the first render; caller can
 * override on start().
 */
export function useTimer(initialDurationMs: number): [TimerState, TimerControls] {
  // We store endTs (running) OR pausedRemainingMs (paused) in refs so the
  // tick loop can read the latest value without re-subscribing.
  const endTsRef = useRef<number | null>(null);
  const pausedRef = useRef<number | null>(null);
  const totalRef = useRef<number>(initialDurationMs);

  // Purely for rendering — a monotonic counter that bumps every tick to
  // force a re-render. `remainingMs` is re-derived on each render from
  // Date.now() + endTsRef, so React never sees stale state.
  const [, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  // On mount, restore any in-flight session from sessionStorage. This is
  // what makes an accidental reload not lose the user's focus block.
  useEffect(() => {
    const stored = loadStored();
    if (!stored) return;
    totalRef.current = stored.totalMs || initialDurationMs;
    if (stored.endTs != null) {
      // Was running when the tab was reloaded/backgrounded.
      if (stored.endTs > Date.now()) {
        endTsRef.current = stored.endTs;
        setRunning(true);
      } else {
        // Finished while we were away — surface it so the parent can
        // advance the phase + log the session.
        endTsRef.current = null;
        setFinished(true);
      }
    } else if (stored.pausedRemainingMs != null) {
      pausedRef.current = stored.pausedRemainingMs;
    }
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick loop — runs only while `running` is true.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const end = endTsRef.current;
      if (end == null) return;
      const now = Date.now();
      if (now >= end) {
        endTsRef.current = null;
        setRunning(false);
        setFinished(true);
        clearStored();
        setTick((t) => t + 1);
        return;
      }
      setTick((t) => t + 1);
      // 250ms is the sweet spot: mm:ss only updates every 1s so we don't
      // need faster, but a 1s interval risks visible skipping on the ring.
      window.setTimeout(tick, 250);
    }

    // Kick off immediately so the first frame after start() is fresh.
    tick();
    return () => {
      cancelled = true;
    };
  }, [running]);

  const start = useCallback((durationMs?: number) => {
    const dur = durationMs ?? totalRef.current ?? initialDurationMs;
    totalRef.current = dur;
    endTsRef.current = Date.now() + dur;
    pausedRef.current = null;
    setFinished(false);
    setRunning(true);
    saveStored({ endTs: endTsRef.current, pausedRemainingMs: null, totalMs: dur });
  }, [initialDurationMs]);

  const pause = useCallback(() => {
    const end = endTsRef.current;
    if (end == null) return;
    const remaining = Math.max(0, end - Date.now());
    pausedRef.current = remaining;
    endTsRef.current = null;
    setRunning(false);
    saveStored({ endTs: null, pausedRemainingMs: remaining, totalMs: totalRef.current });
  }, []);

  const resume = useCallback(() => {
    const paused = pausedRef.current;
    if (paused == null || paused <= 0) return;
    endTsRef.current = Date.now() + paused;
    pausedRef.current = null;
    setFinished(false);
    setRunning(true);
    saveStored({ endTs: endTsRef.current, pausedRemainingMs: null, totalMs: totalRef.current });
  }, []);

  const reset = useCallback((nextDurationMs?: number) => {
    const dur = nextDurationMs ?? totalRef.current ?? initialDurationMs;
    totalRef.current = dur;
    endTsRef.current = null;
    pausedRef.current = null;
    setRunning(false);
    setFinished(false);
    clearStored();
  }, [initialDurationMs]);

  const complete = useCallback(() => {
    endTsRef.current = null;
    pausedRef.current = null;
    setRunning(false);
    setFinished(true);
    clearStored();
  }, []);

  // Derive display state on every render — always current, never stale.
  const remainingMs = (() => {
    const end = endTsRef.current;
    if (end != null) return Math.max(0, end - Date.now());
    if (pausedRef.current != null) return pausedRef.current;
    return totalRef.current;
  })();

  const total = totalRef.current || 1;
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / total));

  return [
    { remainingMs, running, totalMs: total, progress, finished },
    { start, pause, resume, reset, complete },
  ];
}

/** Format ms as `mm:ss` — never negative, always two-digit each part. */
export function formatMmSs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(clamped / 60);
  const ss = clamped % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
