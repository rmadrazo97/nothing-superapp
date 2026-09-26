'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMmSs } from '../lib/format.ts';

/**
 * RestTimer — compact between-sets countdown bar (v0.6.3).
 *
 * Was a full card with a 72px display number that sat sticky at the top
 * and ate ~40% of a phone screen while logging. Now a single ~56px row:
 * time + progress hairline + −15 / +15 / Skip. Idle it shows the planned
 * rest so the user can tune it before the first set.
 *
 * rAF + Date.now() diffing (not setInterval) so a backgrounded PWA or a
 * locked phone doesn't drift: the next frame reads real elapsed time.
 *
 * Contract:
 *   - `runningSince` null when idle; parent sets Date.now() on set ✓.
 *   - `onFinish` fires exactly once per run when remaining hits 0.
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
  // Parent passes inline arrows; keep the latest in a ref so the rAF loop
  // doesn't restart on every parent render (every keystroke).
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

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
          try {
            navigator.vibrate?.([80, 60, 80]);
          } catch {
            /* unsupported */
          }
          onFinishRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runningSince, durationSec]);

  const idle = runningSince == null;
  const shown = idle ? durationSec : remaining;
  const progress = idle ? 0 : 1 - remaining / Math.max(1, durationSec);

  const smallBtn = {
    background: 'transparent',
    border: '1px solid var(--color-border-visible)',
    color: 'var(--color-text-primary)',
    borderRadius: 'var(--radius-button)',
    height: 40,
    minWidth: 48,
    padding: '0 var(--space-3)',
    fontFamily: 'var(--font-label)',
    fontSize: 'var(--text-label)',
    letterSpacing: '0.06em',
    cursor: 'pointer',
    touchAction: 'manipulation' as const,
  };

  return (
    <section
      aria-label="Rest timer"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-surface)',
        border: `1px solid ${idle ? 'var(--color-border-visible)' : 'var(--color-accent)'}`,
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-2) var(--space-3)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          {idle ? 'REST' : 'RESTING'}
        </span>
        <span
          className="data"
          aria-live="off"
          style={{
            fontSize: 26,
            lineHeight: 1.1,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: idle ? 'var(--color-text-secondary)' : 'var(--color-text-display)',
          }}
        >
          {formatMmSs(shown)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onAddSec(-15)}
        aria-label="Rest 15 seconds less"
        style={smallBtn}
      >
        −15
      </button>
      <button
        type="button"
        onClick={() => onAddSec(15)}
        aria-label="Rest 15 seconds more"
        style={smallBtn}
      >
        +15
      </button>
      {!idle && (
        <button
          type="button"
          onClick={onSkip}
          style={{
            ...smallBtn,
            background: 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
            color: 'var(--color-text-display)',
            textTransform: 'uppercase',
          }}
        >
          Skip
        </button>
      )}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: 2,
          width: `${Math.min(100, Math.max(0, progress * 100))}%`,
          background: 'var(--color-accent)',
        }}
      />
    </section>
  );
}
