#!/usr/bin/env node
/**
 * validate-reference-meal-plan.mjs — parse the reference meal plan through the
 * shared Zod schema and assert per-meal targets sum to the daily targets.
 *
 * This is the make-or-break gate for the meal-plans schema: the nutritionist's
 * shape is canonical, so if this script fails the schema is wrong (not the
 * fixture). Run it after every change to packages/shared/src/schemas/meal-plan.ts.
 *
 * Usage:  node scripts/validate-reference-meal-plan.mjs
 * Exit:   0 on success, 1 on any schema or assertion failure.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mealPlanSchema } from '../packages/shared/src/schemas/meal-plan.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  HERE,
  '..',
  'apps',
  'mini-apps',
  'calorie-lite',
  'fixtures',
  'diet-jam-v1.json',
);

const EXPECTED = {
  protein_g: 109, // 35 + 40 + 34
  carbs_g: 308,   // 95 + 115 + 98
  fat_g: 47,      // 15 + 17 + 15
  calories_kcal: 2100, // 650 + 775 + 675
};

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK:   ${msg}`);
}

async function main() {
  const raw = JSON.parse(await readFile(FIXTURE, 'utf-8'));
  const parsed = mealPlanSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Schema parse failed:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    fail(`mealPlanSchema.parse rejected the reference fixture (${parsed.error.issues.length} issues)`);
  }
  ok(`mealPlanSchema.parse accepted the reference fixture`);

  const plan = parsed.data.plan;
  const meals = plan.meals;
  const sums = meals.reduce(
    (acc, m) => ({
      protein_g: acc.protein_g + m.targets.protein_g,
      carbs_g: acc.carbs_g + m.targets.carbs_g,
      fat_g: acc.fat_g + m.targets.fat_g,
      calories_kcal: acc.calories_kcal + m.targets.calories_kcal,
    }),
    { protein_g: 0, carbs_g: 0, fat_g: 0, calories_kcal: 0 },
  );

  for (const key of Object.keys(EXPECTED)) {
    if (sums[key] !== EXPECTED[key]) {
      fail(`per-meal ${key} sum = ${sums[key]}, expected ${EXPECTED[key]}`);
    }
    ok(`per-meal ${key} sum = ${sums[key]} matches expected ${EXPECTED[key]}`);
  }

  const daily = plan.daily_targets;
  for (const key of Object.keys(EXPECTED)) {
    if (daily[key] !== EXPECTED[key]) {
      fail(`plan.daily_targets.${key} = ${daily[key]}, expected ${EXPECTED[key]}`);
    }
    ok(`plan.daily_targets.${key} = ${daily[key]} matches expected ${EXPECTED[key]}`);
  }

  const optionCount = meals.reduce((n, m) => n + m.options.length, 0);
  const ingredientCount = meals.reduce(
    (n, m) => n + m.options.reduce((k, o) => k + o.ingredients.length, 0),
    0,
  );
  const freeCount = meals.reduce(
    (n, m) =>
      n +
      m.options.reduce(
        (k, o) => k + o.ingredients.filter((i) => i.free === true).length,
        0,
      ),
    0,
  );
  ok(`meals: ${meals.length}, options: ${optionCount}, ingredients: ${ingredientCount}, free: ${freeCount}`);

  console.log('\nreference plan valid');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
