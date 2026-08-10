'use client';

import type { StatTickerData } from './schemas';

/**
 * PixelTicker — hero numeric readout with optional delta chip + sparkline.
 *
 * Layout: eyebrow (Space Mono) → row [Doto value] [delta chip] [sparkline].
 * The sparkline is a fixed 8-column pixel strip in the same grid unit as
 * PixelLoader (3px cell, 1px gap).
 *
 * A positive delta prints green (`--color-success`); a negative delta
 * prints ember red (`--color-accent`) — same rules as the PLAN LED dots.
 */

const CELL = 3;
const GAP = 1;
const SPARK_COLUMNS = 8;
const SPARK_ROWS = 5;

function formatValue(value: number | string): string {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '—';
  // Compact numbers so 12,480 doesn't blow through the bubble.
  if (Math.abs(value) >= 10000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  // One decimal for sub-100 values (weight-style); integers otherwise.
  return Math.abs(value) < 100 && !Number.isInteger(value)
    ? value.toFixed(1)
    : Math.round(value).toLocaleString('en-US');
}

function formatDelta(delta?: number, deltaPct?: number, unit?: string): string | null {
  if (delta == null && deltaPct == null) return null;
  const sign = (delta ?? deltaPct ?? 0) >= 0 ? '+' : '−';
  const num = Math.abs(delta ?? deltaPct ?? 0);
  const body = num < 10 && !Number.isInteger(num) ? num.toFixed(1) : Math.round(num).toString();
  if (deltaPct != null && delta == null) return `${sign}${body}%`;
  return `${sign}${body}${unit ? ` ${unit}` : ''}`;
}

function Sparkline({ values }: { values: number[] }) {
  // Take the last SPARK_COLUMNS values; pad-left with zeros to a fixed
  // width so the strip stays visually stable across renders.
  const tail = values.slice(-SPARK_COLUMNS);
  const padded =
    tail.length < SPARK_COLUMNS ? [...Array(SPARK_COLUMNS - tail.length).fill(0), ...tail] : tail;
  const min = Math.min(...padded);
  const max = Math.max(...padded);
  const range = max - min || 1;
  // Row 0 = top, row SPARK_ROWS-1 = bottom. A value at max lights the
  // whole column bottom-up; a value at min lights just the last cell.
  const heights = padded.map((v) => {
    const norm = (v - min) / range;
    return Math.max(1, Math.round(norm * SPARK_ROWS));
  });
  const total = SPARK_COLUMNS * CELL + (SPARK_COLUMNS - 1) * GAP;
  const totalH = SPARK_ROWS * CELL + (SPARK_ROWS - 1) * GAP;
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-grid',
        gridTemplateColumns: `repeat(${SPARK_COLUMNS}, ${CELL}px)`,
        gridTemplateRows: `repeat(${SPARK_ROWS}, ${CELL}px)`,
        gap: `${GAP}px`,
        width: total,
        height: totalH,
        verticalAlign: 'middle',
      }}
    >
      {Array.from({ length: SPARK_ROWS * SPARK_COLUMNS }).map((_, i) => {
        const row = Math.floor(i / SPARK_COLUMNS);
        const col = i % SPARK_COLUMNS;
        const barHeight = heights[col];
        const lit = row >= SPARK_ROWS - barHeight;
        return (
          <span
            key={i}
            style={{
              width: CELL,
              height: CELL,
              background: lit ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              opacity: lit ? 1 : 0.25,
            }}
          />
        );
      })}
    </span>
  );
}

export function PixelTicker({ label, value, delta, deltaPct, unit, sparkline }: StatTickerData) {
  const deltaLabel = formatDelta(delta, deltaPct);
  const positive = (delta ?? deltaPct ?? 0) >= 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <span
        style={{
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
        }}
      >
        {label}
        {unit ? ` · ${unit}` : ''}
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--font-display-weight)' as unknown as number,
              fontSize: 'var(--text-display-md)',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              color: 'var(--color-text-display)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatValue(value)}
          </span>
          {deltaLabel && (
            <span
              style={{
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.04em',
                color: positive ? 'var(--color-success)' : 'var(--color-accent)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {deltaLabel}
            </span>
          )}
        </div>
        {sparkline && sparkline.length > 0 && (
          <span style={{ color: 'var(--color-accent)' }}>
            <Sparkline values={sparkline} />
          </span>
        )}
      </div>
    </div>
  );
}
