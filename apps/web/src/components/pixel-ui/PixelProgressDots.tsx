'use client';

import type { ProgressDotsData } from './schemas';

/**
 * PixelProgressDots — a row of pixels; filled cadmium up to `filled/total`,
 * muted for the rest. Auto-wraps to a second row past 40 dots so a large
 * denominator (e.g. 90 minutes elapsed of 120) doesn't force a horizontal
 * scrollbar.
 *
 * Header is `LABEL · FILLED / TOTAL UNIT` in Space Mono.
 */

const CELL = 4;
const GAP = 1;
const ROW_MAX = 40;

export function PixelProgressDots({ filled, total, label, unit }: ProgressDotsData) {
  const clampedTotal = Math.max(1, Math.min(400, Math.round(total)));
  const clampedFilled = Math.max(0, Math.min(clampedTotal, Math.round(filled)));
  const rows = Math.ceil(clampedTotal / ROW_MAX);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {(label || unit) && (
        <span
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          {label ? `${label} · ` : ''}
          <span style={{ color: 'var(--color-text-display)' }}>
            {clampedFilled}
          </span>
          {' / '}
          {clampedTotal}
          {unit ? ` ${unit}` : ''}
        </span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: `${GAP + 2}px` }}>
        {Array.from({ length: rows }).map((_, rowIdx) => {
          const rowStart = rowIdx * ROW_MAX;
          const rowEnd = Math.min(clampedTotal, rowStart + ROW_MAX);
          const cellsInRow = rowEnd - rowStart;
          return (
            <div
              key={rowIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cellsInRow}, ${CELL}px)`,
                gridAutoRows: `${CELL}px`,
                gap: `${GAP}px`,
              }}
            >
              {Array.from({ length: cellsInRow }).map((_, i) => {
                const absoluteIdx = rowStart + i;
                const lit = absoluteIdx < clampedFilled;
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
