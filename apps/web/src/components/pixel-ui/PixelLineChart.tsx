'use client';

import type { LineChartData } from './schemas';

/**
 * PixelLineChart — pixel points on a grid, connected by a 1px cadmium
 * stroke via inline SVG. Optional area fill is drawn as a stippled dot-
 * density fill so the pixel idiom carries through even the fill.
 *
 * Design decisions:
 *   - SVG is used only for the connecting line + optional area path; the
 *     data points themselves are DOM squares aligned to the SVG grid so
 *     they inherit `--color-accent` without extra fills.
 *   - Chart body is a fixed height of 24 rows × 3px = 72px. Width scales
 *     to the number of x-labels (min 6 columns of ~24px each).
 *   - No axis lines other than the x-axis hairline — matches the bar
 *     chart's structural rhythm.
 */

const CHART_HEIGHT = 84;
const COLUMN_WIDTH = 28;
const POINT = 4;

export function PixelLineChart({ title, xLabels, values, units, showArea }: LineChartData) {
  const points = values.slice(0, xLabels.length || values.length);
  const cols = Math.max(points.length, 2);
  const chartWidth = Math.max(cols * COLUMN_WIDTH, 200);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  // Map each point to (x, y) in the chart body. y=0 is the top.
  const coords = points.map((v, i) => {
    const x = (i / (cols - 1 || 1)) * (chartWidth - POINT) + POINT / 2;
    const norm = (v - min) / range;
    const y = CHART_HEIGHT - norm * (CHART_HEIGHT - POINT) - POINT / 2;
    return { x, y, value: v };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ');
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${CHART_HEIGHT} L ${coords[0].x.toFixed(2)} ${CHART_HEIGHT} Z`
      : '';

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
          position: 'relative',
          width: '100%',
          overflowX: 'auto',
        }}
      >
        <svg
          width={chartWidth}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
          role="img"
          aria-label={title ?? 'Line chart'}
          style={{ display: 'block' }}
        >
          {/* Dot-density area fill — SVG pattern of 2px squares on a 4px
              grid, clipped to the area path. Keeps the pixel idiom in the
              fill rather than using a solid gradient. */}
          {showArea && coords.length > 1 && (
            <>
              <defs>
                <pattern
                  id="nsa-pixel-stipple"
                  x="0"
                  y="0"
                  width="4"
                  height="4"
                  patternUnits="userSpaceOnUse"
                >
                  <rect x="0" y="0" width="2" height="2" fill="var(--color-accent)" opacity="0.4" />
                </pattern>
              </defs>
              <path d={areaPath} fill="url(#nsa-pixel-stipple)" stroke="none" />
            </>
          )}
          {/* Connecting stroke — 1px cadmium, no smoothing. */}
          {coords.length > 1 && (
            <path
              d={linePath}
              stroke="var(--color-accent)"
              strokeWidth={1}
              fill="none"
              shapeRendering="crispEdges"
            />
          )}
          {/* Data points — 4×4 squares. Rendered as SVG rects so they
              inherit crispEdges alongside the line. */}
          {coords.map((c, i) => (
            <rect
              key={i}
              x={c.x - POINT / 2}
              y={c.y - POINT / 2}
              width={POINT}
              height={POINT}
              fill="var(--color-accent)"
              shapeRendering="crispEdges"
            >
              <title>{`${xLabels[i] ?? `#${i + 1}`} · ${c.value}`}</title>
            </rect>
          ))}
        </svg>
      </div>

      {/* X-axis labels — hairline over, mono labels beneath. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          borderTop: '1px solid var(--color-border-visible)',
          paddingTop: 'var(--space-2)',
          minWidth: chartWidth,
        }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <span
            key={i}
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.06em',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}
          >
            {xLabels[i] ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}
