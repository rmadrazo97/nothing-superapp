'use client';

/**
 * CopilotDrawerTrigger — small "◐ ASK" chip that owns local open state and
 * renders <CopilotDrawer/>. Drop into a mini-app header next to other chips;
 * it doesn't propagate any state to the parent.
 *
 * Visual: cadmium border + text on a dark background, matching the SET UP
 * PROFILE chip on the calorie-lite header so they read as a family.
 */
import { useState } from 'react';
import { CopilotDrawer } from './CopilotDrawer';

export interface CopilotDrawerTriggerProps {
  /** Scope forwarded to /api/copilot as `body.context`. */
  context?: string;
  /** Uppercase Space Mono subtitle shown in the drawer header (e.g. "CALORIE LITE"). */
  scopeLabel?: string;
  /** Chips shown in the drawer's empty state. */
  suggestedPrompts?: readonly string[];
  /** Chip label — defaults to "◐ ASK". */
  label?: string;
  /**
   * Optional attention dot — shows a small cadmium disc on the chip when the
   * copilot has fresh context to offer (e.g. a protein deficit insight).
   */
  attention?: boolean;
}

export function CopilotDrawerTrigger({
  context,
  scopeLabel,
  suggestedPrompts,
  label = '◐ Ask',
  attention = false,
}: CopilotDrawerTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask the copilot"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          position: 'relative',
          background: 'transparent',
          color: 'var(--color-accent)',
          border: '1px solid var(--color-accent)',
          borderRadius: 'var(--radius-compact)',
          padding: 'var(--space-1) var(--space-3)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {label}
        {attention && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-accent)',
              boxShadow: '0 0 0 2px var(--color-bg)',
            }}
          />
        )}
      </button>
      <CopilotDrawer
        open={open}
        onClose={() => setOpen(false)}
        context={context}
        scopeLabel={scopeLabel}
        suggestedPrompts={suggestedPrompts}
      />
    </>
  );
}
