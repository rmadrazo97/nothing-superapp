/**
 * iOS-safe body scroll lock.
 *
 * The naive `document.body.style.overflow = 'hidden'` trick DOES lock scroll
 * on desktop and Android, but iOS Safari happily ignores it — the moment the
 * user swipes inside a modal that hits its scroll boundary, the page
 * underneath scrolls too. The reliable fix (used by every mobile-first modal
 * library, from body-scroll-lock to Radix) is:
 *
 *   1. Record the current scrollY.
 *   2. `position: fixed; top: -scrollY; left: 0; right: 0;` on body — this
 *      pins the page and prevents any inertial scroll.
 *   3. On release: restore original inline styles, then `window.scrollTo(0,
 *      scrollY)` to put the user back where they were.
 *
 * The functions are reference-counted so nested modals (sheet → confirm inside
 * the sheet) don't fight each other. Only the last release actually unlocks
 * the body.
 *
 * SSR-safe: no-ops if `document` isn't available.
 *
 * Usage (typical React hook):
 *
 *   useEffect(() => {
 *     if (!open) return;
 *     lockBodyScroll();
 *     return () => unlockBodyScroll();
 *   }, [open]);
 */

type ScrollState = {
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  scrollY: number;
};

let lockCount = 0;
let savedState: ScrollState | null = null;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  lockCount += 1;
  if (lockCount > 1) return;

  const body = document.body;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  savedState = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    scrollY,
  };

  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;
  if (!savedState) return;

  const body = document.body;
  const { overflow, position, top, left, right, width, scrollY } = savedState;
  savedState = null;

  body.style.overflow = overflow;
  body.style.position = position;
  body.style.top = top;
  body.style.left = left;
  body.style.right = right;
  body.style.width = width;

  // Restore scroll position without triggering smooth-scroll behaviour.
  window.scrollTo(0, scrollY);
}

/**
 * Test/debug helper — how many locks are currently held. Useful for asserting
 * that a modal correctly releases when it closes.
 */
export function getBodyScrollLockCount(): number {
  return lockCount;
}
