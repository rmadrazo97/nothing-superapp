'use client';

/**
 * SettingsField — labeled form-row with vertical stack:
 *   label (uppercase)
 *   children (input)
 *   optional helper caption
 *
 * Accepts an `htmlFor` so `<label>` binds to a real input for a11y. When
 * the child isn't a single labeled input (e.g. a segmented pill group),
 * omit `htmlFor` and the label renders as a plain span with a matching
 * role="group" aria-label on the wrapper.
 */
import type { ReactNode } from 'react';
import { FIELD_LABEL_STYLE, FIELD_HELPER_STYLE } from './tokens';

export type SettingsFieldProps = {
  label: string;
  /** DOM id of the labeled input. Omit for grouped controls. */
  htmlFor?: string;
  helper?: string;
  children: ReactNode;
};

export function SettingsField({
  label,
  htmlFor,
  helper,
  children,
}: SettingsFieldProps) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      {htmlFor ? (
        <label htmlFor={htmlFor} style={FIELD_LABEL_STYLE}>
          {label}
        </label>
      ) : (
        <span style={FIELD_LABEL_STYLE}>{label}</span>
      )}
      {children}
      {helper ? <p style={FIELD_HELPER_STYLE}>{helper}</p> : null}
    </div>
  );
}
