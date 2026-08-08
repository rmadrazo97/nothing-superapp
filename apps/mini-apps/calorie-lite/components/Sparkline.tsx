'use client';

/**
 * Sparkline — 7-day bar chart of daily kcal, rendered as inline SVG.
 *
 * Why inline SVG and not a chart library:
 *   - Zero JS payload (no chart lib), zero animation loop.
 *   - Bars are trivial: <rect> per day + one dashed target line.
 *   - Locks perfectly to the Nothing tokens (accent bars, muted future
 *     days, dashed target in secondary text colour).
 *
 * The caller passes 7 days worth of totals in **left-to-right chronological
 * order** (oldest first, today last). Days with no entries are shown as a
 * thin muted stub so the day still exists on the axis rather than snapping
 * the chart width — this keeps the 7 weekday labels aligned.
 */

interface Day {
  /** YYYY-MM-DD (local) for the day this bar represents. */
  key: string;
  /** Total kcal logged this day (0 if untouched). */
  kcal: number;
  /** 3-letter weekday label, uppercase — e.g. "MON". */
  weekday: string;
  /**
   * True if this day is fully in the past AND had at least one entry, so it
   * should render in the accent colour. Today with data also counts as
   * "active". Days with no entries render muted regardless.
   */
  active: boolean;
}

interface SparklineProps {
  days: Day[];
  /** Daily kcal goal, if the user has set one — draws a dashed target line. */
  goal: number | null;
}

const WIDTH = 260;
const HEIGHT = 60;
const BAR_WIDTH = 8;
const BAR_GAP = 4;
const LABEL_HEIGHT = 14;
const CHART_HEIGHT = HEIGHT - LABEL_HEIGHT;

export function Sparkline({ days, goal }: SparklineProps) {
  // Scale by the max of (goal, tallest bar) so the target line stays inside
  // the frame even on days where the user blew past goal. Guard divide-by-0.
  const maxKcal = Math.max(
    1,
    goal ?? 0,
    ...days.map((d) => d.kcal),
  );

  // Distribute bars across the available width so 7 bars centre nicely
  // regardless of the container. 7 * 8 + 6 * 4 = 80 min-width — everything
  // wider becomes viewBox padding.
  const barsTotalWidth = days.length * BAR_WIDTH + (days.length - 1) * BAR_GAP;
  const startX = (WIDTH - barsTotalWidth) / 2;

  const goalY =
    goal != null && goal > 0
      ? CHART_HEIGHT - (goal / maxKcal) * CHART_HEIGHT
      : null;

  return (
    <svg
      role="img"
      aria-label="Last 7 days of calorie totals"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: HEIGHT, display: 'block' }}
    >
      {goalY != null && (
        <line
          x1={0}
          x2={WIDTH}
          y1={goalY}
          y2={goalY}
          stroke="var(--color-text-secondary)"
          strokeWidth={1}
          strokeDasharray="4,4"
        />
      )}
      {days.map((d, i) => {
        const x = startX + i * (BAR_WIDTH + BAR_GAP);
        // Empty days still get a 2px stub so the axis reads honestly.
        const rawHeight = (d.kcal / maxKcal) * CHART_HEIGHT;
        const h = d.kcal > 0 ? Math.max(2, rawHeight) : 2;
        const y = CHART_HEIGHT - h;
        const fill = d.active
          ? 'var(--color-accent)'
          : 'var(--color-border-visible)';
        return (
          <g key={d.key}>
            <rect
              x={x}
              y={y}
              width={BAR_WIDTH}
              height={h}
              fill={fill}
              rx={1}
            />
            <text
              x={x + BAR_WIDTH / 2}
              y={HEIGHT - 3}
              textAnchor="middle"
              fill="var(--color-text-disabled)"
              fontFamily="var(--font-label)"
              fontSize={9}
              letterSpacing="0.08em"
            >
              {d.weekday}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export type { Day as SparklineDay };
