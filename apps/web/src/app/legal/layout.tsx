import type { ReactNode } from 'react';
import Link from 'next/link';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 'var(--space-8) var(--space-6)',
        maxWidth: 800,
        margin: '0 auto',
      }}
    >
      <nav
        style={{
          display: 'flex',
          gap: 'var(--space-6)',
          alignItems: 'center',
          marginBottom: 'var(--space-8)',
          paddingBottom: 'var(--space-4)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <Link
          href="/"
          className="label"
          style={{ marginRight: 'auto', textDecoration: 'none', color: 'var(--color-text-display)' }}
        >
          NOTHING
        </Link>
        <Link href="/legal/terms" className="label" style={{ textDecoration: 'none' }}>
          Terms
        </Link>
        <Link href="/legal/privacy" className="label" style={{ textDecoration: 'none' }}>
          Privacy
        </Link>
      </nav>
      {children}
    </div>
  );
}
