'use client';

/**
 * TimerRing — SVG stroke-dasharray countdown ring.
 *
 * A single <circle> whose dasharray reveals more of a fixed stroke as
 * `progress` (0..1) climbs from 0 to 1. Rendered inside a viewBox so it
 * scales cleanly at any container size — the parent controls the visual
 * size by setting `size` (px). The mm:ss `children` sit absolutely
 * centered inside the ring.
 *
 * Colour rules:
 *   - Running work session → --color-accent (cadmium red)
 *   - Break sessions      → --color-accent-400 (muted accent variant)
 *   - Paused/idle         → --color-border-visible (grey)
 * The consumer just tells us which `tone` to render; we map it here so
 * the token names stay in one place.
 */
import type { CSSProperties, ReactNode } from 'react';

export type RingTone = 'work' | 'break' | 'idle';

type Props = {
  progress: number;
  size?: number;
  strokeWidth?: number;
  tone?: RingTone;
  children?: ReactNode;
};

function strokeColorFor(tone: RingTone): string {
  switch (tone) {
    case 'work':
      return 'var(--color-accent)';
    case 'break':
      return 'var(--color-accent-400)';
    case 'idle':
    default:
      return 'var(--color-border-visible)';
  }
}

export function TimerRing({
  progress,
  size = 280,
  strokeWidth = 6,
  tone = 'idle',
  children,
}: Props) {
  // Geometry: pull the ring inward by half the stroke so it fits the box
  // exactly at the outer edge (no clipped stroke on retina displays).
  const r = 50 - strokeWidth / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, progress));
  // dashoffset: 0 → full ring shown; c → empty ring shown.
  const offset = c * (1 - clamped);

  const wrapperStyle: CSSProperties = {
    position: 'relative',
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
  const overlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    textAlign: 'center',
  };

  return (
    <div style={wrapperStyle} aria-hidden={children ? undefined : true}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        // Rotate -90deg so the fill starts from 12 o'clock instead of 3.
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={strokeColorFor(tone)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset var(--dur-medium) var(--ease-out), stroke var(--dur-fast) var(--ease-out)',
          }}
        />
      </svg>
      {children ? <div style={overlayStyle}>{children}</div> : null}
    </div>
  );
}
