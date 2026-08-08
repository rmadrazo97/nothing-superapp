/**
 * /app/* loading UI — a header placeholder + a 4-tile grid skeleton so the
 * layout doesn't jump when the real tiles hydrate. Matches the shape of
 * HomeGrid (auto-fill 140px minmax, aspect-ratio 1).
 */
export default function AppLoading() {
  const tiles = Array.from({ length: 4 });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div
          style={{
            width: 120,
            height: 12,
            background: 'var(--color-surface-raised)',
            borderRadius: 4,
            opacity: 0.6,
          }}
        />
        <div
          style={{
            width: 220,
            height: 32,
            background: 'var(--color-surface-raised)',
            borderRadius: 6,
            marginTop: 'var(--space-2)',
            opacity: 0.6,
          }}
        />
      </header>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 'var(--space-4)',
        }}
        aria-label="Loading mini-apps"
      >
        {tiles.map((_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1 / 1',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-card)',
              background: 'var(--color-surface)',
              animation: 'nothing-tile-shimmer 1.6s ease-in-out infinite',
              animationDelay: `${i * 100}ms`,
              opacity: 0.5,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes nothing-tile-shimmer {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.65; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Loading mini-apps"] > div { animation: none !important; opacity: 0.5 !important; }
        }
      `}</style>
    </div>
  );
}
