'use client';

/**
 * Client bridge that wraps the app subtree in `<SharedContextProvider>`.
 *
 * Why a bridge instead of using the provider inline in `layout.tsx`:
 *   - The runtime SDK's SharedContextProvider is a Client Component and
 *     accepts a `SharedContextValue` — but that value includes an `events`
 *     bus whose methods (emit/subscribe) can't cross the RSC serialization
 *     boundary. So the bus MUST be constructed on the client.
 *   - `user` + `preferences` are serializable — the Server Component
 *     layout reads them from Supabase and hands them to this bridge as
 *     plain props.
 *
 * The event bus is memoised with `useMemo` so it survives re-renders. If
 * we hoist it to module scope we'd share state across all users in a
 * multi-tenant SSR context — even though this is a Client Component
 * (per-tab), keeping it component-scoped is the safer default.
 */
import { useMemo, type ReactNode } from 'react';
import {
  SharedContextProvider,
  createEventBus,
} from '@nothing/mini-apps-runtime';
import type { Preferences, SharedContextValue } from '@nothing/shared';

export function HarnessContextBridge({
  user,
  preferences,
  children,
}: {
  user: SharedContextValue['user'];
  preferences: Preferences;
  children: ReactNode;
}) {
  const value = useMemo<SharedContextValue>(() => {
    const bus = createEventBus();
    return {
      user,
      preferences,
      events: {
        emit: bus.emit,
        subscribe: bus.subscribe,
      },
    };
  }, [user, preferences]);

  return <SharedContextProvider value={value}>{children}</SharedContextProvider>;
}
