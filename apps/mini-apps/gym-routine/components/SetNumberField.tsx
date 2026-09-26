'use client';

/**
 * SetNumberField — the reps / weight cell in the live-session logger.
 *
 * Keeps its own raw draft string so the browser never fights the user:
 *   - "22." / "22,5" survive mid-typing (type="number" + Number() ate them)
 *   - focusing selects the whole value, so one tap + type replaces it
 *     instead of appending to "10" → "108"
 *   - every valid keystroke is pushed up immediately (not on blur), so a
 *     ✓ tap right after typing always sees the new value
 *   - text input + inputMode gives the numeric keypad without the
 *     scroll-wheel / spinner / locale quirks of type="number"
 */
import { forwardRef, useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatDraft, normalizeDraft, parseDraft, type NumberKind } from '../lib/set-input.ts';

export interface SetNumberFieldProps {
  value: number | null;
  kind: NumberKind;
  onValue: (v: number | null) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  done?: boolean;
  enterKeyHint?: 'next' | 'done';
  onEnter?: () => void;
}

const SetNumberField = forwardRef<HTMLInputElement, SetNumberFieldProps>(
  function SetNumberField(
    { value, kind, onValue, ariaLabel, placeholder, disabled, done, enterKeyHint, onEnter },
    ref,
  ) {
    const [draft, setDraft] = useState(() => formatDraft(value));
    const focusedRef = useRef(false);

    // Sync from props only while the user isn't typing in this field —
    // carry-forward from a sibling set or a server reload must show up,
    // but must never clobber a draft like "22." mid-edit.
    useEffect(() => {
      if (!focusedRef.current) setDraft(formatDraft(value));
    }, [value]);

    const style: CSSProperties = {
      width: '100%',
      minWidth: 0,
      height: 48,
      boxSizing: 'border-box',
      padding: '0 var(--space-2)',
      borderRadius: 'var(--radius-compact)',
      border: `1px solid ${done ? 'transparent' : 'var(--color-border-visible)'}`,
      background: done ? 'transparent' : 'var(--color-surface-raised)',
      color: done ? 'var(--color-text-secondary)' : 'var(--color-text-display)',
      fontFamily: 'var(--font-label)',
      // ≥16px or iOS Safari zooms the whole page on focus.
      fontSize: 18,
      fontVariantNumeric: 'tabular-nums',
      textAlign: 'center',
      outline: 'none',
      caretColor: 'var(--color-accent)',
      touchAction: 'manipulation',
      WebkitAppearance: 'none',
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode={kind === 'int' ? 'numeric' : 'decimal'}
        pattern={kind === 'int' ? '[0-9]*' : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className="gym-set-field"
        style={style}
        onFocus={(e) => {
          focusedRef.current = true;
          const el = e.currentTarget;
          const atFocus = el.value;
          try {
            el.setSelectionRange(0, el.value.length);
          } catch {
            /* detached */
          }
          // iOS clears a synchronous selection on the following mouseup.
          // Skip if a keystroke already landed, or we'd select (and then
          // overwrite) the digit the user just typed.
          setTimeout(() => {
            if (el.value !== atFocus || document.activeElement !== el) return;
            try {
              el.setSelectionRange(0, el.value.length);
            } catch {
              /* detached */
            }
          }, 0);
        }}
        onChange={(e) => {
          const next = normalizeDraft(e.target.value, kind);
          if (next == null) return; // reject the keystroke
          setDraft(next);
          onValue(parseDraft(next, kind));
        }}
        onBlur={() => {
          focusedRef.current = false;
          setDraft(formatDraft(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.();
          }
        }}
      />
    );
  },
);

export default SetNumberField;
