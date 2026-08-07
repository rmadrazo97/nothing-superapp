'use client';

import { ReasoningDisclosure } from './ReasoningDisclosure';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** Populated only for assistant messages; empty string means "none". */
  reasoning: string;
  /** True while an assistant message is still receiving SSE frames. */
  streaming?: boolean;
};

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      <div
        style={{
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
          <ReasoningDisclosure
            content={message.reasoning}
            streaming={message.streaming === true && message.content.length === 0}
          />
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
