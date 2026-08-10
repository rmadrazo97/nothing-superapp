/**
 * `/app/*` layout.
 *
 * Server Component: fetches the current user + their preferences from
 * Supabase (RLS-scoped) and hands them to `<HarnessContextBridge>` — the
 * client wrapper that instantiates the event bus and exposes
 * `useSharedContext()` / `useUser()` / `usePreferences()` / `useEvents()`
 * to every mini-app + copilot component beneath it.
 *
 * Auth is enforced upstream by `src/proxy.ts`; by the time this layout
 * renders, `user` is non-null. We still guard with a soft fallback so a
 * momentary session gap doesn't crash the shell — the Proxy will re-route
 * the next navigation to /login.
 *
 * Preferences fall back to a safe default (dark theme, notifications off,
 * no calorie goal) when the profile row hasn't been created yet. Task 05
 * upserts the profiles row on sign-in but the preferences row is created
 * on first save from the settings surface (task 11) — so a brand-new user
 * with no saved preferences must still be able to open the launcher.
 */
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell/Shell';
import { HarnessContextBridge } from '@/components/shell/HarnessContextBridge';
import { AppErrorBoundary } from '@/components/shell/AppErrorBoundary';
import { ToastProvider } from '@/lib/toast/context';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { UndoSnackbarProvider } from '@/components/shell/UndoSnackbar';
import { GlobalShortcuts } from '@/components/keyboard/GlobalShortcuts';
import { PushOptInBanner } from '@/components/push/PushOptInBanner';
import { createClient } from '@/lib/supabase/server';
import type { Preferences } from '@nothing/shared';

const DEFAULT_PREFERENCES: Omit<Preferences, 'user_id' | 'updated_at'> = {
  notifications_enabled: false,
  theme: 'dark',
  daily_calorie_goal: null,
  // v3 MFP-tier defaults — mirror the DB defaults in migration 005 so brand-
  // new users (no preferences row yet) see sensible fallbacks in the water +
  // weight sub-mini-apps rather than 0 goals + broken UI.
  water_goal_ml: 2500,
  weight_goal_kg: null,
  weight_unit: 'kg',
  volume_unit: 'ml',
  // Wave 2-A onboarding profile — all null until the wizard runs. The
  // `onboarded_at == null && age_years == null` combo is the "first mount"
  // signal that fires the wizard.
  sex: null,
  age_years: null,
  height_cm: null,
  activity_level: null,
  goal_direction: null,
  onboarded_at: null,
  // v0.3.2 Web Push — default to off + `releases` topic pre-selected, so
  // when a user later opts in they immediately get release notifications
  // without a second step.
  push_enabled: false,
  push_topics: ['releases'],
  // v0.5 meal plans — user has no active plan by default; the PLAN tab shows
  // an empty state until the user creates or activates one.
  active_meal_plan_id: null,
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Proxy should already have handled this — belt-and-suspenders.
    redirect('/login');
  }

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const { data: prefsRow } = await supabase
    .from('preferences')
    .select(
      'notifications_enabled, theme, daily_calorie_goal, water_goal_ml, weight_goal_kg, weight_unit, volume_unit, sex, age_years, height_cm, activity_level, goal_direction, onboarded_at, push_enabled, push_topics, active_meal_plan_id, updated_at',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  const preferences: Preferences = {
    user_id: user.id,
    notifications_enabled:
      prefsRow?.notifications_enabled ?? DEFAULT_PREFERENCES.notifications_enabled,
    theme: (prefsRow?.theme ?? DEFAULT_PREFERENCES.theme) as Preferences['theme'],
    daily_calorie_goal:
      prefsRow?.daily_calorie_goal ?? DEFAULT_PREFERENCES.daily_calorie_goal,
    // NULL-safe: `weight_goal_kg` is legitimately nullable (no goal set), the
    // other three have DB-level non-null defaults so `??` only matters when
    // the row itself is missing (brand-new user).
    water_goal_ml: prefsRow?.water_goal_ml ?? DEFAULT_PREFERENCES.water_goal_ml,
    weight_goal_kg:
      prefsRow?.weight_goal_kg != null
        ? Number(prefsRow.weight_goal_kg)
        : DEFAULT_PREFERENCES.weight_goal_kg,
    weight_unit:
      (prefsRow?.weight_unit ?? DEFAULT_PREFERENCES.weight_unit) as Preferences['weight_unit'],
    volume_unit:
      (prefsRow?.volume_unit ?? DEFAULT_PREFERENCES.volume_unit) as Preferences['volume_unit'],
    // Wave 2-A onboarding profile hydration — all nullable, no coercion beyond
    // Number() for the numeric column so downstream math has real numbers.
    sex: (prefsRow?.sex ?? null) as Preferences['sex'],
    age_years:
      prefsRow?.age_years != null ? Number(prefsRow.age_years) : null,
    height_cm:
      prefsRow?.height_cm != null ? Number(prefsRow.height_cm) : null,
    activity_level:
      (prefsRow?.activity_level ?? null) as Preferences['activity_level'],
    goal_direction:
      (prefsRow?.goal_direction ?? null) as Preferences['goal_direction'],
    onboarded_at: prefsRow?.onboarded_at ?? null,
    // v0.3.2 Web Push — device-level opt-in flag (persisted across devices)
    // + array of topic slugs the user opted into. Both have DB defaults, so
    // `??` only fires for brand-new users with no preferences row.
    push_enabled: prefsRow?.push_enabled ?? DEFAULT_PREFERENCES.push_enabled,
    push_topics:
      (prefsRow?.push_topics as Preferences['push_topics'] | undefined) ??
      DEFAULT_PREFERENCES.push_topics,
    // v0.5 meal plans — nullable pointer into `meal_plans`.
    active_meal_plan_id:
      (prefsRow?.active_meal_plan_id as string | null | undefined) ??
      DEFAULT_PREFERENCES.active_meal_plan_id,
    updated_at: prefsRow?.updated_at ?? new Date().toISOString(),
  };

  const contextUser = {
    id: user.id,
    email: user.email ?? null,
    displayName: profileRow?.display_name ?? null,
  };

  return (
    <HarnessContextBridge user={contextUser} preferences={preferences}>
      <ToastProvider>
        <UndoSnackbarProvider>
          <Shell>
            <AppErrorBoundary>{children}</AppErrorBoundary>
          </Shell>
          <ToastContainer />
          <GlobalShortcuts />
          <PushOptInBanner />
        </UndoSnackbarProvider>
      </ToastProvider>
    </HarnessContextBridge>
  );
}
