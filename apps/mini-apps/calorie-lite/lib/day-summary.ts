/**
 * day-summary.ts — TODAY-tab hero aggregation (v0.5.12).
 *
 * The TODAY tab lands a hero data card that dogfoods PixelUI: a
 * `<PixelBarChart>` of kcal-by-hour-bucket + a `<PixelMetricGrid>` with 4
 * KPIs (kcal, protein, carbs, fat). This module is the pure aggregator; the
 * page fetches `app_calorie_entries` and hands the rows to `daySummary()`.
 *
 * Mirrors the gym-routine `week-summary.ts` pattern — pure fn, no I/O, no
 * React, `now` passed in for deterministic tests + SSR.
 *
 * Delta semantic for the metric grid:
 *   - `delta = target - current`, so POSITIVE = "you still have room" and
 *     NEGATIVE = "you're over target."
 *   - Combined with `negativeDeltaTone="muted"` on the grid, a red-tinted
 *     negative delta doesn't compete with the cadmium LED signature of the
 *     PixelCard shell. Positive room stays neutral/graphite too because the
 *     accent is reserved for "hit target" states higher in the tree.
 *
 * Macro targets: preferences only stores `daily_calorie_goal` — no macro
 * fields. We derive macro targets from the calorie target using the
 * standard 30% protein / 40% carbs / 30% fat split (protein/carbs = 4
 * kcal/g, fat = 9 kcal/g). Callers can pass explicit overrides if a
 * future preferences shape adds per-macro targets.
 */

import type { CalorieEntry } from '@nothing/shared';
import { KCAL_PER_G, toLocalDateKey } from './aggregate.ts';

/** Standard macro-split percentages used when the user hasn't set custom targets. */
export const DEFAULT_MACRO_SPLIT = {
  protein: 0.3,
  carbs: 0.4,
  fat: 0.3,
} as const;

/** Number of hour-buckets in the kcal-by-hour chart. 8 × 3-hour slots. */
export const HOUR_BUCKETS = 8;

/** Explicit per-KPI target overrides (all optional). */
export interface DaySummaryTargets {
  kcal: number;
  /** Grams of protein per day; if omitted, derived from `kcal` × 30% / 4. */
  protein_g?: number;
  /** Grams of carbs per day; if omitted, derived from `kcal` × 40% / 4. */
  carbs_g?: number;
  /** Grams of fat per day; if omitted, derived from `kcal` × 30% / 9. */
  fat_g?: number;
}

export interface DayKpi {
  /** Current logged amount for today. */
  current: number;
  /** `target - current` — positive = "room left", negative = "over target". */
  delta: number;
  /** The target used to compute `delta`. Exposed so callers can render `/ target`. */
  target: number;
}

export interface DaySummary {
  /** 4 KPIs for `<PixelMetricGrid>` — kcal, protein_g, carbs_g, fat_g. */
  hero_kpis: {
    kcal: DayKpi;
    protein_g: DayKpi;
    carbs_g: DayKpi;
    fat_g: DayKpi;
  };
  /**
   * kcal per 3-hour bucket for today (length = 8).
   *   idx 0 → 00:00–02:59, idx 1 → 03:00–05:59, …, idx 7 → 21:00–23:59.
   * Bucketed (rather than 24 hourly bars) so the PixelBarChart stays
   * readable at typical mobile widths.
   */
  kcal_by_hour: number[];
  /** Human-readable bucket labels — `['0','3','6','9','12','15','18','21']`. */
  kcal_by_hour_labels: string[];
  /** The calorie target used — echoed so the page can render `/ target`. */
  kcal_target: number;
  /** True if the caller has zero entries for today. Page skips the hero when true. */
  is_empty: boolean;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function safeInt(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.round(n);
}

function deriveMacroTargets(
  kcalTarget: number,
  overrides: DaySummaryTargets,
): { protein_g: number; carbs_g: number; fat_g: number } {
  const protein_g =
    overrides.protein_g != null
      ? Math.round(overrides.protein_g)
      : Math.round((kcalTarget * DEFAULT_MACRO_SPLIT.protein) / KCAL_PER_G.protein);
  const carbs_g =
    overrides.carbs_g != null
      ? Math.round(overrides.carbs_g)
      : Math.round((kcalTarget * DEFAULT_MACRO_SPLIT.carbs) / KCAL_PER_G.carbs);
  const fat_g =
    overrides.fat_g != null
      ? Math.round(overrides.fat_g)
      : Math.round((kcalTarget * DEFAULT_MACRO_SPLIT.fat) / KCAL_PER_G.fat);
  return { protein_g, carbs_g, fat_g };
}

const HOUR_BUCKET_LABELS = ['0', '3', '6', '9', '12', '15', '18', '21'];

// ─── main ───────────────────────────────────────────────────────────────────

/**
 * Aggregate today's calorie entries into a hero-card-ready summary.
 *
 * @param entries All fetched `app_calorie_entries` rows for the current user
 *   (the page already fetches these for the entries list — we filter to
 *   today inside).
 * @param targets Nutrition targets. `kcal` is required; macro grams are
 *   derived from the kcal target if omitted.
 * @param now Anchor "today" — defaults to `new Date()`. Passed explicitly
 *   so tests + SSR stay deterministic.
 */
export function daySummary(
  entries: CalorieEntry[],
  targets: DaySummaryTargets,
  now: Date = new Date(),
): DaySummary {
  const todayKey = toLocalDateKey(now.toISOString());
  const todaysEntries = entries.filter(
    (e) => toLocalDateKey(e.entered_at) === todayKey,
  );

  const kcalTarget = Math.max(1, Math.round(targets.kcal));
  const macroTargets = deriveMacroTargets(kcalTarget, targets);

  let currentKcal = 0;
  let currentProtein = 0;
  let currentCarbs = 0;
  let currentFat = 0;
  const buckets = new Array<number>(HOUR_BUCKETS).fill(0);

  for (const e of todaysEntries) {
    currentKcal += safeInt(e.kcal);
    currentProtein += safeInt(e.protein_g);
    currentCarbs += safeInt(e.carbs_g);
    currentFat += safeInt(e.fat_g);

    // Bucket by LOCAL hour of `entered_at` — matches how the entries list
    // renders times to the user.
    const enteredAt = new Date(e.entered_at);
    const hour = enteredAt.getHours(); // 0-23, local
    const bucketIdx = Math.min(HOUR_BUCKETS - 1, Math.floor(hour / 3));
    buckets[bucketIdx] += safeInt(e.kcal);
  }

  // Round bucket totals so trigram noise doesn't produce fractional bars.
  for (let i = 0; i < buckets.length; i += 1) {
    buckets[i] = Math.round(buckets[i]);
  }

  return {
    hero_kpis: {
      kcal: {
        current: currentKcal,
        delta: kcalTarget - currentKcal,
        target: kcalTarget,
      },
      protein_g: {
        current: currentProtein,
        delta: macroTargets.protein_g - currentProtein,
        target: macroTargets.protein_g,
      },
      carbs_g: {
        current: currentCarbs,
        delta: macroTargets.carbs_g - currentCarbs,
        target: macroTargets.carbs_g,
      },
      fat_g: {
        current: currentFat,
        delta: macroTargets.fat_g - currentFat,
        target: macroTargets.fat_g,
      },
    },
    kcal_by_hour: buckets,
    kcal_by_hour_labels: [...HOUR_BUCKET_LABELS],
    kcal_target: kcalTarget,
    is_empty: todaysEntries.length === 0,
  };
}
