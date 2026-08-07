/**
 * `/app` — the launcher. Server Component: reads the installed mini-app
 * registry from the filesystem at request-time (dev) / process-start
 * (prod), and hands the metadata to the client HomeGrid. Rendering runs on
 * the server for a fast first paint and no client-side layout shift as
 * tiles hydrate.
 */
import { loadInstalledMiniApps } from '@/lib/mini-apps/registry';
import { HomeGrid } from '@/components/home/HomeGrid';

// Dynamic because loadInstalledMiniApps() uses node:fs — safer to opt out
// of any accidental static rendering than to debug a stale build snapshot.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const miniApps = await loadInstalledMiniApps();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <header>
        <h1 className="display-md">Apps</h1>
        <p
          className="caption"
          style={{ marginTop: 'var(--space-2)' }}
        >
          {miniApps.length === 0
            ? 'No mini-apps installed yet.'
            : `${miniApps.length} installed`}
        </p>
      </header>
      <HomeGrid miniApps={miniApps} />
    </div>
  );
}
