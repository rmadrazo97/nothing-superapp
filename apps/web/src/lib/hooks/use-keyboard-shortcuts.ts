'use client';

/**
 * Keyboard-shortcut primitives.
 *
 * We intentionally ship a small surface — three shortcuts is craft, ten
 * is a plane cockpit. Every hook here follows the same rules:
 *
 *   1. Never fire when the user is typing (input / textarea / contenteditable).
 *      That means shortcuts like `/` don't hijack a search input.
 *   2. Never intercept OS-level shortcuts unintentionally — the ⌘/Ctrl-K
 *      shortcut only fires when Cmd or Ctrl is held, no modifier soup.
 *   3. Cheap listeners — one `keydown` listener per hook, no re-binding
 *      when unrelated state churns.
 *
 * Exposed hooks:
 *
 *   • useGlobalShortcuts()   — mounted once in the /app layout. Wires up
 *                              ⌘/Ctrl-K (jump to /app/assistant + focus
 *                              composer) and ? (open the hint overlay).
 *   • useShortcut(key, fn)   — general-purpose single-shortcut binding
 *                              honoring the typing-guard.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** True if the event's target is somewhere the user is actively typing. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Bind a single shortcut. Pass a matcher predicate over KeyboardEvent —
 * it should return true when the event should be handled. The handler
 * receives the same event so it can preventDefault() if desired.
 *
 * The typing-guard applies to all bindings — pass `allowInInputs: true`
 * if you specifically want a shortcut that fires from inside a field
 * (e.g. Escape to blur).
 */
export function useShortcut(
  matches: (e: KeyboardEvent) => boolean,
  handler: (e: KeyboardEvent) => void,
  opts?: { allowInInputs?: boolean },
) {
  // Wrap the caller's handler in a ref so consumers don't have to memoize.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const matchesRef = useRef(matches);
  matchesRef.current = matches;

  const allowInInputs = opts?.allowInInputs === true;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!allowInInputs && isTypingTarget(e.target)) return;
      if (!matchesRef.current(e)) return;
      handlerRef.current(e);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowInInputs]);
}

/**
 * Global shortcuts for the `/app/*` shell. Returns `{ hintOpen,
 * setHintOpen }` so the caller can mount `<HintOverlay />` at the right
 * spot in its layout (portals aren't necessary — the overlay uses a
 * fixed backdrop).
 */
export function useGlobalShortcuts() {
  const router = useRouter();
  const [hintOpen, setHintOpen] = useState(false);

  // ⌘K / Ctrl+K — jump to /app/assistant. The composer autofocuses on
  // mount (see CopilotChat.tsx Composer) so no extra focus wire needed.
  useShortcut(
    (e) => (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k',
    (e) => {
      e.preventDefault();
      router.push('/app/assistant');
    },
    // ⌘K should ALSO work from inside inputs — it's an OS-tier shortcut.
    { allowInInputs: true },
  );

  // ? — toggle the hint overlay. On US keyboards this is Shift+/.
  useShortcut(
    (e) => e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey,
    (e) => {
      e.preventDefault();
      setHintOpen((v) => !v);
    },
  );

  // Escape — close the hint overlay. Allowed inside inputs so a modal
  // with a field still dismisses on Escape.
  useShortcut(
    (e) => e.key === 'Escape',
    () => setHintOpen(false),
    { allowInInputs: true },
  );

  return { hintOpen, setHintOpen };
}

/**
 * Page-scoped: `/` focuses a given input ref. Used on the exercises list.
 * The input is passed as a callback rather than a ref so callers can
 * safely invoke this hook before the input has mounted.
 */
export function useSearchSlashShortcut(getInput: () => HTMLElement | null) {
  useShortcut(
    (e) => e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey,
    (e) => {
      const el = getInput();
      if (!el) return;
      e.preventDefault();
      el.focus();
      // If it's a text-like input, place caret at end for convenience.
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          /* number/search inputs may not support setSelectionRange */
        }
      }
    },
  );
}
