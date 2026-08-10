'use client';

/**
 * ExerciseInfoSheet — bottom-sheet wrapper that renders the full
 * <ExerciseDetail> for a given exercise id inside the shared
 * <BottomSheet> shell. Used by the live session view when the user
 * taps the small ⓘ icon on an exercise card.
 *
 * Fetches the exercise on open — cheap (one row lookup) and lazy
 * (nothing over the wire until the user actually opens the sheet).
 * Response is cached in-component via a local ref keyed by id so
 * re-opening the same exercise doesn't refetch.
 */
import { useEffect, useRef, useState } from 'react';
import type { Exercise } from '@nothing/shared';
import { BottomSheet } from '../../../web/src/components/shell/BottomSheet';
import * as api from '../lib/api.ts';
import ExerciseDetail from './ExerciseDetail.tsx';

export type ExerciseInfoSheetProps = {
  exerciseId: string | null;
  open: boolean;
  onClose: () => void;
};

export default function ExerciseInfoSheet({
  exerciseId,
  open,
  onClose,
}: ExerciseInfoSheetProps) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, Exercise>>(new Map());

  useEffect(() => {
    if (!open || !exerciseId) return;
    const cached = cacheRef.current.get(exerciseId);
    if (cached) {
      setExercise(cached);
      setError(null);
      return;
    }
    let cancelled = false;
    setExercise(null);
    setError(null);
    api
      .getExercise(exerciseId)
      .then(({ exercise: ex }) => {
        if (cancelled) return;
        cacheRef.current.set(exerciseId, ex);
        setExercise(ex);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not load exercise.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, exerciseId]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={exercise?.name ?? 'How to'}
      ariaLabel="Exercise details"
    >
      {error ? (
        <p role="alert" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      ) : !exercise ? (
        <p className="caption">Loading…</p>
      ) : (
        <ExerciseDetail exercise={exercise} compact />
      )}
    </BottomSheet>
  );
}
