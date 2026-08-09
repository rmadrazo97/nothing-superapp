'use client';

/**
 * ReportsView — MFP-tier weekly reports tab for calorie-lite.
 *
 * Sections:
 *   1. Weekly summary card (Doto total, ± vs last week, days-with-data)
 *   2. 7-day trend chart (inline SVG bars + dashed goal line)
 *   3. Macros vs goal (avg-consumed vs macro_goal_pct-derived grams)
 *   4. Nutrition breakdown (fiber / sugar / sodium / cholesterol table)
 *   5. Cleanest / heaviest day cards
 *
 * All data fetched from `/api/mini-apps/calorie-lite/reports` in a single call.
 * Design tokens only — no hex colors, no non-scale spacing values.
 */
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, usePreferences } from '@nothing/mini-apps-runtime';

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;
const DEFAULT_GOAL_KCAL = 2000;
const DEFAULT_MACRO_GOAL = { protein: 30, carbs: 40, fat: 30 } as const;

// Reference "guidance" numbers for the nutrition table. Kept as constants so
// a future locale/gender-specific tweak has one edit site.
const GUIDANCE = {
  fiber_g: '≥ 25 g',
  sugar_g: '< 50 g',
  sodium_mg: '< 2300 mg',
  cholesterol_mg: '< 300 mg',
} as const;

interface DailyBucket {
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  cholesterol_mg: number;
}

interface WeekSummary {
  total_kcal: number;
  avg_kcal: number;
  days_with_data: number;
  avg_protein_g: number;
  avg_carbs_g: number;
  avg_fat_g: number;
  avg_fiber_g: number;
  avg_sugar_g: number;
  avg_sodium_mg: number;
  avg_cholesterol_mg: number;
}

interface ReportsPayload {
  this_week: WeekSummary;
  last_week: WeekSummary;
  daily: DailyBucket[];
}

const CARD_STYLE = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'var(--space-3)',
};

/** Read the macro goal from preferences with a sane default fallback. */
function useMacroGoal(): { protein: number; carbs: number; fat: number } {
  const prefs = usePreferences() as unknown as {
    macro_goal_pct?: { protein: number; carbs: number; fat: number } | null;
  };
  const g = prefs.macro_goal_pct;
  if (
    g &&
    typeof g.protein === 'number' &&
    typeof g.carbs === 'number' &&
    typeof g.fat === 'number'
  ) {
    return g;
  }
  return DEFAULT_MACRO_GOAL;
}

/** Percent delta from `prev` to `curr` — 0 when prev is 0 to avoid ∞. */
function pctDelta(curr: number, prev: number): number {
  if (prev <= 0) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

/** "MON" style short weekday for a UTC YYYY-MM-DD. */
function weekdayShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
    .toUpperCase()
    .slice(0, 3);
}

export function ReportsView({ dailyCalorieGoal }: { dailyCalorieGoal: number | null }) {
  const [payload, setPayload] = useState<ReportsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const macroGoal = useMacroGoal();
  const goalKcal = dailyCalorieGoal ?? DEFAULT_GOAL_KCAL;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/mini-apps/calorie-lite/reports', {
          credentials: 'same-origin',
        });
        if (!res.ok) {
          if (cancelled) return;
          setError(res.status === 402 ? 'Subscription required.' : 'Could not load reports.');
          setLoading(false);
          return;
        }
        const body = (await res.json()) as ReportsPayload;
        if (cancelled) return;
        setPayload(body);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError('Network error.');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived: this-week goal-derived macro grams from the user's macro_goal_pct.
  const goalGrams = useMemo(
    () => ({
      protein: Math.round((macroGoal.protein / 100) * goalKcal / KCAL_PER_G.protein),
      carbs: Math.round((macroGoal.carbs / 100) * goalKcal / KCAL_PER_G.carbs),
      fat: Math.round((macroGoal.fat / 100) * goalKcal / KCAL_PER_G.fat),
    }),
    [macroGoal, goalKcal],
  );

  if (loading) return <p className="caption">Loading…</p>;
  if (error) {
    return (
      <div
        role="alert"
        className="caption"
        style={{
          color: 'var(--color-accent)',
          padding: 'var(--space-3) var(--space-4)',
          border: '1px solid var(--color-accent)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        {error}
      </div>
    );
  }
  if (!payload) return null;

  const thisWeekDays = payload.daily.slice(7, 14);

  if (payload.this_week.days_with_data < 3) {
    return (
      <EmptyState
        icon="◐"
        title="Not enough data"
        body="Log meals for a few days to see your trends."
      />
    );
  }

  const kcalDelta = pctDelta(payload.this_week.avg_kcal, payload.last_week.avg_kcal);

  // Cleanest day = smallest deviation from the goal macro split (sum of
  // absolute percentage-point differences). Heaviest = highest kcal.
  const activeDays = thisWeekDays.filter((d) => d.kcal > 0);
  const cleanest = activeDays.length
    ? activeDays.reduce((best, d) => {
        const dScore = macroDeviation(d, macroGoal);
        const bestScore = macroDeviation(best, macroGoal);
        return dScore < bestScore ? d : best;
      })
    : null;
  const heaviest = activeDays.length
    ? activeDays.reduce((max, d) => (d.kcal > max.kcal ? d : max))
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <WeeklySummaryCard
        summary={payload.this_week}
        goalKcal={goalKcal}
        kcalDeltaPct={kcalDelta}
      />

      <TrendChartCard days={thisWeekDays} goalKcal={goalKcal} />

      <MacrosVsGoalCard summary={payload.this_week} goalGrams={goalGrams} />

      <NutritionBreakdownCard summary={payload.this_week} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-3)',
        }}
      >
        <BestDayCard title="CLEANEST DAY" day={cleanest} subtitle="Most balanced macros" />
        <BestDayCard title="HEAVIEST DAY" day={heaviest} subtitle="Highest kcal" />
      </div>
    </div>
  );
}

