'use client';

/**
 * First-run onboarding "seen" flag.
 *
 * Persisted per-device in localStorage — no server round-trip. If a user
 * signs in on a new device we re-show the modal, which is fine (a fresh
 * device is a fresh orientation moment).
 *
 * SSR-safety: `hasSeenOnboarding()` returns `true` on the server so we don't
 * flash a modal during hydration; the client re-checks on mount.
 */
const KEY = 'nsa.onboarding.seen.v1';

export function hasSeenOnboarding(): boolean {
  if (typeof window === 'undefined') return true; // SSR: assume seen so no flash
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboardingSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    // Private mode / disabled storage — best-effort only.
  }
}
