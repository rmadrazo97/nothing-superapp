/**
 * Pure trend math for the WEIGHT history chart (v0.6.4).
 *
 * Everything is in kg + epoch-ms; the view converts to the user's unit at
 * render time. Kept DOM-free so it can be unit tested.
 */

export type WeightPoint = { t: number; kg: number };

export type WeightRange = '30d' | '90d' | '6m' | '1y' | 'all';

export const RANGE_LABEL: Record<WeightRange, string> = {
  '30d': '30D',
  '90d': '90D',
  '6m': '6M',
  '1y': '1Y',
  all: 'ALL',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<Exclude<WeightRange, 'all'>, number> = {
  '30d': 30,
  '90d': 90,
  '6m': 183,
  '1y': 365,
};

/** Oldest → newest, invalid timestamps / weights dropped. */
export function toPoints(
  entries: ReadonlyArray<{ entered_at: string; weight_kg: number }>,
): WeightPoint[] {
  return entries
    .map((e) => ({ t: Date.parse(e.entered_at), kg: Number(e.weight_kg) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.kg) && p.kg > 0)
    .sort((a, b) => a.t - b.t);
}

export function filterRange(points: WeightPoint[], range: WeightRange, now: number): WeightPoint[] {
  if (range === 'all') return points;
  const min = now - RANGE_DAYS[range] * DAY_MS;
  return points.filter((p) => p.t >= min);
}

/**
 * Trailing time-window moving average (default 7 days). Daily weight
 * swings 1–2 kg on water alone; the 7-day average is the number that
 * actually tells you where you're heading.
 */
export function movingAverage(points: WeightPoint[], windowDays = 7): WeightPoint[] {
  const win = windowDays * DAY_MS;
  const out: WeightPoint[] = [];
  let start = 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i].kg;
    while (points[i].t - points[start].t >= win) {
      sum -= points[start].kg;
      start++;
    }
    out.push({ t: points[i].t, kg: sum / (i - start + 1) });
  }
  return out;
}

/** Least-squares fit. `null` with < 2 points or zero time span. */
export function linearFit(
  points: WeightPoint[],
): { slopePerDay: number; at: (t: number) => number } | null {
  const n = points.length;
  if (n < 2) return null;
  const t0 = points[0].t;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    const x = (p.t - t0) / DAY_MS;
    sx += x;
    sy += p.kg;
    sxx += x * x;
    sxy += x * p.kg;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-9) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  return { slopePerDay: slope, at: (t: number) => intercept + slope * ((t - t0) / DAY_MS) };
}

export type RangeStats = {
  count: number;
  first: WeightPoint;
  last: WeightPoint;
  /** Trend-smoothed start / end (7-day average) — what "change" is based on. */
  startAvg: number;
  endAvg: number;
  change: number;
  min: WeightPoint;
  max: WeightPoint;
  /** kg per week from the linear fit; null when there's too little data. */
  perWeek: number | null;
};

export function rangeStats(points: WeightPoint[]): RangeStats | null {
  if (points.length === 0) return null;
  const ma = movingAverage(points);
  const fit = linearFit(points);
  const spanDays = (points[points.length - 1].t - points[0].t) / DAY_MS;
  let min = points[0];
  let max = points[0];
  for (const p of points) {
    if (p.kg < min.kg) min = p;
    if (p.kg > max.kg) max = p;
  }
  const startAvg = ma[Math.min(ma.length - 1, firstFullWindowIdx(points))].kg;
  const endAvg = ma[ma.length - 1].kg;
  return {
    count: points.length,
    first: points[0],
    last: points[points.length - 1],
    startAvg,
    endAvg,
    change: endAvg - startAvg,
    min,
    max,
    // A weekly rate from 3 days of data is noise — require a week+.
    perWeek: fit && spanDays >= 7 ? fit.slopePerDay * 7 : null,
  };
}

/**
 * The start value uses the average of the first week (not the single first
 * weigh-in, which may have been a high/low water day).
 */
function firstFullWindowIdx(points: WeightPoint[]): number {
  const end = points[0].t + 6 * DAY_MS;
  let idx = 0;
  for (let i = 0; i < points.length && points[i].t <= end; i++) idx = i;
  return idx;
}

/**
 * Estimated date the goal is reached at the current weekly rate. Null when
 * there's no rate, the trend points away from the goal, the goal is already
 * reached, or it's more than ~3 years out (not a meaningful projection).
 */
export function projectGoal(
  currentKg: number,
  goalKg: number | null,
  perWeek: number | null,
  now: number,
): number | null {
  if (goalKg == null || perWeek == null || Math.abs(perWeek) < 0.01) return null;
  const remaining = goalKg - currentKg;
  if (Math.abs(remaining) < 0.1) return null;
  if (Math.sign(remaining) !== Math.sign(perWeek)) return null;
  const weeks = remaining / perWeek;
  if (weeks > 156) return null;
  return now + weeks * 7 * DAY_MS;
}

export type MonthRow = {
  key: string; // YYYY-MM
  year: number;
  month: number; // 0-11
  avg: number;
  min: number;
  max: number;
  count: number;
  /** avg minus the previous (older) month's avg; null for the oldest. */
  delta: number | null;
};

/** Monthly summary, newest month first. Uses local calendar months. */
export function monthlySummary(points: WeightPoint[]): MonthRow[] {
  const byKey = new Map<string, { year: number; month: number; vals: number[] }>();
  for (const p of points) {
    const d = new Date(p.t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cur = byKey.get(key) ?? { year: d.getFullYear(), month: d.getMonth(), vals: [] };
    cur.vals.push(p.kg);
    byKey.set(key, cur);
  }
  const asc = [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      key,
      year: v.year,
      month: v.month,
      avg: v.vals.reduce((s, x) => s + x, 0) / v.vals.length,
      min: Math.min(...v.vals),
      max: Math.max(...v.vals),
      count: v.vals.length,
      delta: null as number | null,
    }));
  for (let i = 1; i < asc.length; i++) asc[i].delta = asc[i].avg - asc[i - 1].avg;
  return asc.reverse();
}

/** Index of the point whose time is closest to `t` (points sorted by t). */
export function nearestIndex(points: WeightPoint[], t: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(points[lo].t - t) <= Math.abs(points[hi].t - t) ? lo : hi;
}
