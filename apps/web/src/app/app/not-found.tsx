import Link from 'next/link';

/**
 * /app/* not-found — for mini-app slugs that don't map to an installed
 * mini-app (e.g. a stale link from an uninstalled or renamed mini-app).
 * Rendered inside the Shell so the TabBar stays reachable.
 */
export default function AppNotFound() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        alignItems: 'center',
        textAlign: 'center',
        padding: 'var(--space-12) var(--space-4)',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <div className="display-lg" style={{ color: 'var(--color-accent)' }}>
        ◊
      </div>
      <h1 className="display-md" style={{ margin: 0 }}>
        Mini-app not found
      </h1>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
        This mini-app isn&rsquo;t installed on your account, or the URL is
        wrong. All installed mini-apps are on the home grid.
      </p>
      <Link href="/app" className="btn btn-primary">
        Back to apps
      </Link>
    </div>
  );
}
