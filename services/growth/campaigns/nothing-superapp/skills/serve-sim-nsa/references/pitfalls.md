# Pitfalls & anti-patterns

## Coordinates

- **Never pass pixel coordinates.** All coords are `0..1` normalized. If your source is a DevTools inspector reporting pixel offsets, divide by device width/height (query `curl :3100/config` for the frame size).
- **Post-rotate: coords still work.** The helper compensates for the current orientation. Don't manually swap x/y after `rotate landscape_left`.
- **On resize / fit / theme change**, existing UI still uses the same normalized 0..1 grid.

## Tap vs gesture

- **Never `gesture` a single tap.** Each `gesture` invocation opens a new WebSocket. Two back-to-back `gesture` calls (one `begin`, one `end`) generate enough latency for the sim to interpret them as a **long-press**, not a tap. Use `tap` for anything you want treated as a discrete touch.
- Only use `gesture` when you need multiple steps threaded through the same socket: drags, swipes, pinches, multi-finger.

## Buttons

- **Only six button names are valid.** `home` · `swipe_home` · `app_switcher` · `lock` · `siri` · `side_button`. The CLI rejects anything else. Do not invent `volume_up`, `power`, `screenshot`, etc.

## PWA caching

- **Installed PWA shows stale content after deploy** — the service worker cached the old bundle. Fix: kill the PWA from the app switcher and relaunch, OR bump `SW_VERSION` in `apps/web/public/sw.js` in the deploying commit so the SW invalidates on activation.
- **Safari (not installed PWA) still shows old content** — pull-to-refresh usually doesn't force a bypass. Do a hard reload via `xcrun simctl openurl booted "$URL?bust=$(date +%s)"`.

## Vercel deploy flakiness on this project

- **Git-push auto-deploy is unreliable.** After landing UI code, run `cd apps/web && npx vercel@latest --prod --yes --scope rmadrazo97s-projects` from the **repo root** (NOT `apps/web/` — a stale `apps/web/.vercel/project.json` points to a wrong "web" project). Wait ~30–60s before screenshotting.
- **Deploy fails on cron limits** — Vercel Hobby caps cron resolution at daily. The reminders tick was moved to a GitHub Actions workflow to work around this; do not re-add a sub-daily cron entry to `vercel.json` or the deploy 400s.

## Safari first-run tooltips

- **"View Bookmarks, Share Menu, and Open Tabs"** popover covers the composer on a fresh sim. Dismiss with `npx serve-sim tap 0.94 0.7` (approximate × position) or manually tap the × on the tooltip before serious testing.

## Two-tap confirm patterns

- **Nothing Superapp uses two-tap confirm on destructive actions** (× Delete on entries, plans, routines, reminders). A single `tap` won't fire the delete; the button just enters an armed state (cadmium border) and auto-disarms after 3 s. Send two taps ~500 ms apart:
  ```sh
  npx serve-sim tap 0.9 0.42
  sleep 0.5
  npx serve-sim tap 0.9 0.42
  ```

## Onboarding wizard

- **Overlays the entire viewport on first mount.** If `preferences.onboarded_at IS NULL` for the test user, every calorie-lite route shows the wizard first. Either complete it, tap SKIP FOR NOW, or set `onboarded_at = now()` directly in the DB for a clean test state.

## Auth

- **PWA + Google OAuth in the sim** — the Google OAuth popup opens in Safari, not the PWA. After sign-in it deep-links back to Nothing Superapp. Sometimes iOS doesn't cleanly return to the PWA — end up in Safari instead. Manually tap the PWA icon on the home screen after auth completes.
- **Magic link** — safer path for automated testing. Grab the link on the Mac side (mail.google.com), `xcrun simctl openurl booted "<link>"`.

## Camera injection

- **Only works for one app at a time**, and requires the app to be relaunched with the dylib attached (`camera <bundle-id>`). Hot-swap sources (`camera switch`) do NOT relaunch. To target multiple apps, run `camera <other-bundle>` again after switching.
- **For a PWA installed to home screen**, still target Safari's bundle id (`com.apple.mobilesafari`) — iOS routes `getUserMedia` through Safari.
- **macOS 14+ only.** Older macOS: the helper won't build and camera commands 500.

## Multiple booted sims

- **`serve-sim` picks the first booted device by default.** If you have 3 sims booted, use `-d <udid>` or `-d "iPhone 17 Pro"` on every command.
- **The preview UI at :3200 shows one device at a time** — switch via the devices pane (opened with `--panes devices`).

## Cleanup

- **Camera helpers persist across sessions.** After a testing session, `npx serve-sim camera --stop-webcam`.
- **serve-sim helpers occupy ports 3200 and 3100+.** `npx serve-sim --kill` frees them.
- **Booted sims are cheap to leave running.** Don't shut them down between test cycles; the boot cost is 20–40 s per sim.
