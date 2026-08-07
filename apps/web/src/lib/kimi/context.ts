/**
 * Assembles the read-only cross-mini-app context that the AI copilot sees.
 *
 * The copilot's superpower is that it can look across ANY mini-app the user
 * has used and synthesise answers. In v1 only `calorie-lite` exists, so the
 * surface is intentionally small: identity + prefs + last-20 calorie entries
 * + last-20 mini-app events. This is invoked with the USER'S session client
 * (not service_role) so RLS enforces owner-scoping as a second line of
 * defence even though we also `.eq('user_id', userId)` explicitly.
 *
 * Serialization: we pick JSON over natural-language bullets because
 *   (a) Kimi K2 is strong at reading structured JSON,
 *   (b) it keeps date fields unambiguous (ISO strings),
 *   (c) the shape maps 1:1 to the Zod schemas in @nothing/shared so it stays
 *       in sync automatically when the schema evolves.
 *
 * Hard cap: 6000 chars. Profiles + preferences are always kept whole (small,
 * high-signal). Events + calorie_entries get truncated newest-first if the
 * combined payload exceeds the cap.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Profile,
  Preferences,
  Event,
  CalorieEntry,
} from '@nothing/shared';

const MAX_CONTEXT_CHARS = 6000;
const MAX_ROWS_PER_TABLE = 20;

export type AssembledContext = {
  context: string;
  tokens: number;
  truncated: boolean;
};

export async function assembleUserContext(
  userId: string,
  supabase: SupabaseClient,
): Promise<AssembledContext> {
  // Fire all four reads in parallel — they're independent.
  const [profileRes, prefsRes, entriesRes, eventsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('app_calorie_entries')
      .select('*')
      .eq('user_id', userId)
      .order('entered_at', { ascending: false })
      .limit(MAX_ROWS_PER_TABLE),
    supabase
      .from('events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS_PER_TABLE),
  ]);

  const profile = (profileRes.data ?? null) as Profile | null;
  const preferences = (prefsRes.data ?? null) as Preferences | null;
  let calorieEntries = (entriesRes.data ?? []) as CalorieEntry[];
  let events = (eventsRes.data ?? []) as Event[];

  let truncated = false;

  // Serialize with full lists first. If we blow the cap, drop the oldest
  // rows from entries and events (never from profile/preferences).
  let payload = buildPayload(profile, preferences, calorieEntries, events);
  while (
    payload.length > MAX_CONTEXT_CHARS &&
    (calorieEntries.length > 1 || events.length > 1)
  ) {
    truncated = true;
    // Drop the oldest row from whichever list is currently longer, so we
    // shrink evenly instead of nuking one dimension entirely.
    if (calorieEntries.length >= events.length && calorieEntries.length > 1) {
      calorieEntries = calorieEntries.slice(0, -1);
    } else if (events.length > 1) {
      events = events.slice(0, -1);
    } else {
      break;
    }
    payload = buildPayload(profile, preferences, calorieEntries, events);
  }

  return {
    context: payload,
    // Cheap heuristic; real tokenization is done server-side by Moonshot.
    tokens: Math.ceil(payload.length / 4),
    truncated,
  };
}

function buildPayload(
  profile: Profile | null,
  preferences: Preferences | null,
  calorieEntries: CalorieEntry[],
  events: Event[],
): string {
  const doc = {
    profile,
    preferences,
    recent_calorie_entries: calorieEntries,
    recent_events: events,
  };
  return JSON.stringify(doc, null, 2);
}
