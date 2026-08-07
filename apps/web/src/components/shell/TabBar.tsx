'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { id: 'assistant', label: 'ASSISTANT', href: '/app/assistant' },
  { id: 'home',      label: 'HOME',      href: '/app' },
  { id: 'settings',  label: 'SETTINGS',  href: '/app/settings' },
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
                href={tab.href}
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
                <span
                  aria-hidden="true"
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 4,
                    background: active ? 'var(--color-accent)' : 'transparent',
                  }}
                />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
