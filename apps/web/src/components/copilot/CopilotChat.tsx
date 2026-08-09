'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useToast } from '@/lib/toast/context';
import { Composer } from './Composer';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import { ToolCallCard } from './ToolCallCard';

/**
 * Copilot chat surface — Vercel AI SDK v5 rewrite (v0.4).
 *
 * The old hand-rolled SSE parser + local message state is gone. `useChat()`
 * owns the message list, streaming, and error surfacing. We keep local `input`
 * state (v5 dropped `input`/`handleInputChange` in favour of `sendMessage`)
 * and a busy flag derived from `status`.
 *
 * Rendering: each assistant message is decomposed into its `parts` array —
 * text parts still render as MessageBubbles; `tool-*` parts render as
 * ToolCallCards (cadmium for writes, muted for reads). Reasoning parts are
 * grouped into a single ReasoningDisclosure via the existing MessageBubble
 * component so users can peek at the model's chain of thought.
 */

const SUGGESTED_PROMPTS = [
  'Log a coffee with 40 kcal',
  "What's my calorie streak?",
  'How am I tracking today?',
];

const TAB_BAR_CLEARANCE = 92;

export function CopilotChat() {
  const [input, setInput] = useState('');
  const [uiError, setUiError] = useState<string | null>(null);
  const { toast } = useToast();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/copilot',
      }),
    [],
  );

  const { messages, sendMessage, status, error, clearError } = useChat({
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

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickToBottomRef.current = distanceFromBottom < 40;
  }, []);

  const send = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (text.length === 0 || busy) return;
      setUiError(null);
      if (error) clearError();
      stickToBottomRef.current = true;
      void sendMessage({ text });
      setInput('');
    },
    [busy, error, clearError, sendMessage],
  );

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: `calc(100vh - var(--space-6) - ${TAB_BAR_CLEARANCE}px)`,
        position: 'relative',
      }}
    >
      <header style={{ marginBottom: 'var(--space-4)' }}>
        <div className="label" style={{ marginBottom: 'var(--space-1)' }}>
          Copilot
        </div>
        <h1 className="display-md">Assistant</h1>
      </header>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          paddingBottom: 'var(--space-4)',
        }}
      >
        {isEmpty ? (
          <EmptyState onPick={(prompt) => setInput(prompt)} disabled={busy} />
        ) : (
          messages.map((m) => (
            <RenderedMessage
              key={m.id}
              message={m}
              streaming={busy && m.id === messages[messages.length - 1]?.id && m.role === 'assistant'}
            />
          ))
        )}
      </div>

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
            onSend={() => send(input)}
            busy={busy}
          />
        </div>
      </div>
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
}: {
  message: UIMessage;
  streaming: boolean;
}) {
  if (message.role === 'user') {
    const text = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('');
    const bubble: ChatMessage = {
      id: message.id,
      role: 'user',
      content: text,
      reasoning: '',
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
    streaming: streaming && text.length === 0,
  };

  const toolParts = message.parts.filter(
    (p) => typeof p.type === 'string' && (p.type.startsWith('tool-') || p.type === 'dynamic-tool'),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {(text.length > 0 || reasoning.length > 0 || bubble.streaming || toolParts.length === 0) && (
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
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4) 0',
      }}
    >
      <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        Ask across every mini-app you use. I can also log meals, water, weight,
        and start a pomodoro on your behalf.
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            style={{
              textAlign: 'left',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-card)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-sm)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition:
                'border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
