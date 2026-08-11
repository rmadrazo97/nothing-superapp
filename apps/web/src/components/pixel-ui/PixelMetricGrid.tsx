'use client';

import type { MetricGridData } from './schemas';

/**
 * PixelMetricGrid — 2-column grid of mini-tickers (24px Doto numerals),
 * intended for cross-metric summaries ("this week: kcal / protein / carbs
 * / fat"). Auto-flows to 2×3 for 5–6 items; 4-item summaries render as
 * 2×2.
 *
 * Deltas render as small ▲ / ▼ + value in green / cadmium — same rule as
 * the ticker delta chip, but tighter type so 4 cells fit in the bubble.
 *
 * The optional `negativeDeltaTone` prop lets callers route negative deltas
 * to graphite (`--color-text-disabled`) instead of cadmium — useful inside
 * a `<PixelCard>` whose LED signature is already cadmium (e.g. Gym
 * PROGRESSION), so the negative chip doesn't collide with the cluster.
 */

function fmtValue(v: number | string): string {
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 10000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v);
  }
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(1);
}

function fmtDelta(delta?: number): { text: string; positive: boolean } | null {
  if (delta == null) return null;
  const positive = delta >= 0;
  const abs = Math.abs(delta);
  const body = abs < 10 && !Number.isInteger(abs) ? abs.toFixed(1) : Math.round(abs).toString();
  return { text: `${positive ? '▲' : '▼'} ${body}`, positive };
}

export function PixelMetricGrid({
  title,
  items,
  negativeDeltaTone = 'accent',
}: MetricGridData) {
  const negativeColor =
    negativeDeltaTone === 'muted'
      ? 'var(--color-text-disabled)'
      : 'var(--color-accent)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {title && (
        <span
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          {title}
        </span>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          rowGap: 'var(--space-3)',
          columnGap: 0,
        }}
      >
        {items.map((item, idx) => {
          const delta = fmtDelta(item.delta);
          // Hairline separators between cells — right border on left cell,
          // bottom border on all but the last row.
          const isLeftCol = idx % 2 === 0;
          const isLastRow = idx >= items.length - (items.length % 2 === 0 ? 2 : 1);
          return (
            <div
              key={idx}
              style={{
                padding: `0 var(--space-3)`,
                borderRight: isLeftCol
                  ? '1px solid var(--color-border)'
                  : 'none',
                borderBottom: isLastRow ? 'none' : '1px solid var(--color-border)',
                paddingBottom: isLastRow ? 0 : 'var(--space-3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-label)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {item.label}
                {item.unit ? ` · ${item.unit}` : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 'var(--font-display-weight)' as unknown as number,
                    fontSize: 24,
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                    color: 'var(--color-text-display)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtValue(item.value)}
                </span>
                {delta && (
                  <span
                    style={{
                      fontFamily: 'var(--font-label)',
                      fontSize: 'var(--text-caption)',
                      color: delta.positive ? 'var(--color-success)' : negativeColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {delta.text}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
