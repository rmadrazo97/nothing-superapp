---
name: design-system-builder
description: Build a locked, harness-agnostic design system as a portable folder — 3-family type stack (display/body/label), 4-tier text-opacity ladder, OKLCH tonal ramps (100–900), pill/filled/destructive/FAB button variants, and an editorial gallery of foundation + component HTML pages. Interactive by design — asks a short question flow (or extracts intent from brand manual/logo/palette/photos), then emits `styles.css` + `theme.json` + `readme.md` + `foundations/*` + `components/*` + `index.html` for any coding agent (Claude Code, Cursor, Windsurf) or Claude Design. Modeled on Nothing OS, Braun, Teenage Engineering, Nocturne, Broadsheet. Use for "build a design system", "set up design tokens", "extract a design system from this brand", or the design phase of a web/PWA/native build.
license: MIT
metadata:
  author: jmadrazo7 (Nothing Superapp Build Kit)
  version: "0.3.1"
  changes: "v0.3.1 — SKILL.md + all references (question-flow, token-architecture, output-format, qa-checklist) rewritten to match the 3-font stack + 4-tier opacity ladder + filled-white/destructive/FAB button variants + editorial gallery + border-first depth. Foundations/components render editorial-grade (Nothing OS, Braun, Teenage Engineering-tier). The skill's own docs now describe the beast it produces."
---

# Design System Builder

Build a **locked, portable, editorial-grade design system** in one interactive session. The output is a folder of plain HTML + CSS + JSON — no framework, no build step, no harness dependency. Any coding agent then reads `styles.css` as the visual source of truth for the app that follows.

The skill is **interactive by default**: you (the agent) ask the user a short, structured set of questions to gather intent — one small batch at a time — then generate the whole system. If the user hands over brand materials (manual, logo, palette, reference sites, photos), extract intent from those first and only ask about anything still missing.

## When to use

- User says "build a design system", "set up the design tokens", "make me a design language for X", "design phase", "kick off with the visual foundation".
- User hands over a **brand manual / logo / palette / reference sites / reference photos / vibe** and wants tokens extracted.
- User is starting the **design phase** of any web / PWA / native build (this is the first phase in a design → code → deploy pipeline).

If the user already has a locked design system, **skip this skill** and hand off directly to a builder (e.g. `/next-gen-landing-builder`).

## What you produce

A folder (default: `./design-system/`) — harness-agnostic; every page just links `styles.css`:

```
design-system/
├── styles.css          ← THE source of truth (tokens + component classes)
├── theme.json          ← machine-readable parameters (regeneration seed)
├── readme.md           ← human guide: direction, do/don't, files inventory
├── index.html          ← EDITORIAL gallery: hero + asymmetric tile grid of every page
├── thumbnail.html      ← brand cover (mark + swatch strip on the accent ground)
├── theme.html          ← parameters rendered as a reference sheet
├── foundations/
│   ├── color.html      ← roles + 4-tier opacity ladder + OKLCH tonal ramps
│   ├── type.html       ← 3-family stack (display / body / label) at real sizes
│   ├── layout.html     ← spacing scale + 12-col grid + geometry
│   ├── icons.html      ← Phosphor at interface sizes + in-context
│   └── image.html      ← photograph treatment + placeholders
└── components/
    ├── cards.html      ← hero card, content, raised, accent, elevation utilities
    ├── buttons.html    ← pill primary, secondary, ghost, destructive, FAB, tags, status-line
    ├── forms.html      ← underline inputs, radios, segmented control
    ├── navigation.html ← instrument-panel header bar
    ├── table.html      ← Space Mono numerics, no zebra, selected-row accent bar
    └── dialog.html     ← modal + backdrop, destructive-primary pattern
```

That folder IS the system. It opens in any browser at `http://localhost:8765` (via `scripts/preview.mjs`), and any coding agent reads `styles.css` to inherit tokens directly. The same folder can be zipped and imported into Claude Design as a custom skin (matches the Nocturne / Broadsheet shape).

