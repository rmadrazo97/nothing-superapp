/**
 * Generic mini-app resource endpoints (single-row: get + update + delete).
 *
 *   GET    /api/mini-apps/<slug>/resources/<resource>/<id>
 *   PATCH  /api/mini-apps/<slug>/resources/<resource>/<id>
 *   DELETE /api/mini-apps/<slug>/resources/<resource>/<id>
 *
 * See sibling route.ts (list + create) for the auth/entitlement/rate-limit
 * story — this file follows the same discipline.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { limitPerKey } from '@/lib/rate-limit';
import { getResource } from '@/lib/mini-apps/resources-registry';
import { deleteRow, getRow, updateRow } from '@/lib/mini-app-framework/crud';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOUR_MS = 60 * 60 * 1000;
const READ_LIMIT_PER_HOUR = 300;
const WRITE_LIMIT_PER_HOUR = 30;

type Params = { params: Promise<{ slug: string; resource: string; id: string }> };

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

export async function GET(_request: Request, { params }: Params) {
  const { slug, resource: name, id } = await params;
  const resource = getResource(slug, name);
  if (!resource) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const gate = await commonGate('read');
  if ('error' in gate) return gate.error;

  const result = await getRow(resource, gate.supabase, gate.user.id, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status },
    );
  }
  return NextResponse.json({ row: result.data.row });
}

export async function PATCH(request: Request, { params }: Params) {
  const { slug, resource: name, id } = await params;
  const resource = getResource(slug, name);
  if (!resource) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const gate = await commonGate('write');
  if ('error' in gate) return gate.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const result = await updateRow(resource, gate.supabase, gate.user.id, id, raw);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status },
    );
  }
  return NextResponse.json({ row: result.data.row });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { slug, resource: name, id } = await params;
  const resource = getResource(slug, name);
  if (!resource) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const gate = await commonGate('write');
  if ('error' in gate) return gate.error;

  const result = await deleteRow(resource, gate.supabase, gate.user.id, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status },
    );
  }
  return NextResponse.json({ id: result.data.id });
}
