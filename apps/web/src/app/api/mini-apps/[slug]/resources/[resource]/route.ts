/**
 * Generic mini-app resource endpoints (list + create).
 *
 *   GET  /api/mini-apps/<slug>/resources/<resource>       → list
 *   POST /api/mini-apps/<slug>/resources/<resource>       → create
 *
 * The `resources/` prefix keeps this route distinct from any hand-written
 * `<slug>/<name>` route (e.g. `/api/mini-apps/calorie-lite/entries`). During
 * the framework rollout wave, both paths coexist — the hand-written routes
 * remain authoritative for the mini-app UI while the framework routes back
 * the copilot tools and any new client code that opts in via `useResource`.
 *
 * Auth (401) + entitlement (402) gate every call. Rate-limits are lighter
 * than the hand-written routes because a legitimate copilot flow can burst
 * (300 reads/hr, 30 writes/hr per user) — tighter than the copilot write
 * gate (10/hr) so the LLM can't route around it via REST.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { limitPerKey } from '@/lib/rate-limit';
import { getResource } from '@/lib/mini-apps/resources-registry';
import { createRow, listRows } from '@/lib/mini-app-framework/crud';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOUR_MS = 60 * 60 * 1000;
const READ_LIMIT_PER_HOUR = 300;
const WRITE_LIMIT_PER_HOUR = 30;

type Params = { params: Promise<{ slug: string; resource: string }> };

async function commonGate(op: 'read' | 'write') {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  const { entitlement } = await getEntitlement(user.id, supabase);
  if (!isEntitled(entitlement)) {
    return {
      error: NextResponse.json(
        { error: 'payment_required', entitlement },
        { status: 402 },
      ),
    };
  }
  const limit = op === 'write' ? WRITE_LIMIT_PER_HOUR : READ_LIMIT_PER_HOUR;
  const gate = limitPerKey(`resource-${op}:${user.id}`, limit, HOUR_MS);
  if (!gate.ok) {
    return {
      error: NextResponse.json(
        { error: 'rate_limited', retryAfterSeconds: gate.retryAfterSeconds },
        { status: 429, headers: gate.headers },
      ),
    };
  }
  return { supabase, user };
}

function toParamsRecord(url: URL): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const filter: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (k.startsWith('filter[') && k.endsWith(']')) {
      filter[k.slice(7, -1)] = v;
    } else {
      out[k] = v;
    }
  }
  if (Object.keys(filter).length) out.filter = filter;
  return out;
}

export async function GET(request: Request, { params }: Params) {
  // Auth first — never leak "does this slug/resource exist?" to unauthed callers.
  const gate = await commonGate('read');
  if ('error' in gate) return gate.error;
  const { slug, resource: name } = await params;
  const resource = getResource(slug, name);
  if (!resource) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const result = await listRows(resource, gate.supabase, gate.user.id, toParamsRecord(url));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status },
    );
  }
  return NextResponse.json({ rows: result.data.rows });
}

export async function POST(request: Request, { params }: Params) {
  const gate = await commonGate('write');
  if ('error' in gate) return gate.error;
  const { slug, resource: name } = await params;
  const resource = getResource(slug, name);
  if (!resource) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const result = await createRow(resource, gate.supabase, gate.user.id, raw);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status },
    );
  }
  return NextResponse.json({ row: result.data.row }, { status: 201 });
}
