'use client';

/**
 * WeightHistorySheet — expanded weight history (v0.6.4).
 *
 * Opened from the WEIGHT card's EXPAND button (or by tapping the chart).
 *   - Range chips: 30D / 90D / 6M / 1Y / ALL
 *   - Tall interactive chart: drag / hover to scrub any weigh-in
 *   - Trend stats for the selected range: change (7-day-avg based),
 *     rate per week (least-squares), low / high, weigh-in count, and an
 *     estimated goal date when the trend is heading toward the goal
 *   - Monthly breakdown: average, month-over-month change, low–high
 */
import { useMemo, useState } from 'react';
import type { WeightUnit } from '@nothing/shared';
import { BottomSheet } from '../../../web/src/components/shell/BottomSheet';
import WeightTrendChart, { type ScrubInfo } from './WeightTrendChart.tsx';
import {
  filterRange,
  monthlySummary,
  movingAverage,
  projectGoal,
  RANGE_LABEL,
  rangeStats,
  type WeightPoint,
  type WeightRange,
} from '../lib/weight-trend.ts';

const LB_PER_KG = 2.20462;
const RANGES: WeightRange[] = ['30d', '90d', '6m', '1y', 'all'];

function fmt(kg: number, unit: WeightUnit, digits = 1): string {
  return (unit === 'lb' ? kg * LB_PER_KG : kg).toFixed(digits);
}

