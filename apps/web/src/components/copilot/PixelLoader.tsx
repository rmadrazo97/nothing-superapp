'use client';

/**
 * PixelLoader — a 5×5 grid of pixel cells that twinkle independently.
 *
 * Nothing OS shorthand: no spinning wheels, no throbbing bars — a quiet
 * matrix of dots that catches the eye without competing with content. Each
 * cell runs the same 1.4s opacity keyframe with a shuffled delay so the
 * pattern feels alive but never syncs into a wave.
 *
 * Sizing:
 *   - "sm"  (16px) — inline in ToolCallCard "running" state
 *   - "md"  (24px) — inline in the THINKING pill
 *   - "lg"  (48px) — full-page LOADING CHAT hydrate state
 *
 * Colour reads `currentColor` so callers control tint via `color:` on the
 * wrapper (matches the SVG-icon convention used in the composer + nav).
 */
import { useMemo, type CSSProperties } from 'react';

type Size = 'sm' | 'md' | 'lg';

// Deterministic-per-cell delays — shuffled so no two neighbours light up
// together. Values are within [0, 1.4s) so every cell hits its peak once
// per cycle. Handpicked, not RNG — SSR/CSR need identical output to avoid
// hydration mismatch.
const DELAYS_25 = [
  0.0, 0.9, 0.3, 1.2, 0.6,
  0.5, 0.15, 1.05, 0.75, 0.35,
  0.85, 0.45, 0.0, 1.3, 0.2,
  1.1, 0.65, 0.25, 0.55, 0.95,
  0.1, 0.7, 1.25, 0.4, 0.8,
];

const CELL_PX: Record<Size, number> = {
  sm: 2,
  md: 3,
  lg: 6,
};

const GAP_PX: Record<Size, number> = {
  sm: 1,
  md: 1,
  lg: 2,
};

export interface PixelLoaderProps {
  size?: Size;
  /** ARIA label — visible to screen readers, hidden visually. */
  label?: string;
  /** Optional class hook if a caller needs to nudge margin/vertical align. */
  className?: string;
  /** Inline style escape hatch — kept narrow, prefer wrapping instead. */
  style?: CSSProperties;
}

export function PixelLoader({
  size = 'md',
  label = 'Loading',
  className,
  style,
}: PixelLoaderProps) {
  const cell = CELL_PX[size];
  const gap = GAP_PX[size];
  const total = cell * 5 + gap * 4;

  // Grid-template-columns computed once per size. Not per-render RNG so SSR +
  // CSR agree.
  const gridStyle = useMemo<CSSProperties>(
    () => ({
      display: 'inline-grid',
      gridTemplateColumns: `repeat(5, ${cell}px)`,
      gridAutoRows: `${cell}px`,
      gap: `${gap}px`,
      width: total,
      height: total,
      color: 'currentColor',
      verticalAlign: 'middle',
      ...style,
    }),
    [cell, gap, total, style],
  );

  return (
    <span
      role="status"
      aria-label={label}
      aria-live="polite"
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit' }}
    >
      <span aria-hidden style={gridStyle}>
        {DELAYS_25.map((delay, i) => (
          <span
            key={i}
            style={{
              width: cell,
              height: cell,
              background: 'currentColor',
              // The keyframe (`nsa-pixel-twinkle`) is declared globally in
              // design-system/styles.css so the animation compiles once per
              // page instead of per-component.
              animation: 'nsa-pixel-twinkle 1.4s ease-in-out infinite',
              animationDelay: `${delay}s`,
              // A tiny sharp radius keeps the pixels feeling like blocks,
              // not dots.
              borderRadius: 0.5,
              willChange: 'opacity',
              opacity: 0.25,
            }}
          />
        ))}
      </span>
      {/* Visually hidden but announced by assistive tech. Callers can override
          with their own label (e.g. "THINKING") for context. */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {label}
      </span>
    </span>
  );
}
