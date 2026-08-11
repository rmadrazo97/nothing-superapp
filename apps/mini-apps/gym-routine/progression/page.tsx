'use client';

/**
 * PROGRESSION — the "am I actually getting stronger?" tab for the Gym mini-app.
 *
 * v0.5.8: first dogfood of the PixelUI component library (v0.5.4) outside the
 * assistant. Layout:
 *   - Header (same shell chrome as MEASUREMENTS)
 *   - `<PixelMetricGrid>` — 4 KPIs (volume / sets / PRs / sessions) with a
 *     signed delta chip on each cell. Volume + sets compare last 4w vs prior
 *     4w; PRs + sessions compare this ISO week vs last week.
 *   - `<PixelLineChart>` — total volume per week for the last 8 ISO weeks,
 *     wrapped in a `<PixelCard>` so it inherits the 2×2 cadmium LED signature.
 *   - Per-exercise strip: up to 4 compact `<PixelLineChart>` cards (top set
 *     over last N sessions) for the most-trained exercises this month.
 *   - Empty state when the aggregator returns no exercises.
 *
 * The aggregation is done server-side — see
 * `apps/web/src/app/api/mini-apps/gym-routine/progression/route.ts`. This
 * component just does a single GET on mount and renders.
 *
 * Design constraints (per the task PRD):
 *   - Cadmium accent for positive deltas; graphite for negative. The shared
 *     `<PixelMetricGrid>` accepts `negativeDeltaTone="muted"` (v0.5.10) so
 *     it routes negatives to `--color-text-disabled` instead of cadmium,
 *     avoiding the collision with the LED signature (also cadmium). Zero
 *     deltas are omitted (the shared grid drops them naturally when
 *     `delta` is undefined; we pass `undefined` for zero to preserve the
 *     "nothing to celebrate / nothing to worry about" beat).
 *   - Same 3px cell + 1px gap grid rhythm as the rest of PixelUI.
 *   - Per-exercise mini-charts stack 2×2 on mobile via CSS grid auto-fit.
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { PixelCard, PixelLineChart, PixelMetricGrid } from '../../../web/src/components/pixel-ui';
import type {
  ProgressionPayload,
  TopExercise,
  VolumeBucket,
} from '../lib/progression-query.ts';
import { ghostButtonStyle } from '../lib/ui.ts';

// ─── page ──────────────────────────────────────────────────────────────────

export default function ProgressionPage() {
  const [data, setData] = useState<ProgressionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/mini-apps/gym-routine/progression', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        // 401 → auth loop handled by proxy. 402 → paywall (see api.ts).
        // Anything else → generic message + RELOAD affordance.
        if (res.status === 402) throw new Error('subscription_required');
        throw new Error(`http_${res.status}`);
      }
      const body = (await res.json()) as ProgressionPayload;
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasSignal =
    data !== null &&
    (data.kpis.sessions.current > 0 ||
      data.top_exercises.length > 0 ||
      data.volume_by_week.some((b) => b.kg > 0));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-12)',
      }}
    >
      {/* Header — matches MEASUREMENTS eyebrow + Doto title shape. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="label">GYM · PROGRESSION</span>
          <h1 className="display-lg" style={{ margin: 0 }}>
            PROGRESSION
          </h1>
        </div>
      </div>

      <Link href="/app/gym-routine" style={{ textDecoration: 'none' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          ← BACK TO GYM
        </span>
      </Link>

      {error && (
        <ErrorCard
          message={
            error === 'subscription_required'
              ? "This one's paid. Subscribe on the paywall."
              : "Couldn't load your progression. Try again?"
          }
          onReload={() => void load()}
        />
      )}

      {loading && !data && (
        <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          Loading…
        </p>
      )}

      {data && !hasSignal && !error && <EmptyState />}

      {data && hasSignal && !error && (
        <>
          <PixelCard title="SUMMARY" meta="LAST 4W · THIS WEEK">
            <PixelMetricGrid
              kind="metric_grid"
              negativeDeltaTone="muted"
              items={[
                {
                  label: 'VOLUME',
                  unit: 'KG',
                  value: data.kpis.volume_kg.current,
                  delta: data.kpis.volume_kg.delta || undefined,
                },
                {
                  label: 'SETS',
                  value: data.kpis.sets.current,
                  delta: data.kpis.sets.delta || undefined,
                },
                {
                  label: 'PRS',
                  value: data.kpis.prs.current,
                  delta: data.kpis.prs.delta || undefined,
                },
                {
                  label: 'SESSIONS',
                  value: data.kpis.sessions.current,
                  delta: data.kpis.sessions.delta || undefined,
                },
              ]}
            />
          </PixelCard>

          <VolumeChartCard buckets={data.volume_by_week} />

          {data.top_exercises.length > 0 && (
            <PerExerciseGrid exercises={data.top_exercises} />
          )}
        </>
      )}
    </div>
  );
}

// ─── volume-per-week chart ─────────────────────────────────────────────────

function VolumeChartCard({ buckets }: { buckets: VolumeBucket[] }) {
  return (
    <PixelCard title="VOLUME PER WEEK" meta="KG · LAST 8W">
      <PixelLineChart
        kind="line_chart"
        title={undefined}
        xLabels={buckets.map((b) => weekShortLabel(b.week))}
        values={buckets.map((b) => b.kg)}
        showArea
      />
    </PixelCard>
  );
}

// ─── per-exercise mini-charts ──────────────────────────────────────────────

function PerExerciseGrid({ exercises }: { exercises: TopExercise[] }) {
  return (
    <section
      aria-label="Per-exercise progression"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      <span className="label">TOP EXERCISES</span>
      <div
        style={{
          display: 'grid',
          // 2×2 on tablet / mobile, 4-wide on desktop. minmax gives us the
          // 2×2-on-mobile behaviour the PRD asked for without a media query.
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        {exercises.map((ex) => (
          <PixelCard key={ex.name} title={truncate(ex.name, 28)} meta="TOP SET · KG">
            <PixelLineChart
              kind="line_chart"
              xLabels={ex.history.map((p) => shortDate(p.session_date))}
              values={ex.history.map((p) => p.top_set_kg)}
            />
            {/* Last-value pill so a user glancing at the card gets the current
                number without having to hover the tooltip. */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingTop: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-text-disabled)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                LATEST
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  color: 'var(--color-text-display)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {ex.history[ex.history.length - 1]?.top_set_kg.toFixed(1)}
                <span
                  style={{
                    fontFamily: 'var(--font-label)',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-text-secondary)',
                    marginLeft: 'var(--space-2)',
                  }}
                >
                  ×{ex.history[ex.history.length - 1]?.top_set_reps}
                </span>
              </span>
            </div>
          </PixelCard>
        ))}
      </div>
    </section>
  );
}

