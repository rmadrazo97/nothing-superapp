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
import { GlobalShortcuts } from '@/components/keyboard/GlobalShortcuts';
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
      'notifications_enabled, theme, daily_calorie_goal, water_goal_ml, weight_goal_kg, weight_unit, volume_unit, updated_at',
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
        <Shell>
          <AppErrorBoundary>{children}</AppErrorBoundary>
        </Shell>
        <ToastContainer />
        <GlobalShortcuts />
      </ToastProvider>
    </HarnessContextBridge>
  );
}
