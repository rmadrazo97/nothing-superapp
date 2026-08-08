'use client';

/**
 * StreakChip — small pill shown top-right of the calorie-lite header.
 *
 * Two states:
 *   - streak > 0 → filled dot + "N DAY STREAK" in the accent colour, so it
 *     reads at a glance as "you're doing the thing".
 *   - streak === 0 → hollow dot + "NO STREAK YET" muted, so it's a nudge
 *     without being a scold.
 */
export function StreakChip({ current }: { current: number }) {
  const active = current > 0;
  const color = active ? 'var(--color-accent)' : 'var(--color-text-disabled)';
  const label = active
    ? `${current} DAY STREAK`
    : 'NO STREAK YET';
  return (
    <span
      aria-label={
        active ? `Current streak: ${current} days` : 'No streak yet'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-1) var(--space-3)',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
        borderRadius: 'var(--radius-button)',
        color,
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: active ? 'var(--color-accent)' : 'transparent',
          border: active ? 0 : `1px solid ${color}`,
        }}
      />
      {label}
    </span>
  );
}
