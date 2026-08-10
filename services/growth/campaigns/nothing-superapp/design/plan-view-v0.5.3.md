# PLAN surface — design plan v0.5.3

Author: Worker D3
Date: 2026-08-10
Applies to: Fitness Pal (calorie-lite) PLAN tab — list, detail, create/edit
Locked design system: `/design-system/styles.css` (Nothing Superapp tokens)

## Brief recap

A meal plan built by a nutritionist is a **prescription** — a physical
artifact with a signature, a date, numbered meal blocks, macros in mono
type, and rules footnoted. Alex is a design-literate power user tracking
macros for body composition; the plan view is the surface where he opens a
plan the assistant (or a human nutritionist) built for him, sees today's
targets at a glance, picks a meal, and logs it in one tap. The template
answer is a dashboard: title + subtitle + three pill buttons + card
stack. B2 shipped that. The user rejected it.

The move: stop treating the plan as a dashboard. Treat it as the
artifact itself — a **prescription slip / receipt-tape** aesthetic that
already lives inside the Nothing OS instrument-panel visual language.

## Color

All values are the Nothing Superapp tokens; the deltas below are the
surface-specific rules, not new hex values.

| Role                       | Token / hex             | Where |
| --------------------------- | ----------------------- | ----- |
| Ground                     | `--color-bg` `#000000`   | page  |
| Prescription substrate     | `--color-surface` `#111` | the timeline rail body |
| Border hairline (quiet)    | `--color-border` `#222`  | between meals on the rail |
| Border hairline (loud)     | `--color-border-visible` `#333` | tape-strip edges, gutter rail |
| Ember accent               | `--color-accent` `#D71921` | ACTIVE stamp; the one punched hole on the active plan card; the LOG chip |
| Success (adherence check)  | `--color-success` `#4A9E5C` | a small dot when today's meal was logged (never a full pill — the presence of the dot is the whole message) |

**Deliberate omissions:** no gradient. No secondary color. Green appears
as a 6px dot, nothing more — it's an instrument LED, not chrome.

## Type

Three roles, three families — as system-defined — but the assignment on
this surface is what makes it distinctive.

| Family                  | Weight | Where on the PLAN surface |
| ------------------------ | ------ | ------------------------- |
| **Doto** (display, pixel) | 700    | Numerals inside the macro **tape ticker** cells (KCAL, P, C, F). Meal number in the gutter rail (`01 / 02 / 03`). Nowhere else — Doto is used **only for numerals**, never for words on this surface. |
| **Space Mono** (label)   | 400/700 | All instrument labels (`KCAL`, `P·C·F`, `OPCIÓN 01`, `RX-2026-08-10`, `[← PLANS]`). Ingredient quantities (`180 g`). |
| **Space Grotesk** (body) | 400/500 | Plan name (mid-weight). Meal name (regular). Ingredient names. Long-form notes on rules. |

**Type scale on this surface (specific — not the whole system):**

```
tape-ticker value:  --text-display-lg (48px) Doto 700   line-height 1
plan title:         --text-heading (24px)    Grotesk 500 line-height 1.2
meal number gutter: --text-display-md (36px) Doto 700   line-height 0.85 (crushed)
meal name:          --text-body (16px)       Grotesk 500 line-height 1.3
label everywhere:   --text-label (11px)      Mono UPPER  tracking 0.08em
ingredient name:    --text-body-sm (14px)    Grotesk 400
ingredient qty:     --text-body-sm (14px)    Mono tabular
prescription meta:  --text-caption (12px)    Mono UPPER  tracking 0.06em
```

**Why this pairing:** Doto (pixel-display) reads as *machined output* —
right for numerals-as-readings. Space Mono reads as *tape / receipt* —
right for the "instrument panel" chrome the rest of Nothing OS speaks in.
Grotesk carries humane content (the plan's name, the meal's name) without
sliding into the terracotta-serif template look every AI design defaults
to.

## Layout

### LIST view — "the cabinet"

Plans are index cards in a vertical stack. Each card has a **punched hole**
in the left gutter — a 12px circle drawn with a 1px border-visible ring.
On the ACTIVE plan the hole is **filled ember-red** — a pushpin.