## The output rules (non-negotiable)

Every generated system MUST obey these — they are what separate a system from a stylesheet:

1. **`styles.css` is the ONLY source of truth for tokens.** All HTML pages link only to `styles.css`; the only per-page CSS is a small demo-scaffold block for that page's layout. Never hard-code hex, font names, or px values already in tokens.
2. **Three font families, three roles, no overlap.** `--font-display` (Doto / display face — 36 px+ only, hero moments), `--font-body` (Space Grotesk / grotesque — body copy, headings, buttons), `--font-label` (Space Mono / mono — ALL-CAPS labels, tabular numerics). Never a fourth face.
3. **Four-tier text opacity ladder.** `--color-text-display` (100% — hero numbers), `--color-text-primary` (~90% — body), `--color-text-secondary` (~60% — labels), `--color-text-disabled` (~40% — timestamps). This IS the hierarchy on a monochrome ground.
4. **Tonal ramps 100 → 900** for neutral + accent, generated in OKLCH via `scripts/generate-ramps.mjs` — one shared perceptual-lightness scale so the same step of any ramp carries the same visual weight. Do not eyeball.
5. **Border-first depth.** Cards default to a 1 px border on `--color-surface`. Drop shadows (`.elev-sm/md/lg`) are opt-in for the "card floating on a colored ground" case (a tile on a red wallpaper). No default shadows on the base surface.
6. **The accent is a signal, not a decoration.** Used ONCE per screen: the FAB, an active status tag, a destructive-action border, an accent card block. Never as a large background flood in ordinary UI chrome.
7. **`:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` on everything interactive.** Never leave the browser default. Never `outline: none` without a themed replacement.
8. **Buttons are pill (999 px) or technical (4–8 px) — nothing in between.** Min 44 px height. Space Mono, ALL CAPS, letter-spacing 0.06 em.
9. **Contrast: body text ≥ WCAG AA (4.5:1) on `--color-bg`.** Verify with `scripts/generate-ramps.mjs --contrast` before delivery. Fix ramps if it fails.
10. **`readme.md` is a designer's brief, not boilerplate.** Say WHY, not just WHAT. The reader should finish it knowing which classes to reach for and which ones will get their PR rejected.

If the user's request forces breaking one of these rules, ASK before doing it.

## Process — the 4 phases

### Phase 1 — Discovery (1 message)

Ask ONE upfront question to route the flow:

> "Do you have brand materials to work from (logo, palette, brand manual, reference sites, reference photos of a device / product / space you love) — or should we go by feel?"
>
> Options: **Extract from materials** · **Guided from a vibe** · **I have exact tokens already, just format them**.

Route:
- **Extract from materials** → Read every file the user provides (open the manual/logo/photos, WebFetch reference sites). Only ask about anything the materials don't specify.
- **Guided from a vibe** → Use the full question flow in `references/question-flow.txt`.
- **Exact tokens** → Skip to Phase 3.

### Phase 2 — Interactive intake (1–3 short batches)

Read `references/question-flow.txt` for the complete tree. Ask in **small batches (2–4 questions per turn)** via `AskUserQuestion` in Claude Code — never a wall of 12. Confirm implicitly by moving on. The core questions cover:

- **Ground** (light / dark / dual-support)
- **Scheme** (mono — one accent · duo — two accents · polychrome)
- **Primary accent hue** — offer a curated palette (`references/palette-catalog.txt`) if the user has no preference
- **3-family type stack** — display + body + label choices from `references/type-catalog.txt`. Doto (variable dot-matrix) + Space Grotesk + Space Mono is the Nothing-family default; other combinations documented in the catalog. Always Google Fonts (with fallbacks for premium picks).
- **Density** (compact 0.7× · comfortable 1.0× · spacious 1.25×) — moves spacing only, never type
- **Radius (card)** (sharp 4 · soft 8–14 · rounded 16) and **Radius (button)** (pill "999px" · technical "6px")
- **Button style** (**filled-white** — the Nothing default on dark grounds · **filled-accent** — consumer / marketing · **outline** — editorial / considered · **ghost** — minimal / dense)
- **Image treatment** (none · lighten · halftone · duotone)
- **Icon set** (phosphor · lucide · heroicons · material)
- **Voice / do & don't** (a paragraph from the user — informs `readme.md`)

