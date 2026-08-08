'use client';

/**
 * History — last 7 days of completed pomodoros, one row per day.
 *
 * Only `phase === 'work'` sessions are shown (breaks are noise for the
 * "how much did I focus" question the history view answers). Each row
 * shows the day label, the count of finished pomodoros, and the total
 * focused minutes.
 */
import { useMemo } from 'react';
import type { PomodoroSession } from '@nothing/shared';

function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  const month = dt.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  return `${weekday} · ${month} ${String(d).padStart(2, '0')}`;
}

function formatMinutes(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function History({
  sessions,
  loading,
}: {
  sessions: PomodoroSession[];
  loading: boolean;
}) {
  const byDay = useMemo(() => {
    // Only completed work sessions count toward the daily focus tally.
    const work = sessions.filter((s) => s.phase === 'work' && s.completed);
    const map = new Map<string, PomodoroSession[]>();
    for (const s of work) {
      const key = toLocalDateKey(s.started_at);
      const bucket = map.get(key);
      if (bucket) bucket.push(s);
      else map.set(key, [s]);
    }
    // Newest day first.
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [sessions]);

  if (loading) {
    return <p className="caption">Loading…</p>;
  }

  if (byDay.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-secondary)' }}>
        Nothing logged yet. Finish a focus block to start your streak.
      </p>
    );
  }

  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {byDay.map(([key, day]) => {
        const totalSeconds = day.reduce((sum, s) => sum + (s.actual_duration_seconds ?? 0), 0);
        return (
          <li
            key={key}
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-card)',
              padding: 'var(--space-4)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 'var(--space-3)',
            }}
          >
            <span className="label">{toDateLabel(key)}</span>
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'baseline' }}>
              <span
                className="data"
                style={{
                  color: 'var(--color-text-display)',
                  fontSize: 'var(--text-body)',
                  fontWeight: 700,
                }}
              >
                {day.length}
                <span
                  className="label"
                  style={{ color: 'var(--color-text-secondary)', marginLeft: 'var(--space-2)' }}
                >
                  {day.length === 1 ? 'POM' : 'POMS'}
                </span>
              </span>
              <span
                className="data"
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-caption)',
                  letterSpacing: '0.06em',
                }}
              >
                {formatMinutes(totalSeconds)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
