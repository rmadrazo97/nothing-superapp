'use client';

/**
 * FirstRunHint — one-time nudge shown on `/app` below the mini-app grid.
 *
 * A brand-new signed-in-and-entitled user lands on `/app` and sees four
 * mini-app tiles + a greeting. Everything else about the product (cross-app
 * search, the copilot's ability to answer questions about their data) is
 * invisible until they poke at it. This card tells them where the Assistant
 * lives, then disappears forever once dismissed.
 *
 * Persistence:
 *   - Flag lives in localStorage under `nothing:first-run-hint:seen`.
 *   - localStorage is per-device / per-browser — that's fine. If the same
 *     user opens the app on a new device, seeing the hint again is a
 *     feature, not a bug. Do NOT round-trip this to Supabase.
 *
 * SSR-safety:
 *   - Component renders `null` until we've checked localStorage on the
 *     client. That's one paint of "nothing", but avoids hydration mismatch.
 *   - Guarded against private-mode / disabled-storage exceptions.
 *
 * Visual:
 *   - Same dashed-outline card language as EmptyState (Nothing OS
 *     "instrument panel"), but with a subtle accent-colored top-left corner
 *     and a dismiss "×" in the top-right so it reads as informational,
 *     not empty.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nothing:first-run-hint:seen';

export function FirstRunHint() {
  // undefined = we haven't checked yet (server / pre-mount).
  // true = show, false = hidden (dismissed or already seen).
  const [visible, setVisible] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // Storage disabled — err on the side of showing the hint. Worst
      // case the user sees it every visit; still better than a silent
      // orientation gap.
      seen = false;
    }
    setVisible(!seen);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // If we can't persist the flag we still hide it for this session —
      // the user has clearly seen it.
    }
  }

  if (visible !== true) return null;

  return (
    <section
      role="note"
      aria-label="First-run tip"
      style={{
        position: 'relative',
        border: '1px dashed var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4) var(--space-6)',
        background: 'transparent',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-4)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 24,
          lineHeight: 1,
          color: 'var(--color-accent)',
          flex: '0 0 auto',
        }}
      >
        ◊
      </span>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          minWidth: 0,
          flex: 1,
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-primary)',
            margin: 0,
          }}
        >
          New here?
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-text-secondary)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Tap Assistant to ask your copilot anything about your data. It reads
          across every mini-app.
        </p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss first-run tip"
        style={{
          position: 'absolute',
          top: 'var(--space-2)',
          right: 'var(--space-2)',
          width: 32,
          height: 32,
          background: 'transparent',
          border: 0,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body)',
          lineHeight: 1,
          borderRadius: 'var(--radius-compact)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>
    </section>
  );
}
