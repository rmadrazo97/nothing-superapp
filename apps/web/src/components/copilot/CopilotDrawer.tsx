'use client';

/**
 * CopilotDrawer — bottom-sheet drawer that hosts <CopilotChat/> inside a
 * mini-app. Opens over the app, dims the background, dismisses on backdrop
 * tap + Escape, and locks body scroll while open.
 *
 * Style: dark surface, cadmium grab-handle, Space Mono header. Height caps
 * at min(85vh, 720px) so it never eclipses the app on tall screens but stays
 * spacious enough for a real conversation.
 *
 * The drawer intentionally embeds CopilotChat in `layout="embedded"` mode —
 * the composer flows with the drawer container instead of pinning to the
 * viewport's bottom bar, so scroll + focus stays contained.
 */
import { useEffect } from 'react';
import { CopilotChat } from './CopilotChat';

export interface CopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Scope hint forwarded to /api/copilot as `body.context`. */
  context?: string;
  /** Uppercase Space Mono subtitle to the right of "◐ COPILOT". */
  scopeLabel?: string;
  /** Chips shown in the empty state. */
  suggestedPrompts?: readonly string[];
}

// ~85% of viewport height, but never taller than 720px — matches the ergonomic
// max for one-thumb reach on large phones.
const DRAWER_MAX_HEIGHT = 'min(85vh, 720px)';

export function CopilotDrawer({
  open,
  onClose,
  context,
  scopeLabel,
  suggestedPrompts,
}: CopilotDrawerProps) {
  // Escape + body-scroll lock. Effect only runs while open so we don't
  // permanently pin the body when the drawer is never mounted-visible.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        evt.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={scopeLabel ? `Copilot · ${scopeLabel}` : 'Copilot'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop — tap-to-close, keyboard-inert. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          animation: 'nsa-copilot-fade-in var(--dur-fast, 180ms) var(--ease-out, ease-out) both',
        }}
      />

      {/* Sheet */}
      <section
        style={{
          position: 'relative',
          background: 'var(--color-bg)',
          borderTop: '1px solid var(--color-border-visible)',
          borderTopLeftRadius: 'var(--radius-card)',
          borderTopRightRadius: 'var(--radius-card)',
          height: DRAWER_MAX_HEIGHT,
          maxHeight: DRAWER_MAX_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 'max(var(--space-4), env(safe-area-inset-left))',
          paddingRight: 'max(var(--space-4), env(safe-area-inset-right))',
          paddingBottom: 'max(var(--space-3), env(safe-area-inset-bottom))',
          boxShadow: '0 -12px 32px rgba(0, 0, 0, 0.6)',
          animation:
            'nsa-copilot-slide-up var(--dur-medium, 240ms) var(--ease-out, cubic-bezier(0.2, 0.8, 0.2, 1)) both',
        }}
      >
        {/* Grab handle — cadmium accent so it reads as a real affordance. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 'var(--space-2)',
            paddingBottom: 'var(--space-1)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'block',
              width: 48,
              height: 4,
              borderRadius: 2,
              background: 'var(--color-accent)',
            }}
          />
        </div>

        {/* Header row */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            paddingTop: 'var(--space-2)',
            paddingBottom: 'var(--space-3)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span
            className="label"
            style={{
              fontFamily: 'var(--font-label)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-text-primary)',
            }}
          >
            ◐ COPILOT{scopeLabel ? ` · ${scopeLabel}` : ''}
          </span>
          <button
            type="button"
            aria-label="Close copilot"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-body)',
              padding: 'var(--space-1) var(--space-3)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        {/* Chat — flex:1 so it fills the sheet without overflowing. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'var(--space-3)',
          }}
        >
          <CopilotChat
            context={context}
            suggestedPrompts={suggestedPrompts}
            layout="embedded"
          />
        </div>
      </section>

      {/* Scoped keyframes — kept inline so the drawer is fully self-contained
          and doesn't require a companion CSS import. */}
      <style>{`
        @keyframes nsa-copilot-slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes nsa-copilot-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
