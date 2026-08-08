'use client';

/**
 * HintOverlay — small dialog listing the app's keyboard shortcuts.
 *
 * Opened by pressing `?` anywhere in the shell (see
 * `useGlobalShortcuts`). Dismisses on Escape (handled by the same hook)
 * or a click on the backdrop.
 *
 * Uses the design-system `.dialog` / `.dialog-backdrop` classes so it
 * inherits the shell's motion + tone with zero bespoke chrome.
 */
import { useEffect, useRef } from 'react';

interface HintOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ['⌘', 'K'], label: 'Jump to Assistant' },
  { keys: ['/'], label: 'Focus search (Exercises)' },
  { keys: ['?'], label: 'Show this hint' },
  { keys: ['Esc'], label: 'Close dialog' },
];

export function HintOverlay({ open, onClose }: HintOverlayProps) {
  // Focus the dialog on open so Escape works even before the user has
  // interacted with anything. Click-outside dismissal is on the backdrop.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      // Backdrop click closes. Guard so a click INSIDE the dialog doesn't
      // bubble back and dismiss us.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ zIndex: 100 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hint-overlay-title"
        tabIndex={-1}
        className="dialog"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="hint-overlay-title" className="dialog-title">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-body)',
              padding: 'var(--space-1) var(--space-2)',
            }}
          >
            ×
          </button>
        </div>

        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {SHORTCUTS.map((row) => (
            <li
              key={row.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <span
                style={{
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-body-sm)',
                }}
              >
                {row.label}
              </span>
              <span style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                {row.keys.map((k) => (
                  <kbd
                    key={k}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 24,
                      padding: '2px 8px',
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border-visible)',
                      borderRadius: 'var(--radius-compact)',
                      color: 'var(--color-text-display)',
                      fontFamily: 'var(--font-label)',
                      fontSize: 'var(--text-caption)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
