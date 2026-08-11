'use client';

/**
 * TodayCard — the launcher's cross-mini-app TODAY summary. Sits above the
 * mini-app tile grid on `/app` and gives the user a one-glance view of
 * their current-day state across every installed mini-app.
 *
 * Data comes from GET /api/launcher/today (a single parallel aggregation
 * over calorie / workout / habits / journal tables). We fetch client-side
 * after mount so the launcher's first paint isn't blocked on a multi-table
 * read — parity with the calorie-lite TodayInsights pattern.
 *
 * Hide rules — this card is aggressively minimal so a fresh account never
 * sees clutter above the tile grid:
 *   - 402 (unentitled) → render nothing.
 *   - Network / server error → render nothing (silent; the tile grid still
 *     works, and the assistant tile below is a much better fallback).
 *   - All slices empty (0 kcal AND no workout AND 0 habits done AND no
 *     journal) → render nothing.
 *
 * Once a user has ANY data for the day, the card appears with all four
 * cells so their eyes learn the shape (empty cells show `—` rather than
 * disappearing — the layout stability matters more than the byte-savings
 * of hiding cells individually).
 */
import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/pixel-ui/PixelCard';
import { PixelMetricGrid } from '@/components/pixel-ui/PixelMetricGrid';

interface Summary {
  date: string;
  kcal: { current: number; target: number };
  workout: { logged_today: boolean; session_id: string | null };
  habits: { done_today: number; active_total: number };
  journal: { has_entry: boolean; mood: string | null };
}

/** "MON · AUG 12" — Space Mono meta line under the TODAY eyebrow. */
function formatDateLabel(iso: string): string {
  // Parse the YYYY-MM-DD as a local date (not UTC) so the weekday matches
  // what the user sees on their phone's home screen.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  const weekday = dt
    .toLocaleDateString('en-US', { weekday: 'short' })
    .toUpperCase();
  const month = dt
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase();
  return `${weekday} · ${month} ${d}`;
}

export function TodayCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'hidden'>(
    'loading',
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/launcher/today', {
          credentials: 'same-origin',
        });
        if (!res.ok) {
          // 401 / 402 / 500 — silently hide. The launcher is still useful
          // without a summary card, and an error banner up top would fight
          // for attention with the assistant tile.
          if (!cancelled) setStatus('hidden');
          return;
        }
        const body = (await res.json()) as Summary;
        if (cancelled) return;
        setSummary(body);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('hidden');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status !== 'ready' || !summary) return null;

  // Empty-state gate — don't clutter the launcher for a brand-new user
  // whose day is blank. As soon as they log anything, the card materialises.
  const hasAnyData =
    summary.kcal.current > 0 ||
    summary.workout.logged_today ||
    summary.habits.done_today > 0 ||
    summary.journal.has_entry;
  if (!hasAnyData) return null;

  const { kcal, workout, habits, journal } = summary;

  // kcal delta = target - current, i.e. "budget remaining". Passed as a
  // negative when the user has already gone over — PixelMetricGrid renders
  // negative deltas in the muted tone we opted into below, so an over-eat
  // day reads as a graphite ▼ rather than a red alarm.
  const kcalDelta =
    kcal.target > 0 ? kcal.target - kcal.current : undefined;

  return (
    <PixelCard title="TODAY" meta={formatDateLabel(summary.date)}>
      <PixelMetricGrid
        kind="metric_grid"
        negativeDeltaTone="muted"
        items={[
          {
            label: 'KCAL',
            value: kcal.current,
            unit: kcal.target > 0 ? `/ ${kcal.target}` : undefined,
            delta: kcalDelta,
          },
          {
            label: 'WORKOUT',
            value: workout.logged_today ? '✓' : '—',
          },
          {
            label: 'HABITS',
            value: habits.done_today,
            unit:
              habits.active_total > 0 ? `/ ${habits.active_total}` : undefined,
          },
          {
            label: 'JOURNAL',
            value: journal.has_entry ? '✓' : '—',
          },
        ]}
      />
    </PixelCard>
  );
}