/** Sum of |actual% − goal%| across P/C/F — lower = closer to goal. */
function macroDeviation(
  day: DailyBucket,
  goal: { protein: number; carbs: number; fat: number },
): number {
  const pKcal = day.protein_g * KCAL_PER_G.protein;
  const cKcal = day.carbs_g * KCAL_PER_G.carbs;
  const fKcal = day.fat_g * KCAL_PER_G.fat;
  const total = pKcal + cKcal + fKcal;
  if (total <= 0) return Number.POSITIVE_INFINITY;
  const pPct = (pKcal / total) * 100;
  const cPct = (cKcal / total) * 100;
  const fPct = (fKcal / total) * 100;
  return Math.abs(pPct - goal.protein) + Math.abs(cPct - goal.carbs) + Math.abs(fPct - goal.fat);
}

// ─── Sub-cards ───────────────────────────────────────────────────────────────

function WeeklySummaryCard({
  summary,
  goalKcal,
  kcalDeltaPct,
}: {
  summary: WeekSummary;
  goalKcal: number;
  kcalDeltaPct: number;
}) {
  const arrow = kcalDeltaPct > 0 ? '▲' : kcalDeltaPct < 0 ? '▼' : '·';
  return (
    <section aria-label="Weekly summary" style={CARD_STYLE}>
      <span className="label">THIS WEEK · KCAL</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <span className="display-xl">{summary.total_kcal.toLocaleString()}</span>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          / {(goalKcal * 7).toLocaleString()}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          alignItems: 'baseline',
        }}
      >
        <SummaryStat label="AVG / DAY" value={`${summary.avg_kcal.toLocaleString()} kcal`} />
        <SummaryStat label="DAYS LOGGED" value={`${summary.days_with_data} / 7`} />
        <SummaryStat
          label="VS LAST WEEK"
          value={`${arrow} ${Math.abs(kcalDeltaPct)}%`}
        />
      </div>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span
        className="data"
        style={{
          color: 'var(--color-text-display)',
          fontSize: 'var(--text-body)',
          fontWeight: 700,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * TrendChartCard — inline SVG bar chart, no dependencies. The chart is drawn
 * inside a fixed 100×40 viewBox so it scales to the parent width smoothly on
 * any device without recalculating pixel positions on resize.
 */
function TrendChartCard({ days, goalKcal }: { days: DailyBucket[]; goalKcal: number }) {
  // Chart uses a 200×80 viewBox — plenty of resolution for 7 bars + labels
  // while staying a whole-number pixel grid at typical 1× / 2× render sizes.
  const width = 200;
  const height = 80;
  const barGap = 4;
  const barWidth = (width - barGap * (days.length + 1)) / days.length;

  // Y-scale: use the greater of (max daily kcal) or (goal kcal * 1.2) so the
  // dashed goal line always sits inside the chart even on light days.
  const maxKcal = Math.max(
    goalKcal * 1.2,
    ...days.map((d) => d.kcal),
    1,
  );

  const goalY = height - (goalKcal / maxKcal) * height;

  return (
    <section aria-label="Last 7 days trend" style={CARD_STYLE}>
      <span className="label">7-DAY TREND · KCAL</span>
      <svg
        role="img"
        aria-label={`7-day calorie trend, target ${goalKcal} kcal per day`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 100, display: 'block' }}
      >
        {/* Dashed goal line — pattern length in the same units as viewBox */}
        <line
          x1={0}
          x2={width}
          y1={goalY}
          y2={goalY}
          stroke="var(--color-text-secondary)"
          strokeWidth={0.5}
          strokeDasharray="2 2"
        />
        {days.map((d, i) => {
          const x = barGap + i * (barWidth + barGap);
          const h = Math.max(0.5, (d.kcal / maxKcal) * height);
          const y = height - h;
          return (
            <rect
              key={d.date}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              fill="var(--color-accent)"
              opacity={d.kcal > 0 ? 1 : 0.2}
              rx={0.5}
            />
          );
        })}
      </svg>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${days.length}, 1fr)`,
          gap: 0,
        }}
      >
        {days.map((d) => (
          <span
            key={d.date}
            className="data"
            style={{
              textAlign: 'center',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-text-disabled)',
              letterSpacing: '0.06em',
            }}
          >
            {weekdayShort(d.date)}
          </span>
        ))}
      </div>
    </section>
  );
}

function MacrosVsGoalCard({
  summary,
  goalGrams,
}: {
  summary: WeekSummary;
  goalGrams: { protein: number; carbs: number; fat: number };
}) {
  return (
    <section aria-label="Macros vs goal" style={CARD_STYLE}>
      <span className="label">MACROS vs GOAL · WEEK AVG</span>
      <MacroRow
        label="PROTEIN"
        actual={summary.avg_protein_g}
        goal={goalGrams.protein}
        // Protein consistently short of goal → highlight the text in red as a
        // "get more protein" nudge; carbs/fat over goal is normal noise.
        warnLow
      />
      <MacroRow
        label="CARBS"
        actual={summary.avg_carbs_g}
        goal={goalGrams.carbs}
      />
      <MacroRow
        label="FAT"
        actual={summary.avg_fat_g}
        goal={goalGrams.fat}
      />
    </section>
  );
}

function MacroRow({
  label,
  actual,
  goal,
  warnLow = false,
}: {
  label: string;
  actual: number;
  goal: number;
  warnLow?: boolean;
}) {
  const pct = goal > 0 ? Math.min(1, actual / goal) : 0;
  const isShort = warnLow && goal > 0 && actual < goal * 0.8;
  const textColor = isShort ? 'var(--color-accent)' : 'var(--color-text-display)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </span>
        <span
          className="data"
          style={{
            color: textColor,
            fontSize: 'var(--text-body-sm)',
            fontWeight: 700,
          }}
        >
          {actual.toLocaleString()} g / {goal.toLocaleString()} g
        </span>
      </div>
      <div
        aria-hidden
        style={{
          position: 'relative',
          height: 3,
          background: 'var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.round(pct * 100)}%`,
            background: 'var(--color-accent)',
          }}
        />
      </div>
    </div>
  );
}

