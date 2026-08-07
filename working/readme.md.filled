# Nothing Superapp design system

Dense, dark, technical. **One subscription that replaces a dozen $4.99 utility apps deserves a single visual language** that pulls them into one product instead of a stack of tabs. Nothing Superapp takes the Nothing OS aesthetic — OLED-black grounds, a single cadmium-red signal light, dot-matrix hero numerals over a grotesque body, monospaced instrument-panel labels — and applies it to every tile: calorie counter, gym routine, habit tracker, budget, timer, notes, and sleep/water/steps.

The system is monochromatic on purpose. Color is an *event*, not a default. Red appears only where something is urgent, active, or destructive — never as decoration. Structure is ornament: exposing the grid, the data, the hierarchy itself is the whole design.

## How to use this

- Link the one stylesheet from every page — `<link rel="stylesheet" href="styles.css">` (adjust the relative path). Every color, font, spacing, radius, and elevation flows from tokens (`var(--color-*)`, `var(--font-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`). Never hard-code a hex, a font name, or a px value the tokens already carry.
- Build with the component classes below. The demo pages are plain HTML — view source and copy the markup.
- `styles.css` is the source of truth. Change the look by editing tokens at the top of `styles.css`, then keep `theme.json` in step so the record stays true.
- Harness-agnostic: works with Claude Code, Cursor, any AI coding agent, or plain hand-editing. The same folder imports into Claude Design as a custom skin.

## Direction

**The three-layer rule.** Every screen has exactly three layers. Primary — the ONE thing (a hero number, a headline, a state) — is set in **Doto** at display size (48–96 px+) and gets vast breathing room (48–96 px). Secondary — labels, values, related data — is **Space Grotesk** at body size, grouped tight (8–16 px) to the primary. Tertiary — timestamps, nav, system info — is **Space Mono** ALL CAPS at 11–12 px, pushed to edges or bottom. If two things compete, one needs to shrink, fade, or move.

**Break the pattern in exactly one place per screen** — the accent moment. A red pill button. A red status tag. A red-bordered destructive dialog action. Never more than one accent per screen; if nothing is urgent, no accent on the screen.

**Composition is asymmetric.** Large left, small right. Top-heavy. Edge-anchored. Centered layouts feel generic. Balance heavy elements with more empty space, not with more heavy elements.

## Color

Pure OLED black is the ground (`--color-bg: #000000`), because on real hardware — and every Nothing Superapp user is on real hardware — OLED black draws zero power and reads as truly infinite depth. Cards and tiles sit at `--color-surface: #111111`, one hair up from bg; elevated content (modals, popovers) uses `--color-surface-raised: #1A1A1A`. Borders are decorative at `#222222` (`--color-border`) or intentional at `#333333` (`--color-border-visible`).

Text lives on a four-tier opacity ladder:

- `--color-text-display` `#FFFFFF` — hero numbers, headlines. Use once per screen.
- `--color-text-primary` `#E8E8E8` — body copy.
- `--color-text-secondary` `#999999` — labels, captions, metadata.
- `--color-text-disabled` `#666666` — timestamps, hints, disabled controls.

The accent is `--color-accent: #D71921` — the cadmium red used across Nothing OS. It's a signal light: active states, destructive actions, urgent alerts. Never decorative. Never as a large flood except on the FAB and the one accent card per screen.

For elevation, prefer border-only cards (`.card`) — real drop shadows are opt-in via `.elev-sm/md/lg` and reserved for cards on colored grounds (the reference case is a Nothing OS tile floating on a red wallpaper).

## Type

Three families, three roles, no overlap:

- **Doto** (display) — the variable dot-matrix face, closest Google Fonts substitute for Nothing's proprietary NDot 57. Use for hero numbers, hero headings, and the one break-the-pattern moment per screen. Never below 36 px. Never for body copy.
- **Space Grotesk** (body/UI) — Colophon Foundry, shared design DNA with Nothing's actual typefaces. Body copy, headings, buttons, most UI. Weights 300 / 400 / 500 / 700.
- **Space Mono** (label/data) — Colophon Foundry monospace. All labels ALL CAPS with 0.08em tracking. All numeric readouts (calories, steps, timers, currency) with tabular numerals. This is the instrument-panel voice.

The fixed type scale (11 / 12 / 14 / 16 / 18 / 24 / 36 / 48 / 72 px) doesn't scale with density — density only moves spacing. Two font-sizes per screen (one large, one small), two weights per screen (regular + one other). Every additional size or weight costs coherence.

## Icons

**Phosphor** throughout, imported as inline SVG. Single weight. Icons inherit color via `currentColor` — set the parent's color to `var(--color-accent)` for accent icons.

## Interaction states

Themed, never browser defaults. Every interactive element gets a hover state (subtle background or color shift), keyboard focus rendered with `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`, and `::selection` in a 30% accent tint. Disabled controls drop text/border to `--color-text-disabled` and lose their hover response. No custom scrollbars.

