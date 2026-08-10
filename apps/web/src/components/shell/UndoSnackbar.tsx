'use client';

/**
 * UndoSnackbar — imperative snackbar with a 5s undo window.
 *
 * Contract: `showUndo({ label, onUndo, onCommit, duration })` shows a
 * bottom-of-viewport snackbar reading `LABEL · UNDO` (UNDO styled as a
 * link). Two possible outcomes:
 *
 *   1. User taps UNDO within `duration` ms → `onUndo()` runs, `onCommit`
 *      is NEVER called, snackbar dismisses.
 *   2. Timer expires → `onCommit()` runs (this is the "actually delete"
 *      moment) and the snackbar dismisses.
 *
 * The snackbar is rendered via a Portal appended to `document.body` so it
 * sits above every mini-app + drawer without needing z-index gymnastics.
 * Multiple concurrent undos stack vertically, newest at bottom.
 *
 * The Provider is safe to mount at the app-root layout. `useUndoSnackbar()`
 * outside the Provider throws — this is intentional; unlike toasts, an
 * un-provided undo would silently swallow destructive intent.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export interface ShowUndoOptions {
  /** Uppercase label ("MEAL DELETED", "CHAT DELETED"). */
  label: string;
  /** Called if the user taps UNDO within `duration`. */
  onUndo: () => void;
  /** Called if the user does nothing; fires the real destructive action. */
  onCommit: () => void;
  /** Time before commit fires, in ms. Default 5000. */
  duration?: number;
}

interface SnackbarItem {
  id: string;
  label: string;
  onUndo: () => void;
  onCommit: () => void;
  duration: number;
  /** ms remaining until commit; drives the progress bar. */
  expiresAt: number;
}

interface UndoSnackbarContextValue {
  showUndo: (opts: ShowUndoOptions) => void;
}

const UndoSnackbarContext = createContext<UndoSnackbarContextValue | null>(null);

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `undo-${idCounter}-${Date.now()}`;
}

export function UndoSnackbarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SnackbarItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [mounted, setMounted] = useState(false);

  // Portal target only exists client-side.
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const showUndo = useCallback(
    ({ label, onUndo, onCommit, duration = 5000 }: ShowUndoOptions) => {
      const id = nextId();
      const item: SnackbarItem = {
        id,
        label,
        onUndo,
        onCommit,
        duration,
        expiresAt: Date.now() + duration,
      };
      setItems((prev) => [...prev, item]);
      const timer = setTimeout(() => {
        // Commit path — remove from list first so consumer callback can
        // safely re-render the list.
        setItems((prev) => prev.filter((it) => it.id !== id));
        timersRef.current.delete(id);
        try {
          onCommit();
        } catch {
          /* consumer callback errors must not break the snackbar */
        }
      }, duration);
      timersRef.current.set(id, timer);
    },
    [],
  );

  const handleUndo = useCallback(
    (item: SnackbarItem) => {
      dismiss(item.id);
      try {
        item.onUndo();
      } catch {
        /* consumer callback errors must not break the snackbar */
      }
    },
    [dismiss],
  );

  // Clean up any live timers on unmount so they don't fire commits on a
  // torn-down tree.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo<UndoSnackbarContextValue>(() => ({ showUndo }), [showUndo]);

  return (
    <UndoSnackbarContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 'calc(var(--space-4) + env(safe-area-inset-bottom))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-2)',
              pointerEvents: 'none', // wrapper is transparent; children re-enable
              zIndex: 1000,
            }}
          >
            {items.map((item) => (
              <UndoSnackbarItem
                key={item.id}
                item={item}
                onUndo={() => handleUndo(item)}
              />
            ))}
          </div>,
          document.body,
        )}
    </UndoSnackbarContext.Provider>
  );
}

function UndoSnackbarItem({ item, onUndo }: { item: SnackbarItem; onUndo: () => void }) {
  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-compact)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption, 12px)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        minWidth: 220,
        maxWidth: 'min(420px, 90vw)',
        position: 'relative',
        overflow: 'hidden',
        animation: 'nsa-undo-in var(--dur-medium, 220ms) var(--ease-out) both',
      }}
    >
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.label}
      </span>
      <span aria-hidden style={{ color: 'var(--color-text-disabled)' }}>·</span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          color: 'var(--color-accent)',
          fontFamily: 'var(--font-label)',
          fontSize: 'inherit',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          cursor: 'pointer',
        }}
      >
        Undo
      </button>
      {/* Progress bar — shrinks left→right over `duration`. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: 'var(--color-accent)',
          transformOrigin: 'left center',
          animation: `nsa-undo-progress ${item.duration}ms linear both`,
        }}
      />
      <style>{`
        @keyframes nsa-undo-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nsa-undo-progress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}

export function useUndoSnackbar(): UndoSnackbarContextValue {
  const ctx = useContext(UndoSnackbarContext);
  if (!ctx) {
    throw new Error('useUndoSnackbar() must be used within <UndoSnackbarProvider>');
  }
  return ctx;
}
