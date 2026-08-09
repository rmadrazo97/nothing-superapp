/**
 * Framework-generated copilot tools.
 *
 * `resourceTools(userId, supabase)` walks every mini-app's `resources.ts` and
 * produces named `Tool`s the copilot can call:
 *
 *   calorie_lite_entries_list       calorie_lite_entries_create
 *   calorie_lite_entries_update     calorie_lite_entries_delete
 *   calorie_lite_water_create       …
 *   pomodoro_sessions_list          pomodoro_sessions_create
 *
 * These COEXIST with the hand-written tools in `apps/web/src/lib/ai/tools/*.ts`.
 * When the parallel copilot worker wires up its route it can merge:
 *
 *   const tools = { ...handWrittenTools, ...resourceTools(userId, supabase) };
 *
 * A follow-up wave collapses the hand-written ones onto the framework and
 * removes the duplicates.
 *
 * Every tool audits into `copilot_tool_calls` and (for writes) shares the
 * same write-budget gate the hand-written tools use, so a runaway agent
 * loop can't leak damage through the framework tools any faster than through
 * the hand-written ones.
 */
import { tool, type Tool } from 'ai';
import { z, type ZodTypeAny } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MiniAppResource, ResourceOp } from '@nothing/shared';
import { resolveOps } from '@nothing/shared';

import { getAllResourceModules } from '@/lib/mini-apps/resources-registry';
import {
  createRow,
  deleteRow,
  getRow,
  listRows,
  updateRow,
  type CrudResult,
} from '@/lib/mini-app-framework/crud';
import { insertToolAudit } from '@/lib/ai/tools/_audit';
import { assertEntitled, assertWriteBudget } from '@/lib/ai/tools/_gate';

// Kebab-case in the resource path/slug, snake_case in the tool name so the
// LLM sees consistent underscore-separated identifiers.
const kebabToSnake = (s: string) => s.replaceAll('-', '_');

/** Small param schema for list tools — LLMs get sane defaults. */
const listInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20).optional(),
  offset: z.number().int().min(0).default(0).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  filter: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const getInputSchema = z.object({
  id: z.string().min(1).describe('Row id to fetch.'),
});

const deleteInputSchema = z.object({
  id: z.string().min(1).describe('Row id to delete.'),
});

interface ToolCtx {
  userId: string;
  supabase: SupabaseClient;
  slug: string;
  resource: MiniAppResource;
  op: ResourceOp;
  toolName: string;
}

/** Uniform envelope the LLM receives — matches the shape existing tools use. */
type ToolOk = { ok: true; summary: string; data: unknown };
type ToolErr = { ok: false; error: string };

async function audit(
  ctx: ToolCtx,
  input: unknown,
  result: CrudResult<unknown> | ToolErr,
): Promise<void> {
  if ('ok' in result && result.ok === true) {
    await insertToolAudit({
      supabase: ctx.supabase,
      userId: ctx.userId,
      toolName: ctx.toolName,
      input,
      output: result,
      status: 'ok',
    });
    return;
  }
  const err = result as { ok: false; status?: number; error: string };
  const status =
    err.status === 401 ? 'unauthorized'
    : err.status === 402 ? 'payment_required'
    : err.status === 429 ? 'rate_limited'
    : 'error';
  await insertToolAudit({
    supabase: ctx.supabase,
    userId: ctx.userId,
    toolName: ctx.toolName,
    input,
    status,
    errorMessage: err.error,
  });
}

function describeFor(resource: MiniAppResource, op: ResourceOp): string {
  const ops = resource.agent?.describeOps ?? {};
  const per = ops[op];
  if (per) return per;
  const base = resource.agent?.describe ?? `${resource.name} (${op}).`;
  const opNoun: Record<ResourceOp, string> = {
    list: 'List rows',
    get: 'Fetch a single row by id',
    create: 'Create a new row',
    update: 'Update an existing row by id',
    delete: 'Delete a row by id (destructive — confirm with the user first)',
  };
  return `${opNoun[op]}. ${base}`;
}

function buildListTool(ctx: ToolCtx): Tool {
  return tool({
    description: describeFor(ctx.resource, 'list'),
    inputSchema: listInputSchema,
    async execute(input): Promise<ToolOk | ToolErr> {
      const raw = (input ?? {}) as Record<string, unknown>;
      const cap = ctx.resource.agent?.listCap ?? 50;
      const effectiveLimit = Math.min(Number(raw.limit ?? 20), cap);
      const params = { ...raw, limit: effectiveLimit };
      const result = await listRows(ctx.resource, ctx.supabase, ctx.userId, params);
      await audit(ctx, input, result);
      if (!result.ok) return { ok: false, error: result.error };
      const rows = (result.data.rows ?? []) as unknown[];
      return {
        ok: true,
        summary: `Returned ${rows.length} ${ctx.resource.name} row${rows.length === 1 ? '' : 's'} for ${ctx.slug}.`,
        data: { rows },
      };
    },
  });
}

function buildGetTool(ctx: ToolCtx): Tool {
  return tool({
    description: describeFor(ctx.resource, 'get'),
    inputSchema: getInputSchema,
    async execute(input): Promise<ToolOk | ToolErr> {
      const result = await getRow(ctx.resource, ctx.supabase, ctx.userId, input.id);
      await audit(ctx, input, result);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        summary: `Fetched ${ctx.resource.name}/${input.id}.`,
        data: result.data.row,
      };
    },
  });
}

