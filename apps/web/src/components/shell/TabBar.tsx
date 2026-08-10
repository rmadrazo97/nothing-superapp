'use client';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Nav SVG icons — minimalist stroke/fill, `currentColor` so the active/idle
// text colour drives them without a JS re-render. 16×16 viewBox. Kept inline
// (no icon library) so the initial nav bar bundle stays a handful of bytes.
// NOTE: these are chrome (nav), NOT product (tiles) — tiles use emoji. Do
// not unify the two systems.
const AssistantIcon = () => (
  // 4-point spark/star — thin diamond with a slim vertical + horizontal bar.
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 1.5 L9.2 6.8 L14.5 8 L9.2 9.2 L8 14.5 L6.8 9.2 L1.5 8 L6.8 6.8 Z"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
      fill="none"
    />
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

const TABS: readonly Tab[] = [
  { id: 'assistant', label: 'ASSISTANT', href: '/app/assistant', icon: <AssistantIcon /> },
  { id: 'home',      label: 'HOME',      href: '/app',           icon: <HomeIcon /> },
  { id: 'settings',  label: 'SETTINGS',  href: '/app/settings',  icon: <SettingsIcon /> },
] as const;

export function TabBar() {
  const pathname = usePathname();
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
          {TABS.map((tab) => {
            const active =
              tab.href === '/app'
                ? pathname === '/app'
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.id}
                href={tab.href as Route}
                aria-current={active ? 'page' : undefined}
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
