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
          // Using --space-4 for horizontal padding to stay within existing tokens.
          padding: 'var(--space-6) var(--space-4) 170px',
          minHeight: '100vh',
        }}
      >
        {children}
      </main>
      <TabBar />
    </>
  );
}
