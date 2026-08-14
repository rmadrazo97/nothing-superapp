---
name: native-feel
description: Turn any web or PWA into a mobile-native-feeling app in one strict pass. Framework-agnostic (React / Vue / Svelte / Angular / vanilla). Audits + fixes the 30+ common mobile-web bugs that make a site feel "off" on a phone — tap flash, sticky hover after tap, wrong-height layout (100vh vs 100dvh vs 100svh), notch-cropped content, keyboard zoom on inputs, laggy taps, pull-to-refresh hijack, gesture-surface conflicts, long-press text selection on buttons, wrong status-bar color, missing PWA manifest / apple-touch-icon / theme-color, iOS keyboard viewport bugs, and more. Every fix has DETECT (grep command) → FIX (copy-paste code) → VERIFY (behavior to test on real hardware). Refuses to hand-wave; refuses to ship without a device-test checklist. Interactive at intake (which surfaces, which framework, real-hardware access), then executes phase-by-phase. Use when: user says the app feels janky/laggy/broken on mobile, before PWA store submission, after a design refresh tested only in desktop Chrome, or as a standing polish pass before every release.
license: MIT
metadata:
  author: jmadrazo7 (Nothing Superapp Build Kit)
  version: "0.1.0"
  changes: "v0.1.0 — initial release. 30 recipes sourced from real Nothing Superapp production bugs + PWA best-practice references. Framework-agnostic; zero new dependencies; device-test checklist is a first-class deliverable."
---

# native-feel

Take any web or PWA and make it **feel native on mobile** in one strict pass. No wrong-height layouts. No gray tap flashes. No keyboard-jumping inputs. No notch-cropped content. No sticky hover after tap. No gesture bugs.

Framework-agnostic. Zero new dependencies. Every fix comes with a grep to detect it, a code snippet to apply it, and a behavior to verify on real hardware.

## When to use

- User says: "the app feels laggy on my phone", "why does this look weird on mobile", "make this feel native", "polish this for mobile", "PWA feels janky", "buttons flash gray when I tap", "my app looks fine in Chrome but broken on iOS".
- App already ships to real users and reports "feels off" on mobile.
- Before submitting a PWA to app stores (Play Store TWA, iOS Add-to-Home-Screen).
- After a design refresh that was tested only in desktop Chrome.
- As a **standing polish pass before every release** — run once per version bump; costs 10 minutes; catches regressions.

**When NOT to use:**
- Native-native apps (Swift, Kotlin, Jetpack Compose, SwiftUI) — this skill only knows web platform primitives. For a Capacitor / Expo wrapper: yes, use this — the shell is a WebView.
- Layout is fundamentally broken on desktop too. Fix layout first, then polish.
- The app has no mobile users and never will. This is polish, it costs time.
- You want a full accessibility audit. Native-feel touches a11y at the edges (16px input font-size, tap targets), but for a proper WCAG pass use a dedicated accessibility skill.

## What you produce

Every invocation writes to `docs/native-feel/<YYYY-MM-DD>/`:

```
docs/native-feel/<date>/
├── audit.md         ← Phase 2 — every recipe: FOUND / NOT PRESENT / ALREADY FIXED / UNKNOWN + file:line refs
├── changes.md       ← Phase 6 — every fix applied, grouped by category, with file:line + before/after
├── verify.md        ← Phase 5 — device-test checklist the human runs on real hardware
└── residual.md      ← Phase 6 — issues that need manual attention (rare, but honest)
```

Plus committed edits to the codebase. Every commit is scoped: `native-feel: kill tap flash + sticky hover`, `native-feel: safe-area + viewport-fit`, etc.

## The 7 non-negotiable rules

