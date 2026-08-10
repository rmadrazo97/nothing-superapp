'use client';

/**
 * SettingsToggle — cadmium-accent checkbox matching the global Settings
 * "Dark mode" / "Notifications" pattern: label + optional helper on the
 * left, native checkbox on the right, whole row is clickable.
 */
import { useId } from 'react';
import { FIELD_LABEL_STYLE, FIELD_HELPER_STYLE } from './tokens';

export type SettingsToggleProps = {
  label: string;
  helper?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export function SettingsToggle({
  label,
  helper,
  checked,
  onChange,
  disabled = false,
}: SettingsToggleProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={FIELD_LABEL_STYLE}>{label}</span>
        {helper ? <span style={FIELD_HELPER_STYLE}>{helper}</span> : null}
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 20,
          height: 20,
          accentColor: 'var(--color-accent)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
    </label>
  );
}
