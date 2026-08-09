/**
 * Mini-App Resource Framework — declarative data-layer for mini-apps.
 *
 * The pitch: every mini-app declares its resources ONCE in a `resources.ts`
 * file next to its `manifest.ts`. In exchange, the framework generates:
 *
 *   1. REST endpoints — `GET/POST /api/mini-apps/<slug>/resources/<name>`
 *      and `GET/PATCH/DELETE /api/mini-apps/<slug>/resources/<name>/[id]`.
 *      Auth-gated (401), entitlement-gated (402), rate-limited, Zod-validated.
 *   2. Copilot tools — `resourceTools(userId, supabase)` returns a map of
 *      Vercel AI SDK `Tool`s named `<slug>_<resource>_<op>` with the
 *      declared Zod schema as input.
 *   3. Client hook — `useResource(slug, name)` in `@nothing/mini-apps-runtime`
 *      fetches list, exposes `{ data, isLoading, create, update, remove }`.
 *
 * Coexistence: existing hand-written REST routes at
 * `/api/mini-apps/<slug>/<name>` are UNTOUCHED. The generic routes bind at
 * a distinct prefix (`resources/`) so nothing breaks. A later wave collapses
 * the hand-written ones onto the framework one by one.
 *
 * Server-owned columns (`id`, `user_id`, `created_at`, `updated_at`) are
 * always stripped from client payloads before insert/update — a rogue client
 * cannot spoof ownership. `user_id` is FORCED to `session.user.id` on every
 * write, matching the pattern of every hand-written route.
 */
import type { ZodTypeAny } from 'zod';

/**
 * Loose type for the Supabase client. Kept as `unknown` here so `@nothing/shared`
 * doesn't need to depend on `@supabase/supabase-js` (which would bloat every
 * consumer). The route handlers + tool factory that actually invoke this cast
 * to the real `SupabaseClient` type from their own scope.
 */
export type FrameworkSupabaseClient = unknown;

export type ResourceOp = 'list' | 'get' | 'create' | 'update' | 'delete';

export interface MiniAppResourceOps {
  list?: boolean;
  get?: boolean;
  create?: boolean;
  update?: boolean;
  delete?: boolean;
}

export interface MiniAppResourceAgentConfig {
  /** One-liner the LLM sees for this resource. Hand-written product prose. */
  describe: string;
  /**
   * Per-op description override. Used when a specific op needs guidance the
   * generic `describe` line doesn't cover (e.g. "confirm before delete").
   */
  describeOps?: Partial<Record<ResourceOp, string>>;
  /**
   * Event name emitted to the client event bus + optionally to a server
   * broadcast channel on successful write. Matches the string the mini-app
   * UI already subscribes to (e.g. `calorie_entry_added`).
   */
  emitEvent?: string;
  /** Whether the resource is exposed to the agent at all. Default true. */
  exposed?: boolean;
  /** Cap on rows returned via `list`. Default 50. */
  listCap?: number;
}

export interface MiniAppResource<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Row = unknown,
  Insert = unknown,
  Update = unknown,
> {
  /** URL path segment. Kebab-case, plural. e.g. `entries`, `custom-foods`. */
  name: string;
  /** Actual Postgres table (may differ from name). */
  table: string;
  /**
   * Optional view/table for READS. If set, list + get fetch from `readVia`
   * while create/update/delete still write to `table`. Useful when reads
   * should join other columns.
   */
  readVia?: string;
  /** Zod schema for a full row (post-read). */
  rowSchema: ZodTypeAny;
  /** Zod schema for the create payload. `user_id`/`id` MUST NOT be required. */
  insertSchema: ZodTypeAny;
  /**
   * Zod schema for the update payload. Omit to disable updates entirely
   * (regardless of `ops.update`).
   */
  updateSchema?: ZodTypeAny;
  /** Column that carries the user id. Default `user_id`. */
  userIdColumn?: string;
  /** Comma-separated select spec. Default `*`. */
  select?: string;
  /** Default sort for list. */
  orderBy?: { column: string; ascending?: boolean };
  /**
   * Columns whitelisted for `?filter[column]=value`. Anything not listed here
   * is silently dropped — the LLM can't scan tables it wasn't given.
   */
  filterableColumns?: string[];
  /**
   * Enabled operations. Defaults:
   *   { list: true, get: true, create: true, update: false, delete: false }
   */
  ops?: MiniAppResourceOps;
  /** Optional agent-tool exposure config. Omit to keep the resource REST-only. */
  agent?: MiniAppResourceAgentConfig;
  /**
   * Hook that runs AFTER Zod-validate but BEFORE the DB insert/update. Return
   * the (possibly-modified) payload, or throw to abort. Use it for derived
   * columns, snapshot-lookups, or additional entitlement checks the schema
   * can't express.
   */
  beforeWrite?: (
    row: Insert | Update,
    ctx: { supabase: FrameworkSupabaseClient; userId: string; op: 'create' | 'update' },
  ) => Promise<Insert | Update>;
}

/**
 * A mini-app's declared resources. Every mini-app that participates in the
 * framework exports one of these as `default` from `resources.ts`.
 */
export interface MiniAppResourceModule {
  /** Must match the mini-app's `manifest.slug` for symmetry. */
  slug: string;
  resources: MiniAppResource[];
}

/** Op defaults — resources opt IN to writes, opt OUT of reads. */
export const DEFAULT_OPS: Required<MiniAppResourceOps> = {
  list: true,
  get: true,
  create: true,
  update: false,
  delete: false,
};

/** Merge caller-supplied ops with defaults. */
export function resolveOps(ops: MiniAppResourceOps | undefined): Required<MiniAppResourceOps> {
  return { ...DEFAULT_OPS, ...(ops ?? {}) };
}
