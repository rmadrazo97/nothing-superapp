import type { Preferences } from '../schemas/index.ts';
import { EVENT_KINDS } from '../schemas/index.ts';

export type { Profile, Preferences, Subscription, Event, CalorieEntry, Meal, Theme, WeightUnit, VolumeUnit, SubscriptionStatus, ProfileInsert, PreferencesInsert, SubscriptionInsert, EventInsert, CalorieEntryInsert, WeightEntry, WeightEntryInsert, WaterEntry, WaterEntryInsert, BodyPart, Exercise, RoutineSet, RoutineExercise, WorkoutRoutine, WorkoutRoutineInsert, WorkoutRoutineUpdate, SessionSet, SessionEntry, WorkoutSession, WorkoutSessionInsert, WorkoutSessionUpdate, PomodoroPhase, PomodoroSession, NewPomodoroSession, Sex, ActivityLevel, GoalDirection } from '../schemas/index.ts';
export { EVENT_KINDS } from '../schemas/index.ts';

export type EventKind = (typeof EVENT_KINDS)[keyof typeof EVENT_KINDS];

export type SharedContextValue = {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
  };
  preferences: Preferences;
  events: {
    emit: (kind: EventKind, payload: unknown) => void;
    subscribe: (kind: EventKind, handler: (payload: unknown) => void) => () => void;
  };
};

export type MiniAppManifest = {
  slug: string;
  name: string;
  description?: string;
  icon: string; // SVG string or icon name
  route: string; // e.g. '/app/calorie'
  requiresSubscription?: boolean; // default true
  /**
   * Optional per-mini-app settings metadata. Presence of this block signals
   * to the shell that the mini-app has a settings panel that should be
   * discoverable via the shared cog UI (see MiniAppSettingsButton). Only
   * metadata lives here so the manifest stays JSON-serializable — the
   * actual React component reference is registered in the client-side
   * `MINI_APP_SETTINGS` map in `apps/web/src/lib/mini-apps/client-registry`.
   */
  settings?: {
    /** Title rendered in the settings sheet header. Defaults to `name`. */
    title?: string;
  };
};
