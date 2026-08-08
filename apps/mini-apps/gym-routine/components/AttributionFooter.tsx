'use client';

/**
 * AttributionFooter — the tiny "© Gym visual" credit.
 *
 * Non-negotiable per Gym Visual's license (see exercises.attribution DB
 * column, populated for every row). Every exercise detail screen mounts
 * one of these; the exercise browser mounts one at the bottom of the grid
 * so users see it even if they scroll past the first tile.
 */
export default function AttributionFooter() {
  return (
    <p
      className="caption"
      style={{
        color: 'var(--color-text-disabled)',
        marginTop: 'var(--space-6)',
        textAlign: 'center',
      }}
    >
      Exercise imagery ©{' '}
      <a
        href="https://gymvisual.com/"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Gym visual
      </a>
      .
    </p>
  );
}
