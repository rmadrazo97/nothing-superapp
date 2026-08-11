/**
 * progression-query.ts — pure aggregation for the PROGRESSION tab.
 *
 * The Gym mini-app stores every completed workout as a `workout_sessions` row
 * with an `entries` jsonb column (see packages/shared/src/schemas/index.ts →
 * sessionEntrySchema). This module turns a flat array of those rows into the
 * three payloads the PROGRESSION page renders:
 *
 *   1. `kpis` — four scalar cards (volume, sets, PRs, sessions) with a raw
 *      delta vs the prior comparison window.
 *   2. `volume_by_week` — 8 rolling ISO-week buckets so the top-of-page line
 *      chart always renders as a fixed-width strip, even when the user has
 *      only lifted for two weeks.
 *   3. `top_exercises` — the four most-frequently-logged exercises in the
 *      last 30 days, each with the top-set weight from up to their last 8
 *      sessions.
 *
 * PR definition: for each exercise we scan history in ascending time order
 * and track the running max top-set weight. A "PR" is a session whose top
 * set strictly exceeds the previous running max. This-week's PR count is
 * the number of distinct exercises that hit a PR in the current ISO week.
 *
 * Kept pure (no supabase, no fetch) so the server route can call it with a
 * Postgres result set AND the browser can call it with a client-side fetch
 * result if we ever expose one. Also makes it trivially unit-testable.
 */

import type { SessionEntry, SessionSet, WorkoutSession } from '@nothing/shared';
import { isoWeekKey } from './format.ts';

// ─── shared shapes (mirror the JSON contract in the PRD) ────────────────────

export interface KpiValue {
  /** Value for the "current" comparison window. */
  current: number;
  /** Signed delta vs the prior comparison window. Positive = improvement. */
  delta: number;
  /** Human label for the comparison window (e.g. "last 4w", "this week"). */
  period: string;
}

export interface ProgressionKpis {
  volume_kg: KpiValue;
  sets: KpiValue;
  prs: KpiValue;
  sessions: KpiValue;
}

export interface VolumeBucket {
  /** ISO week key, e.g. "2026-W28". */
  week: string;
  /** Total kg lifted that week (rounded). */
  kg: number;
}

export interface TopSetPoint {
  /** ISO date (YYYY-MM-DD) of the session — chart axis label. */
  session_date: string;
  /** Heaviest weight_kg logged for this exercise in the session. */
  top_set_kg: number;
  /** Reps at that top set — shown in the tooltip title. */
  top_set_reps: number;
}

export interface TopExercise {
  name: string;
  history: TopSetPoint[];
}

export interface ProgressionPayload {
  kpis: ProgressionKpis;
  volume_by_week: VolumeBucket[];
  top_exercises: TopExercise[];
}

// Minimal projection of `workout_sessions` this module needs. Keeping the
// shape narrow means the server route can pass either a Supabase row or a
// full WorkoutSession without changing the aggregator.
export interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  entries: SessionEntry[] | null;
}

// ─── constants ──────────────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const VOLUME_WEEKS = 8;
const KPI_WINDOW_WEEKS = 4;
const TOP_EXERCISES = 4;
const TOP_EXERCISE_HISTORY = 8;
/** Sessions older than this are dropped before any aggregation runs. */
export const PROGRESSION_LOOKBACK_DAYS = 120;

// ─── entry-level helpers ────────────────────────────────────────────────────

/**
 * Volume for one exercise entry in a session. Bodyweight sets (`weight_kg`
 * null) contribute zero — same rule as `format.ts::totalVolumeKg`.
 */
function entryVolume(sets: SessionSet[]): number {
  let sum = 0;
  for (const s of sets) {
    if (s.weight_kg == null) continue;
    sum += s.reps * s.weight_kg;
  }
  return sum;
}

/**
 * Count of *completed* sets in an entry. A set is "completed" iff it has a
 * completed_at timestamp — mirrors format.ts::totalSetsCompleted so PROGRESSION
 * numbers agree with the home-screen recent list.
 */
function completedSets(sets: SessionSet[]): number {
  let n = 0;
  for (const s of sets) if (s.completed_at) n += 1;
  return n;
}

/**
 * Heaviest weight_kg across an entry's sets (nulls skipped). Returns null if
 * the entry has no weighted sets — bodyweight-only exercises never PR.
 */
function topSet(sets: SessionSet[]): { weight_kg: number; reps: number } | null {
  let best: { weight_kg: number; reps: number } | null = null;
  for (const s of sets) {
    if (s.weight_kg == null) continue;
    if (!best || s.weight_kg > best.weight_kg) {
      best = { weight_kg: s.weight_kg, reps: s.reps };
    }
  }
  return best;
}

// ─── session-level helpers ──────────────────────────────────────────────────