```
┌───────────────────────────────────────────────────────────┐
│  PLANS · 03 IN LIBRARY                        [+ NEW]    │
│                                                            │
│  ●─── José Nutritionist · Dieta                    ↳     │
│      2100 KCAL   P109  C308  F47        ACTIVE           │
│      updated 2 days ago                                    │
│                                                            │
│  ○─── Cutting · 2400                                ↳    │
│      2400 KCAL   P150  C220  F80                          │
│      updated 6 days ago                                    │
│                                                            │
│  ○─── Weekend refeed                                 ↳    │
│      2800 KCAL   P130  C400  F60                          │
│      updated 3 weeks ago                                   │
└───────────────────────────────────────────────────────────┘
```

- `●` = filled ember-red pushpin (active)
- `○` = hollow ring (inactive; tap-to-set-active via swipe)
- `↳` = SwipeableRow affordance (kept — reuse)
- The card is wrapped in `<SwipeableRow>`; swipe left → Set Active / Edit / Delete.
- The `+ NEW` chip is deliberately small mono type; not a giant CTA.

### DETAIL view — "the prescription slip"

```
┌───────────────────────────────────────────────────────────┐
│  [ ← PLANS / 03 IN LIBRARY ]                              │
│                                                            │
│  RX · 2026-08-10 · JOSÉ NUTRITIONIST                      │  ← Mono kicker, 11px, tracked
│  Dieta                                              ●     │  ← Grotesk 24, pushpin at right if ACTIVE
│                                                            │
│  ┏━━━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━┓                    │
│  ┃  KCAL  ┃   P    ┃   C    ┃   F    ┃  ← MACRO TAPE
│  ┃  2100  ┃  109   ┃  308   ┃   47   ┃    (segmented cells)
│  ┗━━━━━━━━┻━━━━━━━━┻━━━━━━━━┻━━━━━━━━┛
│                                                            │
│  [ SET ACTIVE ]  · edit · duplicate                        │  ← One primary; secondaries as underlined text links
│                                                            │
│  ┌─────┬───────────────────────────────────────────────┐  │
│  │  01 │ BREAKFAST                              ●      │  │
│  │     │ Huevos con tortillas · Oatmeal + whey · +2    │  │
│  │     │ 550 KCAL · P35 · C60 · F20                    │  │
│  │     │                                                │  │
│  │     │ [ LOG · OPCIÓN 01 ]     Prev: opción 02 ·    │  │
│  ├─────┼───────────────────────────────────────────────┤  │
│  │  02 │ LUNCH                                   ○      │  │
│  │     │ …                                              │  │
│  ├─────┼───────────────────────────────────────────────┤  │
│  │  03 │ DINNER                                  ○      │  │
│  │     │ …                                              │  │
│  ├─────┼───────────────────────────────────────────────┤  │
│  │  04 │ SNACKS                                  ○      │  │
│  │     │ …                                              │  │
│  └─────┴───────────────────────────────────────────────┘  │
│                                                            │
│  RULES                                              show → │  ← Rules card stays; unchanged
└───────────────────────────────────────────────────────────┘
```

