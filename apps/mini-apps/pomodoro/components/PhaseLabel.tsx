'use client';

/**
 * PhaseLabel — one-line instrument label above the ring.
 *
 * Space Mono, uppercase, tight tracking. The colour shifts by phase so a
 * glance tells you "am I focusing or resting" without reading the word.
 */
import type { Phase } from '../lib/phase.ts';

const LABELS: Record<Phase, string> = {
  work: 'FOCUS',
  short_break: 'BREAK',
  long_break: 'LONG BREAK',
};

export function PhaseLabel({ phase, running }: { phase: Phase; running: boolean }) {
  const color =
    phase === 'work'
      ? 'var(--color-accent)'
      : 'var(--color-accent-400)';
  return (
    <span
      className="label"
      style={{
        color: running ? color : 'var(--color-text-secondary)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        transition: 'color var(--dur-fast) var(--ease-out)',
      }}
    >
      {LABELS[phase]}
    </span>
  );
}
