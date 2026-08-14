# PATCH-LAYOUT.md — native-feel worker 3 handoff

Add to `apps/web/src/app/layout.tsx` (worker 1 owns that file; this note is for the serial integrator).

## What to add

One import + one render inside the root `<body>` (or wherever your top-level client-safe island lives — a spot inside the App Router root layout that's already client-friendly).

```tsx
import { MobileKeyboardBehavior } from '@/components/mobile/MobileKeyboardBehavior';

// …inside the root layout's returned JSX, near the top of <body>:
<MobileKeyboardBehavior />
```

## Why

1. Installs the global `visualViewport` focus-scroll handler — native-feel recipe 16 (fixes iOS keyboard covering focused inputs near the bottom of the viewport).
2. Injects a coarse-pointer-only CSS rule that forces every editable surface to render at `font-size: max(16px, 1rem)` — native-feel recipe 15 (fixes iOS auto-zoom on focus for the 14px inputs shipped by the design system's `.input` class and various `INPUT_STYLE` objects). Uses `@media (pointer: coarse)` so desktop mouse users keep the intended 14px chrome.

## Placement notes

- The component renders `null` — it's a pure side-effect island. Order inside the tree doesn't matter as long as it mounts once per session.
- `'use client'` is set on the component itself, so it's safe to render from a Server Component parent (which `layout.tsx` is under the App Router).
- Idempotent: repeated mounts (React StrictMode dev double-invoke) install the handler and inject the `<style>` exactly once via id-check + window sentinel.

## Verification after integration

```bash
grep -rn "MobileKeyboardBehavior" apps/web/src/app/layout.tsx
# should return exactly one hit — the import + one JSX render
```

Then on a real iPhone:
1. Open the app.
2. Open Settings → focus the "Display name" input near the bottom of the viewport.
3. Keyboard rises; input auto-scrolls to vertical center of the visible area.
4. Focus any 14px input (e.g. the calorie-lite settings "Daily calorie target"). Page does NOT zoom in.
