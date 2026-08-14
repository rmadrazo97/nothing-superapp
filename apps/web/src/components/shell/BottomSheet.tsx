'use client';

/**
 * BottomSheet — mobile-first modal sheet that slides up from the bottom.
 *
 * Chrome:
 *   - Full-viewport dim scrim (tap to close).
 *   - Rounded top corners; body-scroll locked while open; safe-area top
 *     padding so the drag handle clears the notch on landscape.
 *   - Grabber pill at the top; touch-drag downward past ~80px closes,
 *     otherwise it springs back to its resting position.
 *   - Close button (×) top-right for keyboard/mouse users.
 *   - Escape closes.
 *
 * No spring library dependency — a couple of `transform` transitions and a
 * touchmove listener does the job. Zero hex codes; all values via
 * design-system tokens.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/mobile/body-scroll-lock';

const DRAG_CLOSE_PX = 80;

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Sheet header title. Kept short — small caps rendered. */
  title?: string;
  /** Optional aria-label; falls back to `title` or "Details". */
  ariaLabel?: string;
  children: ReactNode;
};

const BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1200,
  background: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
};

const SHEET_BASE_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 640,
  maxHeight: '92dvh',
  background: 'var(--color-surface)',
  borderTopLeftRadius: 'var(--radius-card)',
  borderTopRightRadius: 'var(--radius-card)',
  borderTop: '1px solid var(--color-border-visible)',
  boxShadow: '0 -12px 32px rgba(0, 0, 0, 0.55)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  willChange: 'transform',
};

const HANDLE_STYLE: CSSProperties = {
  width: 40,
  height: 4,
  borderRadius: 999,
  background: 'var(--color-border-visible)',
  margin: 'var(--space-2) auto var(--space-1)',
  flexShrink: 0,
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--space-3) var(--space-6) var(--space-3)',
  borderBottom: '1px solid var(--color-border)',
  flexShrink: 0,
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-display)',
};

const CLOSE_BTN_STYLE: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-border-visible)',
  color: 'var(--color-text-primary)',
  borderRadius: 'var(--radius-compact)',
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  lineHeight: 1,
  minWidth: 32,
  minHeight: 32,
};

const BODY_STYLE: CSSProperties = {
  padding:
    'var(--space-4) var(--space-6) calc(var(--space-6) + env(safe-area-inset-bottom))',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
};

export function BottomSheet({
  open,
  onClose,
  title,
  ariaLabel,
  children,
}: BottomSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const handler = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        evt.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Body-scroll lock (iOS-safe: position: fixed + restore scrollY).
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [open]);

  // Reset drag offset each time the sheet re-opens so a prior drag doesn't
  // leave it in a weird half-open state.
  useEffect(() => {
    if (open) setDragOffset(0);
  }, [open]);

  const handleBackdropClick = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      if (evt.target === evt.currentTarget) onClose();
    },
    [onClose],
  );

  const onTouchStart = useCallback((evt: TouchEvent<HTMLDivElement>) => {
    const t = evt.touches[0];
    if (!t) return;
    dragStartY.current = t.clientY;
  }, []);

  const onTouchMove = useCallback((evt: TouchEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const t = evt.touches[0];
    if (!t) return;
    const delta = t.clientY - dragStartY.current;
    // Only track downward drags — upward drags let the body scroll.
    if (delta > 0) setDragOffset(delta);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (dragStartY.current == null) return;
    const finalOffset = dragOffset;
    dragStartY.current = null;
    if (finalOffset > DRAG_CLOSE_PX) {
      onClose();
    } else {
      // Spring back to zero.
      setDragOffset(0);
    }
  }, [dragOffset, onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`@keyframes bottom-sheet-slide-in {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }`}</style>
      <div
        role="presentation"
        style={BACKDROP_STYLE}
        onClick={handleBackdropClick}
      >
        <aside
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel ?? title ?? 'Details'}
          style={{
            ...SHEET_BASE_STYLE,
            transform: `translateY(${dragOffset}px)`,
            transition: dragStartY.current
              ? 'none'
              : 'transform var(--dur-medium) var(--ease-out)',
            animation: `bottom-sheet-slide-in var(--dur-medium) var(--ease-out)`,
          }}
        >
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            // The handle + header react to touch-drag. The body doesn't so
            // users can freely scroll long content without accidentally
            // dismissing.
            style={{ flexShrink: 0 }}
          >
            <div style={HANDLE_STYLE} aria-hidden="true" />
            <header style={HEADER_STYLE}>
              <h2 style={TITLE_STYLE}>{(title ?? '').toUpperCase()}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={CLOSE_BTN_STYLE}
              >
                ×
              </button>
            </header>
          </div>
          <div style={BODY_STYLE}>{children}</div>
        </aside>
      </div>
    </>
  );
}
