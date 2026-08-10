/**
 * Design-token style objects shared across the mini-app settings framework.
 *
 * Every value flows through `var(--*)` — no hex, no --space-5 / --space-7
 * (the space scale skips 5 and 7 by design; see feedback_ns_space_scale_gap).
 * Kept as plain style objects rather than a CSS module so mini-apps in
 * separate packages can `import` them without a bundler-config touch.
 */
import type { CSSProperties } from 'react';

export const SECTION_CARD_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

export const SECTION_KICKER_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

export const SECTION_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: 'var(--text-heading)',
  color: 'var(--color-text-display)',
  letterSpacing: '-0.01em',
};

export const FIELD_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

export const FIELD_HELPER_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-caption)',
  color: 'var(--color-text-secondary)',
  lineHeight: 1.4,
};

export const INPUT_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  outline: 'none',
};

export const PRIMARY_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-6)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: 'none',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontWeight: 500,
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: 44,
  alignSelf: 'flex-start',
  transition: 'opacity var(--dur-fast) var(--ease-out)',
};

export const GHOST_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-6)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontWeight: 500,
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: 44,
  alignSelf: 'flex-start',
};

/**
 * Pad numeric section index as 01, 02, ... to match the numbered-eyebrow
 * pattern used by the global Settings surface.
 */
export function sectionEyebrow(n: number): string {
  return `Section ${String(n).padStart(2, '0')}`;
}