function fmtDelta(kg: number, unit: WeightUnit): string {
  const v = unit === 'lb' ? kg * LB_PER_KG : kg;
  const r = Math.round(v * 10) / 10;
  if (r === 0) return '±0.0';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}`;
}

function fmtDate(t: number, withYear = false): string {
  return new Date(t)
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    })
    .toUpperCase();
}

/** Toward goal → success, away → accent, no goal → neutral. */
function deltaColor(deltaKg: number, fromKg: number, goalKg: number | null): string {
  if (Math.abs(deltaKg) < 0.05 || goalKg == null) return 'var(--color-text-primary)';
  const toward = Math.abs(fromKg + deltaKg - goalKg) < Math.abs(fromKg - goalKg);
  return toward ? 'var(--color-success)' : 'var(--color-accent)';
}

export default function WeightHistorySheet({
  open,
  onClose,
  points,
  unit,
  goalKg,
  totalLoaded,
  capped,
}: {
  open: boolean;
  onClose: () => void;
  /** Full loaded history, oldest → newest. */
  points: WeightPoint[];
  unit: WeightUnit;
  goalKg: number | null;
  totalLoaded: number;
  /** True when the API row cap was hit (older history may exist). */
  capped: boolean;
}) {
  const [range, setRange] = useState<WeightRange>('90d');
  const [scrub, setScrub] = useState<ScrubInfo>(null);
  const [now] = useState(() => Date.now());
  const U = unit.toUpperCase();

  const visible = useMemo(() => filterRange(points, range, now), [points, range, now]);
  const stats = useMemo(() => rangeStats(visible), [visible]);
  const months = useMemo(() => monthlySummary(points), [points]);
  const latestAvg = useMemo(() => {
    const ma = movingAverage(points);
    return ma.length ? ma[ma.length - 1].kg : null;
  }, [points]);
  // Goal ETA uses the selected range's rate from today's 7-day average.
  const eta =
    stats && latestAvg != null ? projectGoal(latestAvg, goalKg, stats.perWeek, now) : null;

  // Which ranges actually add something (hide 1Y when all data < 6 months…).
  const oldest = points[0]?.t ?? now;
  const spanDays = (now - oldest) / 86_400_000;
  const available = RANGES.filter((r) => {
    if (r === 'all' || r === '30d') return true;
    const prevDays = r === '90d' ? 30 : r === '6m' ? 90 : 183;
    return spanDays > prevDays;
  });

  const readout = scrub
    ? { label: fmtDate(scrub.point.t, true), kg: scrub.point.kg, avg: scrub.avg }
    : stats
      ? { label: `LATEST · ${fmtDate(stats.last.t)}`, kg: stats.last.kg, avg: latestAvg ?? stats.endAvg }
      : null;

  const chip = (active: boolean) => ({
    flex: 1,
    minWidth: 0,
    height: 36,
    borderRadius: 'var(--radius-button)',
    border: `1px solid ${active ? 'var(--color-text-display)' : 'var(--color-border-visible)'}`,
    background: active ? 'var(--color-text-display)' : 'transparent',
    color: active ? 'var(--color-bg)' : 'var(--color-text-secondary)',
    fontFamily: 'var(--font-label)',
    fontSize: 'var(--text-label)',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    touchAction: 'manipulation' as const,
  });

  return (
    <BottomSheet open={open} onClose={onClose} title="Weight history">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div role="tablist" aria-label="Range" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {available.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              style={chip(range === r)}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>

        {/* Readout — latest by default, the scrubbed point while dragging. */}
        {readout && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="label">{readout.label}</span>
              <span className="data" style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-display)', lineHeight: 1.1 }}>
                {fmt(readout.kg, unit)}
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)', marginLeft: 4 }}>{U}</span>
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span className="label">7-DAY AVG</span>
              <span className="data" style={{ fontSize: 'var(--text-subheading)', color: 'var(--color-text-primary)' }}>
                {fmt(readout.avg, unit)} {U}
              </span>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <p className="caption" style={{ margin: 0 }}>
            No weigh-ins in this range. Try a longer one.
          </p>
        ) : (
          <WeightTrendChart
            points={visible}
            unit={unit}
            goalKg={goalKg}
            height={260}
            interactive
            onScrub={setScrub}
          />
        )}

        <div className="label" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', color: 'var(--color-text-disabled)' }}>
          <span><span style={{ color: 'var(--color-text-display)' }}>━</span> 7-DAY TREND</span>
          <span><span style={{ color: 'var(--color-text-secondary)' }}>●</span> WEIGH-IN</span>
          {goalKg != null && (
            <span><span style={{ color: 'var(--color-accent)' }}>╌</span> GOAL {fmt(goalKg, unit)}</span>
          )}
          <span style={{ marginLeft: 'auto' }}>DRAG TO INSPECT</span>
        </div>

        {stats && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 'var(--space-2)',
            }}
          >
            <Stat
              label="CHANGE"
              value={`${fmtDelta(stats.change, unit)}`}
              sub={U}
              color={deltaColor(stats.change, stats.startAvg, goalKg)}
            />
            <Stat
              label="PER WEEK"
              value={stats.perWeek == null ? '—' : fmtDelta(stats.perWeek, unit)}
              sub={stats.perWeek == null ? 'NEED 7+ DAYS' : U}
              color={
                stats.perWeek == null
                  ? undefined
                  : deltaColor(stats.perWeek, latestAvg ?? stats.endAvg, goalKg)
              }
            />
            <Stat label="WEIGH-INS" value={String(stats.count)} sub={RANGE_LABEL[range]} />
            <Stat label="LOW" value={fmt(stats.min.kg, unit)} sub={fmtDate(stats.min.t)} />
            <Stat label="HIGH" value={fmt(stats.max.kg, unit)} sub={fmtDate(stats.max.t)} />
            {goalKg != null ? (
              <Stat
                label="GOAL ETA"
                value={eta ? fmtDate(eta) : latestAvg != null && Math.abs(latestAvg - goalKg) < 0.1 ? 'HIT' : '—'}
                sub={eta ? String(new Date(eta).getFullYear()) : 'AT THIS RATE'}
              />
            ) : (
              <Stat label="AVG" value={fmt(stats.endAvg, unit)} sub="7-DAY" />
            )}
          </div>
        )}

        {months.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span className="label">BY MONTH</span>
            <div
              className="label"
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr 1.4fr',
                gap: 'var(--space-2)',
                color: 'var(--color-text-disabled)',
                paddingBottom: 'var(--space-1)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span>MONTH</span>
              <span style={{ textAlign: 'right' }}>AVG</span>
              <span style={{ textAlign: 'right' }}>Δ</span>
              <span style={{ textAlign: 'right' }}>LOW–HIGH</span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {months.map((m) => (
                <li
                  key={m.key}
                  className="data"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr 1fr 1.4fr',
                    gap: 'var(--space-2)',
                    alignItems: 'baseline',
                    padding: 'var(--space-2) 0',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: 'var(--text-body-sm)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {new Date(m.year, m.month, 1)
                      .toLocaleDateString('en-US', { month: 'short' })
                      .toUpperCase()}{' '}
                    &apos;{String(m.year).slice(2)}
                    <span style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-label)' }}> ·{m.count}</span>
                  </span>
                  <span style={{ textAlign: 'right', color: 'var(--color-text-display)', fontWeight: 700 }}>
                    {fmt(m.avg, unit)}
                  </span>
                  <span
                    style={{
                      textAlign: 'right',
                      color: m.delta == null ? 'var(--color-text-disabled)' : deltaColor(m.delta, m.avg - m.delta, goalKg),
                    }}
                  >
                    {m.delta == null ? '—' : fmtDelta(m.delta, unit)}
                  </span>
                  <span style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                    {fmt(m.min, unit)}–{fmt(m.max, unit)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="caption" style={{ margin: 0, color: 'var(--color-text-disabled)' }}>
          {totalLoaded} weigh-ins{capped ? ' (most recent shown; older history is not loaded)' : ''}. Change
          and rate use the 7-day average, so one salty dinner doesn’t swing the numbers.
        </p>
      </div>
    </BottomSheet>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-compact)',
        padding: 'var(--space-2) var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0,
      }}
    >
      <span className="label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span
        className="data"
        style={{
          fontSize: 'var(--text-subheading)',
          fontWeight: 700,
          color: color ?? 'var(--color-text-display)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </span>
      {sub && (
        <span className="label" style={{ color: 'var(--color-text-disabled)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </span>
      )}
    </div>
  );
}
