'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseCopilotStream } from '@/lib/copilot/sse-parser';
import { Composer } from './Composer';
import { MessageBubble, type ChatMessage } from './MessageBubble';

/**
 * Copilot chat surface (task 13).
 *
 * Layout — mirrors the Shell's 480px column:
 *   [ suggested prompts / message list ] — scrolls
 *   [ composer ]                        — fixed above the TabBar
 *
 * State:
 *   messages       — ordered list; assistant messages accumulate SSE `delta`
 *                    frames into `content` and `reasoning` frames into `reasoning`.
 *   input          — controlled textarea value.
 *   busy           — true while a stream is in flight; disables the composer.
 *   error          — one-shot banner for network/SSE errors.
 *
 * Persistence: none in v1 — refresh clears the thread (spec v3 §deferrals).
 */

const SUGGESTED_PROMPTS = [
  'What did I eat this week?',
  'How am I tracking against my calorie target?',
  'Summarize the last thing I logged.',
];

// Height of the fixed TabBar area (approx: 44px content + ~28px padding +
// safe-area inset). Keeps the composer above the tabs without overlap.
const TAB_BAR_CLEARANCE = 92;

function makeId(): string {
  // Non-cryptographic; sufficient for stable React keys.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function CopilotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Track whether the user is pinned to the bottom. If they scroll up mid-stream
  // we stop auto-scrolling so we don't fight them.
  const stickToBottomRef = useRef(true);

  // Auto-scroll on new content — only if the user hasn't scrolled up.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Treat "within 40px of bottom" as still stuck to bottom — accommodates
    // rounding + the last streamed token nudging scrollHeight.
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickToBottomRef.current = distanceFromBottom < 40;
  }, []);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (text.length === 0 || busy) return;

      setError(null);

      const userMsg: ChatMessage = {
        id: makeId(),
        role: 'user',
        content: text,
        reasoning: '',
      };
      const assistantId = makeId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        reasoning: '',
        streaming: true,
      };

      // Snapshot outbound history *before* setState (React batches, so we can't
      // rely on `messages` being current inside this closure).
      const outboundHistory = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setBusy(true);
      // A fresh send pins us back to the bottom of the scroller.
      stickToBottomRef.current = true;

      try {
        const response = await fetch('/api/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: outboundHistory }),
        });

        if (!response.ok || !response.body) {
          // Try to surface the server's JSON error, but don't blow up if it isn't JSON.
          let msg = `Request failed (${response.status})`;
          try {
            const data = (await response.json()) as { error?: string };
            if (data.error) msg = data.error;
          } catch {
            /* fall through */
          }
          throw new Error(msg);
        }

        for await (const frame of parseCopilotStream(response.body)) {
          if ('delta' in frame) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + frame.delta } : m,
              ),
            );
          } else if ('reasoning' in frame) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, reasoning: m.reasoning + frame.reasoning } : m,
              ),
            );
          } else if ('error' in frame) {
            setError(frame.error);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        setError(msg);
      } finally {
        setBusy(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
        );
      }
    },
    [busy, messages],
  );

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Fill the viewport minus the shell's top padding + the tabbar zone.
        // The <main> wrapper already pads 170px on the bottom; we override the
        // visual "chat area" to be a proper flex column by absolute-positioning
        // the composer.
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

      {/* Scroll region — messages OR empty-state suggestions */}
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
          <EmptyState
            onPick={(prompt) => setInput(prompt)}
            disabled={busy}
          />
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      {error && (
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
          <span>{error}</span>
        </div>
      )}

      {/* Composer — sticks above the TabBar. */}
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
      <p
        className="caption"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Ask across every mini-app you use. Read-only.
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
