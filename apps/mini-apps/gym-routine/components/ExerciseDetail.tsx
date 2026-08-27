'use client';

/**
 * ExerciseDetail — pure presentational render of a single exercise.
 *
 * Extracted from `pages/exercise-detail.tsx` so both the standalone route
 * (`/app/gym-routine/exercises/[id]`) AND the in-session HOW-TO bottom
 * sheet render exactly the same content: image + tags + numbered how-to
 * steps + secondary muscles.
 *
 * The "Add to routine / Add to session" actions and the routine-picker
 * flow stay on the route wrapper — they're irrelevant in the bottom-sheet
 * context where the exercise is already in the session.
 */
import type { Exercise } from '@nothing/shared';
import { chipStyle } from '../lib/ui.ts';
import AttributionFooter from './AttributionFooter.tsx';
import { ExerciseIllustration } from './ExerciseIllustration.tsx';
import { resolveSlug } from '../lib/workout-guide-map.ts';

export type ExerciseDetailProps = {
  exercise: Exercise;
  /** When true (bottom-sheet mode), suppress the "EXERCISE · id" eyebrow
   *  and outer padding — the sheet chrome already provides those. */
  compact?: boolean;
};

export default function ExerciseDetail({
  exercise,
  compact = false,
}: ExerciseDetailProps) {
  const slug = resolveSlug(exercise);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        paddingTop: compact ? 0 : 'var(--space-4)',
      }}
    >
      {!compact && (
        <span className="label">EXERCISE · {exercise.id}</span>
      )}

      <h1
        className={compact ? undefined : 'display-md'}
        style={{
          margin: 0,
          fontSize: compact ? 'var(--text-subheading)' : undefined,
          color: 'var(--color-text-display)',
        }}
      >
        {exercise.name}
      </h1>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={chipStyle(false)}>{exercise.body_part}</span>
        <span style={chipStyle(false)}>{exercise.target}</span>
        <span style={chipStyle(false)}>{exercise.equipment}</span>
      </div>

      <div style={{ alignSelf: 'center' }}>
        <ExerciseIllustration
          slug={slug}
          fallbackGifUrl={exercise.gif_url}
          alt={`${exercise.name} demonstration`}
          size={compact ? 360 : 480}
          fps={2}
        />
        {slug && (
          <div
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-text-disabled)',
              marginTop: 'var(--space-2)',
              textAlign: 'center',
            }}
          >
            Illustrations by Bryl Lim · CC BY-SA 4.0
          </div>
        )}
      </div>

      <section
        aria-label="Instructions"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <span className="label">HOW TO</span>
        {exercise.instruction_steps.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            No instructions available.
          </p>
        ) : (
          <ol
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              paddingLeft: 'var(--space-6)',
              margin: 0,
            }}
          >
            {exercise.instruction_steps.map((step, i) => (
              <li
                key={i}
                style={{ color: 'var(--color-text-primary)', lineHeight: 1.5 }}
              >
                {step}
              </li>
            ))}
          </ol>
        )}
      </section>

      {exercise.secondary_muscles.length > 0 && (
        <section
          aria-label="Secondary muscles"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <span className="label">ALSO WORKS</span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {exercise.secondary_muscles.map((m) => (
              <span key={m} style={chipStyle(false)}>
                {m}
              </span>
            ))}
          </div>
        </section>
      )}

      {!compact && <AttributionFooter />}
    </div>
  );
}
