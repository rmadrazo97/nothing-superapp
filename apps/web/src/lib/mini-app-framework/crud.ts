/**
 * Framework CRUD — the actual Supabase reads/writes that back BOTH the generic
 * REST routes AND the copilot resource-tools. Factoring here so REST and tools
 * behave identically (same validation, same server-owned column stripping,
 * same event emission on success).
 *
 * Every function returns a structured result — `{ ok, status?, ... }` — so
 * both the route handler and the tool factory can translate cleanly (route
 * translates to NextResponse status; tool translates to a JSON payload for
 * the LLM).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { MiniAppResource, ResourceOp } from '@nothing/shared';
import { resolveOps } from '@nothing/shared';

/**
 * Columns the client is NEVER allowed to set. The framework strips them from
 * every insert/update payload — a rogue client can't spoof ownership or
 * fake timestamps. `user_id` is set separately from the session.
 */
const RESERVED_COLUMNS = new Set([
  'id',
  'user_id',
  'created_at',
  'updated_at',
  'entered_at',
  'started_at',
  'ended_at',
]);

export interface CrudOk<T> {
  ok: true;
  data: T;
}
export interface CrudErr {
  ok: false;
  status: number; // HTTP-shaped
  error: string;
  details?: unknown;
}
export type CrudResult<T> = CrudOk<T> | CrudErr;

const listParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(['asc', 'desc']).optional(),
  filter: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type ListParams = z.infer<typeof listParamsSchema>;

function assertOp(resource: MiniAppResource, op: ResourceOp): CrudErr | null {
  const ops = resolveOps(resource.ops);
  if (!ops[op]) {
    return { ok: false, status: 405, error: `op_disabled:${op}` };
  }
  return null;
}

function stripReserved<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!RESERVED_COLUMNS.has(k)) out[k] = v;
  }
  return out as Partial<T>;
}

function selectSpec(resource: MiniAppResource): string {
  return resource.select ?? '*';
}

function readTable(resource: MiniAppResource): string {
  return resource.readVia ?? resource.table;
}

function userCol(resource: MiniAppResource): string | null {
  // `undefined` in the type => scope disabled (public reference table like `foods`).
  return resource.userIdColumn === undefined ? null : (resource.userIdColumn ?? 'user_id');
}

/**
 * LIST — paginated, optionally filtered by resource.filterableColumns.
 */
export async function listRows(
  resource: MiniAppResource,
  supabase: SupabaseClient,
  userId: string,
  rawParams: Record<string, unknown>,
): Promise<CrudResult<{ rows: unknown[] }>> {
  const opErr = assertOp(resource, 'list');
  if (opErr) return opErr;

  const parsed = listParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'invalid_query', details: parsed.error.flatten() };
  }
  const { limit, offset, order, filter } = parsed.data;
  const cap = resource.agent?.listCap ?? 500;
  const effectiveLimit = Math.min(limit, cap);

  let q = supabase.from(readTable(resource)).select(selectSpec(resource));
  const uc = userCol(resource);
  if (uc) q = q.eq(uc, userId);

  // Row filtering — only whitelisted columns pass through.
  if (filter) {
    const whitelist = new Set(resource.filterableColumns ?? []);
    for (const [col, val] of Object.entries(filter)) {
      if (whitelist.has(col)) q = q.eq(col, val);
    }
  }

  if (resource.orderBy) {
    const ascending = order ? order === 'asc' : (resource.orderBy.ascending ?? false);
    q = q.order(resource.orderBy.column, { ascending });
  }

  q = q.range(offset, offset + effectiveLimit - 1);

  const { data, error } = await q;
  if (error) {
    return { ok: false, status: 500, error: 'db_error', details: error.message };
  }
  return { ok: true, data: { rows: data ?? [] } };
}

/**
 * GET — single row by id.
 */
export async function getRow(
  resource: MiniAppResource,
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<CrudResult<{ row: unknown }>> {
  const opErr = assertOp(resource, 'get');
  if (opErr) return opErr;

  let q = supabase.from(readTable(resource)).select(selectSpec(resource)).eq('id', id);
  const uc = userCol(resource);
  if (uc) q = q.eq(uc, userId);

  const { data, error } = await q.maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: 'db_error', details: error.message };
  }
  if (!data) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, data: { row: data } };
}

/**
 * CREATE — Zod-validate against `insertSchema`, strip reserved columns,
 * force `user_id`, run `beforeWrite` hook, insert, return the new row.
 */
export async function createRow(
  resource: MiniAppResource,
  supabase: SupabaseClient,
  userId: string,
  raw: unknown,
): Promise<CrudResult<{ row: unknown }>> {
  const opErr = assertOp(resource, 'create');
  if (opErr) return opErr;

  const parsed = resource.insertSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'invalid_body', details: parsed.error.flatten() };
  }

  let payload = stripReserved(parsed.data as Record<string, unknown>);
  if (resource.beforeWrite) {
    try {
      payload = (await resource.beforeWrite(payload, {
        supabase,
        userId,
        op: 'create',
      })) as Partial<Record<string, unknown>>;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'before_write_failed';
      return { ok: false, status: 400, error: 'before_write_failed', details: message };
    }
  }

  const insert: Record<string, unknown> = { ...payload };
  const uc = userCol(resource);
  if (uc) insert[uc] = userId;

  const { data, error } = await supabase
    .from(resource.table)
    .insert(insert)
    .select(selectSpec(resource))
    .single();

  if (error || !data) {
    return { ok: false, status: 500, error: 'db_error', details: error?.message };
  }
  return { ok: true, data: { row: data } };
}

/**
 * UPDATE — Zod-validate against `updateSchema` (or insertSchema.partial() if
 * omitted), strip reserved columns, run `beforeWrite`, update by id +
 * user_id, return the updated row.
 */
export async function updateRow(
  resource: MiniAppResource,
  supabase: SupabaseClient,
  userId: string,
  id: string,
  raw: unknown,
): Promise<CrudResult<{ row: unknown }>> {
  const opErr = assertOp(resource, 'update');
  if (opErr) return opErr;

  const schema = resource.updateSchema;
  if (!schema) {
    return { ok: false, status: 405, error: 'op_disabled:update' };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'invalid_body', details: parsed.error.flatten() };
  }

  let payload = stripReserved(parsed.data as Record<string, unknown>);
  if (resource.beforeWrite) {
    try {
      payload = (await resource.beforeWrite(payload, {
        supabase,
        userId,
        op: 'update',
      })) as Partial<Record<string, unknown>>;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'before_write_failed';
      return { ok: false, status: 400, error: 'before_write_failed', details: message };
    }
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, status: 400, error: 'empty_update' };
  }

  let q = supabase.from(resource.table).update(payload).eq('id', id);
  const uc = userCol(resource);
  if (uc) q = q.eq(uc, userId);

  const { data, error } = await q.select(selectSpec(resource)).maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: 'db_error', details: error.message };
  }
  if (!data) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, data: { row: data } };
}

/**
 * DELETE — owner-scoped delete by id.
 */
export async function deleteRow(
  resource: MiniAppResource,
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<CrudResult<{ id: string }>> {
  const opErr = assertOp(resource, 'delete');
  if (opErr) return opErr;

  let q = supabase.from(resource.table).delete().eq('id', id);
  const uc = userCol(resource);
  if (uc) q = q.eq(uc, userId);

  const { error } = await q;
  if (error) {
    return { ok: false, status: 500, error: 'db_error', details: error.message };
  }
  return { ok: true, data: { id } };
}
