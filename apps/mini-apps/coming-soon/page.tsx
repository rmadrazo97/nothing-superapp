/**
 * Coming-soon placeholder mini-app page.
 *
 * Loaded by the harness at /app/coming-soon via the re-export in
 * apps/web/src/app/app/coming-soon/page.tsx. Keeps its own component so
 * task 12 can copy this exact shape for calorie-lite.
 */
export default function ComingSoonPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        paddingTop: 'var(--space-8)',
      }}
    >
      <h1 className="display-md">More soon</h1>
      <p
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-body)',
          lineHeight: 1.5,
        }}
      >
        Additional mini-apps land here as they ship. This tile exists so the
        launcher has something real to render before the first product surface
        goes live.
      </p>
      <p
        className="label"
        style={{
          marginTop: 'var(--space-6)',
        }}
      >
        NEXT UP · CALORIE-LITE
      </p>
    </div>
  );
}
