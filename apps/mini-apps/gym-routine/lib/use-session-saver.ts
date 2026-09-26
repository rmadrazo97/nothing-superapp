'use client';

/**
 * useSessionSaver — serialized, latest-wins autosave for a live session.
 *
 * Why (v0.6.3): the logger used to PATCH on every blur/toggle in parallel
 * and then replace local `entries` with each server response. Two bugs fell
 * out of that:
 *   1. A slow response for set 1 landed while the user was typing set 2 and
 *      overwrote the half-typed value — "I have to fill it in twice".
 *   2. The ✓ button was `disabled={saving}`. Tapping ✓ while a reps field
 *      was focused blurred it → save started → button disabled before the
 *      click landed → tap swallowed.
 *
 * Now local state is the single source of truth. This hook only ships
 * snapshots to the server: at most one request in flight, newer snapshots
 * coalesce into the next request, failures keep the snapshot and retry
 * (network / 5xx / 429) so nothing typed is ever dropped. Pending edits are
 * flushed with `keepalive` when the page is hidden (PWA backgrounded,
 * phone locked, tab switched).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionEntry } from '@nothing/shared';
import * as api from './api.ts';
import { ApiError } from './api.ts';
import { sanitizeEntries } from './set-input.ts';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 600;
const RETRY_MS = 4000;

function isRetryable(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true; // network failure
  return e.status >= 500 || e.status === 408 || e.status === 429;
}

export function useSessionSaver(
  sessionId: string,
  onError: (e: unknown) => void,
) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const pendingRef = useRef<SessionEntry[] | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only toast once per failure streak — retries shouldn't spam.
  const erroredRef = useRef(false);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const clearTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Declared via ref so the retry timer / finally-block can re-enter it
  // without a stale-closure dance.
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const drain = useCallback(async () => {
    while (pendingRef.current) {
      const snapshot = pendingRef.current;
      pendingRef.current = null;
      setStatus('saving');
      try {
        await api.updateSession(sessionId, { entries: sanitizeEntries(snapshot) });
        erroredRef.current = false;
      } catch (e) {
        // Keep the newest snapshot — a newer edit may have arrived mid-flight.
        if (!pendingRef.current) pendingRef.current = snapshot;
        setStatus('error');
        if (!erroredRef.current) {
          erroredRef.current = true;
          onErrorRef.current(e);
        }
        if (isRetryable(e)) {
          clearTimer();
          timerRef.current = setTimeout(() => void flushRef.current(), RETRY_MS);
        }
        return;
      }
    }
    setStatus('saved');
  }, [sessionId]);

  const flush = useCallback((): Promise<void> => {
    clearTimer();
    if (inflightRef.current) return inflightRef.current;
    if (!pendingRef.current) return Promise.resolve();
    const p = drain().finally(() => {
      inflightRef.current = null;
      // An edit that arrived between the loop's last check and here.
      if (pendingRef.current && !erroredRef.current) void flushRef.current();
    });
    inflightRef.current = p;
    return p;
  }, [drain]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  /** Queue a snapshot. `immediate` skips the debounce (✓ taps, add/remove). */
  const save = useCallback(
    (entries: SessionEntry[], opts?: { immediate?: boolean }) => {
      pendingRef.current = entries;
      if (!inflightRef.current) setStatus('pending');
      clearTimer();
      if (opts?.immediate) {
        void flush();
      } else {
        timerRef.current = setTimeout(() => void flush(), DEBOUNCE_MS);
      }
    },
    [flush],
  );

  /**
   * Wait until everything queued has reached the server. Throws if a save
   * fails, so callers (End session) can refuse to navigate away.
   */
  const flushAll = useCallback(async () => {
    erroredRef.current = false;
    for (let i = 0; i < 5; i++) {
      if (!pendingRef.current && !inflightRef.current) return;
      await flush();
      if (erroredRef.current) break;
    }
    if (pendingRef.current) throw new Error('unsaved_changes');
  }, [flush]);

  /** Manual retry from the "Not saved · Retry" chip. */
  const retry = useCallback(() => {
    erroredRef.current = false;
    void flush();
  }, [flush]);

  // Page hidden / unloading → push whatever is pending with keepalive.
  // Unmount (in-app navigation) → normal flush; fetch outlives the component.
  useEffect(() => {
    const onHide = (ev: Event) => {
      if (ev.type === 'visibilitychange' && document.visibilityState !== 'hidden') {
        // Back in the foreground — make sure the keepalive copy (or a
        // retry that was waiting) actually landed. PATCH is idempotent.
        if (pendingRef.current) void flushRef.current();
        return;
      }
      if (!pendingRef.current) return;
      clearTimer();
      api.updateSessionKeepalive(sessionId, {
        entries: sanitizeEntries(pendingRef.current),
      });
    };
    const onOnline = () => {
      if (pendingRef.current) void flushRef.current();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('online', onOnline);
      if (pendingRef.current) void flushRef.current();
      clearTimer();
    };
  }, [sessionId]);

  return { status, save, flushAll, retry };
}
