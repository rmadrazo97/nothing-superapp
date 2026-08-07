# {{SYSTEM_NAME}} design system

{{DIRECTION_PARAGRAPH}}

## How to use this

- Link the one stylesheet from every page — `<link rel="stylesheet" href="styles.css">` (adjust the relative path) — and take every color, font, spacing, radius and shadow from its variables (`var(--color-*)`, `var(--font-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`). Never hard-code a hex, a font name or a px value the tokens already carry.
- Build with the classes below rather than inventing parallel ones; the component pages are plain HTML, so view source and copy the markup.
- `styles.css` is the source of truth. To change the look, edit the tokens at the top of `styles.css` — every page and `thumbnail.html` read from them — and keep `theme.json` in step so the record stays true.
- The system is harness-agnostic: it works with Claude Code, Cursor, any AI coding agent, or plain hand-editing. If Claude Design is available, the same folder can be imported as a custom skin.

## Direction

{{DIRECTION_DETAIL}}

## Color

{{COLOR_NOTES}}

On this ground, use the {{RAMP_STEP_GUIDANCE}} for tinted fills, hovers and subtle borders, `-500` as the role's base, and the {{RAMP_TEXT_GUIDANCE}} for text on those tints and for pressed states. Prefer ramp steps over ad-hoc `color-mix()`.

For elevation use `--shadow-sm/md/lg` (tuned to the ground) rather than ad-hoc box-shadows.

## Type

{{TYPE_NOTES}}

## Icons

{{ICON_NOTES}}

## Interaction states

Interactive states are themed, never browser defaults: every interactive element gets a `:hover` tint from the accent ramp, keyboard focus is styled with `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`, `::selection` is a 30% accent tint, and disabled controls drop to 45% opacity. Don't restyle these per page.

## Components

| Class | What it is | Shown in |
| --- | --- | --- |
| `.btn` with `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`, `.btn-block` | Actions — the primary is {{BUTTON_STYLE_DESCRIPTION}} | components/buttons.html |
| `.tag` with `.tag-accent`, `.tag-neutral`, `.tag-outline` | Small labels tinted from the ramps | components/buttons.html |
| `.field` + `label`, `.input`, `.radio` + `.dot`, `.seg` + `.seg-opt` | Form fields and choices on native elements — no script | components/forms.html |
| `.card` with `.card-kicker`, `.card-title`, `.card-body`, `.card-meta`; `.elev-sm/md/lg` | Surface-filled content cards; elevation utilities | components/cards.html |
| `.nav` + `.nav-brand` | The header bar | components/navigation.html |
| `.table` | Data tables with themed header and row rules | components/table.html |
| `.dialog-backdrop` + `.dialog` (+ `.dialog-title/-body/-actions`) | A modal at the top elevation | components/dialog.html |
| `.hr` | A horizontal rule | components/buttons.html (bottom) |

## Do

{{DO_LIST}}

## Don't

{{DONT_LIST}}

## Files

- `styles.css` — the only stylesheet: the token sheet (`:root` variables, ramps, base type) plus the component layer. Link it from every page.
- `theme.json` — the machine-readable parameters the CSS was derived from.
- `readme.md` — this guide.
- `index.html` — a browsable index linking every foundation + component.
- `thumbnail.html` — the project cover (brand mark + swatches).
- `theme.html` — the theme's parameters rendered as a reference sheet.
- `foundations/type.html` — the type scale and the heading/body pairing at real sizes.
- `foundations/color.html` — color roles and the 100–900 tonal ramps, with usage notes.
- `foundations/layout.html` — the spacing scale, the grid and how edges are drawn.
- `foundations/icons.html` — the icon set at interface sizes, inline and in buttons.
- `foundations/image.html` — how photographs and figures are treated.
- `components/buttons.html` — buttons, icon buttons and tags in every variant and state.
- `components/forms.html` — text fields, radios and the segmented control on native elements.
- `components/cards.html` — content cards and the elevation steps.
- `components/navigation.html` — the header bar pattern.
- `components/table.html` — a data table with themed header and row rules.
- `components/dialog.html` — a modal over its backdrop at the top elevation.

{{OPTIONAL_DERIVED_CHOICES_SECTION}}