After the last batch, **echo back the locked parameters** as a compact preview (ASCII swatch strip + type pairing + density/radius/button style + voice quote) and get a **yes/lock-it confirmation**. This is the user's course-correct moment — before generation.

### Phase 3 — Generate the system

Two paths:

**Path A — hand-run the builder (recommended, fastest):**
```bash
node scripts/build-system.mjs --theme <working>/theme.json --readme <working>/readme.md.filled --out ./design-system
```
The builder handles: ramp generation, all token substitution, button-variant CSS, image-treatment CSS, verbatim copy of foundations+components with full token substitution, thumbnail + theme + index assembly.

**Path B — do it manually (only if the builder breaks):**
1. Run `scripts/generate-ramps.mjs --theme <path>` → get the neutral + accent ramp CSS lines.
2. Substitute `templates/styles.css` — inject roles, ramps, spacing (from density), radii, button-variant block.
3. Write `theme.json` — the seed, machine-readable.
4. Write `readme.md` — the designer's brief (see rule 10 above).
5. Copy foundations/*.html + components/*.html into output — substitute the full token map (SYSTEM_NAME, FONT_*, DENSITY, RADIUS_*, IMAGE_TREATMENT) — the captions reference them.
6. Substitute `templates/thumbnail.html` + `templates/theme.html` + `templates/index.html`.

Prefer Path A. Path B is documented so you can debug when a token isn't rendering.

### Phase 4 — Verify + deliver

1. **Grep for unfilled placeholders:** `grep -rc "{{" <output>` should return 0 for every file. If not, the builder was invoked wrong or a template drifted.
2. **Run the contrast check:** `node scripts/generate-ramps.mjs --contrast --theme <output>/theme.json`. Body text on bg + on surface must be ≥ 4.5:1 (AA). Accent on bg must be ≥ 3:1 for large-text / UI use.
3. **Serve over HTTP — never `file://`.** `node scripts/preview.mjs <output>` starts `http://localhost:8765` and opens the browser. This is non-optional: Chrome and Safari block `file://` iframes from loading other `file://` URLs, so `index.html`'s tile previews come up blank if opened from disk.
4. **Hand off:** the ONE file downstream agents need is `styles.css`. Also mention `theme.json` for tools that want to regenerate ramps. If Claude Design is in play, note that the whole folder can be zipped and imported as a skin.

## Key file map inside this skill

Load only the reference you need for the current phase.

| When you need to… | Load |
|---|---|
| Ask the right question at the right time | `references/question-flow.txt` |
| Suggest a curated accent hue | `references/palette-catalog.txt` |
| Suggest a display / body / label pairing | `references/type-catalog.txt` |
| Understand the token architecture (why 4 opacity tiers, 3 font roles, OKLCH ramps) | `references/token-architecture.txt` |
| Know the anatomy of every output file (classes, IDs, page structure) | `references/output-format.txt` |
| Run the final QA pass before delivery | `references/qa-checklist.txt` |
| See a fully worked reference system to compare against | `examples/README.txt` (Nocturne + Broadsheet as gold-standard exemplars; the Nothing OS canon is on Dominik Martn's `nothing-design-skill`) |

## Bundled scripts

| Script | Purpose |
|---|---|
| `scripts/generate-ramps.mjs` | Given pinned roles + ground → outputs OKLCH-based 100–900 ramps as CSS lines. `--contrast` flag verifies WCAG AA. |
| `scripts/build-system.mjs` | One-shot: reads `theme.json` + optional agent-authored `readme.md.filled`, runs the ramp generator, substitutes every template with the full token map, copies foundations/components with substitution, writes the whole output folder. **Prefer this.** |
| `scripts/preview.mjs` | Serves the generated folder on `http://localhost:8765` and opens the browser. **Required** — never hand the user a `file://` URL: Chrome/Safari block `file://` iframes. |

All three are dependency-free (pure Node ≥ 18). No install step.

## Bundled templates (v0.3 schema)

| Template | Substitution | Notes |
|---|---|---|
| `templates/styles.css` | Full token map | The heart. 3-font stack, 4-opacity ladder, ramp blocks, button-variant block, image-treatment class. |
| `templates/theme.json` | Full seed | Palette (bg/surface/surface_raised/border/border_visible + 4 text tiers + accent), 3 font specs, density, radiusCard, radiusButton. |
| `templates/readme.md.txt` | Fill with real prose | The stub. Never ship the placeholder text. |
| `templates/thumbnail.html` | Brand name + typeface names | Brand-mark left, swatch strip right, accent-red ground. The cover. |
| `templates/theme.html` | Parameter values | Reference sheet — human-readable seed. |
| `templates/index.html` | Brand name + typography values | The **editorial gallery**: hero (huge display-face brand mark + swatch strip + subtitle), 3 asymmetric tile sections (foundations / components / theme), each tile a live iframe preview, one wide "hero" tile per section. |
| `templates/foundations/*.html` | Full token map | Foundations use tokens in their editorial captions — pass the full substitution map, not just SYSTEM_NAME. |
| `templates/components/*.html` | Full token map | Same. |

## Voice + polish

- **`readme.md` is your first impression.** Read it as if you were the designer briefing a new engineer over coffee. Say WHY, not just WHAT. Look at `examples/README.txt` → Nocturne/Broadsheet + Dominik's `nothing-design-skill` for the tone bar.
- **No AI-speak.** Never write "generated" or "AI-produced" in the output. The system reads as if a person sat down and made it.
- **Derived choices get flagged.** If a color / font choice is inferred rather than user-specified, list it under a "Derived choices" section in `readme.md` so the user can correct.
- **The `index.html` gallery is not a docs page.** It's a *portfolio*. Editorial hero, asymmetric grid, live-preview iframes, tabular index numbers, a section for foundations / components / theme, monospace footer meta. Read `templates/index.html` for the current bar.

## Failure modes to catch yourself

- **Wall-of-questions.** Never > 4 in one turn. Batch small.
- **Skipping the lock preview.** Always echo parameters back before generating.
- **Regenerating on every tweak.** If the user wants one token changed after generation, edit `styles.css` directly and reprint — do not regenerate the whole system.
- **Ignoring supplied materials.** If the user gave you a PDF, you MUST have read it before asking any question the manual would have answered.
- **Hard-coded values in components.** If any HTML page has a hex or a font name literal, you broke rule #1 — go fix it. Grep the output for `#[0-9a-f]{6}` and quoted font names.
- **Two fonts instead of three.** The 3-family stack is non-negotiable — display + body + label. If the system truly needs only two visual voices, set `display.family` and `body.family` to the same value (Space Grotesk / Space Grotesk works for utility-first systems). Never omit `--font-label`.
- **Filled-red primary buttons everywhere.** Filled red is the FAB and the accent card — not the standard primary. The standard primary on a dark ground is `filled-white` (white pill, black text). Only pick `filled-accent` for consumer / marketing surfaces where "convert now" outweighs "one signal per screen".

## Handoff

When the system is delivered, print two lines the user can paste to the next agent:

> ✅ Design system locked at `./design-system/` — live preview at **http://localhost:8765/index.html** (via `node scripts/preview.mjs`).
>
> Hand `./design-system/styles.css` + the direction paragraph from `./design-system/readme.md` to your builder (e.g. `/next-gen-landing-builder`, or use it as the source of truth for the PWA build).
