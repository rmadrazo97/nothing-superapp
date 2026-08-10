# Canonical Nothing Superapp smoke flows

Each flow is a fixed tap/type sequence you can run to verify a mini-app is healthy. Use them:

- After landing a UI change to catch regressions elsewhere.
- Before bumping `APP_VERSION` (the release-broadcast GH Action will Web-Push every opt-in device once you do).
- To reproduce user-reported bugs — replay the same sequence, compare frames.

`scripts/smoke-nsa.sh` runs a subset headlessly with a screenshot per step to `/tmp/nsa-smoke-<epoch>/`.

## 0. Auth (once per session)

Signed-in state is persisted in Safari cookies inside the sim, so you only do this the first time (or after a manual sign-out).

1. `xcrun simctl openurl booted "https://nothing-superapp.vercel.app/login"`
2. Type your test email into the input, tap SEND MAGIC LINK.
3. Grab the link from the inbox on your Mac. `xcrun simctl openurl booted "<link>"`.
4. Screenshot to confirm you landed on `/app`.

## 1. Launcher grid (30s)

1. `xcrun simctl openurl booted "https://nothing-superapp.vercel.app/app"`
2. `scripts/snap.sh` — confirm 2 tiles per row on iPhone width (should be `repeat(2, minmax(0, 1fr))`, not collapsed to 1 col).
3. Verify: "GOOD MORNING/EVENING <name>" heading in Doto, subtitle "N apps · one subscription", each tile is a square with icon + label.

## 2. Calorie Lite — Add Meal via SEARCH (2 min)

1. Tap the Calorie Lite tile — roughly `(0.25, 0.35)` on a 2-col grid.
2. On the TODAY view, tap `+ ADD MEAL` at the bottom.
3. The default subview is SEARCH. Confirm meal-slot pills (BREAKFAST · LUNCH · DINNER · SNACKS) are above the search input.
4. Type into the search: `npx serve-sim type "chicken"` — 250 ms debounced fetch should populate results from the 7,946 USDA food row corpus.
5. Tap any result row. A quantity picker appears with a live macro preview.
6. Tap `+ ADD`. Screenshot — the entry should now be on TODAY with a group card if it was logged from a plan, or a single row otherwise.
7. **Edit test**: tap the entry row to expand; tap ✎ EDIT; change kcal; tap Save. Screenshot — value updated.
8. **Delete test**: tap the entry row; tap × Delete; wait for cadmium × CONFIRM?; tap again. Screenshot — row gone.

## 3. Calorie Lite — Log meal from active plan (1 min)

Requires an active meal plan (Diet Jam v1 is pre-seeded on the founder account).

1. Open the PLAN tab. Screenshot — confirm the three meals (DESAYUNO · COMIDA · CENA) render with per-meal targets + option chips.
2. Tap OPCIÓN 4 on Comida. Tap `+ LOG THIS MEAL AS OPCIÓN 4`.
3. Switch to TODAY tab. Screenshot — the lunch should now appear as ONE group card labeled "Comida · Opción 4", collapsed by default (≥3 rows). Tap the chevron to expand — confirm individual ingredient rows.
4. Tap `× Delete group` header; two-tap confirm. Screenshot — group + all rows gone.

## 4. Assistant chat (1 min)

1. `xcrun simctl openurl booted "https://nothing-superapp.vercel.app/app/assistant"`
2. Screenshot — empty state shows 2×2 prompt cards + composer at bottom with `◐` (image), `◉` (mic), `→` (send) icons.
3. Tap a prompt card (e.g. "Log what I ate today"). Confirm text populates in the composer.
4. Tap → to send. Screenshot mid-stream — verify blinking `▊` cursor on the assistant bubble; user bubble right-aligned cadmium outline.
5. Tap the `☰` in the top-left. Screenshot — thread drawer slides in from the left, `+ NEW CHAT` chip visible, current thread has a cadmium left border.

## 5. Assistant multimodal (1 min)

Requires an image on disk on the Mac.

1. In the assistant composer, tap `◐` (image). System file picker appears — annoyingly this is a native iOS picker inside the sim and you can't easily drive it via tap coords. Alternative: drag the file onto the serve-sim preview window (browser side), which forwards the drop to the sim as a photo library import.
2. Or inject via camera: `npx serve-sim camera com.apple.mobilesafari --file ~/Pictures/plate.jpg` — Safari's `getUserMedia` returns your image.
3. Type a prompt like "estimate the macros" and send. Screenshot — assistant should return a `ToolCallCard` for `extract_macros_from_text` or vision-based estimation.

## 6. Reminders — create + trigger (2 min)

1. `xcrun simctl openurl booted "https://nothing-superapp.vercel.app/app/reminders"`
2. Screenshot — UPCOMING / ALL / HISTORY tab bar; empty state should show `+ NEW REMINDER` CTA plus `◐ TEMPLATES` disclosure.
3. Tap `+ NEW REMINDER`. In the form:
   - Title: "Test agent loop"
   - Kind: tap `◐ AGENT LOOP`
   - Schedule: `Once` at 1 minute in the future (or use `▶ Run now` on the row after saving).
   - Prompt: "Say 'smoke test OK' and nothing else."
4. Save. Screenshot — new reminder appears in UPCOMING.
5. Tap `▶ Run now` on the row. Wait ~15s. Screenshot — should get a push notification banner (if opted in) + a new HISTORY row with `agent_summary` visible.

## 7. Gym Routine — start a v2 session (2 min)

Assumes JAM v1 is pre-seeded.

1. `xcrun simctl openurl booted "https://nothing-superapp.vercel.app/app/gym-routine/routines"`
2. Screenshot — routine list; tap "JAM v1 (smoke test)".
3. Screenshot — verify v2 rendering: PlanDayCard per day, top-set/back-off blocks with rep ranges + RIR, superset on Day 5, cardio card at the bottom.
4. Tap `Start Day 1`. Screenshot — session view; first exercise's blocks should be pre-filled.
5. Tap through set-complete on the first block; confirm rest timer starts. Screenshot after 5s.

## 8. Pomodoro cycle (30s)

1. `xcrun simctl openurl booted "https://nothing-superapp.vercel.app/app/pomodoro"`
2. Screenshot — verify Doto 25:00 timer, START button, cycle indicator.
3. Tap START. Screenshot after 3s — confirm countdown ticks.
4. Tap SKIP. Screenshot — should log an aborted session (audit) and reset to 25:00.

## 9. Settings + ABOUT card (30s)

1. Tap SETTINGS on the bottom nav.
2. Scroll to bottom. Screenshot — ABOUT card should show `NOTHING SUPERAPP · v0.5.0` (or current) + `RELEASED <date>`.
3. Tap `▶ CHANGELOG (N releases)`. Screenshot — disclosure expands with per-version bullet list, newest first.

## What "healthy" looks like — quick sanity checklist

- No hex codes visible in DevTools computed styles (all colors are tokens).
- No horizontal scrollbars on any view at iPhone width.
- Safe-area padding respected (nothing under the Dynamic Island, nothing under the home indicator).
- Pinch-zoom does nothing (viewport meta locks it).
- Assistant streaming cursor blinks (not a static `▊`).
- Tab bar sticks to bottom with safe-area padding.
