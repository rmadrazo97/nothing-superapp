'use client';

/**
 * DotStreak — visualises pomodoros-until-long-break as a row of dots.
 *
 * Filled circle = completed work session; hollow = pending. Row length is
 * driven by `total` (settings.pomodoros_per_cycle, default 4). `completed`
 * is clamped so a bug in the counter can't render more dots than the row
 * width would allow.
 */
type Props = {
  completed: number;
  total: number;
};

export function DotStreak({ completed, total }: Props) {
  const safeTotal = Math.max(1, Math.floor(total));
  const filled = Math.min(safeTotal, Math.max(0, Math.floor(completed)));
  return (
    <div
      role="img"
      aria-label={`${filled} of ${safeTotal} pomodoros completed this cycle`}
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        alignItems: 'center',
      }}
    >
      {Array.from({ length: safeTotal }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: i < filled ? 'var(--color-accent)' : 'transparent',
            border: `1px solid ${i < filled ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
            transition: 'background var(--dur-fast) var(--ease-out)',
          }}
        />
      ))}
    </div>
  );
}
