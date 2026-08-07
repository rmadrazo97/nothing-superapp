'use client';

import { useState } from 'react';

/**
 * Collapsed-by-default disclosure that shows Kimi K2's reasoning tokens.
 * Rendered *inside* an assistant bubble, above the visible answer.
 * Typographic tone: Space Mono, muted — the "instrument panel" register
 * the design system reserves for machine chatter.
 */
export function ReasoningDisclosure({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (content.length === 0) return null;

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
          gap: 6,
          padding: 0,
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
        }}
      >
        <span aria-hidden="true" style={{ display: 'inline-block', width: '1ch' }}>
          {open ? '−' : '+'}
        </span>
        <span>Reasoning{streaming ? '…' : ''}</span>
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
