'use client';

import type { ArcGraphData } from './schemas';

/**
 * PixelArc — a 180° arc rendered as a thin cadmium stroke, with a filled
 * 6px cadmium square marker sitting on the arc at the current-position
 * angle. Center holds a Doto numeral for the current value and a Space
 * Mono unit label beneath.
 *
 * Used for cyclic readings (pomodoro cycle progress, sunrise-style time
 * markers, arcs that read as "N of MAX along a fixed path"). NOT a
 * general-purpose gauge; the arc's angle carries meaning ("how far along
 * the cycle"), not just percentage.
 */

const WIDTH = 200;
const HEIGHT = 110;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT - 10;
const RADIUS = 80;

function polar(radius: number, angleDeg: number): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER_X + radius * Math.cos(angleRad),
    y: CENTER_Y + radius * Math.sin(angleRad),
  };
}

export function PixelArc({ label, arc, markers, unit }: ArcGraphData) {
  const { min, max, current } = arc;
  const span = max - min || 1;
  const clamped = Math.max(min, Math.min(max, current));
  const t = (clamped - min) / span;
  // 180° arc from left (180°) to right (360°/0°) — top-half semicircle.
  // Angle in svg space uses y-down, so we sweep from 180° → 360°.
  const angle = 180 + t * 180;
  const markerPos = polar(RADIUS, angle);

  // Track path — full 180° arc, drawn as a single "A" arc.
  const start = polar(RADIUS, 180);
  const end = polar(RADIUS, 360);
  const trackPath = `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`;

  // Filled portion — from start to current angle.
  const filledPath = `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${markerPos.x} ${markerPos.y}`;

  const centerNumber =
    typeof current === 'number' && Number.isFinite(current)
      ? Number.isInteger(current)
        ? current.toString()
        : current.toFixed(1)
      : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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
      </span>

      <div style={{ position: 'relative', width: WIDTH, height: HEIGHT, alignSelf: 'center' }}>
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${label}: ${current} of ${max}`}
          style={{ display: 'block' }}
        >
          {/* Track — muted, at 25% opacity */}
          <path
            d={trackPath}
            stroke="var(--color-text-secondary)"
            strokeOpacity={0.25}
            strokeWidth={1.5}
            fill="none"
          />
          {/* Filled portion — cadmium */}
          <path
            d={filledPath}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            fill="none"
          />
          {/* Optional markers along the arc — 2px cadmium ticks */}
          {markers?.map((m, i) => {
            const mt = Math.max(0, Math.min(1, (m - min) / span));
            const a = 180 + mt * 180;
            const pos = polar(RADIUS, a);
            return (
              <rect
                key={i}
                x={pos.x - 1}
                y={pos.y - 1}
                width={2}
                height={2}
                fill="var(--color-accent)"
                shapeRendering="crispEdges"
              />
            );
          })}
          {/* Current-position marker — 6px filled square, the "sun on the arc" */}
          <rect
            x={markerPos.x - 3}
            y={markerPos.y - 3}
            width={6}
            height={6}
            fill="var(--color-accent)"
            shapeRendering="crispEdges"
          />
        </svg>

        {/* Center label overlay — Doto numeral */}
        <div
          style={{
            position: 'absolute',
            top: '55%',
            left: 0,
            right: 0,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--font-display-weight)' as unknown as number,
              fontSize: 'var(--text-display-md)',
              lineHeight: 1,
              color: 'var(--color-text-display)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {centerNumber}
          </div>
          {unit && (
            <div
              style={{
                marginTop: 2,
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
              }}
            >
              {unit}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
