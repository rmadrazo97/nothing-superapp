'use client';

/**
 * Exercise browser — searchable, body-part-filtered grid of the 1,324
 * exercises seeded in migration 003.
 *
 * Search is debounced (400ms). Body-part filter round-trips to the API
 * because the DB has an `exercises_body_part_idx` — cheap enough to always
 * be a server query, and it avoids shipping the full 1,300+ row payload to
 * the client. Pagination is offset-based with a fixed page size of 60 — a
 * "Load more" button appends the next page in place.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Exercise, BodyPart } from '@nothing/shared';
import { EmptyState } from '@nothing/mini-apps-runtime';
// Same-module toast + shortcuts from the host app. Resolves to the same
// context instance mounted in /app/layout.tsx.
import { useToast } from '../../../web/src/lib/toast/context';
import { useSearchSlashShortcut } from '../../../web/src/lib/hooks/use-keyboard-shortcuts';
import { SkeletonGrid } from '../../../web/src/components/ui/Skeleton';
import * as api from '../lib/api.ts';
import { ApiError, toastForError } from '../lib/api.ts';
import SearchBar from '../components/SearchBar.tsx';
import BodyPartTabs from '../components/BodyPartTabs.tsx';
import ExerciseGrid from '../components/ExerciseGrid.tsx';
import AttributionFooter from '../components/AttributionFooter.tsx';
import { ghostButtonStyle, primaryButtonStyle } from '../lib/ui.ts';

const PAGE_SIZE = 60;

export default function ExercisesPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [bodyPart, setBodyPart] = useState<BodyPart | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  // `/` focuses the search field. Scoped: querySelector inside our own
  // wrapper so we don't accidentally focus something in the shell nav.
  useSearchSlashShortcut(() =>
    searchWrapRef.current?.querySelector('input[type="search"]') as HTMLElement | null,
  );

  // Debounce the search input.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch on filter change — reset pagination.
  useEffect(() => {
    let cancelled = false;
    const rid = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setOffset(0);
    api
      .listExercises({
        body_part: bodyPart ?? undefined,
        q: debouncedQ || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      })
      .then((resp) => {
        if (cancelled || rid !== requestIdRef.current) return;
        setExercises(resp.exercises);
        setTotal(resp.total);
      })
      .catch((e: unknown) => {
        if (cancelled || rid !== requestIdRef.current) return;
        setError(
          e instanceof ApiError && e.status === 402
            ? 'Subscription required.'
            : 'Could not load exercises.',
        );
        const t = toastForError(e);
        if (t) toast[t.variant](t.message);
      })
      .finally(() => {
        if (!cancelled && rid === requestIdRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bodyPart, debouncedQ]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const next = offset + PAGE_SIZE;
      const resp = await api.listExercises({
        body_part: bodyPart ?? undefined,
        q: debouncedQ || undefined,
        limit: PAGE_SIZE,
        offset: next,
      });
      setExercises((prev) => [...prev, ...resp.exercises]);
      setOffset(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load more.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    } finally {
      setLoading(false);
    }
  }, [bodyPart, debouncedQ, offset]);

  const hasMore = useMemo(
    () => exercises.length < total && exercises.length > 0,
    [exercises.length, total],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-12)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">EXERCISES</span>
        <Link href="/app/gym-routine" style={{ textDecoration: 'none' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            ← BACK
          </span>
        </Link>
      </div>

      <div ref={searchWrapRef}>
        <SearchBar value={q} onChange={setQ} placeholder="Search 1,324 exercises" />
      </div>

      <BodyPartTabs value={bodyPart} onChange={setBodyPart} />

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      <span
        className="data"
        style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-caption)' }}
      >
        {total.toLocaleString()} MATCH{total === 1 ? '' : 'ES'}
      </span>

      {loading && exercises.length === 0 ? (
        <SkeletonGrid count={6} />
      ) : (
      <ExerciseGrid
        exercises={exercises}
        loading={false}
        empty={
          <EmptyState
            icon="◈"
            title="No exercises match"
            body={
              debouncedQ
                ? `Nothing matches "${debouncedQ}". Try a different term or clear the body-part filter.`
                : 'No exercises match that filter. Try a different body part.'
            }
            primaryAction={
              debouncedQ || bodyPart
                ? {
                    label: 'Clear filters',
                    onClick: () => {
                      setQ('');
                      setBodyPart(null);
                    },
                  }
                : undefined
            }
          />
        }
      />
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          style={{
            ...ghostButtonStyle,
            alignSelf: 'center',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}

      <AttributionFooter />
    </div>
  );
}
