/**
 * Shared skeleton primitive shown by every mini-app `loading.tsx` while its
 * client bundle hydrates and the first data fetch resolves. Replaces the
 * blank-screen gap when the user taps a launcher tile.
 */
export function MiniAppSkeleton({ label }: { label: string }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
      aria-label={`Loading ${label}`}
      aria-busy="true"
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div
          style={{
            width: 80,
            height: 10,
            background: 'var(--color-surface-raised)',
            borderRadius: 2,
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: 200,
            height: 28,
            background: 'var(--color-surface-raised)',
            borderRadius: 4,
            marginTop: 'var(--space-2)',
            opacity: 0.5,
          }}
        />
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 88,
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-card)',
              background: 'var(--color-surface)',
              animation: 'nothing-skeleton-shimmer 1.6s ease-in-out infinite',
              animationDelay: `${i * 120}ms`,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes nothing-skeleton-shimmer {
          0%, 100% { opacity: 0.32; }
          50% { opacity: 0.6; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-busy="true"] > div > div { animation: none !important; opacity: 0.5 !important; }
        }
      `}</style>
    </div>
  );
}