function NutritionBreakdownCard({ summary }: { summary: WeekSummary }) {
  const rows: Array<{ nutrient: string; avg: string; guidance: string }> = [
    { nutrient: 'FIBER', avg: `${summary.avg_fiber_g} g`, guidance: GUIDANCE.fiber_g },
    { nutrient: 'SUGAR', avg: `${summary.avg_sugar_g} g`, guidance: GUIDANCE.sugar_g },
    { nutrient: 'SODIUM', avg: `${summary.avg_sodium_mg} mg`, guidance: GUIDANCE.sodium_mg },
    {
      nutrient: 'CHOLESTEROL',
      avg: `${summary.avg_cholesterol_mg} mg`,
      guidance: GUIDANCE.cholesterol_mg,
    },
  ];
  return (
    <section aria-label="Nutrition breakdown" style={CARD_STYLE}>
      <span className="label">NUTRITION · AVG / DAY</span>
      <table
        className="data"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-text-primary)',
        }}
      >
        <thead>
          <tr>
            <Th>NUTRIENT</Th>
            <Th align="right">AVG</Th>
            <Th align="right">GUIDANCE</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nutrient}>
              <Td>{r.nutrient}</Td>
              <Td align="right">{r.avg}</Td>
              <Td align="right" muted>
                {r.guidance}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: 'var(--space-2) 0',
        borderBottom: '1px solid var(--color-border)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        color: 'var(--color-text-secondary)',
        fontWeight: 400,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  muted = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  muted?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: 'var(--space-2) 0',
        borderBottom: '1px solid var(--color-border)',
        color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
      }}
    >
      {children}
    </td>
  );
}

function BestDayCard({
  title,
  subtitle,
  day,
}: {
  title: string;
  subtitle: string;
  day: DailyBucket | null;
}) {
  return (
    <section aria-label={title} style={CARD_STYLE}>
      <span className="label">{title}</span>
      {day ? (
        <>
          <span
            className="data"
            style={{
              color: 'var(--color-text-display)',
              fontSize: 'var(--text-subheading)',
              fontWeight: 700,
            }}
          >
            {weekdayShort(day.date)}
          </span>
          <span
            className="data"
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-caption)',
            }}
          >
            {day.kcal.toLocaleString()} kcal · {day.protein_g}p/{day.carbs_g}c/{day.fat_g}f
          </span>
        </>
      ) : (
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          —
        </span>
      )}
      <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>
        {subtitle}
      </span>
    </section>
  );
}
