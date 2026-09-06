import type { ReactNode } from 'react';
import { DotGrid } from './DotGrid';
import { TabBar } from './TabBar';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <DotGrid />
      <main
        style={{
          position: 'relative',
          zIndex: 1,
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
          // (long titles, wide grids, sticky elements), clip it here instead
          // of letting the whole shell scroll sideways off-screen.
          overflowX: 'hidden',
        }}
      >
        {children}
      </main>
      <TabBar />
    </>
  );
}
