'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/lib/toast/context';
import { ReasoningDisclosure } from './ReasoningDisclosure';

export type ChatRole = 'user' | 'assistant';

export type ChatAttachmentPreview = {
  /** Data URL or hosted URL — rendered as-is in an <img>. */
  url: string;
  filename?: string;
  /** e.g. "image/png" — non-image types are ignored by the bubble. */
  mediaType: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** Populated only for assistant messages; empty string means "none". */
  reasoning: string;
  /** True while an assistant message is still receiving SSE frames. */
  streaming?: boolean;
  /** Image previews rendered inside the bubble (user turns only in v0.5). */
  attachments?: ChatAttachmentPreview[];
};

/**
 * MessageBubble.
 *
 * Two small polish behaviours over v0.3.0:
 *
 *  1. A tiny copy-to-clipboard button in the top-right corner of every
 *     assistant bubble. Hover-reveal on desktop (see `.nsa-copy-btn` in
 *     globals.css), always visible on coarse pointers.
 *
 *  2. A one-frame `data-fresh="true"` attribute on newly-mounted
 *     bubbles so the CSS selector `[data-fresh="true"] .nsa-msg-bubble`
 *     plays a 180ms fade-up. We clear the attribute after a rAF so the
 *     animation runs exactly once per message — subsequent token deltas
 *     mutate `content` but don't re-fire the entrance.
 *
 * The wrapper carries the `data-fresh` attr; the inner bubble carries
 * the visual chrome + the copy button. This split keeps the animation
 * targetable by CSS without threading refs.
 */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // One-frame data-fresh flag — the CSS animation reads this off the
  // wrapper so React doesn't need to keep a state var for it.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.setAttribute('data-fresh', 'true');
    const id = requestAnimationFrame(() => {
      // Clear after one paint. If the component unmounts first, the ref
      // is stale but the DOM is gone — no cleanup needed.
      el.removeAttribute('data-fresh');
    });
    return () => cancelAnimationFrame(id);
    // Runs once per bubble mount; message id is included so a swapped
    // message (rare, but possible in re-order edits) also re-triggers.
  }, [message.id]);

  const copyToClipboard = useCallback(async () => {
    // Nothing to copy while the assistant is still thinking.
    if (message.content.length === 0) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success('Copied');
      // Brief visual flash — CSS reveals the ✓ glyph via aria-pressed.
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Couldn't copy — clipboard permission blocked.");
    }
  }, [message.content, toast]);

  return (
    <div
      ref={wrapperRef}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      <div
        className="nsa-msg-bubble"
        style={{
          position: 'relative',
          maxWidth: '85%',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-card)',
          background: isUser ? 'var(--color-accent)' : 'var(--color-surface-raised)',
          color: isUser ? 'var(--color-text-display)' : 'var(--color-text-primary)',
          border: isUser ? '1px solid var(--color-accent)' : '1px solid var(--color-border-visible)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.role === 'assistant' && (
          <>
            <ReasoningDisclosure
              content={message.reasoning}
              streaming={message.streaming === true && message.content.length === 0}
            />
            {/* Copy button lives inside the bubble so the hover selector on
                `.nsa-msg-bubble` catches it. Hidden while there's nothing
                to copy (empty content — still streaming). */}
            {message.content.length > 0 && (
              <button
                type="button"
                onClick={() => void copyToClipboard()}
                aria-label={copied ? 'Copied' : 'Copy message'}
                aria-pressed={copied}
                className="nsa-copy-btn"
                style={{
                  position: 'absolute',
                  top: 'var(--space-2)',
                  right: 'var(--space-2)',
                  width: 28,
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: '1px solid var(--color-border-visible)',
                  borderRadius: 'var(--radius-compact)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-body-sm)',
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                {copied ? '✓' : '⧉'}
              </button>
            )}
          </>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginBottom: message.content.length > 0 ? 'var(--space-2)' : 0,
            }}
          >
            {message.attachments
              .filter((a) => a.mediaType.startsWith('image'))
              .map((a, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${message.id}-att-${idx}`}
                  src={a.url}
                  alt={a.filename ?? `attachment ${idx + 1}`}
                  style={{
                    width: 96,
                    height: 96,
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-compact)',
                    border: '1px solid var(--color-border-visible)',
                    display: 'block',
                  }}
                />
              ))}
          </div>
        )}
        {message.content.length > 0 ? (
          message.content
        ) : message.role === 'assistant' && message.streaming ? (
          <span
            aria-live="polite"
            style={{
              display: 'inline-block',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Thinking…
          </span>
        ) : null}
      </div>
    </div>
  );
}
