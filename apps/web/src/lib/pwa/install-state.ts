'use client';

/**
 * PWA install-state helpers.
 *
 * The launcher's `<InstallPrompt />` uses these to decide whether to render
 * a card nudging the user to install to their home screen. Kept in a
 * dedicated module so the detection logic is unit-testable and the UI
 * component stays focused on rendering.
 *
 * SSR safety: every helper guards `typeof window`/`typeof navigator` because
 * this file is imported from a client component that gets tree-shaken into
 * the initial JS bundle — Next.js may still evaluate module scope during
 * server render even though the runtime checks live inside `useEffect`.
 *
 * Dismissal is persisted per-device in localStorage under
 * `nsa.pwa-install.dismissed.v1`. A fresh device / cleared storage re-shows
 * the prompt — that's the correct behaviour: install is a per-device
 * concept, not a per-account one.
 */

export type InstallCapability =
  | { kind: 'installed' }
  | { kind: 'ios-safari-manual' }
  | { kind: 'prompt-available'; prompt: () => Promise<'accepted' | 'dismissed'> }
  | { kind: 'unavailable' };

/**
 * True when the page is running as an installed PWA (standalone display
 * mode on Chromium/Android/desktop, or iOS Safari's legacy
 * `navigator.standalone`). Returning `true` from SSR is deliberate — it
 * prevents any hydration flash of the install card, and the client re-checks
 * on mount.
 */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.matches) return true;
  } catch {
    // matchMedia is universal in real browsers; guard anyway for exotic
    // WebView shims that throw.
  }
  const nav = window.navigator as unknown as { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * True when we're running in iOS Safari specifically — the only mainstream
 * browser that never fires `beforeinstallprompt`, so we have to show the
 * manual "Share → Add to Home Screen" instructions instead.
 *
 * Detects iPadOS 13+ via the desktop-Safari UA + touch fallback.
 */
export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document);
  // Exclude in-app browsers (Chrome, Firefox, Edge on iOS all use WebKit but
  // identify themselves — none of them can install a PWA either, but the
  // Share-sheet instructions we render only make sense in real Safari).
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

const DISMISS_KEY = 'nsa.pwa-install.dismissed.v1';

/**
 * True when the user has previously dismissed the install prompt. SSR /
 * unavailable storage returns `true` so we never flash the card during
 * hydration for a user who has already said no.
 */
export function hasDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return true;
  }
}

export function markDismissed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode / disabled storage — best-effort only. Next visit will
    // show the prompt again, which is acceptable.
  }
}
