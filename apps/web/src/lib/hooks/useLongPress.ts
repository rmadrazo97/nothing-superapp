'use client';

/**
 * useLongPress — 500ms press-and-hold detector using pointer events.
 *
 * Cancels the pending long-press if the pointer moves more than
 * `moveTolerance` pixels (default 10). This is deliberate: page-scroll
 * needs to win over long-press, and a user who starts a swipe should not
 * also fire the long-press action mid-drag.
 *
 * Returns spreadable pointer handlers so a component can compose this
 * with `useSwipe` on the same element.
 */
import { useCallback, useRef } from 'react';

export interface UseLongPressOptions {
  /** Fired when the pointer is held stationary for `delay` ms. */
  onLongPress: () => void;
  /** Hold time in ms (default 500). */
  delay?: number;
  /** Movement tolerance in px before we cancel (default 10). */
  moveTolerance?: number;
  /** If false, the hook is a no-op. Handy for conditionally disabling. */
  enabled?: boolean;
}

export function useLongPress(options: UseLongPressOptions) {
  const { onLongPress, delay = 500, moveTolerance = 10, enabled = true } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number; id: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      // Ignore secondary mouse buttons — right-click has its own menu.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      timerRef.current = setTimeout(() => {
        // Only fire if we're still tracking the same pointer.
        if (startRef.current && startRef.current.id === e.pointerId) {
          onLongPress();
        }
        timerRef.current = null;
      }, delay);
    },
    [enabled, delay, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current || startRef.current.id !== e.pointerId) return;
      const dx = Math.abs(e.clientX - startRef.current.x);
      const dy = Math.abs(e.clientY - startRef.current.y);
      if (dx > moveTolerance || dy > moveTolerance) clear();
    },
    [clear, moveTolerance],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current || startRef.current.id !== e.pointerId) return;
      clear();
    },
    [clear],
  );

  const onPointerCancel = onPointerUp;
  const onPointerLeave = onPointerUp;

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
  };
}
