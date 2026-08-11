'use client';

import { useEffect, useRef, useState } from 'react';
import { PixelLoader } from './PixelLoader';

/**
 * Collapsed-by-default disclosure that shows Kimi K2's reasoning tokens.
 * Rendered *inside* an assistant bubble, above the visible answer.
 * Typographic tone: Space Mono, muted — the "instrument panel" register
 * the design system reserves for machine chatter.
 *
 * v0.5.12 (user feedback "the animation is horrible") — replaced the
 * bare ellipsis with the PixelLoader idiom used everywhere else in the
 * copilot for pending state. Ticks a "Thought for Ns" counter while
 * streaming; freezes the final duration once the reasoning arrives.
 */
export function ReasoningDisclosure({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const [thoughtSec, setThoughtSec] = useState<number>(0);
  const [finalSec, setFinalSec] = useState<number | null>(null);

  // Start the wall-clock the first time we see reasoning content or a
  // streaming flag; freeze once streaming flips false.
  useEffect(() => {
    if (streaming && startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    }
    if (!streaming && startedAtRef.current !== null && finalSec === null) {
      setFinalSec(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
    }
  }, [streaming, finalSec]);

  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      if (startedAtRef.current !== null) {
        setThoughtSec(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
      }
    }, 500);
    return () => clearInterval(id);
  }, [streaming]);

  if (content.length === 0 && !streaming) return null;

  const durationLabel = finalSec !== null
    ? `Thought for ${finalSec}s`
    : streaming
      ? `Thinking for ${thoughtSec}s`
      : 'Reasoning';

  return (
    <div
      style={{
        marginBottom: 'var(--space-2)',
        borderLeft: '1px solid var(--color-border-visible)',
        paddingLeft: 'var(--space-3)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 0,
          background: 'transparent',
          border: 0,
          cursor: content.length > 0 ? 'pointer' : 'default',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
        }}
        disabled={content.length === 0}
      >
        {streaming ? (
          <PixelLoader size="sm" />
        ) : (
          <span aria-hidden="true" style={{ display: 'inline-block', width: '1ch' }}>
            {open ? '−' : '+'}
          </span>
        )}
        <span>{durationLabel}</span>
      </button>
      {open && (
        <pre
          style={{
            margin: 'var(--space-2) 0 0',
            padding: 0,
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            lineHeight: 1.5,
            color: 'var(--color-text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: 'transparent',
            border: 0,
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