/** All entries in a session, coercing null → []. */
function entriesOf(session: SessionRow): SessionEntry[] {
  return Array.isArray(session.entries) ? session.entries : [];
}

function sessionVolume(session: SessionRow): number {
  let sum = 0;
  for (const e of entriesOf(session)) sum += entryVolume(e.sets);
  return sum;
}

function sessionSetCount(session: SessionRow): number {
  let n = 0;
  for (const e of entriesOf(session)) n += completedSets(e.sets);
  return n;
}

// ─── window filters ────────────────────────────────────────────────────────

/**
 * Windowed sessions filter: `[startInclusive, endExclusive)` on started_at.
 * Uses started_at (not ended_at) so a session that spans midnight is bucketed
 * by when it began — matches how the home page dates sessions.
 */
function inWindow(
  sessions: SessionRow[],
  startInclusive: number,
  endExclusive: number,
): SessionRow[] {
  return sessions.filter((s) => {
    const t = Date.parse(s.started_at);
    return t >= startInclusive && t < endExclusive;
  });
}

// ─── KPI computation ───────────────────────────────────────────────────────

interface KpiWindow {
  volume: number;
  sets: number;
  sessions: number;
}

function summarizeWindow(sessions: SessionRow[]): KpiWindow {
  let volume = 0;
  let sets = 0;
  for (const s of sessions) {
    volume += sessionVolume(s);
    sets += sessionSetCount(s);
  }
  return { volume: Math.round(volume), sets, sessions: sessions.length };
}

/**
 * PR aggregator: walks sessions in ascending time order, tracking the running
 * max top-set weight per exercise. Returns the ISO week each PR landed in so
 * we can bucket "PRs this week" without re-scanning.
 */
function computePrsByWeek(sessions: SessionRow[]): Map<string, number> {
  const runningMax = new Map<string, number>();
  const prWeekCounts = new Map<string, Set<string>>(); // week → set of exercise names

  const sorted = [...sessions].sort(
    (a, b) => Date.parse(a.started_at) - Date.parse(b.started_at),
  );

  for (const session of sorted) {
    const week = isoWeekKey(session.started_at);
    for (const entry of entriesOf(session)) {
      const top = topSet(entry.sets);
      if (!top) continue;
      // Dedupe by name — exercise_id is more stable but many sessions in
      // the wild come from `+ empty` flows that don't set an id yet.
      const key = entry.name || entry.exercise_id;
      if (!key) continue;
      const prev = runningMax.get(key) ?? 0;
      if (top.weight_kg > prev) {
        runningMax.set(key, top.weight_kg);
        // Skip the "first-ever session" case — otherwise every rookie's very
        // first week would show 10+ PRs, which is technically true but not a
        // useful signal. `prev > 0` means we've seen the exercise before.
        if (prev > 0) {
          if (!prWeekCounts.has(week)) prWeekCounts.set(week, new Set());
          prWeekCounts.get(week)!.add(key);
        }
      }
    }
  }

  const out = new Map<string, number>();
  for (const [week, names] of prWeekCounts) out.set(week, names.size);
  return out;
}

// ─── volume-by-week bucketing ──────────────────────────────────────────────

/**
 * Build exactly `VOLUME_WEEKS` buckets ending in the current ISO week. Weeks
 * with no sessions render as `kg: 0` so the line chart stays a fixed-width
 * strip regardless of gaps in the user's training history.
 */
function buildVolumeByWeek(sessions: SessionRow[], now: Date): VolumeBucket[] {
  // Aggregate first
  const byWeek = new Map<string, number>();
  for (const s of sessions) {
    const week = isoWeekKey(s.started_at);
    byWeek.set(week, (byWeek.get(week) ?? 0) + sessionVolume(s));
  }

  // Walk backwards from `now` in 7-day strides, computing the ISO week key at
  // each step. Uses the current date's actual timestamp (not midnight) so DST
  // days can't accidentally double-count.
  const buckets: VolumeBucket[] = [];
  for (let i = VOLUME_WEEKS - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * WEEK_MS);
    const week = isoWeekKey(t.toISOString());
    buckets.push({ week, kg: Math.round(byWeek.get(week) ?? 0) });
  }
  return buckets;
}

// ─── top-exercise history ──────────────────────────────────────────────────

/**
 * Pick the `TOP_EXERCISES` most-frequently-logged exercises in the last 30
 * days and return the top set from each of their last `TOP_EXERCISE_HISTORY`
 * sessions. Only exercises with ≥ 2 sessions (a chart of one point is a dot).
 */
