'use client';

import type { Exercise } from '@nothing/shared';
import ExerciseCard from './ExerciseCard.tsx';

/**
 * ExerciseGrid — responsive 2-col (mobile) / 3-col (tablet) / 4-col (desktop)
 * layout. CSS Grid `auto-fill` + `minmax` handles the breakpoints without a
 * media query, which keeps this component drop-in for future container
 * queries.
 */
export default function ExerciseGrid({
  exercises,
  onQuickAdd,
  loading,
  empty,
}: {
  exercises: Exercise[];
  onQuickAdd?: (ex: Exercise) => void;
  loading?: boolean;
  empty?: React.ReactNode;
}) {
  if (loading && exercises.length === 0) {
    return <p className="caption">Loading exercises…</p>;
  }
  if (!loading && exercises.length === 0) {
    return (
      <>{empty ?? <p style={{ color: 'var(--color-text-secondary)' }}>No exercises match those filters.</p>}</>
    );
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 'var(--space-4)',
      }}
    >
      {exercises.map((ex) => (
        <ExerciseCard key={ex.id} exercise={ex} onQuickAdd={onQuickAdd} />
      ))}
    </div>
  );
}