## Components

| Class | What it is | Shown in |
| --- | --- | --- |
| `.btn` with `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-destructive`, `.btn-icon`, `.btn-block` | Actions. Primary is a filled-white pill on the dark ground (the Nothing default); destructive is a red-outlined pill. All 44 px min. | components/buttons.html |
| `.fab` | The floating action button — a 56 px red pill, one per screen | components/buttons.html |
| `.tag` with `.tag-accent`, `.tag-subtle`, `.tag-neutral`, `.tag-outline` | Small labels — Space Mono ALL CAPS | components/buttons.html |
| `.status-line` with `.status-ok`, `.status-warn`, `.status-error` | Bracketed inline status — `[SAVED]`, `[PENDING]`, `[ERROR]`. Replaces toast popups. | components/buttons.html |
| `.field` + `label`, `.input` (underline default, `.input-boxed` variant), `.radio` + `.dot`, `.seg` + `.seg-opt` | Native form controls, themed | components/forms.html |
| `.card` (default), `.card-raised`, `.card-accent`, `.card-hero`, `.elev-sm/md/lg` | The primary layout primitive — every tile on the home surface is a card | components/cards.html |
| `.nav` + `.nav-brand` | Top instrument-panel bar; active link marked with `aria-current="page"` | components/navigation.html |
| `.table` with `td.num` for right-aligned numerics | Data tables (routine history, expense log, food log). No zebra; selected row gets accent bar. | components/table.html |
| `.dialog-backdrop` + `.dialog` (with `.dialog-title`, `.dialog-body`, `.dialog-actions`) | Modals at the top elevation | components/dialog.html |
| `.hr`, `.hr-visible` | Rules — last resort; prefer whitespace | — |

## Do

- Set every numeric readout — calories, reps, steps, timers, currency — in `.data` (Space Mono) with tabular numerals. Hero numbers use `.display-xl`/`lg`/`md` (Doto).
- Reach for whitespace before dividers, and dividers before borders, and borders before backgrounds. Lightest tool that works.
- Use exactly one accent moment per screen. The FAB, one accent tag, one destructive button — pick one, not several.
- Make composition asymmetric. Centered feels generic.
- Native HTML controls first (`<button>`, `<input>`, `<select>`) — reach for JS only when the native primitive can't express the interaction.

## Don't

- No gradients in UI chrome. Ever.
- No default drop shadows. Border separation is the whole depth story unless a card floats on a colored ground.
- No pure black (`#000`) or pure white (`#fff`) *for text* — text uses the opacity ladder. Ground can be `#000` (OLED-optimal) but text tops out at `--color-text-display` `#FFFFFF`.
- No third font family. Doto / Space Grotesk / Space Mono. Three roles, no overlap.
- No radius over 16 px on cards. Buttons are pill (999px) or technical (4–8px) — never in between.
- No zebra striping in tables. No skeleton loaders. No toast popups. No filled multi-color icons.
- No spring/bounce easing. `ease-out` only, 120 ms fast / 220 ms medium.

## Files

- `styles.css` — the only stylesheet: tokens (`:root`) plus the component layer.
- `theme.json` — machine-readable parameters `styles.css` was derived from.
- `readme.md` — this guide.
- `index.html` — browsable editorial gallery linking every foundation + component.
- `thumbnail.html` — brand cover (mark + swatch strip).
- `theme.html` — parameters rendered as a reference sheet.
- `foundations/type.html` — the three-family stack demonstrated at real sizes.
- `foundations/color.html` — role palette, opacity ladder, OKLCH tonal ramps.
- `foundations/layout.html` — spacing scale, 12-column grid, geometry.
- `foundations/icons.html` — Phosphor at interface sizes.
- `foundations/image.html` — photograph treatment + placeholders.
- `components/buttons.html`, `cards.html`, `forms.html`, `navigation.html`, `table.html`, `dialog.html`.

## Derived choices

Inferred from the Nothing OS aesthetic (via Dominik Martn's `nothing-design-skill` and observed Nothing OS surfaces). Correct any of these in `theme.json` and rerun `scripts/build-system.mjs`:

- **Accent** `#D71921` — matches Nothing OS canonical red. Confirmed against Dominik's tokens; may want adjusting against an official Nothing brand manual if we obtain one.
- **Doto for display** — Google Fonts' 2024 variable dot-matrix font, the closest legal substitute for NDot 57. Ship Doto; upgrade if we license NDot.
- **Density 1.0×** — Nothing OS has breathing room in its cards; the compact 0.7× we tried first read as brutalist rather than premium.
- **Radius 14 px on cards, pill (999 px) on buttons** — Dominik's spec is 12–16 for cards, 999 for buttons. 14 splits the middle for cards.
- **Filled-white primary buttons** — the Nothing OS default. Red is reserved for the FAB, destructive actions, and one accent tag per screen — anywhere else it becomes decoration.
