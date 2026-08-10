'use client';

/**
 * SettingsButton — the framework's CTA button.
 *
 * `variant="primary"`  → cadmium fill (Save)
 * `variant="ghost"`    → outlined transparent (Cancel / secondary action)
 * `variant="accent-ghost"` → outlined in the accent color (destructive-ish)
 */
import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { PRIMARY_BTN_STYLE, GHOST_BTN_STYLE } from './tokens';

export type SettingsButtonVariant = 'primary' | 'ghost' | 'accent-ghost';

export type SettingsButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'style'
> & {
  variant?: SettingsButtonVariant;
  fullWidth?: boolean;
  style?: CSSProperties;
};

export function SettingsButton({
  variant = 'primary',
  fullWidth = false,
  disabled = false,
  style,
  ...rest
}: SettingsButtonProps) {
  const base =
    variant === 'primary'
      ? PRIMARY_BTN_STYLE
      : variant === 'accent-ghost'
        ? {
            ...GHOST_BTN_STYLE,
            color: 'var(--color-accent)',
            borderColor: 'var(--color-accent)',
          }
        : GHOST_BTN_STYLE;
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...base,
        ...(fullWidth ? { alignSelf: 'stretch', width: '100%' } : null),
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    />
  );
}
