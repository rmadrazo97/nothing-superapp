'use client';

/**
 * SettingsDrawer — right-anchored slide-in panel for tunable durations.
 *
 * Stays out of the way (a small gear icon) until the user taps it, then
 * covers the right half of the surface on desktop / most of the screen on
 * mobile. Escape + backdrop click both close.
 *
 * Fields:
 *   - Work minutes            (1..120)
 *   - Short break minutes     (1..60)
 *   - Long break minutes      (1..60)
 *   - Pomodoros per cycle     (2..12)
 *   - Sound on phase change   (bool)
 *
 * Ranges match the clamps in `lib/phase.ts` so invalid values can never
 * make it into localStorage.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../lib/phase.ts';

const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 40,
};

const DRAWER: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(360px, 100vw)',
  background: 'var(--color-surface)',
  borderLeft: '1px solid var(--color-border-visible)',
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  overflowY: 'auto',
  zIndex: 41,
};

const FIELD_LABEL: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

const INPUT: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  outline: 'none',
};

type Props = {
  open: boolean;
  initial: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
};

export function SettingsDrawer({ open, initial, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Settings>(initial);

  // Reset the draft every time the drawer re-opens so a user who cancels
  // and re-opens sees the persisted values, not their last stale edit.
  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function submit(evt: React.FormEvent) {
    evt.preventDefault();
    onSave(draft);
  }

  return (
    <>
      <div style={OVERLAY} onClick={onClose} aria-hidden="true" />
      <aside style={DRAWER} role="dialog" aria-label="Pomodoro settings">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">SETTINGS</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: 'var(--space-2)',
            }}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={submit}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <NumberField
            label="Work (min)"
            value={draft.workMinutes}
            min={1}
            max={120}
            onChange={(n) => update('workMinutes', n)}
          />
          <NumberField
            label="Short break (min)"
            value={draft.shortBreakMinutes}
            min={1}
            max={60}
            onChange={(n) => update('shortBreakMinutes', n)}
          />
          <NumberField
            label="Long break (min)"
            value={draft.longBreakMinutes}
            min={1}
            max={60}
            onChange={(n) => update('longBreakMinutes', n)}
          />
          <NumberField
            label="Pomodoros per cycle"
            value={draft.pomodorosPerCycle}
            min={2}
            max={12}
            onChange={(n) => update('pomodorosPerCycle', n)}
          />

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) 0',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <span style={FIELD_LABEL}>Sound on phase change</span>
            <input
              type="checkbox"
              checked={draft.soundEnabled}
              onChange={(e) => update('soundEnabled', e.target.checked)}
              aria-label="Enable phase-change beep"
            />
          </label>

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <button
              type="submit"
              style={{
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
                flex: 1,
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_SETTINGS)}
              style={{
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-visible)',
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-3) var(--space-4)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Defaults
            </button>
          </div>
        </form>
      </aside>
    </>
  );

  function NumberField({
    label,
    value,
    min,
    max,
    onChange,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (n: number) => void;
  }) {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={FIELD_LABEL}>{label}</span>
        <input
          style={INPUT}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const raw = Number(e.target.value);
            if (!Number.isFinite(raw)) return;
            onChange(Math.min(max, Math.max(min, Math.floor(raw))));
          }}
        />
      </label>
    );
  }
}