function buildTopExercises(sessions: SessionRow[], now: Date): TopExercise[] {
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  // Count sessions per exercise name (using entries within recent sessions).
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (Date.parse(s.started_at) < thirtyDaysAgo) continue;
    // Dedupe within a session — a workout that has bench press twice (e.g.
    // top-set / backoff) is one session for the exercise, not two.
    const seen = new Set<string>();
    for (const e of entriesOf(s)) {
      const name = (e.name || e.exercise_id || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_EXERCISES)
    .map(([name]) => name);

  // For each ranked exercise, walk *all* sessions (not just 30d) newest-first
  // and pull up to N top sets so a chart shows a real slope even when the
  // exercise was only trained twice in the last month.
  const sortedDesc = [...sessions].sort(
    (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
  );

  const out: TopExercise[] = [];
  for (const name of ranked) {
    const history: TopSetPoint[] = [];
    for (const s of sortedDesc) {
      if (history.length >= TOP_EXERCISE_HISTORY) break;
      for (const e of entriesOf(s)) {
        if ((e.name || e.exercise_id || '').trim() !== name) continue;
        const top = topSet(e.sets);
        if (!top) continue;
        history.push({
          session_date: s.started_at.slice(0, 10),
          top_set_kg: Math.round(top.weight_kg * 10) / 10,
          top_set_reps: top.reps,
        });
        break; // one top set per session
      }
    }
    if (history.length >= 2) {
      // Chart reads left→right = old→new.
      out.push({ name, history: history.slice().reverse() });
    }
  }
  return out;
}

// ─── isoWeek helpers (thin wrappers around format.ts) ──────────────────────

/**
 * ISO week of `now`. Duplicated here (rather than imported from shared) so
 * this module has zero shared/DB deps and can be tested with just an array.
 */
function currentWeek(now: Date): string {
  return isoWeekKey(now.toISOString());
}

// ─── public entrypoint ─────────────────────────────────────────────────────

/**
 * Fold an array of `workout_sessions` rows into the PROGRESSION payload.
 *
 * `now` is a parameter so tests can pin the "current" moment; production
 * callers pass `new Date()`.
 */
export function computeProgression(
  allSessions: SessionRow[],
  now: Date,
): ProgressionPayload {
  // Only count sessions the user actually finished. A live session (ended_at
  // null) reflects intent, not lifted volume, and would double-count if the
  // user started W10 and then came back to end W9.
  const finished = allSessions.filter((s) => s.ended_at != null);

  // KPI windows: last 4w vs prior 4w for volume/sets; current ISO week vs
  // previous ISO week for PRs + sessions.
  const nowMs = now.getTime();
  const fourWeeksMs = KPI_WINDOW_WEEKS * WEEK_MS;
  const eightWeeksMs = 2 * fourWeeksMs;

  const last4 = inWindow(finished, nowMs - fourWeeksMs, nowMs + 1);
  const prior4 = inWindow(finished, nowMs - eightWeeksMs, nowMs - fourWeeksMs);

  const cur = summarizeWindow(last4);
  const prev = summarizeWindow(prior4);

  // PRs & sessions bucket by ISO week rather than a rolling 7-day window
  // because that's how the user reads them ("this week I hit two PRs").
  const thisWeekKey = currentWeek(now);
  const lastWeekKey = currentWeek(new Date(nowMs - WEEK_MS));

  const prsByWeek = computePrsByWeek(finished);
  const prsThisWeek = prsByWeek.get(thisWeekKey) ?? 0;
  const prsLastWeek = prsByWeek.get(lastWeekKey) ?? 0;

  const sessionsThisWeek = finished.filter(
    (s) => isoWeekKey(s.started_at) === thisWeekKey,
  ).length;
  const sessionsLastWeek = finished.filter(
    (s) => isoWeekKey(s.started_at) === lastWeekKey,
  ).length;

  return {
    kpis: {
      volume_kg: {
        current: cur.volume,
        delta: cur.volume - prev.volume,
        period: 'last 4w',
      },
      sets: {
        current: cur.sets,
        delta: cur.sets - prev.sets,
        period: 'last 4w',
      },
      prs: {
        current: prsThisWeek,
        delta: prsThisWeek - prsLastWeek,
        period: 'this week',
      },
      sessions: {
        current: sessionsThisWeek,
        delta: sessionsThisWeek - sessionsLastWeek,
        period: 'this week',
      },
    },
    volume_by_week: buildVolumeByWeek(finished, now),
    top_exercises: buildTopExercises(finished, now),
  };
}

/**
 * Empty payload — served by the API when the user has no finished sessions
 * in the lookback window. Keeps the client from having to null-check every
 * field.
 */
export function emptyProgression(now: Date): ProgressionPayload {
  return {
    kpis: {
      volume_kg: { current: 0, delta: 0, period: 'last 4w' },
      sets: { current: 0, delta: 0, period: 'last 4w' },
      prs: { current: 0, delta: 0, period: 'this week' },
      sessions: { current: 0, delta: 0, period: 'this week' },
    },
    volume_by_week: buildVolumeByWeek([], now),
    top_exercises: [],
  };
}