function buildCreateTool(ctx: ToolCtx, insertSchema: ZodTypeAny): Tool {
  return tool({
    description: describeFor(ctx.resource, 'create'),
    inputSchema: insertSchema,
    async execute(input): Promise<ToolOk | ToolErr> {
      // Same write gates the hand-written tools use — no bypass via the framework.
      const budget = assertWriteBudget(ctx.userId);
      if (!budget.ok) {
        await audit(ctx, input, { ok: false, error: budget.error });
        return { ok: false, error: budget.error };
      }
      const gate = await assertEntitled(ctx.userId, ctx.supabase);
      if (!gate.ok) {
        await audit(ctx, input, { ok: false, error: gate.error });
        return { ok: false, error: gate.error };
      }
      const result = await createRow(ctx.resource, ctx.supabase, ctx.userId, input);
      await audit(ctx, input, result);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        summary: `Created ${ctx.slug}/${ctx.resource.name}.`,
        data: result.data.row,
      };
    },
  });
}

function buildUpdateTool(ctx: ToolCtx, updateSchema: ZodTypeAny): Tool {
  // The update schema doesn't include `id` — wrap it with the id field so the
  // LLM knows to supply it.
  const wrapped = z
    .object({
      id: z.string().min(1).describe('Row id to update.'),
      patch: updateSchema.describe('Partial fields to update.'),
    })
    .strict();
  return tool({
    description: describeFor(ctx.resource, 'update'),
    inputSchema: wrapped,
    async execute(input): Promise<ToolOk | ToolErr> {
      const budget = assertWriteBudget(ctx.userId);
      if (!budget.ok) {
        await audit(ctx, input, { ok: false, error: budget.error });
        return { ok: false, error: budget.error };
      }
      const gate = await assertEntitled(ctx.userId, ctx.supabase);
      if (!gate.ok) {
        await audit(ctx, input, { ok: false, error: gate.error });
        return { ok: false, error: gate.error };
      }
      const result = await updateRow(
        ctx.resource,
        ctx.supabase,
        ctx.userId,
        input.id,
        input.patch,
      );
      await audit(ctx, input, result);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        summary: `Updated ${ctx.slug}/${ctx.resource.name}/${input.id}.`,
        data: result.data.row,
      };
    },
  });
}

function buildDeleteTool(ctx: ToolCtx): Tool {
  return tool({
    description: describeFor(ctx.resource, 'delete'),
    inputSchema: deleteInputSchema,
    async execute(input): Promise<ToolOk | ToolErr> {
      const budget = assertWriteBudget(ctx.userId);
      if (!budget.ok) {
        await audit(ctx, input, { ok: false, error: budget.error });
        return { ok: false, error: budget.error };
      }
      const gate = await assertEntitled(ctx.userId, ctx.supabase);
      if (!gate.ok) {
        await audit(ctx, input, { ok: false, error: gate.error });
        return { ok: false, error: gate.error };
      }
      const result = await deleteRow(ctx.resource, ctx.supabase, ctx.userId, input.id);
      await audit(ctx, input, result);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        summary: `Deleted ${ctx.slug}/${ctx.resource.name}/${input.id}.`,
        data: result.data.id,
      };
    },
  });
}

/**
 * Build every framework-declared tool. Callers merge this into their
 * hand-written tools map before passing to `streamText`.
 */
export function resourceTools(
  userId: string,
  supabase: SupabaseClient,
): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const module of getAllResourceModules()) {
    const slugPart = kebabToSnake(module.slug);
    for (const resource of module.resources) {
      if (resource.agent?.exposed === false) continue;
      const namePart = kebabToSnake(resource.name);
      const base = `${slugPart}_${namePart}`;
      const ops = resolveOps(resource.ops);

      const mkCtx = (op: ResourceOp): ToolCtx => ({
        userId,
        supabase,
        slug: module.slug,
        resource,
        op,
        toolName: `${base}_${op}`,
      });

      if (ops.list) out[`${base}_list`] = buildListTool(mkCtx('list'));
      if (ops.get) out[`${base}_get`] = buildGetTool(mkCtx('get'));
      if (ops.create) out[`${base}_create`] = buildCreateTool(mkCtx('create'), resource.insertSchema);
      if (ops.update && resource.updateSchema) {
        out[`${base}_update`] = buildUpdateTool(mkCtx('update'), resource.updateSchema);
      }
      if (ops.delete) out[`${base}_delete`] = buildDeleteTool(mkCtx('delete'));
    }
  }
  return out;
}

/** Debug helper — returns the list of tool names the factory would build. */
export function listResourceToolNames(): string[] {
  const names: string[] = [];
  for (const module of getAllResourceModules()) {
    const slugPart = kebabToSnake(module.slug);
    for (const resource of module.resources) {
      if (resource.agent?.exposed === false) continue;
      const namePart = kebabToSnake(resource.name);
      const base = `${slugPart}_${namePart}`;
      const ops = resolveOps(resource.ops);
      if (ops.list) names.push(`${base}_list`);
      if (ops.get) names.push(`${base}_get`);
      if (ops.create) names.push(`${base}_create`);
      if (ops.update && resource.updateSchema) names.push(`${base}_update`);
      if (ops.delete) names.push(`${base}_delete`);
    }
  }
  return names;
}
