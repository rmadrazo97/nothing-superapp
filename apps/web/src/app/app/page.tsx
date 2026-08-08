/**
 * `/app` — the launcher. Server Component: reads the installed mini-app
 * registry from the filesystem at request-time (dev) / process-start
 * (prod), and hands the metadata to the client HomeGrid. Rendering runs on
 * the server for a fast first paint and no client-side layout shift as
 * tiles hydrate.
 */
import { loadInstalledMiniApps } from '@/lib/mini-apps/registry';
import { HomeGrid } from '@/components/home/HomeGrid';
import { FirstRunHint } from '@/components/home/FirstRunHint';
import { createClient } from '@/lib/supabase/server';

// Dynamic because loadInstalledMiniApps() uses node:fs — safer to opt out
// of any accidental static rendering than to debug a stale build snapshot.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [miniApps, supabase] = await Promise.all([
    loadInstalledMiniApps(),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Session is guaranteed by the Proxy (see middleware.ts); user is
  // non-null in the happy path. Fall back gracefully anyway so a stale
  // client cookie doesn't 500 the page.
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null };
  const displayName = (profile as { display_name?: string | null } | null)?.display_name;
  const emailUser = user?.email?.split('@')[0];
  const salute = displayName || emailUser || 'friend';

  const hour = new Date().getHours();
  const timeOfDay = hour < 5 ? 'evening' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <p
          className="label"
          style={{ margin: 0 }}
        >
          Good {timeOfDay}
        </p>
        <h1 className="display-md" style={{ margin: 0 }}>
          {salute}
        </h1>
        <p
          className="caption"
          style={{ margin: 0, marginTop: 'var(--space-2)' }}
        >
          {miniApps.length === 0
            ? 'No mini-apps installed yet.'
            : `${miniApps.length} apps · one subscription`}
        </p>
      </header>
      <HomeGrid miniApps={miniApps} />
      <FirstRunHint />
    </div>
  );
}
