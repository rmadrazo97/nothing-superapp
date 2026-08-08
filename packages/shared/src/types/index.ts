import type { Preferences } from '../schemas/index.ts';
import { EVENT_KINDS } from '../schemas/index.ts';

export type { Profile, Preferences, Subscription, Event, CalorieEntry, Meal, Theme, SubscriptionStatus, ProfileInsert, PreferencesInsert, SubscriptionInsert, EventInsert, CalorieEntryInsert, BodyPart, Exercise, RoutineSet, RoutineExercise, WorkoutRoutine, WorkoutRoutineInsert, WorkoutRoutineUpdate, SessionSet, SessionEntry, WorkoutSession, WorkoutSessionInsert, WorkoutSessionUpdate, PomodoroPhase, PomodoroSession, NewPomodoroSession } from '../schemas/index.ts';
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
};
