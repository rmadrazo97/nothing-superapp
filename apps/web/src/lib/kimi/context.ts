/**
 * Assembles the read-only cross-mini-app context that the AI copilot sees.
 *
 * The copilot's superpower is that it can look across ANY mini-app the user
 * has used and synthesise answers. As of v0.2 four mini-apps ship:
 *   calorie-lite   → app_calorie_entries
 *   gym-routine    → workout_sessions + workout_routines
 *   pomodoro       → pomodoro_sessions
 *   (+ meta)       → profile / preferences / cross-app events
 *
 * Invoked with the USER'S session client (not service_role) so RLS enforces
 * owner-scoping as a second line of defence even though we also
 * `.eq('user_id', userId)` explicitly.
 *
 * Serialization: JSON (not natural-language bullets) because Kimi K2 is
 * strong at reading structured JSON, ISO strings stay unambiguous, and the
 * shape maps 1:1 to the Zod schemas in @nothing/shared so drift is automatic.
 *
 * Hard cap: 6000 chars. Profile + preferences are always kept whole (small,
 * high-signal). Row lists get truncated newest-first (round-robin) if the
 * combined payload exceeds the cap.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Profile,
  Preferences,
  Event,
  CalorieEntry,
} from '@nothing/shared';

const MAX_CONTEXT_CHARS = 6000;
const MAX_ROWS_PER_TABLE = 20;
const MAX_WORKOUTS = 5;         // sessions have jsonb entries — bigger per-row cost
const MAX_ROUTINES = 5;
const MAX_POMODOROS = 30;       // one field per row — cheap

export type AssembledContext = {
  context: string;
  tokens: number;
  truncated: boolean;
};

type WorkoutSession = {
  id: string;
  routine_id: string | null;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  entries: unknown;
};

type WorkoutRoutine = {
  id: string;
  name: string;
  exercises: unknown;
  updated_at: string;
};

type PomodoroSession = {
  phase: 'work' | 'short_break' | 'long_break';
  planned_duration_seconds: number;
  actual_duration_seconds: number;
  completed: boolean;
  started_at: string;
  ended_at: string;
};

export async function assembleUserContext(
  userId: string,
  supabase: SupabaseClient,
): Promise<AssembledContext> {
  // Fire all reads in parallel — independent tables.
  // Any table that doesn't exist (older environments) is caught + skipped
  // rather than 500-ing the copilot endpoint.
  const [
    profileRes,
    prefsRes,
    entriesRes,
    eventsRes,
    workoutsRes,
    routinesRes,
    pomodorosRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('preferences').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('app_calorie_entries')
      .select('*')
      .eq('user_id', userId)
      .order('entered_at', { ascending: false })
      .limit(MAX_ROWS_PER_TABLE),
    supabase
      .from('events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS_PER_TABLE),
    supabase
      .from('workout_sessions')
      .select('id, routine_id, name, started_at, ended_at, entries')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(MAX_WORKOUTS),
    supabase
      .from('workout_routines')
      .select('id, name, exercises, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(MAX_ROUTINES),
    supabase
      .from('pomodoro_sessions')
      .select('phase, planned_duration_seconds, actual_duration_seconds, completed, started_at, ended_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(MAX_POMODOROS),
  ]);

  const profile = (profileRes.data ?? null) as Profile | null;
  const preferences = (prefsRes.data ?? null) as Preferences | null;
  let calorieEntries = (entriesRes.data ?? []) as CalorieEntry[];
  let events = (eventsRes.data ?? []) as Event[];
  let workouts = (workoutsRes.data ?? []) as WorkoutSession[];
  let routines = (routinesRes.data ?? []) as WorkoutRoutine[];
  let pomodoros = (pomodorosRes.data ?? []) as PomodoroSession[];

  // Roll pomodoros into a compact summary — the raw list is high-volume /
  // low-signal for the LLM. Keep only the last 3 individual sessions and a
  // 7-day rollup.
  const pomodoroSummary = summarisePomodoros(pomodoros);
  const recentPomodoros = pomodoros.slice(0, 3);

  let truncated = false;
  let payload = buildPayload({
    profile,
    preferences,
    calorieEntries,
    events,
    workouts,
    routines,
    pomodoroSummary,
    recentPomodoros,
  });

  // Round-robin drop the tail from whichever mini-app list is currently
  // longest so we shrink evenly instead of nuking one dimension entirely.
  while (payload.length > MAX_CONTEXT_CHARS) {
    const lengths = [
      { key: 'calorie' as const, len: calorieEntries.length, min: 1 },
      { key: 'events' as const, len: events.length, min: 1 },
      { key: 'workouts' as const, len: workouts.length, min: 1 },
      { key: 'routines' as const, len: routines.length, min: 1 },
    ];
    const trimmable = lengths.filter((l) => l.len > l.min);
    if (trimmable.length === 0) break;
    trimmable.sort((a, b) => b.len - a.len);
    const target = trimmable[0].key;
    truncated = true;
    if (target === 'calorie') calorieEntries = calorieEntries.slice(0, -1);
    else if (target === 'events') events = events.slice(0, -1);
    else if (target === 'workouts') workouts = workouts.slice(0, -1);
    else if (target === 'routines') routines = routines.slice(0, -1);
    payload = buildPayload({
      profile,
      preferences,
      calorieEntries,
      events,
      workouts,
      routines,
      pomodoroSummary,
      recentPomodoros,
    });
  }

  return {
    context: payload,
    tokens: Math.ceil(payload.length / 4),
    truncated,
  };
}

function summarisePomodoros(sessions: PomodoroSession[]): {
  total_last_7d: number;
  completed_work_last_7d: number;
  focus_minutes_last_7d: number;
  today_completed_work: number;
  today_focus_minutes: number;
} {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  let total7d = 0;
  let completedWork7d = 0;
  let focusSec7d = 0;
  let todayCompletedWork = 0;
  let todayFocusSec = 0;

  for (const s of sessions) {
    const t = Date.parse(s.started_at);
    if (isNaN(t) || t < sevenDaysAgo) continue;
    total7d += 1;
    if (s.phase === 'work') {
      if (s.completed) completedWork7d += 1;
      focusSec7d += s.actual_duration_seconds ?? 0;
      if (t >= startOfTodayMs) {
        if (s.completed) todayCompletedWork += 1;
        todayFocusSec += s.actual_duration_seconds ?? 0;
      }
    }
  }

  return {
    total_last_7d: total7d,
    completed_work_last_7d: completedWork7d,
    focus_minutes_last_7d: Math.round(focusSec7d / 60),
    today_completed_work: todayCompletedWork,
    today_focus_minutes: Math.round(todayFocusSec / 60),
  };
}

function buildPayload(input: {
  profile: Profile | null;
  preferences: Preferences | null;
  calorieEntries: CalorieEntry[];
  events: Event[];
  workouts: WorkoutSession[];
  routines: WorkoutRoutine[];
  pomodoroSummary: ReturnType<typeof summarisePomodoros>;
  recentPomodoros: PomodoroSession[];
}): string {
  const doc = {
    profile: input.profile,
    preferences: input.preferences,
    calorie_lite: {
      recent_entries: input.calorieEntries,
    },
    gym_routine: {
      recent_sessions: input.workouts,
      saved_routines: input.routines,
    },
    pomodoro: {
      summary: input.pomodoroSummary,
      recent_sessions: input.recentPomodoros,
    },
    recent_events: input.events,
  };
  return JSON.stringify(doc, null, 2);
}
