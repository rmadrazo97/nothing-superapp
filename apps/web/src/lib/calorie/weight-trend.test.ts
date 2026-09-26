import { describe, expect, it } from 'vitest';
import {
  filterRange,
  linearFit,
  monthlySummary,
  movingAverage,
  nearestIndex,
  projectGoal,
  rangeStats,
  toPoints,
  type WeightPoint,
} from '../../../../mini-apps/calorie-lite/lib/weight-trend';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1, 12);
/** Straight line losing 0.1 kg/day from 90 kg. */
const line = (days: number): WeightPoint[] =>
  Array.from({ length: days }, (_, i) => ({ t: T0 + i * DAY, kg: 90 - 0.1 * i }));

describe('toPoints', () => {
  it('sorts oldest-first and drops junk', () => {
    const pts = toPoints([
      { entered_at: '2026-01-03T00:00:00Z', weight_kg: 80 },
      { entered_at: 'nope', weight_kg: 81 },
      { entered_at: '2026-01-01T00:00:00Z', weight_kg: 82 },
    ]);
    expect(pts.map((p) => p.kg)).toEqual([82, 80]);
  });
});

describe('movingAverage', () => {
  it('averages over a trailing 7-day window', () => {
    const ma = movingAverage(line(10));
    expect(ma[0].kg).toBeCloseTo(90);
    // day 9 window = days 3..9 → mean of 89.7..89.1 = 89.4
    expect(ma[9].kg).toBeCloseTo(89.4);
  });
});

describe('linearFit / rangeStats', () => {
  it('recovers the weekly rate', () => {
    const fit = linearFit(line(30));
    expect(fit?.slopePerDay).toBeCloseTo(-0.1);
    const s = rangeStats(line(30))!;
    expect(s.perWeek).toBeCloseTo(-0.7);
    expect(s.change).toBeLessThan(0);
    expect(s.min.kg).toBeCloseTo(87.1);
    expect(s.max.kg).toBe(90);
  });
  it('withholds a weekly rate under a week of data', () => {
    expect(rangeStats(line(3))!.perWeek).toBeNull();
  });
  it('handles a single point', () => {
    const s = rangeStats([{ t: T0, kg: 80 }])!;
    expect(s.change).toBe(0);
    expect(s.perWeek).toBeNull();
  });
});

describe('filterRange', () => {
  it('keeps only the window', () => {
    const pts = line(100);
    const now = pts[99].t;
    expect(filterRange(pts, '30d', now)).toHaveLength(31);
    expect(filterRange(pts, 'all', now)).toHaveLength(100);
  });
});

describe('projectGoal', () => {
  it('projects when trending toward the goal', () => {
    expect(projectGoal(85, 80, -0.5, T0)).toBe(T0 + 10 * 7 * DAY);
  });
  it('null when trending away or already there', () => {
    expect(projectGoal(85, 80, 0.5, T0)).toBeNull();
    expect(projectGoal(80.05, 80, -0.5, T0)).toBeNull();
    expect(projectGoal(85, null, -0.5, T0)).toBeNull();
  });
});

describe('monthlySummary', () => {
  it('groups by month newest-first with deltas', () => {
    const rows = monthlySummary(line(45)); // Jan 1 → Feb 14
    expect(rows.map((r) => r.key)).toEqual(['2026-02', '2026-01']);
    expect(rows[1].delta).toBeNull();
    expect(rows[0].delta!).toBeLessThan(0);
    expect(rows[1].count).toBe(31);
  });
});

describe('nearestIndex', () => {
  it('binary-searches the closest time', () => {
    const pts = line(10);
    expect(nearestIndex(pts, T0 + 3.4 * DAY)).toBe(3);
    expect(nearestIndex(pts, T0 + 3.6 * DAY)).toBe(4);
    expect(nearestIndex(pts, T0 - DAY)).toBe(0);
    expect(nearestIndex([], T0)).toBe(-1);
  });
});
