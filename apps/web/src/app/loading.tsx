/**
 * Root loading UI — shown while an unauthenticated route (/login, /paywall,
 * /legal/*, /) is streaming its initial payload. Kept minimal so it doesn't
 * flash busy UI when the connection is fast.
 */
export default function RootLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text-display)',
      }}
    >
      <div
        aria-label="Loading"
        role="status"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-heading)',
          letterSpacing: '-0.02em',
          opacity: 0.6,
          animation: 'nothing-loading-pulse 1.2s ease-in-out infinite',
        }}
      >
        NOTHING<span style={{ color: 'var(--color-accent)' }}> ●</span>
      </div>
      <style>{`
        @keyframes nothing-loading-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
