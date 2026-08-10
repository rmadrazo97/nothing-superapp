'use client';

/**
 * useMiniAppSettings<T> — one-line hook every mini-app settings panel
 * uses to read + write its slice of `mini_app_settings`.
 *
 *   const { settings, updateSettings, isLoading, error } =
 *     useMiniAppSettings<GymSettings>('gym-routine', DEFAULTS);
 *
 * Behavior:
 *   - On mount, GETs /api/mini-app-settings/[slug] once. Missing row
 *     resolves to `{}` on the server; missing keys fall back to defaults
 *     provided here.
 *   - `updateSettings(patch)` is optimistic + debounced. The local state
 *     shallow-merges immediately (so the UI is snappy); the PATCH fires
 *     300ms after the last call so a burst of edits collapses into one
 *     network round-trip.
 *   - `isLoading` is true only during the initial fetch. Debounced writes
 *     don't show a loading flag — the shape is "always show current".
 *   - `error` surfaces the last GET or PATCH failure. Non-fatal — a
 *     failed save just keeps the local optimistic value; the next
 *     successful save covers for it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 300;

export type UseMiniAppSettings<T> = {
  settings: T;
  updateSettings: (patch: Partial<T>) => void;
  isLoading: boolean;
  error: string | null;
};

type FlushRef<T> = {
  timeout: ReturnType<typeof setTimeout> | null;
  pending: Partial<T>;
};

export function useMiniAppSettings<T extends Record<string, unknown>>(
  slug: string,
  defaults: T,
): UseMiniAppSettings<T> {
  const [settings, setSettings] = useState<T>(defaults);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Track the latest defaults so we don't accidentally re-hydrate from a
  // stale closure if the caller passes a new object every render.
  const defaultsRef = useRef<T>(defaults);
  defaultsRef.current = defaults;

  const flushRef = useRef<FlushRef<T>>({ timeout: null, pending: {} });

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/mini-app-settings/${encodeURIComponent(slug)}`,
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
          },
        );
        if (!res.ok) {
          if (res.status === 401) {
            // Not signed in — leave defaults in place, don't shout.
            if (!cancelled) setError(null);
            return;
          }
          throw new Error(`load_${res.status}`);
        }
        const body = (await res.json()) as {
          settings?: Partial<T> | null;
        };
        if (cancelled) return;
        const stored = body.settings ?? {};
        setSettings({ ...defaultsRef.current, ...stored });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'load_failed');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally exclude `defaults` — the ref covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Flush pending patch to the server.
  const flush = useCallback(async () => {
    const patch = flushRef.current.pending;
    flushRef.current = { timeout: null, pending: {} };
    if (Object.keys(patch).length === 0) return;
    try {
      const res = await fetch(
        `/api/mini-app-settings/${encodeURIComponent(slug)}`,
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) throw new Error(`save_${res.status}`);
      // Server returns merged blob — trust it as source of truth so a
      // second tab's changes don't get silently overwritten forever.
      const body = (await res.json()) as { settings?: Partial<T> | null };
      const stored = body.settings ?? {};
      setSettings((prev) => ({ ...prev, ...stored }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save_failed');
    }
  }, [slug]);

  const updateSettings = useCallback(
    (patch: Partial<T>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      flushRef.current.pending = { ...flushRef.current.pending, ...patch };
      if (flushRef.current.timeout) clearTimeout(flushRef.current.timeout);
      flushRef.current.timeout = setTimeout(() => {
        void flush();
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  // Flush on unmount so a fast close-after-toggle doesn't lose the patch.
  useEffect(() => {
    return () => {
      if (flushRef.current.timeout) {
        clearTimeout(flushRef.current.timeout);
        flushRef.current.timeout = null;
        void flush();
      }
    };
  }, [flush]);

  return { settings, updateSettings, isLoading, error };
}
