/**
 * keyboard-scroll — the mobile-web fix for "the iOS keyboard covers the
 * focused input" bug.
 *
 * Native-feel recipe 16: attach a `focusin` handler that, after the keyboard
 * finishes its animation, scrolls the focused field into the *visible*
 * viewport (which shrinks when the keyboard is up). Uses the standards-track
 * `window.visualViewport` API — no dependencies, no framework hooks.
 *
 * Wire once from the client entry (see MobileKeyboardBehavior.tsx). Idempotent
 * — repeated installs no-op via the `__nsaKeyboardScrollBound` sentinel.
 *
 * A11y notes:
 * - Only scrolls when the focused element is an actual editable surface
 *   (input / textarea / [contenteditable]) — never disturbs focus rings on
 *   buttons or links.
 * - Uses `block: 'center'` so the input lands in the middle of the visible
 *   area — leaves the field label above and any inline error below it
 *   visible.
 * - Respects `prefers-reduced-motion`: uses `'auto'` behavior when the user
 *   opts out of animation, `'smooth'` otherwise.
 */

const BOUND_FLAG = '__nsaKeyboardScrollBound' as const;

// Delay long enough for the iOS keyboard slide-in animation to finish.
// Empirically ~250-300ms on iOS 17; 320 gives a small buffer.
const KEYBOARD_SETTLE_MS = 320;

const EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"], [contenteditable=""]';

/**
 * Install the global focus-scroll behavior. Safe to call multiple times.
 * No-ops on the server, on browsers without visualViewport (older Android
 * WebViews, jsdom), and after the first successful install.
 */
export function installKeyboardScroll(): void {
  if (typeof window === 'undefined') return;
  // visualViewport is required — without it we can't tell where the keyboard
  // stops, so scrolling into view could put the field UNDER the keyboard.
  if (!('visualViewport' in window)) return;

  const w = window as Window & { [BOUND_FLAG]?: boolean };
  if (w[BOUND_FLAG]) return;
  w[BOUND_FLAG] = true;

  const prefersReducedMotion =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  const scrollBehavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // Skip synthetic inputs the user can't type into (file / checkbox / radio
    // / hidden / etc.) — the keyboard doesn't rise for those, so scrolling
    // them into center is disruptive.
    if (target instanceof HTMLInputElement) {
      const skipTypes = new Set([
        'file',
        'checkbox',
        'radio',
        'submit',
        'button',
        'reset',
        'hidden',
        'image',
        'color',
        'range',
      ]);
      if (skipTypes.has(target.type)) return;
    }
    if (!target.matches(EDITABLE_SELECTOR)) return;

    window.setTimeout(() => {
      // Field may have blurred / unmounted while we waited for the keyboard.
      if (document.activeElement !== target) return;
      try {
        target.scrollIntoView({ block: 'center', behavior: scrollBehavior });
      } catch {
        // Older Safari can throw if the element detached mid-animation.
        // Swallow — a missed scroll is better than a runtime error in prod.
      }
    }, KEYBOARD_SETTLE_MS);
  });
}
