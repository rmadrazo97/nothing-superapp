'use client';

/**
 * Home launcher grid. Receives the mini-app manifest metadata from a Server
 * Component (see apps/web/src/app/app/page.tsx) — this file stays a Client
 * Component so it can subscribe to `useEntitlement()` and dim/redirect
 * subscription-gated tiles in real time (e.g. right after a successful
 * checkout, `refresh()` on the hook re-hydrates without a page reload).
 *
 * Layout: `auto-fill, minmax(140px, 1fr)` — the viewport chooses column
 * count so the grid never overflows on narrow devices and never grows
 * cards absurdly wide on tablets. Aspect-ratio 1 forces the tile to be
 * square so the composition reads as a launcher, not a list.
 *
 * Visual style follows the Nothing OS brief: dark cadmium ember accents on
 * a near-black canvas, thin `--color-border-visible` outlines instead of
 * shadows, monospace label at the bottom of each tile. Locked-tiles use
 * opacity 0.5 + a small lightning glyph in the accent color as the "you
 * need Pro" affordance.
 */
import Link from 'next/link';
import type { Route } from 'next';
import type { CSSProperties } from 'react';
import type { MiniAppManifest } from '@nothing/shared';
import { useEntitlement } from '@/lib/hooks/use-entitlement';

// Spec calls for --space-5 (design-system doesn't ship that token — see
// Shell.tsx for the same escape hatch); --space-4 is the nearest existing
// horizontal-padding token.
const tileInnerPadding = 'var(--space-4)';

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 'var(--space-4)',
  width: '100%',
};

const tileBaseStyle: CSSProperties = {
  aspectRatio: '1 / 1',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: tileInnerPadding,
  background: 'var(--color-surface)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  color: 'var(--color-text-primary)',
  textDecoration: 'none',
  position: 'relative',
  transition: 'border-color 120ms ease, transform 120ms ease',
};

const iconStyle: CSSProperties = {
  fontSize: 'var(--text-heading)',
  lineHeight: 1,
  color: 'var(--color-text-display)',
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const lockBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 'var(--space-2)',
  right: 'var(--space-2)',
  fontSize: 'var(--text-caption)',
  color: 'var(--color-accent)',
  fontFamily: 'var(--font-label)',
  letterSpacing: '0.04em',
};

const emptyStateStyle: CSSProperties = {
  border: '1px dashed var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-8) var(--space-4)',
  color: 'var(--color-text-secondary)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  textAlign: 'center',
  lineHeight: 1.5,
};

export function HomeGrid({ miniApps }: { miniApps: MiniAppManifest[] }) {
  const { entitlement, isLoading } = useEntitlement();
  const isEntitled = entitlement === 'active' || entitlement === 'trialing';

  if (miniApps.length === 0) {
    return (
      <div style={emptyStateStyle}>
        No mini-apps installed yet. Check back soon.
      </div>
    );
  }

  return (
    <div style={gridStyle}>
      {miniApps.map((app, idx) => {
        const needsSubscription = app.requiresSubscription !== false;
        // Pre-checkout, avoid dimming until we know the answer — a brief
        // flash of "locked" during the entitlement fetch would look like a
        // bug to a paying user.
        const showLocked = needsSubscription && !isLoading && !isEntitled;
        // Navigate to /paywall instead of the mini-app when the user is
        // locked out — the Proxy would redirect anyway, but doing it in the
        // link means no flash of the destination shell.
        const href = showLocked ? '/paywall' : app.route;
        // While entitlement is resolving, softly pulse the tile at
        // opacity 0.6 → 0.85 so paying users don't see a "locked" flash
        // and unpaid users don't see a "you're in!" flash. Handoff in
        // one paint once useEntitlement resolves.
        const entitlementPending = needsSubscription && isLoading;
        const classes = ['tile', 'tile-appear'];
        if (showLocked) classes.push('tile-locked');
        if (entitlementPending) classes.push('tile-entitlement-pending');
        return (
          <Link
            key={app.slug}
            href={href as Route}
            className={classes.join(' ')}
            // --tile-index feeds the stagger keyframe in globals.css.
            style={{
              ...tileBaseStyle,
              opacity: showLocked ? 0.5 : entitlementPending ? undefined : 1,
              ['--tile-index' as string]: String(idx),
            }}
            aria-label={
              showLocked
                ? `${app.name} (requires subscription)`
                : app.name
            }
          >
            <div style={iconStyle} aria-hidden="true">
              {app.icon}
            </div>
            <div style={labelStyle}>{app.name}</div>
            {showLocked ? (
              <span style={lockBadgeStyle} aria-hidden="true">
                ⚡
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
