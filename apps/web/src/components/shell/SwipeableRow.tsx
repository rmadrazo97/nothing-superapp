'use client';

/**
 * SwipeableRow — Nothing-OS style list row with swipe-to-reveal actions.
 *
 * A wrapper around any list item that adds:
 *   - Swipe-left (touch, mouse-drag, or pen) → slides the row left,
 *     revealing a right-anchored action panel. 40px commit threshold,
 *     snaps fully open at 80px.
 *   - Long-press (500ms) → same reveal + optional `navigator.vibrate(10)`
 *     haptic tick + `onLongPress` callback if provided.
 *   - Destructive actions → the row itself fades to 50% + strikethrough,
 *     an undo snackbar appears at the viewport bottom. If the user does
 *     nothing for 5s, the real `onSelect` fires. If they tap UNDO, the
 *     row restores.
 *   - Primary actions → fire `onSelect()` immediately, close the drawer.
 *   - `⋯` affordance icon at right edge (40% opacity at rest) — hints at
 *     the interaction without dominating the row.
 *   - Keyboard-only fallback — a visually-hidden `⋯` button (focus-visible
 *     restored) opens a dropdown with the same actions, so nothing sits
 *     behind an unreachable gesture.
 *   - Backdrop click / Escape / swipe-right → collapse.
 *
 * All state is local. Consumers only wire the actions + children.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSwipe } from '@/lib/hooks/useSwipe';
import { useLongPress } from '@/lib/hooks/useLongPress';
import { useUndoSnackbar } from './UndoSnackbar';

export interface SwipeAction {
  label: string;
  kind: 'primary' | 'destructive';
  onSelect: () => void;
  /** Optional pre-strike label shown in the undo snackbar. */
  undoLabel?: string;
}

export interface SwipeableRowProps {
  actions: SwipeAction[];
  /** Renders `⋯` at 40% opacity at the right edge when at rest. Default true. */
  showAffordance?: boolean;
  /** If provided, long-press also reveals actions (still runs your callback first). */
  onLongPress?: () => void;
  /** Ignored while a destructive action's undo window is active. */
  children: ReactNode;
  /** Optional aria-label for the row when actions are keyboard-driven. */
  ariaLabel?: string;
}

const PANEL_WIDTH = 120; // px — matches useSwipe.maxOffset & snap threshold

