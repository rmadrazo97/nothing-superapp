// Dot-grid background — matches POC .dot-grid pattern from styles.css
// Fixed position, low opacity, non-interactive.
export function DotGrid() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundImage:
          'radial-gradient(circle, var(--color-border) 0.5px, transparent 0.5px)',
        backgroundSize: '12px 12px',
        opacity: 0.5,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
