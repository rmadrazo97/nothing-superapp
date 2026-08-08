/**
 * Toast store.
 *
 * Pure, framework-agnostic subscribe/notify store. Keeps a bounded queue
 * (`MAX_TOASTS`) — when full, the oldest is displaced. This is the
 * single source of truth: the React Context Provider wires it up so
 * `useToast()` returns a stable API and the `<ToastContainer />` reads
 * the current list via `useSyncExternalStore`.
 *
 * The store deliberately does NOT own the auto-dismiss timers — those
 * are per-toast concerns handled inside the `<Toast />` component so
 * hover-to-pause is trivial (setTimeout on mount, clearTimeout on
 * pointer-enter). The store just exposes `dismiss(id)`.
 */

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastOptions {
  /** Auto-dismiss after this many ms. Default: 4000. Set 0 to disable. */
  duration?: number;
}

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
  /** Monotonic timestamp for animation stagger / testing. */
  createdAt: number;
}

export const MAX_TOASTS = 3;
export const DEFAULT_DURATION_MS = 4000;

type Listener = (toasts: ReadonlyArray<ToastItem>) => void;

function makeId(): string {
  // Cheap unique id — good enough for a client-side ephemeral list.
  // Not using crypto.randomUUID so this works in older browsers + SSR probes.
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createToastStore() {
  let toasts: ReadonlyArray<ToastItem> = [];
  const listeners = new Set<Listener>();

  function emit() {
    for (const l of listeners) l(toasts);
  }

  function subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }

  function getSnapshot(): ReadonlyArray<ToastItem> {
    return toasts;
  }

  function push(variant: ToastVariant, message: string, opts?: ToastOptions): string {
    const item: ToastItem = {
      id: makeId(),
      variant,
      message,
      duration: opts?.duration ?? DEFAULT_DURATION_MS,
      createdAt: Date.now(),
    };
    // Displace the oldest when at capacity.
    const next = toasts.length >= MAX_TOASTS ? toasts.slice(1) : toasts.slice();
    next.push(item);
    toasts = next;
    emit();
    return item.id;
  }

  function dismiss(id: string): void {
    const next = toasts.filter((t) => t.id !== id);
    if (next.length === toasts.length) return;
    toasts = next;
    emit();
  }

  function clear(): void {
    if (toasts.length === 0) return;
    toasts = [];
    emit();
  }

  return {
    subscribe,
    getSnapshot,
    push,
    dismiss,
    clear,
  };
}

export type ToastStore = ReturnType<typeof createToastStore>;
