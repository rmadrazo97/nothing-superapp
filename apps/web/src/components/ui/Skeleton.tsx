'use client';

/**
 * Skeleton — dark card with a subtle left-to-right shimmer, used as a
 * loading placeholder for grid/list views.
 *
 * All colors and durations come from design-system tokens (see
 * design-system/styles.css). The shimmer keyframe + a11y respect for
 * `prefers-reduced-motion: reduce` are declared in globals.css so this
 * component stays a pure, styleable primitive.
 *
 * Reading order: aria-hidden — screen readers should hear the surrounding
 * loading state, not the skeletons themselves.
 */
import type { CSSProperties } from 'react';

export interface SkeletonProps {
  /** CSS width — number is px, string passes through. Default '100%'. */
  width?: number | string;
  /** CSS height — number is px, string passes through. Default 16. */
  height?: number | string;
  /** Border radius token or CSS value. Default var(--radius-compact). */
  radius?: string;
  /** Extra className to merge (e.g. layout hooks). */
  className?: string;
  /** Extra inline style overrides. */
  style?: CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--radius-compact)',
  className,
  style,
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={['nsa-skeleton', className].filter(Boolean).join(' ')}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

/**
 * SkeletonCard — square tile skeleton matching the exercise-grid layout
 * (a 1:1 image plate with two lines of text below).
 */
export function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <Skeleton
        width="100%"
        height="auto"
        radius="var(--radius-card)"
        style={{ aspectRatio: '1 / 1' }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          marginTop: 'var(--space-2)',
        }}
      >
        <Skeleton width="80%" height={12} />
        <Skeleton width="40%" height={10} />
      </div>
    </div>
  );
}

/**
 * SkeletonGrid — N SkeletonCards laid out identically to ExerciseGrid.
 * Default 6 cards — enough to fill above-the-fold on most viewports.
 */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      aria-busy="true"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
