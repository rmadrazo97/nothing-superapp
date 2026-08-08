'use client';

/**
 * Fixed-position container that renders the active toast list.
 *
 * Anchored top-center on narrow viewports and top-right on wide ones
 * (>= 640px) via a plain CSS media query wired through inline style
 * fallback — since we can't use CSS-in-JS for media queries with pure
 * inline styles, we render a small <style> tag with a stable class name.
 *
 * We do NOT use `createPortal` — the container lives at a stable spot
 * in the tree beneath `<HarnessContextBridge>`. This avoids SSR
 * hydration mismatches and keeps the toast Provider's Context
 * accessible to the container without extra plumbing.
 */
import { useCallback } from 'react';
import { useToastList, useToast } from '@/lib/toast/context';
import { Toast } from './Toast';

const CONTAINER_CLASS = 'ns-toast-container';

export function ToastContainer() {
  const toasts = useToastList();
  const { toast } = useToast();
  const onDismiss = useCallback((id: string) => toast.dismiss(id), [toast]);

  return (
    <>
      {/* Positioning styles. Kept scoped via a stable class name. */}
      <style>{`
        .${CONTAINER_CLASS} {
          position: fixed;
          top: var(--space-4);
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          pointer-events: none;
          padding: 0 var(--space-4);
          width: 100%;
          max-width: 420px;
        }
        @media (min-width: 640px) {
          .${CONTAINER_CLASS} {
            top: var(--space-6);
            left: auto;
            right: var(--space-6);
            transform: none;
            padding: 0;
            width: auto;
          }
        }
      `}</style>
      <div className={CONTAINER_CLASS} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <Toast key={t.id} item={t} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
}
