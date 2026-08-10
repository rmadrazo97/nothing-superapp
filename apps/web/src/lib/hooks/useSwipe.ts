'use client';

/**
 * useSwipe — pointer-event driven horizontal drag hook.
 *
 * Handles the low-level bookkeeping for `<SwipeableRow>`: tracks the
 * pointerdown → pointermove → pointerup lifecycle, computes an `offsetX`
 * (clamped to [-maxOffset, 0] so rows only reveal the right-side action
 * panel, not scroll off both sides), and reports whether the drag was
 * committed past `commitThreshold` on release.
 *
 * Pointer events (not touch-only) so the same code works with a mouse in
 * desktop QA and with a finger in the simulator.
 *
 * Vertical intent detection: if the first ~10px of movement is dominantly
 * vertical (page-scroll wins), we abort the swipe so users can scroll a
 * list without every row twitching sideways. Once we've committed to a
 * horizontal drag, we `setPointerCapture` + `preventDefault` on the
 * pointermove so the browser doesn't hijack the gesture.
 */
import { useCallback, useRef, useState } from 'react';

export interface UseSwipeOptions {
  /** Minimum |dx| in px to consider a real horizontal swipe (default 40). */
  commitThreshold?: number;
  /** Distance past which the row snaps fully open on release (default 80). */
  snapOpenThreshold?: number;
  /** Maximum reveal distance in px (also caps `offsetX`). Default 120. */
  maxOffset?: number;
  /** Fired when a horizontal swipe committed left past the snap threshold. */
  onCommitLeft?: () => void;
  /** Fired when the user released before committing OR swiped right. */
  onCommitClose?: () => void;
}

export interface UseSwipeReturn {
  /** Current signed horizontal offset in px; ≤ 0 for a left-reveal. */
  offsetX: number;
  /** True while a real horizontal drag is in progress. */
  isSwiping: boolean;
  /**
   * Bind to the swipeable element. Uses pointer events so the same
   * handlers cover mouse + touch + pen.
   */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  /** Programmatically snap open (e.g. from a long-press). */
  openLeft: () => void;
  /** Programmatically collapse to rest. */
  close: () => void;
}

export function useSwipe(options: UseSwipeOptions = {}): UseSwipeReturn {
  const {
    commitThreshold = 40,
    snapOpenThreshold = 80,
    maxOffset = 120,
    onCommitLeft,
    onCommitClose,
  } = options;

  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // Refs avoid re-renders during the pointermove hot loop.
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const activeIdRef = useRef<number | null>(null);
  // 'undecided' → we're still in the axis-lock deadband
  // 'horizontal' → committed to swipe
  // 'vertical'   → yielded to page scroll; ignore until pointerup
  const axisRef = useRef<'undecided' | 'horizontal' | 'vertical'>('undecided');
  const openStateRef = useRef<'closed' | 'open'>('closed');

  const openLeft = useCallback(() => {
    setOffsetX(-snapOpenThreshold);
    openStateRef.current = 'open';
  }, [snapOpenThreshold]);

  const close = useCallback(() => {
    setOffsetX(0);
    openStateRef.current = 'closed';
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only primary button for mouse; touch/pen always pass.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activeIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    axisRef.current = 'undecided';
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (activeIdRef.current !== e.pointerId) return;
      const dx = e.clientX - startXRef.current;
      const dy = e.clientY - startYRef.current;

      if (axisRef.current === 'undecided') {
        // 8px deadband — enough to distinguish taps from drags without
        // stealing scroll intent.
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          axisRef.current = 'vertical';
          return;
        }
        axisRef.current = 'horizontal';
        setIsSwiping(true);
        // Once we own the gesture, capture so the pointer keeps reporting
        // even if it slides off the element.
        try {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        } catch {
          /* older browsers may throw — safe to ignore */
        }
      }

      if (axisRef.current !== 'horizontal') return;

      // Anchor to the open state so a partial re-close feels natural.
      const anchor = openStateRef.current === 'open' ? -snapOpenThreshold : 0;
      const next = Math.max(-maxOffset, Math.min(0, anchor + dx));
      setOffsetX(next);
    },
    [maxOffset, snapOpenThreshold],
  );

  const finish = useCallback(
    (e: React.PointerEvent) => {
      if (activeIdRef.current !== e.pointerId) return;
      const wasHorizontal = axisRef.current === 'horizontal';
      activeIdRef.current = null;
      axisRef.current = 'undecided';
      setIsSwiping(false);

      if (!wasHorizontal) return;

      // Decision: open if past snap, close otherwise. `commitThreshold`
      // is the minimum to even consider a state change from closed.
      if (offsetX <= -snapOpenThreshold) {
        setOffsetX(-snapOpenThreshold);
        openStateRef.current = 'open';
        onCommitLeft?.();
      } else if (offsetX <= -commitThreshold && openStateRef.current === 'closed') {
        // Committed past 40 but not the full 80 — still snap open so the
        // user sees the reveal without needing a big drag.
        setOffsetX(-snapOpenThreshold);
        openStateRef.current = 'open';
        onCommitLeft?.();
      } else {
        setOffsetX(0);
        openStateRef.current = 'closed';
        onCommitClose?.();
      }
    },
    [commitThreshold, offsetX, onCommitClose, onCommitLeft, snapOpenThreshold],
  );

  return {
    offsetX,
    isSwiping,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
    openLeft,
    close,
  };
}
