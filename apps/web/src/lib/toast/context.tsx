'use client';

/**
 * Toast Context — the React binding for `toast-store`.
 *
 * Exposes `useToast()` returning a stable `toast` object with
 * `.info() / .success() / .error() / .dismiss()` methods, plus a
 * `useToastList()` hook the container uses to render the current list.
 *
 * The Provider is intentionally lazy: if no Provider is mounted higher
 * in the tree (e.g. inside a mini-app previewed outside the shell) the
 * hook falls back to a shared module-scope store so calls never throw.
 * This keeps the API 1-line to adopt from any client component without
 * requiring every ancestor to install the provider first.
 */
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createToastStore,
  type ToastItem,
  type ToastOptions,
  type ToastStore,
} from './toast-store';

// Module-scope fallback store — used when no Provider is mounted.
// In practice the `<ToastContainer />` under `/app/*` binds to the
// Provider's store; this fallback keeps standalone previews safe.
let fallbackStore: ToastStore | null = null;
function getFallbackStore(): ToastStore {
  if (!fallbackStore) fallbackStore = createToastStore();
  return fallbackStore;
}

const ToastStoreContext = createContext<ToastStore | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  // One store per Provider instance — pinned across renders.
  const store = useMemo(() => createToastStore(), []);
  return <ToastStoreContext.Provider value={store}>{children}</ToastStoreContext.Provider>;
}

function useToastStore(): ToastStore {
  return useContext(ToastStoreContext) ?? getFallbackStore();
}

/**
 * Public hook. Returns a stable `toast` object. The identity of `toast`
 * is stable per-store so consumers can safely put it in effect deps.
 */
export function useToast() {
  const store = useToastStore();

  const toast = useMemo(
    () => ({
      info: (message: string, opts?: ToastOptions) => store.push('info', message, opts),
      success: (message: string, opts?: ToastOptions) => store.push('success', message, opts),
      error: (message: string, opts?: ToastOptions) => store.push('error', message, opts),
      dismiss: (id: string) => store.dismiss(id),
      clear: () => store.clear(),
    }),
    [store],
  );

  return { toast };
}

/**
 * Used by `<ToastContainer />` to subscribe to the current toast list
 * across the SSR boundary. `useSyncExternalStore` is the React 18+
 * recommended way to bind to an external mutable source.
 */
export function useToastList(): ReadonlyArray<ToastItem> {
  const store = useToastStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    // Server snapshot: always empty. Toasts are ephemeral + client-only.
    () => EMPTY,
  );
}

const EMPTY: ReadonlyArray<ToastItem> = Object.freeze([]);
