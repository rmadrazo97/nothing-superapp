'use client';

/**
 * FirstRunModal — 3-step welcome carousel shown the first time a signed-in
 * user lands on `/app`.
 *
 * Step 1: pitch (Swiss-army-knife, five mini-apps, $1/mo).
 * Step 2: mini-app grid (emoji + label tour).
 * Step 3: assistant intro (sparkle icon, "chat with the assistant" copy).
 *
 * Dismissal:
 *   - [SKIP] on step 1 and [GOT IT ✓] on step 3 both set the localStorage
 *     "seen" flag then close.
 *   - ESC and backdrop click also dismiss + set the flag (a user who
 *     opens-and-closes doesn't need to see it again — they got the gist).
 *
 * Design constraints (from the design system):
 *   - Nothing OS tokens only (no new colors).
 *   - Emoji tile-icon direction is locked (🍽️🏋️🍅⏰🌱). Do not swap for SVG.
 *   - Body scroll is NOT locked — content is short enough that the modal
 *     shouldn't fight scroll wheels or trackpads.
 */
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { markOnboardingSeen } from '@/lib/onboarding/dismissed';

type Step = 0 | 1 | 2;

const BACKDROP_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1300,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'grid',
  placeItems: 'center',
  padding: 'var(--space-6)',
  animation: 'nsa-fr-fade-in var(--dur-medium) var(--ease-out)',
};

const CARD_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: 'rgba(0, 0, 0, 0.85)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6)',
  animation: 'nsa-fr-rise var(--dur-medium) var(--ease-out)',
};

const HERO_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 96,
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'var(--text-heading)',
  letterSpacing: '-0.01em',
  color: 'var(--color-text-display)',
  textAlign: 'center',
};

const BODY_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  lineHeight: 1.5,
  color: 'var(--color-text-primary)',
  textAlign: 'center',
};

const DOTS_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 'var(--space-2)',
};

const DOT_STYLE = (active: boolean): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: 999,
  background: active
    ? 'var(--color-text-display)'
    : 'var(--color-border-visible)',
  transition: 'background var(--dur-fast) var(--ease-out)',
});

const ACTIONS_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  marginTop: 'var(--space-2)',
};

const MINI_APPS: Array<{ emoji: string; label: string; desc: string }> = [
  { emoji: '🍽️', label: 'FITNESS PAL', desc: 'meals, macros, plans' },
  { emoji: '🏋️', label: 'GYM', desc: 'routines, sets, PRs' },
  { emoji: '🍅', label: 'POMODORO', desc: 'timers with streaks' },
  { emoji: '⏰', label: 'REMINDERS & TASKS', desc: 'push + autonomous copilot jobs' },
  { emoji: '🌱', label: 'HABITS', desc: 'daily checkboxes + streaks' },
];

// Reuses the same 4-point spark shape as the Assistant tab icon (see
// components/shell/TabBar.tsx). Kept inline so this modal stays a single
// self-contained file.
function SparkleGlyph() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 1.5 L9.2 6.8 L14.5 8 L9.2 9.2 L8 14.5 L6.8 9.2 L1.5 8 L6.8 6.8 Z"
        stroke="var(--color-text-display)"
        strokeWidth="1.1"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export type FirstRunModalProps = {
  onClose: () => void;
};

export function FirstRunModal({ onClose }: FirstRunModalProps) {
  const [step, setStep] = useState<Step>(0);

  const dismiss = useCallback(() => {
    markOnboardingSeen();
    onClose();
  }, [onClose]);

  // ESC closes + marks seen. A user who opens and immediately hits ESC has
  // acknowledged the modal — no need to nag on the next visit.
  useEffect(() => {
    const handler = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') {
        evt.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [dismiss]);

  const handleBackdropClick = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      if (evt.target === evt.currentTarget) dismiss();
    },
    [dismiss],
  );

  const next = () => setStep((s) => (Math.min(2, s + 1) as Step));
  const back = () => setStep((s) => (Math.max(0, s - 1) as Step));

  let hero: ReactNode;
  let title: string;
  let body: ReactNode;
  let actions: ReactNode;

  if (step === 0) {
    hero = (
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 72,
          lineHeight: 1,
          color: 'var(--color-accent)',
        }}
      >
        ◆
      </span>
    );
    title = 'Nothing Superapp';
    body = (
      <p style={BODY_STYLE}>
        One app. Five mini-apps. $1 a month. Sign up captures your email so
        you can come back; subscribe to unlock the tiles.
      </p>
    );
    actions = (
      <div style={ACTIONS_ROW_STYLE}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={dismiss}
        >
          Skip
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={next}
        >
          Next →
        </button>
      </div>
    );
  } else if (step === 1) {
    hero = (
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          width: '100%',
        }}
      >
        {MINI_APPS.map((app) => (
          <li
            key={app.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              background: 'var(--color-surface)',
            }}
          >
            <span
              aria-hidden="true"
              style={{ fontSize: 24, lineHeight: 1, flex: '0 0 auto' }}
            >
              {app.emoji}
            </span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-label)',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-display)',
                }}
              >
                {app.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {app.desc}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
    title = 'Five mini-apps';
    body = (
      <p style={BODY_STYLE}>
        Tap a tile to jump in. Subscription unlocks all of them.
      </p>
    );
    actions = (
      <div style={ACTIONS_ROW_STYLE}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={back}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={next}
        >
          Next →
        </button>
      </div>
    );
  } else {
    hero = <SparkleGlyph />;
    title = 'Ask the assistant';
    body = (
      <p style={BODY_STYLE}>
        Chat to log meals, start a workout, or see charts of your progress.
        It&apos;s always in the ASSISTANT tab.
      </p>
    );
    actions = (
      <div style={ACTIONS_ROW_STYLE}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={back}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={dismiss}
        >
          Got it ✓
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes nsa-fr-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nsa-fr-rise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        role="presentation"
        style={BACKDROP_STYLE}
        onClick={handleBackdropClick}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Nothing Superapp"
          style={CARD_STYLE}
        >
          <div style={HERO_STYLE}>{hero}</div>
          <h2 style={TITLE_STYLE}>{title}</h2>
          {body}
          <div style={DOTS_ROW_STYLE} aria-hidden="true">
            <span style={DOT_STYLE(step === 0)} />
            <span style={DOT_STYLE(step === 1)} />
            <span style={DOT_STYLE(step === 2)} />
          </div>
          {actions}
        </div>
      </div>
    </>
  );
}

/**
 * FirstRunGate — client-only sibling to mount inside the server-rendered
 * `/app` page. Checks the localStorage flag on mount and renders the modal
 * exactly once for a new user. Kept intentionally tiny so we don't hydrate
 * the whole launcher client-side.
 */
export function FirstRunGate() {
  // undefined = pre-mount / SSR pass; true = show; false = hide.
  const [open, setOpen] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Inline read rather than importing `hasSeenOnboarding` — same effect,
    // one fewer indirection to reason about at mount.
    let seen = true;
    try {
      seen = window.localStorage.getItem('nsa.onboarding.seen.v1') === '1';
    } catch {
      seen = true;
    }
    setOpen(!seen);
  }, []);

  if (open !== true) return null;
  return <FirstRunModal onClose={() => setOpen(false)} />;
}
