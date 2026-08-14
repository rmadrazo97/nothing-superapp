'use client';

/**
 * MobileKeyboardBehavior — mount-once client wrapper for the native-feel
 * mobile input polish pass.
 *
 * Does TWO things:
 *
 * 1. Installs the global visualViewport focus-scroll handler
 *    (native-feel recipe 16) so tapping an input near the bottom of the
 *    screen doesn't leave the field trapped under the iOS keyboard.
 *
 * 2. Injects a document-level <style> block that forces every editable
 *    surface — <input>, <textarea>, <select>, [contenteditable] — to
 *    render at font-size >= 16px (native-feel recipe 15). iOS Safari zooms
 *    the whole page in when a field with sub-16px text receives focus; the
 *    only a11y-safe fix is to set the actual font-size to 16px. We honor
 *    inline `style={{ fontSize: … }}` overrides via `:not([style*="font-size"])`
 *    so components that INTEND a smaller size (e.g. tiny numeric spin fields)
 *    keep their inline value. The rule is media-gated to touch pointers so
 *    desktop mouse users retain the designed 14px chrome.
 *
 * Renders nothing. Wire from apps/web/src/app/layout.tsx exactly once.
 */

import { useEffect } from 'react';
import { installKeyboardScroll } from '@/lib/mobile/keyboard-scroll';

// Selector matches editable surfaces WITHOUT skipping checkboxes / radios —
// harmless, since font-size on those has no visible effect. Excluding them
// would just add complexity. `[type="hidden"]` is fine to hit for the same
// reason (no rendering).
const INPUT_16PX_STYLE = `
@media (pointer: coarse) {
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  textarea,
  select,
  [contenteditable="true"],
  [contenteditable=""] {
    font-size: max(16px, 1rem) !important;
  }
}
`.trim();

const STYLE_ID = 'nsa-native-feel-input-16px';

export function MobileKeyboardBehavior(): null {
  useEffect(() => {
    installKeyboardScroll();

    // Inject the 16px input override exactly once. Idempotent — a second
    // mount (e.g. under React StrictMode double-invoke in dev) finds the
    // node and no-ops.
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = INPUT_16PX_STYLE;
    document.head.appendChild(style);
  }, []);

  return null;
}

export default MobileKeyboardBehavior;
