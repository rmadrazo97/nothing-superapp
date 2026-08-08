'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMmSs } from '../lib/format.ts';
import { ghostButtonStyle, primaryButtonStyle } from '../lib/ui.ts';

/**
 * RestTimer — between-sets countdown.
 *
 * We use requestAnimationFrame + Date.now() diffing (NOT setInterval) so a
 * background tab or sleep event doesn't drift the timer. When the tab
 * regains focus the next rAF tick reads real wall-clock elapsed and
 * updates to the correct remaining time.
 *
 * Contract:
 *   - `runningSince` is null when idle. Set to Date.now() by the parent
 *     when a set is marked complete.
 *   - `durationSec` — total planned rest. Default 90s.
 *   - `onFinish` fires exactly once when remaining hits 0.
 *
 * The parent owns the "should we be running?" state — this component only
 * renders the countdown. That means the timer survives re-renders and can
 * be lifted to a page-level context if we later want a persistent timer
 * across the whole session UI.
 */
export default function RestTimer({
  runningSince,
  durationSec = 90,
  onFinish,
  onSkip,
  onAddSec,
}: {
  runningSince: number | null;
  durationSec?: number;
  onFinish: () => void;
  onSkip: () => void;
  onAddSec: (sec: number) => void;
}) {
  const [remaining, setRemaining] = useState<number>(durationSec);
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    if (runningSince == null) {
      setRemaining(durationSec);
      return;
    }
    let raf = 0;
    const tick = () => {
      const elapsedMs = Date.now() - runningSince;
      const left = Math.max(0, durationSec - Math.floor(elapsedMs / 1000));
      setRemaining(left);
      if (left <= 0) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          onFinish();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runningSince, durationSec, onFinish]);

  const idle = runningSince == null;

  return (
    <section
      aria-label="Rest timer"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: `1px solid ${idle ? 'var(--color-border-visible)' : 'var(--color-accent)'}`,
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <span className="label">{idle ? 'REST · READY' : 'REST · COUNTDOWN'}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <span
          className="display-xl"
          style={{ color: idle ? 'var(--color-text-secondary)' : 'var(--color-text-display)' }}
        >
          {formatMmSs(idle ? durationSec : remaining)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onAddSec(15)}
          disabled={idle}
          style={{
            ...ghostButtonStyle,
            opacity: idle ? 0.5 : 1,
            cursor: idle ? 'not-allowed' : 'pointer',
          }}
        >
          +15s
        </button>
        <button
          type="button"
          onClick={() => onAddSec(30)}
          disabled={idle}
          style={{
            ...ghostButtonStyle,
            opacity: idle ? 0.5 : 1,
            cursor: idle ? 'not-allowed' : 'pointer',
          }}
        >
          +30s
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={idle}
          style={{
            ...primaryButtonStyle,
            opacity: idle ? 0.5 : 1,
            cursor: idle ? 'not-allowed' : 'pointer',
          }}
        >
          Skip
        </button>
      </div>
    </section>
  );
}
