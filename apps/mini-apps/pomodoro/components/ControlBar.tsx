'use client';

/**
 * ControlBar — the row of buttons under the ring.
 *
 * Three states drive the layout:
 *   - idle    : big Start CTA only
 *   - running : Pause CTA + Skip / Reset secondaries
 *   - paused  : Resume CTA + Skip / Reset secondaries
 *
 * The primary CTA is cadmium red. Secondaries are ghost buttons with a
 * visible border so they don't disappear on the dark surface.
 */
import type { CSSProperties } from 'react';

type Kind = 'idle' | 'running' | 'paused';

type Props = {
  kind: Kind;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onReset: () => void;
};

const PRIMARY: CSSProperties = {
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: '1px solid var(--color-accent)',
  borderRadius: 'var(--radius-button)',
  padding: 'var(--space-3) var(--space-8)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minWidth: 160,
};

const SECONDARY: CSSProperties = {
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  padding: 'var(--space-2) var(--space-6)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

export function ControlBar({ kind, onStart, onPause, onResume, onSkip, onReset }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      {kind === 'idle' && (
        <button type="button" onClick={onStart} style={PRIMARY}>
          Start
        </button>
      )}
      {kind === 'running' && (
        <button type="button" onClick={onPause} style={PRIMARY}>
          Pause
        </button>
      )}
      {kind === 'paused' && (
        <button type="button" onClick={onResume} style={PRIMARY}>
          Resume
        </button>
      )}

      {kind !== 'idle' && (
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button type="button" onClick={onSkip} style={SECONDARY} aria-label="Skip to next phase">
            Skip
          </button>
          <button type="button" onClick={onReset} style={SECONDARY} aria-label="Reset session">
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
