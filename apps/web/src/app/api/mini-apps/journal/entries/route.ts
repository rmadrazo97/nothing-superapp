/**
 * GET  /api/mini-apps/journal/entries?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N
 *   — list caller's entries newest first. Defaults: last 90 days, limit 100.
 * POST /api/mini-apps/journal/entries
 *   — create a new entry. If `entered_on` is omitted, server uses today's
 *     local date. Body 1..20000 chars. Optional mood.
 *
 * user_id is server-set from the session. RLS on `journal_entries` enforces
 * owner access; the explicit `.eq('user_id', ...)` is defence-in-depth.
 */
import { NextResponse } from 'next/server';
import { journalEntryInsertSchema } from '@nothing/shared';
import { requireEntitledUser, jsonError } from '../_lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT = 'id, user_id, entered_on, mood, body, created_at, updated_at';

function todayLocalISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(request: Request) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limitRaw = url.searchParams.get('limit');

  const isDate = (s: string | null) => s != null && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 90);
  const fromDate = isDate(from) ? from! : defaultFrom.toISOString().slice(0, 10);
  const toDate = isDate(to) ? to! : todayLocalISODate();

  // Sanity-clamp the limit — 500 rows is well beyond any UI need but keeps
  // a rogue caller from asking for the whole table.
  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : NaN;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 500)
      : 100;

  const { data, error } = await gated.supabase
    .from('journal_entries')
    .select(SELECT)
    .eq('user_id', gated.user.id)
    .gte('entered_on', fromDate)
    .lte('entered_on', toDate)
    .order('entered_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(request: Request) {
  const gated = await requireEntitledUser();
  if (!gated.ok) return gated.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('invalid_json', 400);
  }

  const parsed = journalEntryInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const entered_on = parsed.data.entered_on ?? todayLocalISODate();
  const insert = {
    user_id: gated.user.id,
    entered_on,
    body: parsed.data.body,
    mood: parsed.data.mood ?? null,
  };

  const { data, error } = await gated.supabase
    .from('journal_entries')
    .insert(insert)
    .select(SELECT)
    .single();

  if (error) return jsonError('db_error', 500);
  return NextResponse.json({ entry: data });
}
