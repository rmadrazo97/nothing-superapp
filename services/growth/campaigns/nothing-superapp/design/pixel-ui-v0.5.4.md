# Pixel UI — assistant generative surface v0.5.4

Author: Worker Phase-2
Date: 2026-08-10
Applies to: `apps/web/src/components/pixel-ui/*` + `render_*` tools
Locked design system: `/design-system/styles.css` (Nothing Superapp tokens)

## Brief recap

The user asked the copilot "show me a chart of the weights I lifted by exercise"
and got back a markdown pipe-table + ASCII bar art. Both fail: markdown pipe
tables render as raw text in `markdown-lite`, and ASCII bars look like a 1998
terminal, not a Nothing OS surface. The move: **the assistant renders, it does
not describe**. When the user asks for anything quantitative, the model calls a
`render_*` tool and the client mounts a pixel-panel component — same visual
family as `<PixelLoader>`, the launcher tiles, the Doto counters — inside the
chat stream.

The template answer for a "chat charts" library is: import Recharts (or
similar), get gradient bars, tooltips, animated slide-ins, and a rounded card
container. That is what every other AI product ships. We are shipping the
opposite: **pixel dots on hairline grids, static by default, mono type,
cadmium as the only accent**. The chart *is* the instrument reading.

## Ground it in the pixel-dot idiom

`<PixelLoader>` is the anchor. It's a 5×5 grid of 2–6px cells with 1–2px
gaps, using `currentColor` so tint flows from parent. Every pixel-panel
component reuses those exact atoms:

