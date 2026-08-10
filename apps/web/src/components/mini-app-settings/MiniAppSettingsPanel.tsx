'use client';

/**
 * MiniAppSettingsPanel — top-level scroll container for a mini-app's
 * settings sheet body. The MiniAppSettingsSheet renders the modal chrome
 * (backdrop, header, close X); this component owns the *inner* layout:
 *
 *   header eyebrow (mini-app name)
 *   optional `← BACK` link
 *   stack of <SettingsSection>s (passed as children)
 *
 * Wraps everything in a plain <div> — no <form>. Because updates are
 * debounced-optimistic via useMiniAppSettings, there's no submit button
 * to hang the panel off of; each field commits itself.
 */
import type { ReactNode, CSSProperties } from 'react';

export type MiniAppSettingsPanelProps = {
  /** Display name of the mini-app (e.g. "Gym", "Fitness Pal"). */
  name: string;
  /** Optional callback wired to a "← BACK" link at the top-left. */
  onBack?: () => void;
  /** Label of the back link. Defaults to "← BACK". */
  backLabel?: string;
  children: ReactNode;
};

const PANEL_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  // MiniAppSettingsSheet already applies safe-area top/right/bottom
  // padding on the outer aside; leave a small extra bottom pad so the
  // last section clears the home indicator cleanly on iOS.
  paddingBottom: 'calc(var(--space-6) + env(safe-area-inset-bottom))',
};

const HEADER_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const NAME_STYLE: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

const BACK_LINK_STYLE: CSSProperties = {
  background: 'transparent',
  border: 0,
  color: 'var(--color-text-secondary)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-caption)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  padding: 0,
};

export function MiniAppSettingsPanel({
  name,
  onBack,
  backLabel = '← BACK',
  children,
}: MiniAppSettingsPanelProps) {
  return (
    <div style={PANEL_STYLE}>
      <div style={HEADER_STYLE}>
        <span style={NAME_STYLE}>{name.toUpperCase()} · SETTINGS</span>
        {onBack ? (
          <button type="button" onClick={onBack} style={BACK_LINK_STYLE}>
            {backLabel}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
