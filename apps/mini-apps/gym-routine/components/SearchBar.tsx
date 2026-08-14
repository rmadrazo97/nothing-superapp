'use client';

import { inputStyle } from '../lib/ui.ts';

/**
 * SearchBar — Space Mono monospaced input, controlled from the parent.
 *
 * We debounce in the parent (400ms) so this stays dumb and predictable —
 * every keystroke fires onChange, the parent decides when to hit the API.
 */
export default function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search'}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        style={{ ...inputStyle, paddingLeft: 'var(--space-8)' }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 'var(--space-3)',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-text-disabled)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-body)',
          pointerEvents: 'none',
        }}
      >
        ⌕
      </span>
    </div>
  );
}
