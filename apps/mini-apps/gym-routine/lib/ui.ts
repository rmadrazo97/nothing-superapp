/**
 * UI style primitives shared across gym-routine screens.
 *
 * We deliberately avoid a component-styling library — the harness has none —
 * and instead export reusable style objects that map directly to the design-
 * system tokens (see design-system/styles.css). No hex codes anywhere:
 * everything routes through `var(--*)` so a token retune re-skins the
 * mini-app for free.
 */
import type { CSSProperties } from 'react';

export const cardStyle: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4)',
};

export const primaryButtonStyle: CSSProperties = {
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: 0,
  borderRadius: 'var(--radius-button)',
  padding: 'var(--space-3) var(--space-6)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: 44,
};

export const ghostButtonStyle: CSSProperties = {
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  padding: 'var(--space-3) var(--space-6)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: 44,
};

export const inputStyle: CSSProperties = {
  background: 'transparent',
  color: 'var(--color-text-display)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  padding: 'var(--space-3)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body)',
  width: '100%',
  minHeight: 44,
  boxSizing: 'border-box',
};

/**
 * A pill-shape body-part chip. Active variant uses the accent color for
 * border + text (never fills — the design system reserves red fills for
 * hero CTAs only, not filter chrome).
 */
export function chipStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: 'var(--font-label)',
    fontSize: 'var(--text-label)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-button)',
    border: active
      ? '1px solid var(--color-accent)'
      : '1px solid var(--color-border-visible)',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    background: 'transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