export function SwipeableRow({
  actions,
  showAffordance = true,
  onLongPress,
  children,
  ariaLabel,
}: SwipeableRowProps) {
  const { showUndo } = useUndoSnackbar();
  const menuId = useId();

  // "Pending destructive" state — while the undo window is live, the row
  // renders at 50% + strikethrough. We keep the row rendered so the layout
  // doesn't jump; on undo we clear this, on commit the parent removes us.
  const [pendingDestructive, setPendingDestructive] = useState(false);
  // Keyboard-only fallback menu.
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const swipe = useSwipe({
    commitThreshold: 40,
    snapOpenThreshold: 80,
    maxOffset: PANEL_WIDTH,
  });

  const revealAndBuzz = useCallback(() => {
    // Fire the caller's custom long-press hook first (rarely used).
    onLongPress?.();
    swipe.openLeft();
    // Best-effort haptic; ignore if unsupported (iOS Safari, etc.)
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
    } catch {
      /* haptic is a nicety; never a hard failure */
    }
  }, [onLongPress, swipe]);

  const longPress = useLongPress({
    onLongPress: revealAndBuzz,
    delay: 500,
    moveTolerance: 10,
    enabled: !pendingDestructive,
  });

  // Merge the two pointer handlers so both hooks see every event without
  // us stealing capture from either.
  const mergedPointerHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      swipe.handlers.onPointerDown(e);
      longPress.onPointerDown(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      swipe.handlers.onPointerMove(e);
      longPress.onPointerMove(e);
    },
    onPointerUp: (e: React.PointerEvent) => {
      swipe.handlers.onPointerUp(e);
      longPress.onPointerUp(e);
    },
    onPointerCancel: (e: React.PointerEvent) => {
      swipe.handlers.onPointerCancel(e);
      longPress.onPointerCancel(e);
    },
    onPointerLeave: longPress.onPointerLeave,
  };

  // Global "click outside / Escape" collapse while open.
  const isOpen = swipe.offsetX < 0;
  useEffect(() => {
    if (!isOpen && !menuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (rowRef.current && target && !rowRef.current.contains(target)) {
        swipe.close();
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        swipe.close();
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, menuOpen, swipe]);

  const runAction = useCallback(
    (action: SwipeAction) => {
      swipe.close();
      setMenuOpen(false);
      if (action.kind === 'destructive') {
        setPendingDestructive(true);
        showUndo({
          label: action.undoLabel ?? `${action.label}D`,
          onUndo: () => setPendingDestructive(false),
          onCommit: () => {
            // Fire the real destructive callback. We leave
            // `pendingDestructive` true because the row is about to
            // unmount anyway — clearing it would cause a flash of
            // full-opacity content before removal.
            action.onSelect();
          },
          duration: 5000,
        });
      } else {
        action.onSelect();
      }
    },
    [showUndo, swipe],
  );

  // Actions render right-to-left, so [Edit, Delete] shows Delete rightmost.
  // We reverse the array once at render so the leftmost DOM node is the
  // *last* logical action — matching how iOS + Nothing OS lay them out.
  const renderedActions = [...actions].reverse();

  return (
    <div
      ref={rowRef}
      className="nsa-swipeable-row"
      data-open={isOpen ? 'true' : 'false'}
      data-pending-destructive={pendingDestructive ? 'true' : 'false'}
      style={{
        position: 'relative',
        overflow: 'hidden',
        // Row wrapper reserves no extra height; child content dictates.
        touchAction: 'pan-y', // let vertical scroll through, we handle horizontal
      }}
    >
      {/* Action panel — sits behind the sliding content, revealed by swipe. */}
      <div
        aria-hidden={!isOpen}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          // Match snap width so the panel exactly matches the reveal.
          width: PANEL_WIDTH,
          // Fade panel in with the swipe distance for a softer reveal.
          opacity: Math.min(1, Math.abs(swipe.offsetX) / 40),
        }}
      >
        {renderedActions.map((action, i) => (
          <button
            key={`${action.label}-${i}`}
            type="button"
            tabIndex={isOpen ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              runAction(action);
            }}
            style={{
              flex: 1,
              border: 0,
              padding: 'var(--space-2)',
              background:
                action.kind === 'destructive'
                  ? 'var(--color-accent)'
                  : 'var(--color-surface-raised)',
              color:
                action.kind === 'destructive'
                  ? 'var(--color-text-display)'
                  : 'var(--color-text-primary)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-caption, 12px)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Sliding content layer. */}
      <div
        {...mergedPointerHandlers}
        style={{
          position: 'relative',
          transform: `translateX(${swipe.offsetX}px)`,
          transition: swipe.isSwiping
            ? 'none'
            : 'transform var(--dur-medium, 220ms) var(--ease-out)',
          background: 'var(--color-bg)',
          opacity: pendingDestructive ? 0.5 : 1,
          textDecoration: pendingDestructive ? 'line-through' : 'none',
          // Prevent the child pointer-events from stealing when destructive
          // — but keep them enabled otherwise so buttons inside still work.
          pointerEvents: pendingDestructive ? 'none' : 'auto',
        }}
      >
        {children}
        {showAffordance && !pendingDestructive && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: '50%',
              right: 'var(--space-3)',
              transform: 'translateY(-50%)',
              fontSize: 14,
              lineHeight: 1,
              color: 'var(--color-text-secondary)',
              opacity: isOpen ? 0 : 0.4,
              transition: 'opacity var(--dur-fast, 120ms) var(--ease-out)',
              pointerEvents: 'none',
            }}
          >
            ⋯
          </span>
        )}
      </div>

      {/* Keyboard-only fallback: a visually-hidden button that becomes visible
          on focus. Opens a dropdown of the same actions so keyboard users
          never lose functionality to a gesture-only affordance. */}
      <button
        type="button"
        aria-label={ariaLabel ? `${ariaLabel} actions` : 'Row actions'}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 24,
          height: 24,
          padding: 0,
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          border: 0,
          borderRadius: 'var(--radius-compact)',
          cursor: 'pointer',
          // Visually hidden until focused — the swipe affordance ⋯ is the
          // visual signal for mouse/touch users; this button is for AT.
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
        onFocus={(e) => {
          // Restore visibility on focus so a keyboard user can see it.
          const el = e.currentTarget;
          el.style.clip = 'auto';
          el.style.clipPath = 'none';
          el.style.overflow = 'visible';
          el.style.background = 'var(--color-surface-raised)';
          el.style.outline = '2px solid var(--color-accent)';
        }}
        onBlur={(e) => {
          const el = e.currentTarget;
          if (menuOpen) return; // stay visible if menu is up
          el.style.clip = 'rect(0 0 0 0)';
          el.style.clipPath = 'inset(50%)';
          el.style.overflow = 'hidden';
          el.style.background = 'transparent';
          el.style.outline = 'none';
        }}
      >
        ⋯
      </button>

      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          style={{
            position: 'absolute',
            top: 28,
            right: 4,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 140,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-compact)',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          }}
        >
          {actions.map((action, i) => (
            <button
              key={`menu-${action.label}-${i}`}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                runAction(action);
              }}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                background: 'transparent',
                border: 0,
                textAlign: 'left',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-caption, 12px)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color:
                  action.kind === 'destructive'
                    ? 'var(--color-accent)'
                    : 'var(--color-text-primary)',
                cursor: 'pointer',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