1. **Every fix has DETECT → FIX → VERIFY.** Detection is a shell command (grep, find, curl, cat). Fix is copy-paste-safe code. Verify is a specific observable behavior on real hardware. No "should be fine now" hand-waving. See `references/audit-recipes.txt`.
2. **Framework-agnostic.** Never write "the React way" or "the Svelte way". CSS + HTML + minimal vanilla JS only. If the app uses a framework, place fixes in that framework's canonical globals file — grep for `globals.css` / `app.css` / `main.css` / `styles.css` / `index.css` / `_layout.tsx` / `App.vue` / `+layout.svelte` first.
3. **No new dependencies.** No `npm install`, no `pnpm add`, no CDN scripts unless the user explicitly asks. Every fix is native web platform (HTML meta, CSS, standards-track JS APIs).
4. **Detect before fix.** Don't blast every recipe at every codebase. Grep first; skip the ones that don't apply. Report what was skipped and why. A codebase that already sets `-webkit-tap-highlight-color: transparent` in globals doesn't need it re-applied.
5. **Merge, never overwrite.** If the app already has a `<meta name="viewport">`, MERGE the missing bits (`viewport-fit=cover`). If it already has a global CSS file, APPEND the mobile-safe defaults inside a `/* native-feel: mobile baseline */` sentinel block. Never nuke existing content.
6. **Test-on-hardware IS the deliverable.** Chrome DevTools mobile emulator ≠ real iOS Safari. `verify.md` is a first-class artifact — the human must run it and mark pass/fail before the pass is considered done.
7. **Accessibility never regresses.** If a "fix" would break a11y (e.g., `user-scalable=no` to stop input zoom, `user-select: none` on paragraphs to stop selection on buttons), REJECT that fix and use the a11y-safe alternative (16px font-size, scoped `user-select: none`). Non-negotiable.

## The 6 phases

### Phase 1 — Intake (30 seconds, interactive)

Ask ONE batch of questions. Do not proceed until all are answered:

> 1. **Which surfaces are we polishing?** — plain web / PWA / PWA + Capacitor iOS + Capacitor Android / PWA + Expo shells / other.
> 2. **What framework?** — Next.js / Nuxt / SvelteKit / Astro / Remix / Angular / vanilla HTML / other. If unsure: run `cat package.json | grep -E '"(next|nuxt|@sveltejs|astro|@remix-run|@angular)"'`.
> 3. **Where is the global CSS?** — path to the file that ships to every page. If unsure: `find . -type f \( -name "globals.css" -o -name "global.css" -o -name "app.css" -o -name "styles.css" -o -name "main.css" -o -name "index.css" \) -not -path "*/node_modules/*"`.
> 4. **Where is the root HTML head (or its component equivalent)?** — `app/layout.tsx`, `src/app.html`, `index.html`, `_document.tsx`, etc. This is where meta tags go.
> 5. **Is there a PWA manifest?** — path (typically `public/manifest.json` or `public/site.webmanifest`). If none: we'll add one in Phase 3.
> 6. **Any user complaints to prioritize?** — free-form. E.g., "buttons flash gray", "keyboard covers input", "top bar cut off on iPhone 15".
> 7. **Real-hardware access?** — iOS device / Android device / both / neither. If neither: pass will complete but the `verify.md` checklist ships un-run and the polish is not truly signed off — flag that clearly at the end.

Then read `references/audit-recipes.txt` (the 30 recipes) and `references/verification-checklist.txt` (the device tests) into working memory.

### Phase 2 — Audit (5-10 minutes, ZERO edits yet)

Run every DETECT command from `references/audit-recipes.txt`. Categorize each recipe:

- **FOUND** — issue detected in codebase, will fix in Phase 3/4.
- **NOT PRESENT** — grep returns empty; the anti-pattern isn't there; skip.
- **ALREADY FIXED** — the correct pattern is already in place; skip.
- **UNKNOWN** — needs human eyeballs (e.g., "does this carousel scroll horizontally?"); flag in `residual.md`.

Write `docs/native-feel/<date>/audit.md` with a table:

```
| # | Recipe | Status | Evidence | Notes |
|---|---|---|---|---|
| 01 | Kill tap flash | FOUND | src/app/globals.css:none | No -webkit-tap-highlight-color rule anywhere |
| 02 | dvh/svh viewport | ALREADY FIXED | src/app/layout.tsx:12 uses 100dvh | Confirmed |
| 03 | 16px input font | FOUND | src/components/Input.tsx:34 has font-size: 14px | 12 inputs affected |
| … | … | … | … | … |
```

No edits yet. This is the observation pass.

### Phase 3 — Foundation baselines (single commit)

Apply the three foundation files. Each has a MERGE strategy — never overwrite:

