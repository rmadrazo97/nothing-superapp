'use client';

/**
 * InstallPrompt — home-screen install nudge on the launcher.
 *
 * Sits directly under TodayCard on `/app`. Renders one of four states:
 *
 *   1. Already installed (`display-mode: standalone` OR iOS
 *      `navigator.standalone`) → nothing.
 *   2. Previously dismissed (`nsa.pwa-install.dismissed.v1` localStorage
 *      flag) → nothing.
 *   3. Chrome/Edge/Android with a captured `beforeinstallprompt` event →
 *      compact card with [INSTALL] + [NOT NOW]. Install calls the native
 *      browser prompt.
 *   4. iOS Safari (no `beforeinstallprompt` fires there — never will) →
 *      instruction card walking the user through Share → Add to Home
 *      Screen.
 *
 * Other browsers with no way to install (rare — mostly desktop Firefox and
 * in-app WebViews) render nothing rather than dead-end instructions.
 *
 * We wait ~1s after mount for `beforeinstallprompt` before falling back to
 * the iOS-Safari branch. Chromium fires the event almost immediately after
 * the SW is registered, so a short debounce is enough to avoid a flash of
 * the wrong card on Android.
 *
 * Zero animation deliberately — the card should feel like a status line the
 * user notices in their peripheral vision, not a modal demanding attention.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import {
  hasDismissed,
  isIOSSafari,
  isRunningStandalone,
  markDismissed,
} from '@/lib/pwa/install-state';

/**
 * The `beforeinstallprompt` event isn't in lib.dom yet — narrow shape
 * inline. Only `prompt()` + `userChoice` matter to us.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: readonly string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type PromptState =
  | { kind: 'checking' }
  | { kind: 'hidden' }
  | { kind: 'native'; event: BeforeInstallPromptEvent }
  | { kind: 'ios' };

const CARD_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
};

const KICKER_STYLE: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

const BODY_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  lineHeight: 1.5,
  color: 'var(--color-text-primary)',
};

const STEPS_STYLE: CSSProperties = {
  margin: 0,
  paddingLeft: 'var(--space-4)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  lineHeight: 1.6,
  color: 'var(--color-text-primary)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const ACTIONS_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  marginTop: 'var(--space-2)',
};

export function InstallPrompt() {
  const [state, setState] = useState<PromptState>({ kind: 'checking' });

  useEffect(() => {
    // Gate 1: already installed → never render.
    if (isRunningStandalone()) {
      setState({ kind: 'hidden' });
      return;
    }
    // Gate 2: user said no before → never render.
    if (hasDismissed()) {
      setState({ kind: 'hidden' });
      return;
    }

    let cancelled = false;
    let capturedEvent: BeforeInstallPromptEvent | null = null;

    const handler = (evt: Event) => {
      // Prevent the mini-infobar that Chrome auto-shows on Android; we own
      // the UX from here on. Cast is fine — this event type doesn't exist
      // in lib.dom.
      evt.preventDefault();
      capturedEvent = evt as BeforeInstallPromptEvent;
      if (!cancelled) {
        setState({ kind: 'native', event: capturedEvent });
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Fallback timer: if the event hasn't fired after ~1s AND we're in iOS
    // Safari, show the manual instructions. Everything else stays hidden.
    // 1s is comfortably longer than Chromium's typical fire window (~200ms
    // after SW register) while short enough not to feel laggy.
    const timer = window.setTimeout(() => {
      if (cancelled || capturedEvent) return;
      if (isIOSSafari()) {
        setState({ kind: 'ios' });
      } else {
        setState({ kind: 'hidden' });
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', handler);
      window.clearTimeout(timer);
    };
  }, []);

  if (state.kind === 'checking' || state.kind === 'hidden') return null;

  const dismiss = () => {
    markDismissed();
    setState({ kind: 'hidden' });
  };

  if (state.kind === 'native') {
    const onInstall = async () => {
      try {
        await state.event.prompt();
        // We don't branch on the outcome — either way the user has made
        // their call and the card should get out of the way. The browser
        // will remember an "accepted" outcome and prevent future prompts
        // anyway.
        await state.event.userChoice;
      } catch {
        // Some browsers throw if `prompt()` is called twice. Swallow and
        // dismiss — no state to recover.
      }
      markDismissed();
      setState({ kind: 'hidden' });
    };

    return (
      <section
        aria-label="Install Nothing Superapp"
        style={CARD_STYLE}
      >
        <span style={KICKER_STYLE}>INSTALL · HOME SCREEN</span>
        <p style={BODY_STYLE}>
          Add Nothing Superapp to your home screen. Faster to open, push
          notifications work.
        </p>
        <div style={ACTIONS_ROW_STYLE}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={dismiss}
          >
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onInstall}
          >
            Install
          </button>
        </div>
      </section>
    );
  }

  // state.kind === 'ios'
  return (
    <section
      aria-label="Install Nothing Superapp on iOS"
      style={CARD_STYLE}
    >
      <span style={KICKER_STYLE}>INSTALL · HOME SCREEN</span>
      <ol style={STEPS_STYLE}>
        <li>Tap the Share button ⤴</li>
        <li>Scroll and tap &ldquo;Add to Home Screen&rdquo;</li>
        <li>Tap Add</li>
      </ol>
      <div style={{ ...ACTIONS_ROW_STYLE, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={dismiss}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
