'use client';

/**
 * MiniAppSettingsSheet — shared modal/drawer that hosts a mini-app's
 * settings panel. The shell owns the chrome (backdrop, close X, escape
 * key, body-scroll lock) so each mini-app only ships form fields.
 *
 * The actual panel is lazy-loaded via `getMiniAppSettingsComponent(slug)`
 * so the bytes only travel when the cog is tapped. Slugs without a
 * registered panel silently render nothing — callers can pass through
 * dynamic slugs without pre-checking.
 *
 * Zero hex codes — every colour + spacing token comes from the design
 * system. Space Mono uppercase header, dark card sliding in from the
 * right on desktop, full-width on mobile.
 */

import { Suspense, useCallback, useEffect, type CSSProperties } from 'react';
import {
  getMiniAppSettingsComponent,
} from '@/lib/mini-apps/client-registry';

export type MiniAppSettingsSheetProps = {
  /** Mini-app slug. When no panel is registered for this slug, renders null. */
  slug: string;
  /** Header title. Falls back to the slug when omitted. */
  title?: string;
  /** Controls visibility. Parent owns the open/closed boolean. */
  open: boolean;
  /** Called when the user requests close (X, escape, backdrop, or panel done). */
  onClose: () => void;
};

const BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1100,
  background: 'rgba(0, 0, 0, 0.85)',
  // Anchor the sheet to the right edge; on narrow viewports it fills.
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'stretch',
};

const SHEET_STYLE: CSSProperties = {
  width: 'min(480px, 100%)',
  height: '100%',
  background: 'var(--color-surface)',
  borderLeft: '1px solid var(--color-border-visible)',
  padding: 'var(--space-6)',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  // Subtle slide-in — matches the shell's other transitions.
  animation: 'mini-app-settings-slide-in var(--dur-medium) var(--ease-out)',
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  paddingBottom: 'var(--space-3)',
  borderBottom: '1px solid var(--color-border)',
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
  transition:
    'border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
};

const FALLBACK_STYLE: CSSProperties = {
  margin: 0,
  padding: 'var(--space-4) 0',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  color: 'var(--color-text-secondary)',
};

export function MiniAppSettingsSheet({
  slug,
  title,
  open,
  onClose,
}: MiniAppSettingsSheetProps) {
  // Escape closes — attached at document level so focus can be anywhere.
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

  // Body-scroll lock while open. Restore whatever overflow was set (usually
  // empty string) so we don't clobber a page-level lock.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleBackdropClick = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      // Only close when the click hits the backdrop itself, not something
      // inside the sheet (form fields, buttons, etc.).
      if (evt.target === evt.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const Panel = getMiniAppSettingsComponent(slug);
  const headerTitle = (title ?? slug).toUpperCase();

  return (
    <>
      {/* One-off keyframes injected inline so we don't have to touch the
          global CSS just for this sheet. Cheap — the string is static. */}
      <style>{`@keyframes mini-app-settings-slide-in {
        from { transform: translateX(24px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }`}</style>
      <div
        role="presentation"
        style={BACKDROP_STYLE}
        onClick={handleBackdropClick}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="mini-app-settings-title"
          style={SHEET_STYLE}
        >
          <header style={HEADER_STYLE}>
            <h2 id="mini-app-settings-title" style={TITLE_STYLE}>
              <span aria-hidden="true">⚙ </span>
              {headerTitle} SETTINGS
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              style={CLOSE_BTN_STYLE}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-accent)';
                e.currentTarget.style.borderColor = 'var(--color-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
                e.currentTarget.style.borderColor = 'var(--color-border-visible)';
              }}
            >
              ×
            </button>
          </header>

          {Panel ? (
            <Suspense
              fallback={<p style={FALLBACK_STYLE}>Loading settings…</p>}
            >
              <Panel onClose={onClose} />
            </Suspense>
          ) : (
            <p style={FALLBACK_STYLE}>
              No settings available for this mini-app.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
