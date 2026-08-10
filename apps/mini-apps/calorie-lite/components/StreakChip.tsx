'use client';

/**
 * StreakChip — expanded streak card shown top-right of the calorie-lite header.
 *
 * v3 (Wave 2-C):
 *   - Fetches from /api/mini-apps/calorie-lite/streak on mount for the
 *     authoritative current + longest + this-month numbers. Falls back to
 *     the client-side `current` prop if the fetch fails, so a flaky network
 *     never leaves the header empty.
 *   - Big Doto number (current streak) with `LONGEST N` subtitle in Space Mono.
 *   - `◐ N/30 THIS MONTH` line under the streak count.
 *   - Cadmium red flame `▲` if current === longest (fire-emoji-free).
 *
 * Renders as a compact column so it slots into the existing header row without
 * pushing "CALORIE LITE" off-screen on narrow viewports.
 */
import { useEffect, useState } from 'react';
import { useEvents } from '@nothing/mini-apps-runtime';
import { EVENT_KINDS } from '@nothing/shared';

interface StreakData {
  current_streak_days: number;
  longest_streak_days: number;
  days_logged_this_month: number;
  total_days_logged: number;
}

export function StreakChip({ current }: { current: number }) {
  const events = useEvents();
  // Seed with the client-computed number so first paint isn't a hole. When
  // the /streak fetch resolves we overwrite with authoritative values.
  const [data, setData] = useState<StreakData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/mini-apps/calorie-lite/streak', {
          credentials: 'same-origin',
        });
        if (!res.ok) return; // keep fallback
        const body = (await res.json()) as StreakData;
        if (!cancelled) setData(body);
      } catch {
        // Swallow — fallback covers the UI.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refetch when another component announces a new entry — the milestone
  // and this-month counter should feel live, not stale-until-refresh.
  useEffect(() => {
    const off = events.subscribe(EVENT_KINDS.calorie_entry_added, () => {
      void (async () => {
        try {
          const res = await fetch('/api/mini-apps/calorie-lite/streak', {
            credentials: 'same-origin',
          });
          if (!res.ok) return;
          const body = (await res.json()) as StreakData;
          setData(body);
        } catch {
          // ignore
        }
      })();
    });
    return off;
  }, [events]);

  const currentStreak = data?.current_streak_days ?? current;
  const longest = data?.longest_streak_days ?? current;
  const monthCount = data?.days_logged_this_month ?? 0;

  const active = currentStreak > 0;
  const atBest = active && currentStreak === longest;

  if (!active) {
    return (
      <span
        aria-label="No streak yet"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-1) var(--space-3)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-button)',
          color: 'var(--color-text-disabled)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            border: '1px solid var(--color-text-disabled)',
          }}
        />
        NO STREAK YET
      </span>
    );
  }

  return (
    <div
      aria-label={`Current streak: ${currentStreak} days, longest ${longest} days, ${monthCount} days this month`}
      className="nsa-streak-chip"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 'var(--space-1)',
        padding: 'var(--space-2) var(--space-3)',
        border: `1px solid ${atBest ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
        borderRadius: 'var(--radius-card)',
        background: 'rgba(0, 0, 0, 0.5)',
        // Shrinkable so the ⚙ cog next to it always fits — the extra
        // rows collapse via a11y-only visibility on ≤430px viewports
        // (see .nsa-streak-longest / .nsa-streak-month in globals.css).
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-2)',
        }}
      >
        {atBest && (
          <span
            aria-hidden
            style={{
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              lineHeight: 1,
            }}
          >
            {'▲'}
          </span>
        )}
        <span
          className="display-xl"
          style={{
            fontSize: 36,
            lineHeight: 1,
            color: 'var(--color-text-display)',
          }}
        >
          {currentStreak}
        </span>
        <span
          className="data"
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-text-secondary)',
            letterSpacing: '0.08em',
          }}
        >
          D
        </span>
      </div>
      <span
        className="data nsa-streak-longest"
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-text-secondary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        LONGEST {longest}
      </span>
      <span
        className="data nsa-streak-month"
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-text-disabled)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {'◐'} {monthCount}/30 THIS MONTH
      </span>
    </div>
  );
}
