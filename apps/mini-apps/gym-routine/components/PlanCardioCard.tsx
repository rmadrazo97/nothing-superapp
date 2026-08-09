'use client';

/**
 * PlanCardioCard — small compact card summarising the plan's cardio
 * prescription. Renders only the fields the coach actually provided.
 */
import type { PlanCardio } from '@nothing/shared';
import { cardStyle } from '../lib/ui.ts';

export function PlanCardioCard({ cardio }: { cardio: PlanCardio }) {
  const { daily_steps, post_workout, note } = cardio;
  if (!daily_steps && !post_workout && !note) return null;

  return (
    <section
      aria-label="Cardio prescription"
      style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
        CARDIO
      </span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--space-3)',
          alignItems: 'baseline',
        }}
      >
        {daily_steps != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>
              DAILY STEPS
            </span>
            <span
              style={{
                color: 'var(--color-text-display)',
                fontFamily: 'var(--font-mono, "Space Mono", monospace)',
                fontSize: 'var(--text-subheading)',
              }}
            >
              {daily_steps.toLocaleString()}
            </span>
          </div>
        )}
        {post_workout && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>
              POST-WORKOUT
            </span>
            <span
              style={{
                color: 'var(--color-text-display)',
                fontFamily: 'var(--font-mono, "Space Mono", monospace)',
                fontSize: 'var(--text-body)',
              }}
            >
              {post_workout.modality.replace(/_/g, ' ')} · {post_workout.duration_minutes}m
              {post_workout.target_heart_rate_bpm != null ? ` · ${post_workout.target_heart_rate_bpm} bpm` : ''}
            </span>
          </div>
        )}
      </div>
      {note && (
        <span className="caption" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          {note}
        </span>
      )}
    </section>
  );
}
