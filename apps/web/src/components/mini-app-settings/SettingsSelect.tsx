'use client';

/**
 * SettingsSelect — segmented pill control (visual match to the OPCIÓN 1..5
 * pills already used in the calorie-lite plan tab and to the sex / activity
 * / goal radios inline in the mini-app settings panels).
 *
 * The wrapper is a radiogroup so screen readers announce the whole thing
 * as one control. Active state uses the cadmium accent for both background
 * fill and text — matches the design system's rule that filled red is
 * reserved for hero CTAs and *active* selection state.
 */
import type { CSSProperties } from 'react';

export type SettingsSelectOption<T extends string> = {
  value: T;
  label: string;
};

export type SettingsSelectProps<T extends string> = {
  value: T;
  options: SettingsSelectOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  /** For a11y — the radiogroup's label. Usually the parent SettingsField's label. */
  ariaLabel?: string;
};

const GROUP_STYLE: CSSProperties = {
  display: 'inline-flex',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
};

function pillStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    background: active ? 'var(--color-accent)' : 'transparent',
    color: active
      ? 'var(--color-text-display)'
      : 'var(--color-text-primary)',
    border: `1px solid ${
      active ? 'var(--color-accent)' : 'var(--color-border-visible)'
    }`,
    borderRadius: 'var(--radius-button)',
    padding: 'var(--space-2) var(--space-4)',
    fontFamily: 'var(--font-label)',
    fontSize: 'var(--text-label)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    minWidth: 56,
    minHeight: 36,
    transition:
      'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
  };
}

export function SettingsSelect<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: SettingsSelectProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      style={GROUP_STYLE}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={pillStyle(active, disabled)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
