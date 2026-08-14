# native-feel audit — 2026-08-14

**Repo:** `/Users/amadrazo/Desktop/dev/nothing-superapp/apps/web`
**Recipes evaluated:** 30
**FOUND (to fix):** 17
**NOT PRESENT (skip):** 6
**ALREADY FIXED (skip):** 3
**UNKNOWN (manual):** 4

## Results

| # | Category | Title | Status | Evidence |
| --- | --- | --- | --- | --- |
| 01 | A | Viewport meta + viewport-fit=cover | ALREADY FIXED | 1 occurrence(s) — sample: src/components/shell/Shell.tsx:17:          // of the viewport when `viewport-fit=cover`. Add the safe-area inset |
| 02 | A | theme-color per color scheme | FOUND | no evidence of the fix pattern in codebase |
| 03 | A | apple-touch-icon | FOUND | no evidence of the fix pattern in codebase |
| 04 | A | apple-mobile-web-app-* | FOUND | no evidence of the fix pattern in codebase |
| 05 | A | PWA manifest + linked | FOUND | 2/2 checks missing evidence |
| 06 | A | Manifest display: standalone | NOT PRESENT | no public/manifest.json |
| 07 | A | Manifest maskable icon | NOT PRESENT | no public/manifest.json |
| 08 | B | Kill tap flash (webkit-tap-highlight-color) | FOUND | no evidence of the fix pattern in codebase |
| 09 | B | Gate :hover in @media (hover: hover) | FOUND | 8 :hover rules, no @media gate:<br/>src/app/globals.css:12:.tile:hover {<br/>src/app/globals.css:24:.tile-locked:hover {<br/>src/app/globals.css:101:.nsa-msg-bubble:hover .nsa-copy-btn,<br/>src/app/globals.css:172:.nsa-msg-bubble:hover ~ .nsa-msg-actions,<br/>src/app/globals.css:173:.nsa-msg-actions:hover, |
| 10 | B | touch-action: manipulation on interactives | FOUND | no evidence of the fix pattern in codebase |
| 11 | B | user-select: none on buttons | FOUND | no evidence of the fix pattern in codebase |
| 12 | C | 100vh → 100dvh / 100svh | FOUND | 6 anti-pattern hit(s):<br/>src/app/dev/pixel-ui/page.tsx:31:        minHeight: '100vh',<br/>src/app/loading.tsx:10:        minHeight: '100vh',<br/>src/app/legal/layout.tsx:8:        minHeight: '100vh',<br/>src/app/not-found.tsx:10:        minHeight: '100vh',<br/>src/components/copilot/CopilotChat.tsx:349:          : `calc(100vh - var(--space-6) - ${TAB_BAR_CLEARANCE}px)`, |
| 13 | C | safe-area-inset-* on fixed edges | ALREADY FIXED | 16 occurrence(s) — sample: src/app/page.tsx:42:          'calc(var(--space-8) + env(safe-area-inset-top)) calc(var(--space-4) + env(safe-area-inset-right)) calc(var(--space-8) + env(safe-area-inset-bottom)) calc(var(--space-4) + env(safe-area-inset-left))', |
| 14 | C | Bottom sheet respects home-indicator inset | UNKNOWN | Grep for modal/sheet components + verify each uses safe-area-inset-bottom. |
| 15 | D | Inputs ≥ 16px font-size | UNKNOWN | Grep inputs + inspect font-size declarations. Automated only surfaces the raw file list. |
| 16 | D | visualViewport focus-scroll for keyboard | FOUND | no evidence of the fix pattern in codebase |
| 17 | D | -webkit-text-size-adjust: 100% | FOUND | no evidence of the fix pattern in codebase |
| 18 | D | Correct input type + inputmode | UNKNOWN | Enumerate <input> elements and audit each type / inputmode / autocomplete. |
| 19 | D | autocorrect off on usernames / codes | FOUND | no evidence of the fix pattern in codebase |
| 20 | E | overscroll-behavior scoped | FOUND | no evidence of the fix pattern in codebase |
| 21 | E | touch-action: pan-x on carousels | FOUND | no evidence of the fix pattern in codebase |
| 22 | E | Body scroll lock on modal open | FOUND | no evidence of the fix pattern in codebase |
| 23 | E | Remove deprecated -webkit-overflow-scrolling | NOT PRESENT | anti-pattern absent |
| 24 | F | Video autoplay: muted + playsinline | NOT PRESENT | no video elements |
| 25 | F | Images with width/height or aspect-ratio | UNKNOWN | Every <img> should have width+height attrs or aspect-ratio wrapper. Manual audit. |
| 26 | G | iOS splash screens (apple-touch-startup-image) | FOUND | no evidence of the fix pattern in codebase |
| 27 | G | Service worker + /offline fallback | ALREADY FIXED | all checks passed (1 + 1) |
| 28 | G | format-detection: telephone=no | FOUND | no evidence of the fix pattern in codebase |
| 29 | G | Manifest start_url + scope + id | NOT PRESENT | no public/manifest.json |
| 30 | G | Manifest shortcuts / share_target | NOT PRESENT | no public/manifest.json |

## Next step

Load `references/audit-recipes.txt` for the DETECT → FIX → VERIFY block of each FOUND recipe, then execute Phase 4.