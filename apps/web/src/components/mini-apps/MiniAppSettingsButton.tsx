'use client';

/**
 * MiniAppSettingsButton — the cog icon a mini-app drops into its header.
 *
 * Pairs with `MiniAppSettingsSheet`: this button owns the open/closed
 * boolean via local state so a mini-app page doesn't have to plumb the
 * lifecycle. Mini-apps only pass a `slug` (+ optional `title`) and the
 * shared shell handles the rest.
 *
 * If the slug has no registered settings panel (see
 * `hasMiniAppSettings`), this component renders nothing — the mini-app
 * can safely drop the button in its header without pre-checking.
 *
 * Design: 32×32 outlined square, cog glyph, cadmium red on hover. No hex.
 */

import { useCallback, useState, type CSSProperties } from 'react';
import { hasMiniAppSettings } from '@/lib/mini-apps/client-registry';
import { MiniAppSettingsSheet } from './MiniAppSettingsSheet';

export type MiniAppSettingsButtonProps = {
  /** Registered mini-app slug (e.g. 'calorie-lite'). */
  slug: string;
  /** Sheet header title. Falls back to the slug. */
  title?: string;
  /** Optional aria-label override; defaults to `Open {title} settings`. */
  ariaLabel?: string;
};

const BUTTON_STYLE: CSSProperties = {
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  padding: 'var(--space-1) var(--space-2)',
  minWidth: 32,
  minHeight: 32,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  lineHeight: 1,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition:
    'border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
};

export function MiniAppSettingsButton({
  slug,
  title,
  ariaLabel,
}: MiniAppSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // No-op quietly for slugs that haven't registered a panel — this keeps
  // future mini-apps free to drop the button in their header even before
  // wiring up settings.
  if (!hasMiniAppSettings(slug)) return null;

  const labelBase = title ?? slug;
  const label = ariaLabel ?? `Open ${labelBase} settings`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={BUTTON_STYLE}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-accent)';
          e.currentTarget.style.borderColor = 'var(--color-accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-text-primary)';
          e.currentTarget.style.borderColor = 'var(--color-border-visible)';
        }}
      >
        {/* U+FE0E forces text-glyph presentation so we don't render the
            macOS/iOS colored gear graphic (v0.5.1 bug #12). */}
        <span aria-hidden="true">{'⚙︎'}</span>
      </button>
      <MiniAppSettingsSheet
        slug={slug}
        title={title}
        open={open}
        onClose={close}
      />
    </>
  );
}
