# Mini-App Resource Framework

The framework: **every mini-app declares its data model once, and the framework generates the REST + copilot tools + client hooks for free.**

## Path convention

Framework routes bind at a distinct prefix so they coexist with hand-written
routes during the migration wave:

```
Hand-written (unchanged):   /api/mini-apps/<slug>/<name>          e.g. /api/mini-apps/calorie-lite/entries
Framework (new):            /api/mini-apps/<slug>/resources/<name> e.g. /api/mini-apps/calorie-lite/resources/entries
```

The `resources/` folder segment is deliberate — we can't use `_resources/`
because Next.js treats underscore-prefixed folders as *private* and skips them
from the router (learned the hard way — first commit shipped with underscore
and the routes silently 404'd).

## Adding a resource

1. Declare it in the mini-app's `resources.ts`:

   ```ts
   // apps/mini-apps/<slug>/resources.ts
   import { mySchema, myInsertSchema, type MiniAppResourceModule } from '@nothing/shared';

   const module: MiniAppResourceModule = {
     slug: 'my-slug',
     resources: [
       {
         name: 'thing',
         table: 'app_things',
         rowSchema: mySchema,
         insertSchema: myInsertSchema,
         updateSchema: myInsertSchema.partial(),
         orderBy: { column: 'created_at', ascending: false },
         filterableColumns: ['status'],
         ops: { list: true, get: true, create: true, update: true, delete: true },
         agent: {
           describe: 'Human-readable description the LLM sees.',
           describeOps: {
             delete: 'Confirm with the user before deleting — this is irreversible.',
           },
           emitEvent: 'my_thing_added',
         },
       },
     ],
   };
   export default module;
   ```

2. Export `./resources` from the mini-app's `package.json`:

   ```json
   { "exports": { "./resources": "./resources.ts", ... } }
   ```

3. Register in `apps/web/src/lib/mini-apps/resources-registry.ts` — one-line
   import + push onto the alphabetical `MODULES` array.

That's it. You get:

- **REST**: `GET/POST /api/mini-apps/<slug>/resources/thing` + `GET/PATCH/DELETE .../thing/[id]`
- **Copilot tools**: `my_slug_thing_list`, `my_slug_thing_create`, etc. (kebab → snake in identifiers)
- **Client hook**: `useResource<Thing>('my-slug', 'thing')` from `@nothing/mini-apps-runtime`

## Ops matrix

| op       | default   | notes                                                          |
| -------- | --------- | -------------------------------------------------------------- |
| `list`   | enabled   | Paginated. `?limit=&offset=&order=asc\|desc&filter[col]=val`   |
| `get`    | enabled   | Single row by id.                                              |
| `create` | enabled   | Zod-validate `insertSchema`. Strips reserved cols, forces user_id. |
| `update` | disabled  | Requires `updateSchema`. Set `ops.update: true` to enable.     |
| `delete` | disabled  | Owner-scoped. Set `ops.delete: true` to enable.                |

## Reserved columns

The client can NEVER set these — the framework strips them from every
insert/update payload:

```
id, user_id, created_at, updated_at, entered_at, started_at, ended_at
```

`user_id` is forced to `session.user.id` on every write. A rogue client
cannot spoof ownership.

## Row filtering

`?filter[column]=value` is passed through ONLY for columns listed in
`resource.filterableColumns`. Anything not listed is silently dropped — the
LLM can't scan tables it wasn't given.

## Agent tool naming

`<slug>_<resource>_<op>` — kebab-case in URLs, snake_case in tool identifiers:

```
calorie-lite / entries         → calorie_lite_entries_list
calorie-lite / custom-foods    → calorie_lite_custom_foods_create
pomodoro     / sessions        → pomodoro_sessions_list
```

Tools are opt-in per resource — omit the `agent` block to keep the resource
REST-only. Set `agent.exposed: false` for the same effect.

## Read-only tables (e.g. public catalogs)

For a read-only reference table that has no `user_id` column (like
`foods`), set `userIdColumn: undefined as unknown as string` and disable
all write ops. The framework won't scope reads by user_id and will 405
any write attempt before touching the schema:

```ts
{
  name: 'foods',
  table: 'foods',
  rowSchema: foodSchema,
  insertSchema: foodSchema, // never used — placeholder
  userIdColumn: undefined as unknown as string,
  ops: { list: true, get: true, create: false, update: false, delete: false },
}
```

## Rate limits

- Framework REST: **300 reads/hr**, **30 writes/hr** per user.
- Copilot write tools: additionally consume the existing
  **10 writes/hr copilot-write budget** (`_gate.ts`), so the LLM can't
  route around the tighter budget by calling framework REST.

## Coexistence with hand-written routes

Existing hand-written REST at `/api/mini-apps/<slug>/<name>` is untouched.
The framework routes back:

- The copilot's `resourceTools()` factory.
- New client code that opts in via `useResource`.

A future wave collapses the hand-written routes onto the framework one by
one. Until then, both work; the mini-app UI continues to use whatever
it was already using.

## Gotchas

- **Underscore-prefixed folders are private in Next.js.** `_resources/`
  routes silently 404. Use `resources/`.
- **Static routes take precedence over dynamic siblings.** Adding a
  concrete `calorie-lite/foo/route.ts` shadows `[slug]/resources/[resource]`
  for that specific path. This is fine and expected.
- **The `foods` resource is read-only** — public catalog, no user_id column.
  It uses `userIdColumn: undefined as unknown as string` and disabled write ops.
- **Space scale skips 5 and 7** if you ever add UI on top of this — but the
  framework is data-layer only, so this shouldn't come up.
