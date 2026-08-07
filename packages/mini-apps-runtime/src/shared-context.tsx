'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { SharedContextValue } from '@nothing/shared';

const SharedContext = createContext<SharedContextValue | null>(null);

export function SharedContextProvider({
  value,
  children,
}: {
  value: SharedContextValue;
  children: ReactNode;
}) {
  return <SharedContext.Provider value={value}>{children}</SharedContext.Provider>;
}

export function useSharedContext(): SharedContextValue {
  const ctx = useContext(SharedContext);
  if (!ctx) {
    throw new Error(
      'useSharedContext() called outside of <SharedContextProvider>. ' +
        'This hook only works inside a mini-app that has been registered and mounted by the harness shell.',
    );
  }
  return ctx;
}

// Narrower helpers for common access patterns.
export function useUser() {
  return useSharedContext().user;
}

export function usePreferences() {
  return useSharedContext().preferences;
}

export function useEvents() {
  return useSharedContext().events;
}
