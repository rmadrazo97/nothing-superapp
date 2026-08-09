'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type FileUIPart, type UIMessage } from 'ai';
import { useToast } from '@/lib/toast/context';
import { Composer, type ComposerAttachment } from './Composer';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { ToolCallCard } from './ToolCallCard';

/**
 * Copilot chat surface — v0.6 rebuild.
 *
 * The chat is now a proper AI chat app:
 *   - User + assistant bubbles both render (was a bug in v0.5 — user turns
 *     were technically rendered but with the wrong ordering; fixed the flag
 *     that controlled the cursor so streaming shows up mid-text, not only
 *     while empty).
 *   - Streaming ▊ cursor at the end of the last assistant message.
 *   - Reasoning disclosure sits BELOW the answer, not above.
 *   - Empty state renders 4 prompt cards (grid) that pre-fill the composer.
 *   - Auto-scroll only when the user is already at the bottom; a "↓ NEW"
 *     chip appears bottom-right when they scrolled up during a stream.
 *   - Regenerate + Continue actions on the last assistant message.
 *
 * Thread + history wiring happens in the parent page — this component stays
 * transport-agnostic beyond the /api/copilot endpoint.
 */

const DEFAULT_SUGGESTED_PROMPTS = [
  '◐ Log what I ate today',
  '◐ Suggest a meal that fits my macros',
  '◐ Analyze this photo of my plate',
  '◐ Show me my week',
] as const;

const EMBEDDED_SUGGESTED_PROMPTS = [
  '◐ Log what I just ate',
  '◐ What can I still eat today?',
  '◐ Swap this meal for something lighter',
  '◐ How am I tracking this week?',
] as const;

const TAB_BAR_CLEARANCE = 92;

export interface CopilotChatProps {
  /**
   * Optional scope hint sent to `/api/copilot` as `body.context`. When set to
   * a known scope (e.g. `'calorie-lite'`) the server prepends a scoped system
   * prompt + injects a mini-app-specific data snapshot. Omit for the default
   * cross-mini-app assistant.
   */
  context?: string;
  /** Replace the default empty-state prompt chips. */
  suggestedPrompts?: readonly string[];
  /**
   * "standalone" (default) uses the fixed-position bottom composer + tab-bar
   * clearance that the /copilot page needs. "embedded" makes the composer
   * flow with the container so it plays nicely inside a drawer.
   */
  layout?: 'standalone' | 'embedded';
  /** Optional thread id — for now purely decorative (persistence lands in a follow-up slice). */
  threadId?: string | null;
  /** Fired on successful send so the parent page can update its URL / thread state. */
  onFirstMessage?: (firstUserText: string) => void;
}

