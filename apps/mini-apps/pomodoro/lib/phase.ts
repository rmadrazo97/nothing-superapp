/**
 * Phase helpers — the pure state-machine for the pomodoro cycle.
 *
 * A "cycle" is `pomodorosPerCycle` work sessions with a short break after
 * each, EXCEPT the last one which is followed by a long break. So for
 * pomodorosPerCycle=4, the sequence looks like:
 *
 *   work → short_break → work → short_break → work → short_break → work → long_break → …
 *
 * `workCompletedInCycle` counts how many work sessions we've finished
 * inside the current cycle; it resets to 0 after a long break. The
 * settings model + the DB `phase` column agree on the three enum values,
 * so this file is the single source of truth for cycle progression.
 */
export type Phase = 'work' | 'short_break' | 'long_break';

export type Settings = {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  pomodorosPerCycle: number;
  soundEnabled: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  pomodorosPerCycle: 4,
  soundEnabled: true,
};

// Persisted per-user in localStorage (keyed on user id) so a browser
// refresh keeps the same cycle position + settings.
const SETTINGS_KEY_PREFIX = 'nothing:pomodoro:settings:';
const CYCLE_KEY_PREFIX = 'nothing:pomodoro:cycle:';

export function loadSettings(userId: string): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY_PREFIX + userId);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return coerceSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(userId: string, s: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY_PREFIX + userId, JSON.stringify(s));
  } catch {
    // Storage might be full / disabled — the in-memory settings still work
    // for the session, we just can't survive reloads.
  }
}

/**
 * Cycle position — persisted so a page reload keeps the "3rd of 4 dots"
 * feel. Stored as a small blob; totally advisory.
 */
export type CycleState = {
  currentPhase: Phase;
  workCompletedInCycle: number;
};

export const DEFAULT_CYCLE: CycleState = {
  currentPhase: 'work',
  workCompletedInCycle: 0,
};

export function loadCycle(userId: string): CycleState {
  if (typeof window === 'undefined') return DEFAULT_CYCLE;
  try {
    const raw = window.localStorage.getItem(CYCLE_KEY_PREFIX + userId);
    if (!raw) return DEFAULT_CYCLE;
    const parsed = JSON.parse(raw) as Partial<CycleState>;
    return {
      currentPhase: isPhase(parsed.currentPhase) ? parsed.currentPhase : 'work',
      workCompletedInCycle:
        typeof parsed.workCompletedInCycle === 'number' && parsed.workCompletedInCycle >= 0
          ? Math.floor(parsed.workCompletedInCycle)
          : 0,
    };
  } catch {
    return DEFAULT_CYCLE;
  }
}

export function saveCycle(userId: string, c: CycleState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CYCLE_KEY_PREFIX + userId, JSON.stringify(c));
  } catch {
    // ignore
  }
}

/** Duration (in ms) for `phase` given current settings. */
export function durationMsFor(phase: Phase, s: Settings): number {
  const min = phase === 'work' ? s.workMinutes
    : phase === 'short_break' ? s.shortBreakMinutes
    : s.longBreakMinutes;
  return Math.max(1, Math.floor(min)) * 60 * 1000;
}

/**
 * Advance to the next phase. Called both on natural completion AND on
 * Skip. Returns the new cycle state; the caller decides whether to
 * auto-start or wait for the user.
 */
export function advancePhase(cycle: CycleState, s: Settings): CycleState {
  if (cycle.currentPhase === 'work') {
    const nextCompleted = cycle.workCompletedInCycle + 1;
    // If this was the last work session of the cycle → long break.
    if (nextCompleted >= Math.max(1, s.pomodorosPerCycle)) {
      return { currentPhase: 'long_break', workCompletedInCycle: nextCompleted };
    }
    return { currentPhase: 'short_break', workCompletedInCycle: nextCompleted };
  }
  // Any break → back to work. Long break also resets the counter so the
  // dots empty and the cycle starts over.
  if (cycle.currentPhase === 'long_break') {
    return { currentPhase: 'work', workCompletedInCycle: 0 };
  }
  return { currentPhase: 'work', workCompletedInCycle: cycle.workCompletedInCycle };
}

function isPhase(v: unknown): v is Phase {
  return v === 'work' || v === 'short_break' || v === 'long_break';
}

// Guardrails on user-tunable values — kept aligned with the DB check on
// `planned_duration_seconds` (positive int) + reasonable maxima so a
// misclick can't set a 999-minute work block.
function coerceSettings(input: Partial<Settings>): Settings {
  const clamp = (v: unknown, def: number, min: number, max: number): number => {
    const n = typeof v === 'number' ? Math.floor(v) : Number.NaN;
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  };
  return {
    workMinutes: clamp(input.workMinutes, DEFAULT_SETTINGS.workMinutes, 1, 120),
    shortBreakMinutes: clamp(input.shortBreakMinutes, DEFAULT_SETTINGS.shortBreakMinutes, 1, 60),
    longBreakMinutes: clamp(input.longBreakMinutes, DEFAULT_SETTINGS.longBreakMinutes, 1, 60),
    pomodorosPerCycle: clamp(input.pomodorosPerCycle, DEFAULT_SETTINGS.pomodorosPerCycle, 2, 12),
    soundEnabled: typeof input.soundEnabled === 'boolean' ? input.soundEnabled : true,
  };
}