The signature elements here are:
1. **The macro tape ticker** — a 4-cell horizontal strip, Doto numerals inside each cell, mono labels above. Reads as a receipt-printer output, not a stat bar.
2. **The left-gutter timeline rail** — each meal is not a card; it's a *station* on a vertical rail. The gutter is 56px wide, dark grey, with the meal number in crushed Doto (36px). Content flows in the right column, separated from siblings by a `--color-border` hairline (not a card boundary — a page rule).
3. **The `●` adherence LED per meal** — 6px filled circle in `--color-success` when today's meal was logged, hollow otherwise. Not a badge, not a chip. One pixel.
4. **DELETE removed from the header entirely.** Deletion happens exclusively via swipe on the list (same as B2's ⋯ menu-move, but with the menu gone too). Consistent with `<SwipeableRow>` semantics elsewhere.

### CREATE / EDIT view — "the worksheet"

```
┌───────────────────────────────────────────────────────────┐
│  [ ← CANCEL ]                                              │
│                                                            │
│  NEW PRESCRIPTION · STEP 01                                │
│                                                            │
│  ─────────────────────────────────────────────────────    │
│  PLAN NAME                                                 │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Dieta                                                │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ─────────────────────────────────────────────────────    │
│  DAILY TARGETS                                             │
│                                                            │
│  KCAL      P (%)     C (%)     F (%)                       │
│  [ 2100 ]  [  30  ]  [  40  ]  [  30  ]                    │
│                                                            │
│  PRESET:  ( BALANCED ) ( HIGH-P ) ( KETO ) ( CUSTOM )      │  ← mono-typed stamp bar
│                                                            │
│  ─────────────────────────────────────────────────────    │
│  MEALS                                                     │
│  … repeater, same visual language as the detail rail …     │
└───────────────────────────────────────────────────────────┘
```

Zone separation by hairline rules; no cards. The form reads as a filled-in
form on paper. Presets are a **stamp bar** — pill-less mono chips with a
1px border, filled ember-red when active. Ingredient rows keep the
existing B2 field-repeater code — that layer isn't the problem.

## Signature

The **macro tape ticker** is the one memorable element I'm spending
boldness on. It's the piece the user will see first, and it's what
distinguishes this from every other kcal tracker (whose macro row is a
prose string or three colored donuts). Justification:

- Doto numerals rendered inside boxed segmented cells reads as instrument
  output — legible at a glance, tabular, ownable.
- It answers the user's actual question ("what am I aiming for today?")
  in one visual, in three fixed positions, with letter-perfect alignment.
- It's a reusable pattern I can imagine extending to WEIGHT and WATER
  surfaces later without redesigning.
- It's not a chart. Charts of static targets are theater. This is data.

## Motion

Restrained. Two moments only:

1. **Page-load tape unfurl.** On first paint of the DETAIL view, the four
   tape-ticker cells slide in from the right in a 220ms cascade (60ms
   stagger), respecting `prefers-reduced-motion`. Signals arrival like a
   receipt printer, not a splash animation.
2. **LOG chip → adherence LED.** When the user taps LOG, the chip
   collapses to a small "logged" state (`--dur-fast` 120ms) and the
   adherence LED at the meal-header lights up (opacity 0 → 1 in the same
   120ms). One small satisfying feedback loop.

No hover animations, no scroll parallax, no ambient effects. Motion is
the reward for the action.

## Critique against defaults

| Where I could have defaulted | What I did instead | Why |
| ---------------------------- | ------------------ | --- |
| Title + subtitle + three action pill buttons in a row (the B2 layout) | RX-kicker line + Grotesk plan name + macro tape + one primary + two text-links | The buttons row was the exact chrome the user called "horrible". Kicker line does the metadata work; primary action stays singular. |
| Macros as a Space-Mono string `2100 KCAL · P109 · C308 · F47` | Segmented tape ticker with Doto numerals | The prose string is the AI-generic answer; the ticker reads like an instrument. |
| Cards per meal (`<section>` with border + padding + radius) | Left-gutter timeline rail with crushed Doto meal numbers and hairline separators | Cards render every meal at equal visual weight in a stack; the rail encodes order (which is real, meals are sequential) and lets the user scan meal-by-meal without breaking flow. |
| DELETE button in the header | Removed entirely; delete only via swipe on the list card | Consistent with SwipeableRow semantics; header stays for reading, not for destruction. |
| Green "logged today" chip / badge | 6px `--color-success` dot at the meal-name row | Chip is chrome; a single LED-dot is data. Chanel's remove-one-accessory rule. |
| `+ NEW PLAN` big red pill CTA | Small mono chip in the list header | The user creates plans rarely; the CTA doesn't need to shout. |
| Progress donuts for macro progress | Not on this surface at all — that belongs on TODAY | The plan detail is a *prescription* view, not a *today's progress* view. Don't muddle. |
| Numbered markers `01 / 02 / 03` used decoratively | Numbers are the meal `order` field — real sequence, real payload | Only use numbered markers when the content is genuinely sequential. Meals literally are. |

## Reuse checklist

- `<SwipeableRow>` — kept for the LIST cards (Set Active / Edit / Delete)
- `<UndoSnackbar>` — no longer wired from DETAIL (delete moved to list only)
- `<BottomSheet>` — not used on this surface (nothing warrants a modal here)
- `<EmptyState>` from `mini-apps-runtime` — kept, both empty states
- `PlanRulesCard` — kept unchanged (already good enough; collapsed by default)
- `PlanForm` field repeater — kept; only the outer chrome (header, section separators, preset bar) changes
- Existing food-search / ingredient-picker in `PlanForm` — untouched

## Non-goals

- No adherence chart / heatmap on this surface. Adherence belongs to
  TODAY / REPORTS, not the plan document.
- No inline meal editing from DETAIL. Edit requires jumping to the form.
- No copy-to-clipboard / share. Not the surface's job.
