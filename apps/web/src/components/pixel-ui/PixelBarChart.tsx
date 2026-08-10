'use client';

import type { BarChartData } from './schemas';

/**
 * PixelBarChart — vertical dot-stack bars, grouped by x-label.
 *
 * Each bar is a stack of 3px cadmium squares; height = value normalized to
 * the chart's max cell budget. Bar color: series index 0 = cadmium (accent);
 * subsequent series step down opacity so the primary reading pops. This
 * keeps the palette to one hue while still supporting 2–4 series.
 *
 * The x-axis is a 1px hairline; labels are Space Mono at 11px, rotated
 * only if the auto-fit heuristic says they'd overlap.
 */

const CELL = 3;
const GAP = 1;
const CHART_ROWS = 20; // 20 × 3 + 19 × 1 = 79px chart body
const BAR_WIDTH_CELLS = 3;
const BAR_GAP_PX = 2;
const GROUP_GAP_PX = 12;
// Minimum horizontal footprint per x-label. Ensures labels have room to
// read even when the bar group itself is only 9px wide (single-series).
const MIN_COLUMN_PX = 44;

function seriesColor(idx: number): { color: string; opacity: number } {
  // One hue family — cadmium — but stepped opacity so 2–4 series are
  // visually distinguishable without breaking the accent-is-signal rule.
  const OPACITIES = [1, 0.6, 0.4, 0.28];
  return { color: 'var(--color-accent)', opacity: OPACITIES[idx] ?? 0.2 };
}

export function PixelBarChart({ title, xLabels, series, units }: BarChartData) {
  // Flatten all values to compute a shared max — every series bar is
  // normalized to the same peak, so cross-series comparison is honest.
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allValues.map((v) => (Number.isFinite(v) ? v : 0)));
  const barsPerColumn = series.length;
  const groupWidth = barsPerColumn * BAR_WIDTH_CELLS * CELL + (barsPerColumn - 1) * BAR_GAP_PX;
  const columnWidthPx = Math.max(groupWidth, MIN_COLUMN_PX);
  const chartHeight = CHART_ROWS * CELL + (CHART_ROWS - 1) * GAP;

  // Rough auto-fit — if the longest label is longer than 6 chars, tilt them
  // to keep the chart from wrapping.
  const longest = Math.max(...xLabels.map((l) => l.length));
  const tilt = longest > 6;

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
          {units ? ` · ${units}` : ''}
        </span>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-start',
          gap: `${GROUP_GAP_PX}px`,
          overflowX: 'auto',
          paddingBottom: 'var(--space-1)',
        }}
      >
        {xLabels.map((_, colIdx) => (
          <div
            key={colIdx}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: `${BAR_GAP_PX}px`,
              height: chartHeight,
              width: columnWidthPx,
              flexShrink: 0,
            }}
          >
            {series.map((s, seriesIdx) => {
              const raw = s.values[colIdx] ?? 0;
              const norm = max > 0 ? raw / max : 0;
              const cells = Math.max(raw > 0 ? 1 : 0, Math.round(norm * CHART_ROWS));
              const height = cells > 0 ? cells * CELL + (cells - 1) * GAP : 0;
              const { color, opacity } = seriesColor(seriesIdx);
              return (
                <div
                  key={seriesIdx}
                  aria-label={`${xLabels[colIdx]} · ${s.label} · ${raw}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column-reverse',
                    gap: `${GAP}px`,
                    width: BAR_WIDTH_CELLS * CELL,
                    height,
                  }}
                >
                  {Array.from({ length: cells }).map((_, cellIdx) => (
                    <span
                      key={cellIdx}
                      style={{
                        width: BAR_WIDTH_CELLS * CELL,
                        height: CELL,
                        background: color,
                        opacity,
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* X-axis hairline + labels */}
      <div
        style={{
          display: 'flex',
          gap: `${GROUP_GAP_PX}px`,
          alignItems: 'flex-start',
          borderTop: '1px solid var(--color-border-visible)',
          paddingTop: 'var(--space-2)',
        }}
      >
        {xLabels.map((label, i) => (
          <span
            key={i}
            style={{
              width: columnWidthPx,
              flexShrink: 0,
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.06em',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              textTransform: 'uppercase',
              transform: tilt ? 'translateY(6px) rotate(-30deg)' : undefined,
              transformOrigin: 'top center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Legend — only if >1 series (single series is self-explanatory). */}
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {series.map((s, i) => {
            const { color, opacity } = seriesColor(i);
            return (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    background: color,
                    opacity,
                  }}
                />
                {s.label}
              </span>
            );
          })}
        </div>
      )}

    </div>
  );
}
