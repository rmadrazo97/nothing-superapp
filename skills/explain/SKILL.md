---
name: explain
description: Turn a complex concept into a self-contained HTML artifact — three modes. `report` = single scrollable doc with `@media print` for PDF; `landing` = navigable multi-section with in-page ToC + anchors; `slides` = presentation deck with keyboard nav + presenter notes. Vanilla HTML + inline CSS + inline SVG default (zero deps, opens on file://). Mermaid opt-in for text-authored diagrams. Auto-detects `design-system/styles.css` at repo root for on-brand output; falls back to Anthropic-tier defaults. Served via bundled local HTTP (never file:// — Chrome/Safari block iframes there). Use for "explain X visually", "make slides on Y", "draw the architecture", or preparing a pitch/tutorial. Not for product landing pages.
license: MIT
metadata:
  author: jmadrazo7 (Nothing Superapp Build Kit)
  version: "0.1.0"
---

# explain

Turn a complex concept into a **self-contained HTML artifact** — one file, opens anywhere, prints cleanly. Three output modes: **`report`** (single scrollable doc), **`landing`** (navigable multi-section explainer), **`slides`** (presentation deck).

Vanilla HTML + inline CSS + inline SVG. Zero deps by default. Mermaid opt-in for text-authored diagrams. Auto-uses the repo's `design-system/styles.css` if it exists so explainer artifacts look on-brand.

Use when a diagram, workflow, architecture, comparison, or timeline needs to be **shown**, not just described.

## When to use

- User says "explain X visually", "draw the architecture for Y", "make me slides on Z", "create a doc explaining this concept".
- User is preparing a pitch, meeting, review, tutorial, or shareable technical explainer.
- User is mid-conversation about a complex system and wants a permanent visual reference to send later.
- Any concept that benefits from side-by-side text + diagram, or from sequential reveal (slides), or from cross-linked sections (landing).

**When NOT to use:**
- Building a real product landing page → `next-gen-landing-builder`.
- Design-system decisions → `design-system-builder`.
- Turning a spec into code → `dev-loop`.
- One-off Excalidraw diagram (single hand-sketch style) → the `/diagram` skill.
- Long-form editorial content that doesn't need diagrams → plain Markdown is fine.

## What you produce

Depends on mode. Default location: `docs/explain/<slug>/`.

### `report` mode
```
docs/explain/<slug>/
├── explain.html          ← ONE file: inline CSS + inline SVG + @media print
└── readme.md             ← optional: what this doc is + how to update it
```
One `explain.html` — scrollable long-form. Passes Reader Mode, prints to PDF via Chrome's `⌘P → Save as PDF`. No JS required for content.

### `landing` mode
```
docs/explain/<slug>/
├── index.html            ← nav + hero + first section
├── sections/
│   ├── 01-*.html         ← optional per-section files if the explainer is big
│   └── ...
├── shared-styles.css     ← inline for one-file; extracted for multi-page
└── readme.md
```
Navigable — in-page ToC with scroll-spy, anchor deep-links, sticky-graphic + scrolling-text patterns where useful. Rendered via local HTTP.

### `slides` mode
```
docs/explain/<slug>/
├── slides.html           ← one deck, one file, keyboard nav + presenter view
├── presenter-notes.md    ← spoken-word notes per slide
└── readme.md
```
Pure-CSS + tiny JS (< 60 lines) keyboard handler. Fullscreen presentation, `?p` query param for presenter view, `⌘P → Save as PDF` for handout export.

## The output rules (10 — non-negotiable)

1. **Vanilla HTML + inline CSS by default.** No npm, no build step, no framework. Opens on `file://` for report mode. Zero deps.
2. **One file per artifact where possible.** Report mode = always one file. Landing may split. Slides = one file.
3. **Inline SVG for diagrams by default.** Mermaid opt-in via ONE CDN script tag when the user wants text-authored diagrams (asked at Phase 1). D3 only when interactive is required.
4. **`@media print` block mandatory in `report` mode** — `page-break-inside: avoid` on figures, `-webkit-print-color-adjust: exact` on colored backgrounds, `a::after { content: " (" attr(href) ")" }` for print-visible links.
5. **Progressive disclosure via `<details>`/`<summary>`** — free accordions, no JS.
6. **Native HTML primitives first** — `<dialog>`, `<details>`, `<template>` before reaching for any framework primitive.
7. **No AI-slop aesthetics.** No purple gradients on white, no stock hero photos, no rounded-XL cards on every element, no emoji-decorated section headers. Uses `design-system/styles.css` tokens if repo has one; otherwise a tasteful default palette (see `references/layout-patterns.txt`).
8. **Accessible by default** — semantic `<article>`/`<section>`, `alt` on every image, `:focus-visible` outlines, ≥ AA contrast.
9. **Rendered via `scripts/preview.mjs`** — never hand user a `file://` link. Same reason design-system-builder does this: Chrome/Safari block file:// iframes; slides fullscreen behavior is more reliable over HTTP.
10. **Every artifact is self-contained** — CSS inline, SVG inline, at most ONE CDN script tag (Mermaid or nothing). One file → one email/Slack/S3 upload → one shareable link.

## The 4-phase flow

### Phase 0 — Route (one question)

Ask via `AskUserQuestion` in Claude Code (or plain text elsewhere):

> "Which mode: **`report`** (one scrollable doc, PDF-exportable) · **`landing`** (multi-section explainer with nav + anchors) · **`slides`** (presentation deck with keyboard nav)?"

Also ask (skip if the user already stated the intent):
> "One-line concept: what am I explaining?"

Both together — one round-trip.

### Phase 1 — Concept intake (1 batch, 2-4 questions per mode)

Read `references/question-flow.txt` for the mode-specific tree. Common cross-mode questions:

- **Audience** — technical peers / execs / mixed / customers?
- **Length** — one page / 3-5 sections / 10-slide deck?
- **Diagram needs** — architecture / workflow / comparison / timeline / sequence / none?
- **Diagram authoring** — inline SVG (I draw) or Mermaid (text-authored, live-rendered)?
- **Design system pinning** — if `design-system/styles.css` is detected, ask: "use it (recommended, matches your brand) or generic tasteful defaults?"
- **Delivery target** — screen only, print-to-PDF, live presentation, all of the above?

End Phase 1 with a **clarified brief**:

```
BRIEF — <concept slug>

  Mode        · landing
  Concept     · How dev-loop orchestrates parallel implementation from a raw requirement
  Audience    · Mixed (senior devs + solo founders)
  Length      · ~5 sections, ~1500 words of prose + 4 diagrams
  Diagrams    · Inline SVG (I'll draw them)
  Design pins · Nothing Superapp design system (auto-detected)
  Delivery    · Screen (localhost preview) + shareable via URL

  Reply "generate" or tell me what to change.
```

### Phase 2 — Draft

1. Detect `design-system/styles.css` at repo root. If found, extract the tokens (or import directly).
2. Advisor (Fable/Opus if available) plans the outline: sections, diagram types per section, layout patterns.
3. Executor (Sonnet) writes the HTML using the mode's template as skeleton.
4. Inline SVG diagrams drawn per section — use patterns from `templates/diagram-svg-primitives.svg.txt` where they fit.
5. Save to `docs/explain/<slug>/`.

### Phase 3 — Serve + iterate

1. `node scripts/preview.mjs docs/explain/<slug>` — serves on `http://localhost:8766` (avoids design-system-builder's 8765) + opens browser.
2. Print handoff line:
   > ✅ Explainer live at **http://localhost:8766**. Iterate by editing the file and refreshing. Print → PDF via ⌘P.
3. Await user's feedback. Iterate on prose, diagram shapes, section order via targeted edits.

## Key file map inside this skill

| When you need to… | Load |
|---|---|
| Ask the right question at Phase 1 | `references/question-flow.txt` |
| Understand each mode's anatomy | `references/mode-anatomy.txt` |
| Pick the right diagram tech (SVG / Mermaid / D3 / D2 / Excalidraw) | `references/diagram-catalog.txt` |
| Apply the right layout pattern (sticky-graphic / side-by-side / hero) | `references/layout-patterns.txt` |
| Get the exact `@media print` rules for report mode | `references/print-css.txt` |
| Know the rules for slide decks (one-idea, fragments, presenter notes) | `references/slides-anatomy.txt` |
| Run the final QA pass before handoff | `references/qa-checklist.txt` |

## Bundled scripts

| Script | Purpose |
|---|---|
| `scripts/preview.mjs` | Serves `docs/explain/<slug>/` on `http://localhost:8766`, opens browser. Required — never hand `file://` URLs. |
| `scripts/export-pdf.mjs` | Headless-Chromium PDF export for `report` mode. Optional — user can also use browser's ⌘P. |

Zero deps (Node ≥ 18).

## Bundled templates

| Template | Purpose |
|---|---|
| `templates/report.html.txt` | Single-doc print-ready skeleton with `@media print` block. |
| `templates/landing.html.txt` | Multi-section navigable skeleton with in-page ToC + scroll-spy + anchor sections. |
| `templates/slides.html.txt` | Pure-CSS + tiny-JS slide deck (< 60 LOC keyboard handler). Presenter view via `?p` query param. |
| `templates/shared-styles.css.txt` | Base type + spacing + tokens, imports `design-system/styles.css` if present. |
| `templates/diagram-svg-primitives.svg.txt` | Reusable inline SVG patterns — boxes with labels, arrows with heads, connectors, sequence-diagram frames. |

## Voice + polish

- **Every artifact reads like a designer + writer collaborated.** Not "a lot of text" or "a lot of diagrams" — the RIGHT text next to the RIGHT diagram. Prose is tight, diagrams are load-bearing.
- **No hedging.** State the concept, show the diagram, move on. Cut every sentence that starts with "essentially", "basically", "in essence".
- **Diagrams have captions.** Every non-decorative diagram has a one-line caption below it — what the reader should learn from it.
- **Progressive disclosure over information dump.** `<details>` for supplementary explanations that would clutter the primary flow.
- **Print mode is a first-class citizen for report mode.** Every design decision considers "how does this look on paper?"

## Failure modes to catch yourself

- **AI-slop aesthetics** — purple gradients on white, generic hero images, rounded-XL cards on every element. Fix: apply design-system tokens; if none, use `references/layout-patterns.txt` defaults.
- **Text without diagrams in a request for visual explanation** — if the user asked for "explain visually", every major section MUST have a diagram, table, or comparison. Text-only sections = failed brief.
- **Diagrams without captions** — reader has to guess what they're seeing. Every diagram gets a one-line caption.
- **`file://` links given to the user** — Chrome blocks iframes, fonts, some assets. ALWAYS serve via `preview.mjs`.
- **Missing `@media print` in report mode** — user can't PDF-export cleanly. Report mode WITHOUT `@media print` = failed output.
- **Slide decks with more than one idea per slide** — attention fragments. One primary idea, one supporting diagram or example, optional 2-3 bullets.
- **Emoji in section headings** — dates the artifact instantly; screams AI. Ban them by default.

## Handoff

When the artifact is live at `localhost:8766`, print:

> ✅ Explainer live at **http://localhost:8766** (or the port `preview.mjs` printed). Iterate by editing files and refreshing. Print → PDF via browser's ⌘P.
>
> To share: `open http://localhost:8766` from any device on this network, OR upload the folder to Cloudflare Pages / GitHub Pages / Vercel for a public URL.
