/**
 * Calorie Lite — resource declarations for the Mini-App Resource Framework.
 *
 * Every resource here becomes:
 *   - REST at /api/mini-apps/calorie-lite/resources/<name>
 *   - Copilot tools: calorie_lite_<name>_list, _create, _update, _delete
 *   - Client hook: useResource('calorie-lite', '<name>')
 *
 * The framework REST paths coexist with the hand-written REST at
 * /api/mini-apps/calorie-lite/<name> — old routes remain the source of
 * truth for the mini-app UI until a later wave migrates them.
 *
 * Insert-shape hardening: the framework strips `id`, `user_id`, `created_at`,
 * `updated_at`, and `entered_at` before insert (see mini-app-framework/crud).
 * Client-provided values for those columns are silently dropped, so we can
 * safely re-use the existing insert schemas from `@nothing/shared`.
 */
import {
  calorieEntryInsertSchema,
  calorieEntrySchema,
  customFoodInsertSchema,
  customFoodSchema,
  customMealInsertSchema,
  customMealSchema,
  foodFavoriteInsertSchema,
  foodFavoriteSchema,
  foodSchema,
  // waterEntry* imports retired in v0.5.3 (#96) — WATER tab removed.
  // Table + schema kept in @nothing/shared for any external migration/backfill.
  weightEntryInsertSchema,
  weightEntrySchema,
  type MiniAppResourceModule,
} from '@nothing/shared';


const module: MiniAppResourceModule = {
  slug: 'calorie-lite',
  resources: [
    {
      name: 'entries',
      table: 'app_calorie_entries',
      rowSchema: calorieEntrySchema,
      insertSchema: calorieEntryInsertSchema,
      updateSchema: calorieEntryInsertSchema.partial(),
      orderBy: { column: 'entered_at', ascending: false },
      filterableColumns: ['meal', 'food_id', 'custom_food_id'],
      ops: { list: true, get: true, create: true, update: true, delete: true },
      agent: {
        describe:
          'Individual food/meal entries the user has logged. One row per food consumed. Kcal + macros stored as snapshot at log-time.',
        describeOps: {
          create:
            'Log a food entry. Prefer setting `food_id` (from foods_list) or `custom_food_id` — only set name/kcal/macros directly for truly ad-hoc entries the user described in words.',
          delete:
            'Remove a logged entry. Confirm with the user before calling — this is irreversible.',
        },
        emitEvent: 'calorie_entry_added',
      },
    },
    // v0.5.3 (#96): water resource unregistered — WATER tab removed from
    // Fitness Pal, and the framework CRUD tools it generated
    // (calorie_lite_water_*) were unused. The `water_entries` DB table stays
    // (get_daily_summary + past history reads still work); if a future mini-app
    // wants water tracking, re-add a resource entry here or scaffold a new
    // mini-app.
    {
      name: 'weight-entries',
      table: 'weight_entries',
      rowSchema: weightEntrySchema,
      insertSchema: weightEntryInsertSchema,
      orderBy: { column: 'entered_at', ascending: false },
      ops: { list: true, get: true, create: true, delete: true },
      agent: {
        describe:
          'Body-weight measurements over time, stored in kg. One row per weigh-in.',
        describeOps: {
          create:
            'Log a body-weight reading. Value is in KILOGRAMS — convert from lb before calling (kg = lb / 2.20462).',
        },
        emitEvent: 'calorie_entry_added',
      },
    },
    {
      name: 'custom-foods',
      table: 'custom_foods',
      rowSchema: customFoodSchema,
      insertSchema: customFoodInsertSchema,
      updateSchema: customFoodInsertSchema.partial(),
      orderBy: { column: 'created_at', ascending: false },
      ops: { list: true, get: true, create: true, update: true, delete: true },
      agent: {
        describe:
          "User's private custom food catalog — foods they log frequently that aren't in the public catalog. Same nutrition shape as public foods.",
        describeOps: {
          create:
            "Create a custom food the user can then log via entries. Serving is per-100g by default (serving_label='100 g', serving_g=100).",
        },
      },
    },
    {
      name: 'custom-meals',
      table: 'custom_meals',
      rowSchema: customMealSchema,
      insertSchema: customMealInsertSchema,
      updateSchema: customMealInsertSchema.partial(),
      orderBy: { column: 'created_at', ascending: false },
      ops: { list: true, get: true, create: true, update: true, delete: true },
      agent: {
        describe:
          "Named combinations of foods the user eats together (e.g. 'Morning smoothie'). Kcal + macros aggregate the components at save-time.",
      },
    },
    {
      name: 'favorites',
      table: 'food_favorites',
      rowSchema: foodFavoriteSchema,
      insertSchema: foodFavoriteInsertSchema,
      orderBy: { column: 'created_at', ascending: false },
      ops: { list: true, get: true, create: true, delete: true },
      agent: {
        describe:
          "Foods the user has starred for quick access. Exactly one of `food_id` (public catalog) or `custom_food_id` (their own custom food) must be set.",
      },
    },
    {
      name: 'foods',
      table: 'foods',
      // Public catalog — read-only. Anyone authed can list/get.
      rowSchema: foodSchema,
      // Never used because create/update/delete are disabled — framework 405s
      // before touching this schema. Reuse rowSchema as a no-op placeholder.
      insertSchema: foodSchema,
      userIdColumn: undefined as unknown as string,
      orderBy: { column: 'name', ascending: true },
      filterableColumns: ['category', 'brand'],
      ops: { list: true, get: true, create: false, update: false, delete: false },
      agent: {
        describe:
          'Public food catalog (~150 seeded common foods). Read-only. Filter by category or brand; use for lookup before logging an entry.',
        listCap: 100,
      },
    },
  ],
};

export default module;
