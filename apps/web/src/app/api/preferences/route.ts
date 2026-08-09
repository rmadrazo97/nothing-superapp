/**
 * GET   /api/preferences — read the caller's `preferences` row.
 * PATCH /api/preferences — upsert `preferences` for the caller.
 *
 * Auth-gated via the user's Supabase session cookie. RLS on `preferences`
 * enforces owner-only access. `user_id` is server-set from the session and
 * NEVER trusted from the client.
 *
 * Table shape (per packages/shared/src/schemas/index.ts):
 *   user_id (uuid, PK), notifications_enabled (bool), theme ('dark'|'light'),
 *   daily_calorie_goal (int|null), updated_at (timestamptz)
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  activityLevelEnum,
  goalDirectionEnum,
  macroGoalPctSchema,
  pushTopicEnum,
  sexEnum,
} from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Wave C (MFP-tier) additions to the PATCH allow-list:
//   macro_goal_pct — jsonb {protein, carbs, fat} summing to 100
//   water_goal_ml   — positive int, default 2500
//   weight_goal_kg  — nullable numeric (kg)
//   weight_unit     — 'kg' | 'lb' (display preference only, storage stays kg)
//   volume_unit     — 'ml' | 'oz' (display preference only, storage stays ml)
// Wave 2-A (onboarding wizard) additions — all nullable:
//   sex, age_years, height_cm, activity_level, goal_direction, onboarded_at
// Rules — only ADD new fields; GET + upsert structure are untouched.
const preferencesPatchSchema = z
  .object({
    notifications_enabled: z.boolean().optional(),
    theme: z.enum(['dark', 'light']).optional(),
    daily_calorie_goal: z.number().int().positive().max(20000).nullable().optional(),
    macro_goal_pct: macroGoalPctSchema.optional(),
    water_goal_ml: z.number().int().positive().max(10000).optional(),
    weight_goal_kg: z.number().positive().max(500).nullable().optional(),
    weight_unit: z.enum(['kg', 'lb']).optional(),
    volume_unit: z.enum(['ml', 'oz']).optional(),
    sex: sexEnum.nullable().optional(),
    age_years: z.number().int().positive().max(129).nullable().optional(),
    height_cm: z.number().positive().min(50).max(260).nullable().optional(),
    activity_level: activityLevelEnum.nullable().optional(),
    goal_direction: goalDirectionEnum.nullable().optional(),
    onboarded_at: z.string().datetime({ offset: true }).nullable().optional(),
    // v0.3.2 Web Push — device-level opt-in + per-topic allow-list. Kept
    // additive so pre-migration deployments never see undefined columns.
    push_enabled: z.boolean().optional(),
    push_topics: z.array(pushTopicEnum).max(16).optional(),
    // v0.5 meal plans — the PLAN tab writes this via /meal-plans/[id]/activate;
    // included in the direct PATCH allow-list so settings + copilot can clear
    // it too. Null = no active plan.
    active_meal_plan_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('preferences')
    .select(
      'user_id, notifications_enabled, theme, daily_calorie_goal, macro_goal_pct, water_goal_ml, weight_goal_kg, weight_unit, volume_unit, sex, age_years, height_cm, activity_level, goal_direction, onboarded_at, push_enabled, push_topics, active_meal_plan_id, updated_at',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ preferences: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = preferencesPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
  }

  // Upsert on user_id so first-time save creates the row; subsequent saves
  // patch it. Server always owns `user_id`.
  const { data, error } = await supabase
    .from('preferences')
    .upsert(
      { user_id: user.id, ...parsed.data },
      { onConflict: 'user_id' },
    )
    .select(
      'user_id, notifications_enabled, theme, daily_calorie_goal, macro_goal_pct, water_goal_ml, weight_goal_kg, weight_unit, volume_unit, sex, age_years, height_cm, activity_level, goal_direction, onboarded_at, push_enabled, push_topics, active_meal_plan_id, updated_at',
    )
    .single();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ preferences: data });
}
