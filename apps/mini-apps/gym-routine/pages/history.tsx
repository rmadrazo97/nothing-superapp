'use client';

/**
 * History — completed sessions grouped by ISO week, newest first.
 *
 * Each entry shows name + duration + volume + sets. Tap → session detail
 * (which is the same `SessionPage` component; it renders read-only when
 * `ended_at` is non-null).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { WorkoutSession } from '@nothing/shared';
import * as api from '../lib/api.ts';
import { ApiError } from '../lib/api.ts';
import { cardStyle } from '../lib/ui.ts';
import {
  durationLabel,
  isoWeekKey,
  weekLabel,
  toDateLabel,
  totalSetsCompleted,
  totalVolumeKg,
} from '../lib/format.ts';

export default function HistoryPage() {
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { sessions } = await api.listSessions(50);
      setSessions(sessions.filter((s) => s.ended_at != null));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load history.');
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    if (!sessions) return [];
    const buckets = new Map<string, WorkoutSession[]>();
    for (const s of sessions) {
      const key = isoWeekKey(s.started_at);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(s);
      else buckets.set(key, [s]);
    }
    // Descending week order (newest first).
    return Array.from(buckets.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [sessions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">HISTORY</span>
        <Link href="/app/gym-routine" style={{ textDecoration: 'none' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            ← Back
          </span>
        </Link>
      </div>

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      {sessions === null ? (
        <p className="caption">Loading…</p>
      ) : sessions.length === 0 ? (
        <div style={{ ...cardStyle, borderStyle: 'dashed', textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            No completed sessions yet. Finish a workout to see it here.
          </p>
        </div>
      ) : (
        grouped.map(([weekKey, group]) => {
          // Sample date from the first session in the group for a proper label.
          const label = weekLabel(group[0].started_at);
          const weekVolume = group.reduce((s, g) => s + totalVolumeKg(g.entries), 0);
          return (
            <section
              key={weekKey}
              aria-label={label}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="label">{label}</span>
                <span
                  className="data"
                  style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-caption)' }}
                >
                  {weekVolume.toLocaleString()} KG · {group.length} SESSION{group.length === 1 ? '' : 'S'}
                </span>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {group.map((s) => (
                  <li key={s.id}>
                    <Link href={`/app/gym-routine/session/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ color: 'var(--color-text-display)' }}>
                            {s.name ?? 'Untitled session'}
                          </span>
                          <span
                            className="data"
                            style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}
                          >
                            {toDateLabel(s.started_at)}
                          </span>
                        </div>
                        <span
                          className="data"
                          style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-caption)' }}
                        >
                          {durationLabel(s.started_at, s.ended_at)} ·{' '}
                          {totalSetsCompleted(s.entries)} sets ·{' '}
                          {totalVolumeKg(s.entries).toLocaleString()} kg
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