// ─── empty + error states ──────────────────────────────────────────────────

function EmptyState() {
  return (
    <PixelCard title="PROGRESSION" meta="NO DATA">
      <p
        style={{
          margin: 0,
          color: 'var(--color-text-primary)',
          fontSize: 'var(--text-body)',
        }}
      >
        Log a few sessions and the numbers will show up here.
      </p>
      <Link href="/app/gym-routine" style={{ textDecoration: 'none', marginTop: 'var(--space-3)' }}>
        <span
          className="caption"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Start a workout →
        </span>
      </Link>
    </PixelCard>
  );
}

function ErrorCard({
  message,
  onReload,
}: {
  message: string;
  onReload: () => void;
}) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    border: '1px solid var(--color-warning, var(--color-accent))',
    borderRadius: 'var(--radius-card)',
    background: 'rgba(0, 0, 0, 0.35)',
  };
  return (
    <div role="alert" style={style}>
      <span
        className="label"
        style={{ color: 'var(--color-warning, var(--color-accent))' }}
      >
        PROGRESSION · LOAD FAILED
      </span>
      <span className="caption" style={{ color: 'var(--color-text-primary)' }}>
        {message}
      </span>
      <button
        type="button"
        onClick={onReload}
        style={{ ...ghostButtonStyle, alignSelf: 'flex-start' }}
      >
        RELOAD
      </button>
    </div>
  );
}

// ─── formatting helpers ────────────────────────────────────────────────────

/** ISO week "2026-W28" → "W28" (chart axis; the year is in the card meta). */
function weekShortLabel(week: string): string {
  const m = /^\d{4}-W(\d{2})$/.exec(week);
  return m ? `W${m[1]}` : week;
}

/** ISO date "2026-08-01" → "AUG 01" — matches format.ts::toDateLabel. */
function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const month = d
    .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
    .toUpperCase();
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${month} ${day}`;
}

/** Clip a card title so it doesn't collide with the LED cluster. */
function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
