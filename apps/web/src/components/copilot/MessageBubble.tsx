'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/lib/toast/context';
import { PixelLoader } from './PixelLoader';
import { ReasoningDisclosure } from './ReasoningDisclosure';
import { renderMarkdownLite } from './markdown-lite';

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
  /** Epoch millis for the timestamp footer (tap/hover reveal). */
  timestampMs?: number;
  /** Callbacks for the action row (assistant only). Undefined = hide the action. */
  onRegenerate?: () => void;
  onContinue?: () => void;
  /** Retry chip for a failed assistant stream. */
  onRetry?: () => void;
  errored?: boolean;
};

/**
 * MessageBubble — proper AI-chat bubble.
 *
 * Redesigned as part of the copilot rebuild:
 *   - User bubbles are RIGHT-aligned with a cadmium OUTLINE (not fill),
 *     matching the "signal, not decoration" rule on the accent color.
 *   - Assistant bubbles are LEFT-aligned on a subtle raised surface.
 *   - Streaming assistant messages get a blinking ▊ cursor at the end of
 *     the visible text — the single most "feels like a real chat app" win.
 *   - Reasoning disclosure moved BELOW the answer (was above).
 *   - Markdown-lite renderer for **bold**, *italic*, `code`, code blocks,
 *     paragraphs, and - lists. No new deps.
 *   - Action row (Copy / Regenerate / Continue) appears on hover/tap under
 *     assistant bubbles.
 *   - Retry chip under a failed assistant bubble.
 *   - Tap-to-reveal HH:MM timestamp under every bubble.
 */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const { toast } = useToast();

  // One-frame data-fresh flag — the CSS animation reads this off the
  // wrapper so React doesn't need to keep a state var for it.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.setAttribute('data-fresh', 'true');
    const id = requestAnimationFrame(() => {
      el.removeAttribute('data-fresh');
    });
    return () => cancelAnimationFrame(id);
  }, [message.id]);

  const copyToClipboard = useCallback(async () => {
    if (message.content.length === 0) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Couldn't copy — clipboard permission blocked.");
    }
  }, [message.content, toast]);

  const timestampLabel = useMemo(() => {
    if (!message.timestampMs) return null;
    try {
      const d = new Date(message.timestampMs);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch {
      return null;
    }
  }, [message.timestampMs]);

  const bubbleContent = isUser ? (
    // User: plain text, whitespace preserved. Markdown parsing intentionally
    // skipped so a user typing "**foo**" sees exactly that back.
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>
  ) : (
    <div className="nsa-md">
      {renderMarkdownLite(message.content)}
      {message.streaming && (
        <span className="nsa-cursor" aria-hidden>
          ▊
        </span>
      )}
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      <div
        className="nsa-msg-bubble"
        onClick={() => setShowMeta((v) => !v)}
        style={{
          position: 'relative',
          // v0.5.3 — widen bubbles so the chat column doesn't waste the shell
          // width. User turns stay narrower (78%) so they read as
          // conversational asides; assistant turns get 92% because the
          // markdown-rendered answers need room for bullet lists / code
          // blocks / tool cards without a wrapping cliff.
          maxWidth: isUser ? '78%' : '92%',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-card)',
          background: isUser ? 'transparent' : 'rgba(255, 255, 255, 0.03)',
          color: 'var(--color-text-primary)',
          border: isUser
            ? '1px solid var(--color-accent)'
            : '1px solid var(--color-border-visible)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}
      >
        {/* Attachments render above content — used for user image uploads. */}
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
          bubbleContent
        ) : message.role === 'assistant' && message.streaming ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <PixelLoader size="md" label="Thinking" />
            <span>Thinking</span>
          </span>
        ) : null}

        {/* Reasoning disclosure BELOW the answer per redesign spec. */}
        {message.role === 'assistant' && message.reasoning.length > 0 && (
          <ReasoningDisclosure
            content={message.reasoning}
            streaming={message.streaming === true && message.content.length === 0}
          />
        )}
      </div>

      {/* Retry chip — under a failed assistant bubble. */}
      {message.role === 'assistant' && message.errored && message.onRetry && (
        <button
          type="button"
          onClick={message.onRetry}
          className="nsa-msg-retry"
          style={{
            marginTop: 'var(--space-2)',
            padding: 'var(--space-1) var(--space-3)',
            background: 'transparent',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-compact)',
            color: 'var(--color-accent)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          ⚠ Retry
        </button>
      )}

      {/* Message actions — assistant only, hover-reveal on desktop. */}
      {message.role === 'assistant' && message.content.length > 0 && (
        <div
          className="nsa-msg-actions"
          style={{
            display: 'flex',
            gap: 'var(--space-1)',
            marginTop: 'var(--space-1)',
          }}
        >
          <ActionButton
            label={copied ? '✓ Copied' : '⧉ Copy'}
            onClick={() => void copyToClipboard()}
            pressed={copied}
          />
          {message.onRegenerate && (
            <ActionButton label="↻ Regen" onClick={message.onRegenerate} />
          )}
          {message.onContinue && (
            <ActionButton label="⇢ Continue" onClick={message.onContinue} />
          )}
        </div>
      )}

      {timestampLabel && showMeta && (
        <div
          style={{
            marginTop: 'var(--space-1)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-text-disabled)',
            letterSpacing: '0.04em',
          }}
        >
          {timestampLabel}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  pressed,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Prevent parent bubble's onClick from also firing (would toggle meta).
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={pressed}
      style={{
        padding: '4px 8px',
        background: 'transparent',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-compact)',
        color: 'var(--color-text-secondary)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}