export function CopilotChat({
  context,
  suggestedPrompts,
  layout = 'standalone',
  threadId,
  onFirstMessage,
}: CopilotChatProps = {}) {
  const [input, setInput] = useState('');
  const [uiError, setUiError] = useState<string | null>(null);
  const { toast } = useToast();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/copilot',
        // Forwarded on every request body — the route handler reads
        // `body.context` and appends a scoped system-prompt block.
        body: {
          ...(context ? { context } : {}),
          ...(threadId ? { thread_id: threadId } : {}),
        },
      }),
    [context, threadId],
  );

  const { messages, sendMessage, status, error, clearError, setMessages } = useChat({
    transport,
    onError(err) {
      // Map server errors → human toast copy. `err.message` may include the
      // JSON body when the response wasn't 2xx.
      const raw = err.message ?? '';
      const isRate = raw.includes('rate_limited') || raw.includes('429');
      const isPay = raw.includes('payment_required') || raw.includes('402');
      const isAuth = raw.includes('unauthorized') || raw.includes('401');
      if (isRate) {
        toast.info("Slow down — you'll get another 30 messages in about an hour.");
      } else if (isPay) {
        toast.info("This one's paid. Subscribe on the paywall.");
      } else if (!isAuth) {
        toast.error("Something broke on our end. We're logging it.");
      }
      setUiError(raw || 'Network error');
    },
  });

  const busy = status === 'submitted' || status === 'streaming';

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpChip, setShowJumpChip] = useState(false);
  // Cache of when each message was created — the AI SDK doesn't guarantee a
  // timestamp on UIMessage. We stamp on first sight; this survives re-renders
  // via a ref (map) so the values don't reset when React re-renders.
  const timestampsRef = useRef<Map<string, number>>(new Map());

  // Assign a timestamp to any new message we haven't seen before.
  for (const m of messages) {
    if (!timestampsRef.current.has(m.id)) {
      timestampsRef.current.set(m.id, Date.now());
    }
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowJumpChip(false);
    } else if (busy) {
      // New tokens arriving but user isn't at the bottom — surface the chip.
      setShowJumpChip(true);
    }
  }, [messages, busy]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    const atBottom = distanceFromBottom < 40;
    stickToBottomRef.current = atBottom;
    if (atBottom) setShowJumpChip(false);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowJumpChip(false);
  }, []);

  const firstUserFiredRef = useRef(false);

  const send = useCallback(
    (rawText: string, attachments: ComposerAttachment[] = []) => {
      const text = rawText.trim();
      // Allow attachment-only sends ("here's my plate"), still block empty ones.
      if (text.length === 0 && attachments.length === 0) return;
      if (busy) return;
      setUiError(null);
      if (error) clearError();
      stickToBottomRef.current = true;
      setShowJumpChip(false);
      if (!firstUserFiredRef.current && messages.length === 0 && onFirstMessage && text.length > 0) {
        firstUserFiredRef.current = true;
        onFirstMessage(text);
      }
      if (attachments.length > 0) {
        // FileUIPart accepts a data URL directly — no server-side storage in
        // v1. Filename kept for the model + UI thumbnails; contents are never
        // logged (audit log stores metadata only).
        const files: FileUIPart[] = attachments.map((att) => ({
          type: 'file',
          mediaType: att.file.type,
          filename: att.file.name,
          url: att.dataUrl,
        }));
        void sendMessage({ text: text.length > 0 ? text : ' ', files });
      } else {
        void sendMessage({ text });
      }
      setInput('');
    },
    [busy, error, clearError, sendMessage, messages.length, onFirstMessage],
  );

  // ── Regenerate / Continue helpers ─────────────────────────────────
  const regenerate = useCallback(() => {
    if (busy) return;
    // Find the last user message; drop everything after it, resend the same
    // parts. The AI SDK will treat this as a fresh assistant turn.
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const trimmed = messages.slice(0, lastUserIdx);
    const lastUser = messages[lastUserIdx];
    setMessages(trimmed);
    stickToBottomRef.current = true;
    // Rehydrate the parts we know how to resend (text + file).
    const text = lastUser.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('');
    const files: FileUIPart[] = lastUser.parts
      .filter(
        (p) =>
          (p as { type?: string }).type === 'file' &&
          typeof (p as { mediaType?: string }).mediaType === 'string',
      )
      .map((p) => {
        const fp = p as { url: string; filename?: string; mediaType: string };
        return { type: 'file', url: fp.url, filename: fp.filename, mediaType: fp.mediaType };
      });
    if (files.length > 0) {
      void sendMessage({ text: text.length > 0 ? text : ' ', files });
    } else {
      void sendMessage({ text });
    }
  }, [busy, messages, sendMessage, setMessages]);

  const continueAnswer = useCallback(() => {
    if (busy) return;
    void sendMessage({ text: 'Please continue.' });
    stickToBottomRef.current = true;
  }, [busy, sendMessage]);

  const retry = regenerate;

  const isEmpty = messages.length === 0;
  const embedded = layout === 'embedded';
  const prompts =
    suggestedPrompts ?? (embedded ? EMBEDDED_SUGGESTED_PROMPTS : DEFAULT_SUGGESTED_PROMPTS);

  // Find the id of the last assistant message so we know which one gets
  // Regenerate / Continue action buttons.
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].id;
    }
    return null;
  }, [messages]);

  const isLatestErrored = error != null && !busy && messages.length > 0 &&
    messages[messages.length - 1]?.role === 'assistant';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: embedded
          ? 0
          : `calc(100vh - var(--space-6) - ${TAB_BAR_CLEARANCE}px)`,
        flex: embedded ? 1 : undefined,
        position: 'relative',
      }}
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          paddingBottom: embedded ? 'var(--space-3)' : 'var(--space-4)',
        }}
      >
        {isEmpty ? (
          <EmptyState
            prompts={prompts}
            onPick={(prompt) => setInput(prompt)}
            disabled={busy}
            embedded={embedded}
          />
        ) : (
          messages.map((m) => {
            const isLast = m.id === messages[messages.length - 1]?.id;
            const isLastAssistant = m.id === lastAssistantId;
            return (
              <RenderedMessage
                key={m.id}
                message={m}
                streaming={busy && isLast && m.role === 'assistant'}
                timestampMs={timestampsRef.current.get(m.id) ?? Date.now()}
                onRegenerate={isLastAssistant && !busy ? regenerate : undefined}
                onContinue={isLastAssistant && !busy ? continueAnswer : undefined}
                onRetry={isLastAssistant && isLatestErrored ? retry : undefined}
                errored={isLastAssistant && isLatestErrored}
              />
            );
          })
        )}
      </div>

      {showJumpChip && !isEmpty && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="nsa-jump-chip"
          aria-label="Jump to newest message"
        >
          ↓ New
        </button>
      )}

      {uiError && (
        <div
          role="alert"
          style={{
            marginBottom: 'var(--space-2)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-compact)',
            border: '1px solid var(--color-accent)',
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-body-sm)',
          }}
        >
          <span className="status-line status-error">error</span>{' '}
          <span>{uiError}</span>
        </div>
      )}

      {embedded ? (
        <div
          style={{
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <Composer
            value={input}
            onChange={setInput}
            onSend={(attachments) => send(input, attachments)}
            busy={busy}
          />
        </div>
      ) : (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: TAB_BAR_CLEARANCE,
            zIndex: 30,
            background:
              'linear-gradient(to bottom, transparent, var(--color-bg) 40%)',
            paddingTop: 'var(--space-4)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              margin: '0 auto',
              padding: '0 var(--space-4) var(--space-2)',
            }}
          >
            <Composer
              value={input}
              onChange={setInput}
              onSend={(attachments) => send(input, attachments)}
              busy={busy}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Render a single UIMessage — user messages are single-text bubbles;
 * assistant messages are decomposed into parts so tool calls render as
 * ToolCallCards inline with text.
 */
function RenderedMessage({
  message,
  streaming,
  timestampMs,
  onRegenerate,
  onContinue,
  onRetry,
  errored,
}: {
  message: UIMessage;
  streaming: boolean;
  timestampMs: number;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
  errored?: boolean;
}) {
  if (message.role === 'user') {
    const text = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('');
    const images = message.parts
      .filter(
        (p) =>
          (p as { type?: string }).type === 'file' &&
          typeof (p as { mediaType?: string }).mediaType === 'string' &&
          (p as { mediaType: string }).mediaType.startsWith('image'),
      )
      .map((p) => p as { url: string; filename?: string; mediaType: string });
    const trimmed = text.trim();
    const bubble: ChatMessage = {
      id: message.id,
      role: 'user',
      // Trim the whitespace placeholder we send when the user attaches images
      // with no text so the bubble doesn't render a bare space. If the user
      // sends attachments only, fall back to a semantic label so the bubble
      // still reads.
      content: trimmed.length > 0
        ? trimmed
        : images.length > 0
          ? ''
          : '',
      reasoning: '',
      timestampMs,
      attachments: images.map((img) => ({
        url: img.url,
        filename: img.filename,
        mediaType: img.mediaType,
      })),
    };
    return <MessageBubble message={bubble} />;
  }

  // Assistant — combine text parts into one bubble (v5 usually only emits one
  // per turn) and render tool parts as cards between/after text.
  const text = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('');
  const reasoning = message.parts
    .filter((p) => p.type === 'reasoning')
    .map((p) => (p as { text: string }).text)
    .join('');
  const bubble: ChatMessage = {
    id: message.id,
    role: 'assistant',
    content: text,
    reasoning,
    // Cursor blinks whenever the message is the actively-streaming one — the
    // MessageBubble renders it INLINE at the end of the visible text, so the
    // token stream feels alive.
    streaming,
    timestampMs,
    onRegenerate,
    onContinue,
    onRetry,
    errored,
  };

  const toolParts = message.parts.filter(
    (p) => typeof p.type === 'string' && (p.type.startsWith('tool-') || p.type === 'dynamic-tool'),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {(text.length > 0 || reasoning.length > 0 || streaming || toolParts.length === 0) && (
        <MessageBubble message={bubble} />
      )}
      {toolParts.map((p, idx) => {
        const anyPart = p as {
          type: string;
          toolName?: string;
          state?: string;
          input?: unknown;
          output?: unknown;
          errorText?: string;
        };
        const toolName =
          anyPart.type === 'dynamic-tool'
            ? (anyPart.toolName ?? 'tool')
            : anyPart.type.replace(/^tool-/, '');
        return (
          <ToolCallCard
            key={`${message.id}-tool-${idx}`}
            toolName={toolName}
            state={anyPart.state ?? 'input-available'}
            input={anyPart.input}
            output={anyPart.output}
            errorText={anyPart.errorText ?? null}
          />
        );
      })}
    </div>
  );
}

function EmptyState({
  onPick,
  disabled,
  prompts,
  embedded,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
  prompts: readonly string[];
  embedded: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: embedded ? 'var(--space-2) 0' : 'var(--space-6) 0',
      }}
    >
      {!embedded && (
        <div>
          <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
            ◐ COPILOT
          </div>
          <h1 className="display-md" style={{ marginBottom: 'var(--space-2)' }}>
            What can I do?
          </h1>
          <p
            className="caption"
            style={{ color: 'var(--color-text-secondary)', maxWidth: 420 }}
          >
            Ask across every mini-app. I can log meals, water, weight, start a
            pomodoro, and see your macros.
          </p>
        </div>
      )}
      {embedded && (
        <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          Ask about your day, swap ingredients, or log from your plan — the
          copilot has your macros in view.
        </p>
      )}
      <div className="nsa-prompt-grid">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt.replace(/^◐\s*/, ''))}
            className="nsa-prompt-card"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
