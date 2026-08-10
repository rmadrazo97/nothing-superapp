---
name: serve-sim-nsa
description: Test Nothing Superapp — a Next.js PWA at nothing-superapp.vercel.app or localhost:3000 — inside a real iOS Simulator using EvanBacon/serve-sim. Use whenever a task needs to verify a UI change, catch a regression, reproduce a bug, or walk a user flow visually on iPhone. Triggers include "test in the simulator", "verify on iPhone", "screenshot the calorie counter", "walk the onboarding", "does the assistant look right on mobile", "why is this broken on Safari", "reproduce the bug", "smoke test the mini-apps", or anything that pairs the code you just wrote with a visual verification loop on iOS. Do NOT use for Android (no simulator on macOS), for automated Playwright/Cypress runs (this is human-in-the-loop review), or for editing simulator settings unrelated to the app (device management belongs in Simulator.app / xcrun simctl).
license: Apache-2.0
---

# serve-sim-nsa — visually verify Nothing Superapp on iOS

You are testing a specific PWA — **Nothing Superapp** — inside a booted iOS Simulator using [serve-sim](https://github.com/EvanBacon/serve-sim). serve-sim streams the sim's framebuffer to `http://localhost:3200` so both the human and the agent can see the same frames, and exposes a CLI to tap, type, gesture, rotate, and inject a camera feed.

The **repo already ships `scripts/serve-sim-up.sh`** — an idempotent one-shot boot for this project. Prefer it over calling `xcrun simctl` and `npx serve-sim` by hand.

## When to use this skill

- **After landing a UI change** — take a screenshot, confirm it renders correctly on iPhone.
- **Bug reproduction from a user screenshot** — boot the same route, replicate the tap sequence, compare frames.
- **Regression sweep before a release bump** — walk the canonical smoke flows (see `references/flows.md`).
- **Multimodal copilot work** — inject a food photo into Safari's `getUserMedia` to test the assistant's vision + macro-extraction path.
- **PWA install / standalone-mode issues** — install to home screen inside the sim and test the standalone shell (safe-area padding, dynamic island clearance, pinch-zoom lock, service worker updates).
- **Layout audits** — screenshot the launcher grid, calorie-lite tabs, assistant threads drawer, reminders list — you look at the actual pixels via the multimodal Read tool.

## When NOT to use

- **Android** — macOS has no Android simulator; use a physical device or an emulator via `adb`.
- **Automated regression tests** — write a Playwright spec instead. serve-sim is human-in-the-loop review.
- **Anything not involving the PWA** — device management, iOS updates, other apps. Use `xcrun simctl` directly.
- **Real iPhone hardware** — this is a simulator tool. For real devices use `xcrun devicectl` or Xcode.

## Prerequisites (verify once per session)

Run `scripts/check-prereqs.sh` — it exits 0 if the host is ready, non-zero with a specific fix message otherwise. In summary:

| Requirement | Why |
|---|---|
| macOS Apple Silicon (arm64) | serve-sim helper is arm64-only |
| Xcode CLI tools (`xcrun simctl`) | drives the simulator |
| Node 20+ | `npx serve-sim` runs on this |
| An installed iPhone 17 Pro (iOS 26.5) or any recent iPhone sim | if not, script offers to create one |
| macOS 14+ (for camera injection only) | AVFoundation swizzle needs it |

Don't proceed if `check-prereqs.sh` fails — surface the fix line to the user, don't paper over it.

## The whole workflow in three commands

```sh
scripts/boot-and-serve.sh                     # boots iPhone 17 Pro + Safari to prod + serve-sim
scripts/snap.sh                               # takes /tmp/nsa-<ISO>.png; then Read it (multimodal)
# ← iterate on code → git push → wait for Vercel deploy →
scripts/snap.sh                               # verify the pixel diff
```

Or point at local dev:

```sh
URL=http://localhost:3000 scripts/boot-and-serve.sh
```

That's the loop. Nine times out of ten, the rest of this skill is unnecessary — you only need the reference files for edge cases.

## The two things you'll always do

### 1. See what's on screen

You are a multimodal agent. Take a screenshot and Read it:

```sh
xcrun simctl io booted screenshot /tmp/nsa-$(date +%s).png
```

Then call `Read` on the path. You will see the actual pixels — text, colors, layout, safe-area cutouts, dynamic island clearance, pinch-zoom state, streaming cursor, drawer overlays. This is your ground truth. Prefer it over asking the user for a screenshot when the sim is already running.

### 2. Drive taps and type

Prefer `tap` (single-shot) over `gesture` (multi-shot). Coords are **normalized 0..1** with `(0,0)` top-left.

```sh
npx serve-sim tap 0.5 0.9                     # bottom-center — usually a CTA
npx serve-sim type "log 300 kcal of oatmeal"  # types into the focused field
npx serve-sim button home                     # go home (also: swipe_home, app_switcher, lock, siri, side_button)
```

Full CLI + gesture JSON shape: `references/drive.md`.

## Nothing Superapp — the routes you'll touch

The app is a subscription-gated PWA. Sign in is required for every mini-app route. The Proxy at `/app/*` bounces unentitled users to `/paywall`. Booted-sim testing usually uses the founder account (`jmadrazo7@gmail.com`) via magic-link or Google OAuth.

| Route | Feature |
|---|---|
| `/` | Marketing landing |
| `/login` | Magic link + Google OAuth |
| `/app` | Launcher — 2-tile-per-row grid of mini-apps |
| `/app/calorie-lite` | Calorie counter: TODAY / ADD / WATER / WEIGHT / REPORTS / HISTORY / PLAN |
| `/app/gym-routine` | Gym routines (v2 supports top-set/backoff/superset) |
| `/app/pomodoro` | 25/5/15 focus timer |
| `/app/reminders` | Reminders + agent loops |
| `/app/assistant` | Copilot chat with threads, streaming cursor, image+voice input |
| `/app/settings` | Profile + preferences + ABOUT card (version + changelog) |
| `/paywall` | Stripe checkout |

Canonical smoke flows and expected screenshots for each: `references/flows.md`.

## Common pitfalls

- **Fresh PWA install → old bundle** — installed PWAs cache aggressively. If a shipped change isn't visible, tell the user to fully kill the PWA from the app switcher and relaunch, OR bump `SW_VERSION` in `apps/web/public/sw.js` and redeploy.
- **`serve-sim` says "no booted device"** — run `xcrun simctl list devices booted`. If empty, `scripts/boot-and-serve.sh` picks up an iPhone 17 Pro / iOS 26.5. If neither exists, the script prompts to create one.
- **Screenshot shows Safari's "View Bookmarks" tooltip covering the app** — first-run tip. Dismiss with `npx serve-sim tap 0.94 0.7` (the ×) or ignore and take a second screenshot after a manual tap.
- **Sending a tap and nothing happens** — the coordinate may be off-screen after a `rotate`. serve-sim rotates gestures client-side but if you passed pixel coords instead of normalized, everything is wrong. All coords are `0..1`.
- **Camera injection needs the bundle id** — Safari is `com.apple.mobilesafari`. For a home-screen PWA, iOS still routes `getUserMedia` through Safari, so target Safari.
- **Vercel deploy is flaky on this project** — after landing UI code, `cd apps/web && npx vercel@latest --prod --yes --scope rmadrazo97s-projects` from repo root. Then wait ~30s before screenshotting or you'll capture the old bundle.
- **Two-tap confirm patterns (× Delete)** — a single `tap` won't fire; the button auto-disarms after 3s. Send two taps ~500ms apart.

More: `references/pitfalls.md`.

## Cleanup

serve-sim is a long-running foreground process by default. Kill it when done unless the user wants it kept alive:

```sh
npx serve-sim --kill
```

Leave the simulator running — booting is slow, killing serve-sim is cheap.

## Reference index (load on demand)

- `references/prereqs.md` — full prereq matrix + `check-prereqs.sh` walkthrough + how to create a sim if none exist.
- `references/drive.md` — CLI reference: `tap`, `type`, `gesture` JSON shape, `button` names, `rotate`, `camera` subcommand, `-q` flag for JSON output.
- `references/verify.md` — screenshot loop + Reading pixels + the AX-tree HTTP endpoint (`curl :3100/ax`) for content-driven taps instead of pixel hunting.
- `references/flows.md` — canonical Nothing Superapp smoke flows with expected screenshots per step. Onboarding wizard, add meal (SEARCH → tap food → qty → save), plan-log-meal, gym session start, pomodoro cycle, assistant multi-turn thread, reminder create.
- `references/dev-loop.md` — how to pair with the `dev-loop` skill: land code → deploy → screenshot → verify → iterate. Includes the "screenshot before + after" diff pattern.
- `references/pitfalls.md` — anti-patterns and recovery (stale PWA cache, first-run Safari tooltips, coord confusion, camera bundle-id gotchas, Vercel deploy flakiness).

Scripts (executable, do not read the source into context — just run):

- `scripts/check-prereqs.sh` — verify host.
- `scripts/boot-and-serve.sh` — one-shot boot + Safari + serve-sim (wraps repo's `scripts/serve-sim-up.sh`).
- `scripts/snap.sh` — timestamped screenshot to `/tmp/nsa-<epoch>.png`; prints the path so you can immediately `Read` it.
- `scripts/smoke-nsa.sh` — walks the canonical flows, saves one screenshot per step under `/tmp/nsa-smoke-<epoch>/`, prints an index.

## Verified against

- `serve-sim` `~0.1.28` (fields, CLI surface, gesture JSON shape all checked against EvanBacon/serve-sim README + AGENTS.md).
- Nothing Superapp `v0.5.0` (2026-08-10) — mini-app routes and canonical flows.
