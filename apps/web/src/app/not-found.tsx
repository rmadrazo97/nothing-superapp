import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-6)',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        <div
          className="display-xl"
          style={{ letterSpacing: '-0.04em', margin: 0 }}
          aria-hidden="true"
        >
          4<span style={{ color: 'var(--color-accent)' }}>0</span>4
        </div>
        <h1 className="display-md" style={{ margin: 0 }}>
          Nothing here
        </h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          The page you&rsquo;re looking for doesn&rsquo;t exist, or your
          subscription doesn&rsquo;t reach it.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: 'var(--space-4)',
          }}
        >
          <Link href="/" className="btn btn-primary">
            Go home
          </Link>
          <Link href="/app" className="btn btn-secondary">
            Open app
          </Link>
        </div>
      </div>
    </main>
  );
}
