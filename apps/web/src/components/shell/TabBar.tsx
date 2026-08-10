'use client';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  assistantUrlForContext,
  getMiniAppContext,
} from '@/lib/mini-apps/context';

// Nav SVG icons — minimalist stroke/fill, `currentColor` so the active/idle
// text colour drives them without a JS re-render. 16×16 viewBox. Kept inline
// (no icon library) so the initial nav bar bundle stays a handful of bytes.
// NOTE: these are chrome (nav), NOT product (tiles) — tiles use emoji. Do
// not unify the two systems.
//
// v0.5.3 (#96) — the ASSISTANT icon carries an optional orbiting cadmium
// dot when the current route has feedable mini-app context. Static dot for
// prefers-reduced-motion. The dot lives inside the SVG (not a sibling div)
// so it inherits the same 16×16 layout box + doesn't reflow the label.
const AssistantIcon = ({ hasContext = false }: { hasContext?: boolean }) => (
  // 4-point spark/star — thin diamond with a slim vertical + horizontal bar.
  // With `hasContext`, add a 2px cadmium dot that orbits the spark centre
  // at ~4s period. `transform-origin` = the icon centre (8,8). The dot
  // starts due-east of centre at radius 7 (just clear of the star's outer
  // edge). Fallback: static dot when the user prefers reduced motion.
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 1.5 L9.2 6.8 L14.5 8 L9.2 9.2 L8 14.5 L6.8 9.2 L1.5 8 L6.8 6.8 Z"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
      fill="none"
    />
    {hasContext && (
      <g className="nsa-assistant-orbit">
        <circle cx="15" cy="8" r="1" fill="var(--color-accent)" />
      </g>
    )}
  </svg>
);

const HomeIcon = () => (
  // 2×2 dot grid.
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="5" cy="5" r="1.4" fill="currentColor" />
    <circle cx="11" cy="5" r="1.4" fill="currentColor" />
    <circle cx="5" cy="11" r="1.4" fill="currentColor" />
    <circle cx="11" cy="11" r="1.4" fill="currentColor" />
  </svg>
);

const SettingsIcon = () => (
  // 3 horizontal sliders with dot knobs. Rows at y=4, 8, 12.
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <line x1="1.5" y1="4" x2="14.5" y2="4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="11" cy="4" r="1.7" fill="currentColor" />
    <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="5" cy="8" r="1.7" fill="currentColor" />
    <line x1="1.5" y1="12" x2="14.5" y2="12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="9" cy="12" r="1.7" fill="currentColor" />
  </svg>
);

type Tab = {
  id: 'assistant' | 'home' | 'settings';
  label: string;
  href: string;
  icon: ReactNode;
};

export function TabBar() {
  const pathname = usePathname();
  // Route-driven context: when the user is inside a feedable mini-app, the
  // ASSISTANT tab (a) links to `/app/assistant?scope=<slug>` and (b) shows
  // the orbiting-dot animation. Recomputed on every path change — cheap.
  const miniAppCtx = getMiniAppContext(pathname ?? '');
  const hasContext = miniAppCtx !== null;
  const assistantHref = assistantUrlForContext(miniAppCtx);

  const tabs: readonly Tab[] = [
    {
      id: 'assistant',
      label: 'ASSISTANT',
      href: assistantHref,
      icon: <AssistantIcon hasContext={hasContext} />,
    },
    { id: 'home', label: 'HOME', href: '/app', icon: <HomeIcon /> },
    { id: 'settings', label: 'SETTINGS', href: '/app/settings', icon: <SettingsIcon /> },
  ] as const;

  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding:
            'var(--space-2) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {tabs.map((tab) => {
            // Active-state check is unchanged — we compare against the
            // *canonical* nav route (`/app/assistant`), not the query-carrying
            // href we render, so entering the assistant from a scoped context
            // still lights the tab.
            const canonicalHref =
              tab.id === 'assistant' ? '/app/assistant' : tab.href;
            const active =
              canonicalHref === '/app'
                ? pathname === '/app'
                : (pathname ?? '').startsWith(canonicalHref);
            return (
              <Link
                key={tab.id}
                href={tab.href as Route}
                aria-current={active ? 'page' : undefined}
                aria-label={
                  tab.id === 'assistant' && hasContext
                    ? `Assistant — has context from ${miniAppCtx.label}`
                    : undefined
                }
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: 'var(--space-2) 0',
                  textDecoration: 'none',
                  color: active
                    ? 'var(--color-text-display)'
                    : 'var(--color-text-disabled)',
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-label)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                {/* Icon inherits `currentColor` from the parent Link so the
                    active/idle state doesn't need extra wiring. */}
                <span aria-hidden="true" style={{ display: 'inline-flex', lineHeight: 0 }}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
