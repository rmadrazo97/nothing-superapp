import type { ReactNode } from 'react';
import { DotGrid } from './DotGrid';
import { TabBar } from './TabBar';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <DotGrid />
      <main
        style={{
          // No z-index here (v0.6.5): `zIndex: 1` made <main> a stacking
          // context, trapping every modal/sheet rendered inside it BELOW the
          // root-level TabBar (z 40) no matter how high its own z-index.
          // Positioned + later in the DOM is enough to paint above DotGrid.
          position: 'relative',
          // `width: 100%` is load-bearing: <body> is a flex column and the
          // auto side margins disable stretch, so without it <main> sized to
          // its content — one long nowrap title (a routine name) pushed it to
          // the 480px max and the whole page ran off the right edge.
          width: '100%',
          minWidth: 0,
          maxWidth: 480,
          margin: '0 auto',
          // NOTE: design-system defines --space-1..4, 6, 8, 12, 16 (no --space-5).
          // Standalone PWA on iOS: the status bar / Dynamic Island sits ON TOP
          // of the viewport when `viewport-fit=cover`. Add the safe-area inset
          // to the top padding so the mini-app header clears the island. The
          // TabBar handles its own bottom inset — bottom padding is derived
          // from the ~72px nav height + safe-area + a comfortable buffer so
          // scrollable content clears the fixed nav on every device.
          padding:
            'calc(var(--space-6) + env(safe-area-inset-top)) calc(var(--space-4) + env(safe-area-inset-right)) calc(72px + env(safe-area-inset-bottom) + var(--space-8)) calc(var(--space-4) + env(safe-area-inset-left))',
          minHeight: '100dvh',
          // Belt-and-suspenders: if a child mistakenly overflows horizontally
          // (long titles, wide grids), clip it here instead of letting the
          // whole shell scroll sideways. `clip`, not `hidden`: hidden turns
          // <main> into a scroll container, which breaks position: sticky
          // for everything inside it (e.g. the session rest timer).
          overflowX: 'clip',
        }}
      >
        {children}
      </main>
      <TabBar />
    </>
  );
}