- **Cell size:** 3px (default), 4px (large hero) — same as PixelLoader `md`/`lg`
- **Gap:** 1px (default), 2px (large) — same as PixelLoader
- **Off-state:** `--color-text-secondary` at 25% opacity (pixels that could
  be lit but aren't — e.g. empty progress dots, area below a chart line)
- **On-state:** `--color-accent` (cadmium) — the ember dot
- **Positive delta:** `--color-success` (the same 6px green LED the PLAN
  view uses — used sparingly, only on delta chips and stat markers)
- **Bg / substrate:** `--color-surface` (`#111`) inside a `<PixelCard>`

## Color

| Role                      | Token                     | Where |
| ------------------------- | ------------------------- | ----- |
| Card ground               | `--color-surface` `#111`  | every `<PixelCard>` |
| Card border               | `--color-border-visible` `#333` | hairline around every card |
| Empty pixel               | `--color-text-secondary` at 25% opacity | unlit grid cells, empty progress dots, tick marks |
| Lit pixel                 | `--color-accent` `#D71921` | bar values, filled progress, line points, arc marker |
| Positive delta            | `--color-success` `#4A9E5C` | delta chip when trend up, sparkline peak marker |
| Negative delta            | `--color-accent` `#D71921` | delta chip when trend down (yes — ember red for "warning") |
| Numeral / hero            | `--color-text-display` `#FFF` | Doto big numbers |
| Axis / label              | `--color-text-secondary` `#999` | x-axis labels, table headers |
| Table row separator       | `--color-border` `#222`    | hairline between rows |

**Deliberate omissions:** no gradient fills. No shadows. No animation on
charts (see Motion section). No zebra stripes on tables. Green is used
ONLY on positive deltas and streak markers — never as chrome.

## Type

Three-role stack, matching the rest of Nothing OS:

- **Doto** (`--font-display`) — hero numerals inside a `<PixelTicker>`, the
  arc-center number in `<PixelArc>`. The Doto face IS itself a pixel-dot
  typeface, so it composes with the pixel grid natively. Justification:
  Doto isn't the template answer — the template answer would be Inter Black
  for hero numbers. Doto is chosen precisely because it visually IS the
  pixel language.
- **Space Mono** (`--font-label`) — axis labels, table cells (numerics),
  eyebrow labels, delta chip text, units. `font-variant-numeric:
  tabular-nums` on every numeric cell.
- **Inter** (`--font-body`) — card titles ONLY (e.g. "WEIGHTS LIFTED —
  LAST SESSION"). Used with `--text-body-sm` at `--color-text-secondary`
  and uppercase letterspacing, so titles read as instrument labels, not
  headlines.

**Type ratio (fixed across the family):**
- Card title: 11px Space Mono uppercase (`--text-label`)
- Axis labels: 11px Space Mono
- Delta chip: 11px Space Mono
- Body value in table: 12px Space Mono (`--text-caption`)
- Hero numeral (Ticker): 36px Doto (`--text-display-md`) — NOT 72px
  display-xl, because the chat bubble is 92% of a 480px column and 72px
  would blow through it
- Mini-grid numeral (MetricGrid): 24px Doto (custom size — between
  display-md and heading — kept as an inline value)
- Arc center numeral: 36px Doto

## Grid unit

The whole library is on a **3px cell + 1px gap** grid. This gives each
column of a bar chart, each dot of a progress row, and each point of a
line chart the same visible weight — the pixel loader in the composer's
"thinking" state and the bar chart six lines above it read as the same
material.

Component footprints at default density:

- `<PixelTicker>` — one hero row: 36px Doto number + optional 8-column
  sparkline (8 cells × 4px = 32px wide × 20px tall). Full card: full
  bubble width × ~96px tall.
- `<PixelBarChart>` — height budget 24 cells (72px + 23 gaps = 95px);
  each bar is 3 cells wide (9px) with 2px between bars. Multi-series
  groups 2–3 bars per x-label. Full card ~180px tall including title +
  x-axis.
- `<PixelLineChart>` — 12 rows × N columns of 3px cells; connected by
  1px cadmium stroke. Optional area fill = same cadmium at 20% opacity
  in dot-density (skip every other row). Full card ~200px tall.
- `<PixelProgressDots>` — one row of up to 40 dots at 3px, 1px gap
  (40 × 4 - 1 = 159px wide). Auto-wraps to a second row if `total > 40`.
- `<PixelArc>` — 180° arc SVG stroked at 1.5px cadmium; current-position
  marker is a 6px filled square. Center label = Doto numeral. Card ~180px
  tall.
- `<PixelDataTable>` — no fixed height; each row is `--space-3` tall
  (~10px + 12px type = 22px). Right-aligned numerics.
- `<PixelMetricGrid>` — 2-column grid; each cell is a mini-ticker (24px
  Doto numeral, no sparkline). Auto-flows to 3 rows for 6 items.

## Signature

**The pixel cell is the signature.** Every component's atomic visual
unit is a 3px square, and every card carries the same hairline border +
`--space-4` padding. Beyond that, ONE secondary signature ties the
family: a **fixed 2×2 cadmium pixel cluster in the top-right corner of
every card** (4px each, 1px gap → 9px total, cadmium at 100%). It's the
"instrument LED lit" mark — a Nothing OS shorthand for "this is a live
reading from your data, not a static graphic". The user learns it once
across the family; when they see the cluster, they know "this came from
my data, right now."

**Critique against defaults:** the AI template answer for "chart card
library" would give me a 20px rounded card, a subtle drop shadow, a
gradient accent bar under the title, and sliding-in animated bars on
mount. I kept the 7px `--radius-compact` (matching every other Nothing
surface, NOT 20px), zero shadow, zero gradient, zero mount animation.
The LED cluster replaces all four defaults with one deliberate mark.

## Layout — ASCII wireframes

Bubble is 92% of 480px column = ~440px. All components sit inside a
`<PixelCard>` with `--space-4` (12.8px) padding, so the drawable area is
~414px wide.

### `<PixelCard>` — shared container
```
┌─────────────────────────────────────────┐ <- 1px --color-border-visible
│ {slot}                              ▪▪  │  <- 2×2 cadmium LED cluster (top-right)
│                                     ▪▪  │
│                                         │
└─────────────────────────────────────────┘ <- 7px radius-compact
```

### `<PixelTicker>`
```
┌─────────────────────────────────────────┐
│ WEIGHT · KG                         ▪▪  │  <- eyebrow (Space Mono)
│ 78.4  +0.3 ▲          ▪ ▪▪ ▪▪▪▪ ▪ ▪   │  <- Doto 36px + delta chip + 8-col sparkline
└─────────────────────────────────────────┘
```

### `<PixelBarChart>`
```
┌─────────────────────────────────────────┐
│ WEIGHTS LIFTED — LAST SESSION       ▪▪  │
│                                         │
│         ▪                               │
│         ▪         ▪                     │
│   ▪     ▪         ▪                     │
│   ▪     ▪    ▪    ▪    ▪                │
│   ▪     ▪    ▪    ▪    ▪                │
│  ───────────────────────────            │  <- 1px axis
│  SQUAT BENCH DEAD ROW PRESS   KG        │
└─────────────────────────────────────────┘
```

### `<PixelLineChart>`
```
┌─────────────────────────────────────────┐
│ WEIGHT TREND — LAST 4 WEEKS         ▪▪  │
│                                         │
│    ▪                                    │
│      \                        ▪         │
│       ▪──▪                  /           │
│           \      ▪──▪──▪──▪             │
│            ▪────/                       │
│  ───────────────────────────            │
│  W1   W2   W3   W4   W5   W6   KG       │
└─────────────────────────────────────────┘
```

### `<PixelProgressDots>`
```
┌─────────────────────────────────────────┐
│ KCAL LEFT · 420 / 2200              ▪▪  │
│ ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪·······           │  <- filled cadmium, empty muted
└─────────────────────────────────────────┘
```

### `<PixelArc>`
```
┌─────────────────────────────────────────┐
│ POMODORO · CYCLE 3/4                ▪▪  │
│                                         │
│           ╭─────────────╮               │
│         ╭─               ─╮             │
│        ╱                   ╲            │
│       │        18:24        │           │  <- Doto 36px center
│       │         MIN         │           │  <- Space Mono unit
│        ▪                              │  <- current-position marker
└─────────────────────────────────────────┘
```

### `<PixelDataTable>`
```
┌─────────────────────────────────────────┐
│ OPTIONS — LUNCH                     ▪▪  │
│  NAME              KCAL   P    C    F   │  <- header row, cadmium tint
│ ──────────────────────────────────────  │
│  Chicken bowl       620   48   52  22   │  <- Space Mono, right-aligned num
│  Salmon salad       540   42   28  30   │
│  Steak plate        780   62   48  34   │
└─────────────────────────────────────────┘
```

### `<PixelMetricGrid>`
```
┌─────────────────────────────────────────┐
│ THIS WEEK                           ▪▪  │
│  KCAL             │  PROTEIN             │
│  12,480  ▲        │  620g  ▲             │
│                   │                      │
│ ──────────────────┼─────────────────     │
│  CARBS            │  FAT                 │
│  1,240g  ▼        │  420g  ▲             │
└─────────────────────────────────────────┘
```

## Motion

**Static by default.** The chart is a reading, not a performance. The
only exceptions:

1. **PixelLoader remains the only twinkler.** It stays the "we're
   working" signal — no chart ever twinkles.
2. **`<PixelTicker>` sparkline is drawn as-is.** No line-drawing
   animation. No dot-illumination sequence.
3. **Delta chip color transitions:** none. If the value changes on a
   re-render, it changes instantly. Nothing OS restraint: the eye should
   process the new number, not the transition.

`prefers-reduced-motion: reduce`: nothing to disable, because nothing
animates. `<PixelLoader>` already respects the media query in globals.css.

## Critique against defaults

Working through what the template AI would produce, and what I swapped:

| Template default | This library | Why |
| ---- | ---- | ---- |
| `recharts` / `visx` import | Bare SVG + divs | Every pixel is on our grid; no library gets to introduce its own rounded caps, gradient defaults, or hover tooltips that clash with the mono aesthetic |
| Rounded 20px cards, drop shadow | 7px `--radius-compact`, no shadow | Matches every other Nothing surface (bubble, tool card, tile) |
| Blue → purple gradient accent | Cadmium (`#D71921`) flat | Nothing has one accent. No secondary. No gradient. Ever. |
| Animated bar rise on mount | Static | The bars ARE the reading — no theatrics |
| Hover tooltips with tooltip arrow | Value labels rendered inline OR omitted | Chat bubbles are tap targets, not hover targets — hover UX would be dead on mobile |
| Sans-serif hero numerals (Inter Black) | Doto | Doto is a pixel-dot typeface — composes natively with the grid |
| Zebra stripes on tables | Hairline row separators, no zebra | Zebra is decoration; the hairline is structural |
| Green + red delta chips only | Cadmium down + Green up | We use ember red for BOTH the accent AND the "warning" delta — same brand hue does double duty |
| Bar chart shows values on top of every bar | Values shown only on hover / tap of the whole card | Density restraint — the shape carries the comparison |
| Line chart with area fill = solid gradient | Line chart with area fill = dot-density (skip-every-other-row) at 20% opacity | Keeps the pixel idiom in the fill |
| Card container = white bg | Card container = `--color-surface` (`#111`) | Dark ground is the whole product |

**One risk I'm taking:** the 2×2 cadmium LED cluster in every card's
top-right. It's decorative overhead the template would tell me to cut —
but it's the single visual mark that ties the family together across a
chart, a table, and a progress row. Without it the family reads as
"seven random components in the Nothing style"; with it, it reads as
"one instrument suite".

## Implementation notes

- Components live at `apps/web/src/components/pixel-ui/*`.
- Zod schemas for props at `apps/web/src/components/pixel-ui/schemas.ts` —
  clamp arrays to max 60 datapoints, strings to max 80 chars, so a
  hostile tool output can't break layout.
- Every component takes props matching the exact shape of the matching
  `render_*` tool's output — one-way data flow, no massaging in the
  render layer.
- `<PixelCard>` accepts `title` (string) prop so the eyebrow doesn't
  have to be duplicated in every child.
- All colors reference tokens; no inline hex values (matches project
  convention).
- Bar chart bar height = round(value / max * gridRows). Bar chart with a
  single-datapoint series still renders — the bar just always hits max.
- Line chart connects points with a 1px cadmium stroke; markers are
  4×4 filled squares at each data point.

## Verification checklist

1. Ask "show me a chart of the weights I lifted by exercise last session"
   → `render_bar_chart` fires → `<PixelBarChart>` renders
2. "How many kcals do I have left today?" → `render_progress_dots` or
   `render_stat_ticker`
3. "Show me my weight trend last 4 weeks" → `render_line_chart`
4. "Summarize my week's macros" → `render_metric_grid`
5. "Compare option 1 vs option 2 in my lunch plan" → `render_data_table`
6. Rehydrate a thread with a rendered tool → re-renders cleanly
7. 200% zoom in Safari — pixels stay crisp (no bilinear blur)
8. `prefers-reduced-motion` — no accidental transitions

## Change log

- v0.5.4 initial — first ship of the pixel-panel library + 7 render tools.
