'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

/**
 * Bottom-anchored composer. Renders inside a fixed positioner in
 * CopilotChat — this component owns the textarea + send affordance only.
 *
 * Behaviour:
 *   - Enter sends. Shift+Enter inserts a newline.
 *   - Send is disabled while `busy` or the textarea is empty.
 *   - Textarea auto-grows up to a cap (~6 lines) then scrolls internally.
 */
export function Composer({
  value,
  onChange,
  onSend,
  busy,
  placeholder = 'Ask about your day…',
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize: reset then match scrollHeight, clamp to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const MAX = 140; // ~6 lines at 14px body-sm / 1.5 line-height
    el.style.height = Math.min(el.scrollHeight, MAX) + 'px';
  }, [value]);

  const canSend = !busy && value.trim().length > 0;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={busy}
        rows={1}
        aria-label="Message"
        style={{
          flex: 1,
          resize: 'none',
          minHeight: 40,
          maxHeight: 140,
          padding: '10px 12px',
          background: 'transparent',
          border: 0,
          borderRadius: 8,
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
          lineHeight: 1.5,
          caretColor: 'var(--color-accent)',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={!canSend}
        className="btn btn-primary"
        style={{
          minHeight: 40,
          padding: '10px 18px',
          fontSize: 'var(--text-body-sm)',
        }}
      >
        {busy ? '…' : 'Send'}
      </button>
    </form>
  );
}
