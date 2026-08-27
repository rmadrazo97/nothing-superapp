'use client';

import Link from 'next/link';
import type { Exercise } from '@nothing/shared';
import { ExerciseIllustration } from './ExerciseIllustration.tsx';
import { resolveSlug } from '../lib/workout-guide-map.ts';

/**
 * ExerciseCard — a single tile in the exercise grid.
 *
 * The thumbnail is the small static image (`image_url`, 180×180). We do NOT
 * eagerly load `gif_url` here — only the detail view triggers the animation
 * fetch, keeping the browse-grid light even with 1,300+ exercises.
 *
 * The Gym Visual imagery renders on a light background out of the box; on
 * our dark UI we tuck it inside a rounded, tinted plate and let the aspect
 * frame do the design work. Trying `mix-blend-mode: screen` looked wrong on
 * the anatomical linework, so we ship the plate approach.
 */
export default function ExerciseCard({
  exercise,
  onQuickAdd,
}: {
  exercise: Exercise;
  onQuickAdd?: (ex: Exercise) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <Link
        href={`/app/gym-routine/exercises/${exercise.id}`}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'block',
        }}
      >
        <ExerciseIllustration
          slug={resolveSlug(exercise)}
          fallbackGifUrl={exercise.gif_url}
          alt={exercise.name}
          size={180}
          fps={1}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            marginTop: 'var(--space-2)',
          }}
        >
          <span
            style={{
              color: 'var(--color-text-display)',
              fontSize: 'var(--text-body-sm)',
              lineHeight: 1.3,
              // Truncate long names to two lines.
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {exercise.name}
          </span>
          <span
            className="data"
            style={{
              color: 'var(--color-text-disabled)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {exercise.target}
          </span>
        </div>
      </Link>
      {onQuickAdd && (
        <button
          type="button"
          onClick={() => onQuickAdd(exercise)}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border-visible)',
            color: 'var(--color-text-secondary)',
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-2)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          + Add
        </button>
      )}
    </div>
  );
}