- **HTML head baseline** — `references/head-baseline.html.txt`. Adds/merges: viewport (with `viewport-fit=cover`), theme-color (light + dark), apple-touch-icon, apple-mobile-web-app-*, format-detection.
- **Global CSS baseline** — `references/global-css-baseline.css.txt`. Wrap the block in `/* native-feel: mobile baseline — do not remove sentinel */ … /* /native-feel */` so future runs can idempotently update it.
- **PWA manifest baseline** — `references/manifest-baseline.json.txt`. If no manifest exists, create one. If one exists, merge missing fields (never overwrite the user's `name`, `short_name`, `icons`).

Commit as ONE commit:
```
native-feel: baseline foundation (meta / global CSS / manifest)
```

### Phase 4 — Recipe-by-recipe fixes

For each **FOUND** row from Phase 2, apply the corresponding fix from `references/audit-recipes.txt`. Each fix is a surgical one-file edit (or minimal cross-file for meta+CSS pairings).

Group into commits by category so the diff is reviewable:

- `native-feel: kill tap flash + sticky hover`
- `native-feel: safe-area + viewport-fit`
- `native-feel: input zoom + touch-action`
- `native-feel: gesture surfaces (carousels, sheets, modals)`
- `native-feel: keyboard + visualViewport handling`
- `native-feel: theme-color per color scheme`
- `native-feel: text-selection + long-press on interactive surfaces`
- `native-feel: momentum scroll + overscroll containment`
- `native-feel: PWA icons + splash + apple-mobile-web-app`

Skip a category entirely if no recipe under it was FOUND.

For each edit: append a row to `docs/native-feel/<date>/changes.md`:
```
| Recipe | File | Line | Before | After | Commit |
```

### Phase 5 — Generate the verification checklist

Copy `references/verification-checklist.txt` to `docs/native-feel/<date>/verify.md`, then prune it to the recipes that were FOUND-and-fixed (skip the ones that were NOT PRESENT — no point verifying).

Print to the user:

> Foundation + N recipes applied. **Verify on device now:**
> - iOS: `docs/native-feel/<date>/verify.md` § iOS
> - Android: `docs/native-feel/<date>/verify.md` § Android
>
> Mark each check ✅ or ❌. Ping me with ❌s and I'll do a targeted second pass.

If the user answered "no real hardware" in Phase 1: still write the file, but add a bold warning at the top: `⚠️ NOT VERIFIED — no device access declared. Emulator ≠ real hardware. Consider borrowing a device before ship.`

### Phase 6 — Deliver

Write the final summary at `docs/native-feel/<date>/changes.md` (already populated during Phase 4, now add the header):

```
# native-feel pass — <date>

**Framework:** <detected>
**Surfaces:** <declared>
**Recipes evaluated:** 30
**FOUND + fixed:** N
**NOT PRESENT:** M
**ALREADY FIXED:** K
**UNKNOWN → residual.md:** L

## Commits landed
- <sha> native-feel: baseline foundation
- <sha> native-feel: kill tap flash + sticky hover
- <sha> …

## Recipe-by-recipe results
<the table populated in Phase 4>

## Residual
<link to residual.md if it has entries; otherwise "None — clean pass">

## Verify
Open `verify.md` on your device and walk the checklist. Mark ❌ and re-ping.
```

Print the final one-liner:

> ✅ **native-feel v0.1.0 pass complete.** N fixed, M skipped (not present), K already-fixed, L residual. Verify: `docs/native-feel/<date>/verify.md`. Once green on device, this pass is done.

## Files inside this skill

| When you need to… | Load |
|---|---|
| Get the full DETECT → FIX → VERIFY recipes for all 30 issues | `references/audit-recipes.txt` |
| Get the drop-in HTML `<head>` baseline | `references/head-baseline.html.txt` |
| Get the drop-in global CSS baseline | `references/global-css-baseline.css.txt` |
| Get the drop-in PWA manifest | `references/manifest-baseline.json.txt` |
| Get the device verification checklist source | `references/verification-checklist.txt` |
| Get the recipe list summary (one-line per) | `references/recipe-index.txt` |

## Bundled scripts

| Script | Purpose |
|---|---|
| `scripts/audit.mjs` | Runs every DETECT grep from `audit-recipes.txt` in one shot and writes `audit.md`. Zero dependencies. Node ≥ 18. |

## Voice + polish

- **Ship, don't advise.** "Applied `touch-action: manipulation` to 47 button selectors in `src/components/Button.tsx:12`" beats "consider adding touch-action to your buttons."
- **Cite file:line for every edit.** Reader jumps to the diff instantly.
- **Never assume desktop Chrome = truth.** iOS Safari and Chrome Android diverge in dozens of small ways. Call out browser-specific caveats.
- **Own the "test on real hardware" call.** If the user has no device, say so — Chrome DevTools mobile emulator does NOT catch all these bugs (safe-area, real keyboard behavior, real momentum scroll, PWA install flow, splash screens, status-bar theming).
- **No emojis in code output.** The skill's OWN prose can use ✅ / ❌ / ⚠️ for status; committed CSS / HTML / JSON stays plain.

## Failure modes to catch yourself

- **Overwriting an existing globals file** without merging → user loses styling. ALWAYS wrap additions in the `/* native-feel: mobile baseline */ … /* /native-feel */` sentinel and only add missing rules.
- **Applying `user-select: none` globally** → breaks copy-paste on article text, chat messages, code blocks. Only apply to interactive surfaces (buttons, tab bars, gesture handles). Scope with a class or attribute selector — never `body { user-select: none }`.
- **Applying `overscroll-behavior: none` on `body`** without asking → can break pull-to-refresh on pages where the user actually wants it. Default to scoping it to modal overlays and gesture surfaces. Only touch `body` if the user confirms they never want pull-to-refresh.
- **Setting `theme-color` without dark-mode variant** → looks wrong when device is in dark mode. Always emit TWO `<meta name="theme-color">` tags, one with `media="(prefers-color-scheme: light)"` and one with `dark`.
- **Fixing input zoom by disabling zoom entirely (`user-scalable=no`)** → a11y failure and iOS ignores it since iOS 10 anyway. Fix by setting the input's `font-size >= 16px` instead. If a design system insists on smaller inputs, use `font-size: 16px` on the input itself and scale down visually with `transform: scale(0.875)` + width compensation — ugly, but the ONLY safe workaround.
- **Fixing gesture conflicts with `touch-action: none`** on the wrong element → kills native scroll. Scope precisely: `touch-action: pan-y` on a horizontal carousel = "browser handles vertical scroll, page handles horizontal drag." `touch-action: none` = "page handles ALL gestures" — dangerous unless intentional.
- **Adding `-webkit-overflow-scrolling: touch`** in 2026 — deprecated since iOS 13. Momentum scroll is default now. If you see this in the audit, it's a **remove**, not an add.
- **Setting `<meta name="viewport">` without `viewport-fit=cover`** → safe-area env() values will always return `0`. `viewport-fit=cover` is the switch that turns on the notch/home-indicator inset system.
- **Baking mobile Safari–only fixes into a global CSS file** without a `@supports (-webkit-touch-callout: none)` guard → Android Chrome gets Safari's workarounds too. Some are harmless, some make things worse. Guard iOS-only stuff.
- **Forgetting the PWA `theme-color` in manifest.json** → status bar theming doesn't apply when the app is launched from home screen (only when opened in the browser). The `<meta>` tag covers browser mode; the manifest covers standalone mode. BOTH are required.
- **Icon 512×512 without `purpose: "maskable"`** → Android home-screen icon shows in a white square instead of adaptive. Ship both a `"purpose": "any"` and a `"purpose": "maskable"` icon at 512×512.

## Interoperation with other skills

- **After `stack-architect`** — new project, stack locked, before shipping first mobile-facing surface: run `native-feel` as part of the initial polish.
- **After `design-system-builder`** — design tokens locked, base components built: run `native-feel` to make the tokens survive the mobile trip.
- **Before every release** — chain into your release skill (e.g., after `dev-loop` ships a feature, before `land-and-deploy` publishes): one 5-minute `native-feel` pass catches regressions.
- **Not a replacement for**: an accessibility audit skill (WCAG), a performance skill (Lighthouse), or a security skill (Splinter). Complementary, not overlapping.
