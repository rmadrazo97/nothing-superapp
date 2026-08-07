# Examples — flagship demo of the /explain skill

## explain-slides.html — self-referential slide deck for /explain

The 12-slide deck for the /explain skill itself, built BY the /explain skill in one prompt. The demo IS the proof. Preview:

```bash
cd examples
python3 -m http.server 8766
# open http://localhost:8766/explain-slides.html
```

Or use the skill's built-in preview script (once `scripts/preview.mjs` is in the skill):

```bash
node scripts/preview.mjs examples/
```

### What to look for as the tone bar

- **Editorial restraint** — Fraunces display + Inter body + JetBrains Mono for data. No purple gradients, no emoji-in-headers, no rounded-XL cards. Anthropic-tier magazine feel, not startup-pitch tier.
- **One big idea per slide** — display type does the heavy lifting; body prose supports rather than competes.
- **Coral as signal, not ornament** — the Claude coral (#DA7756) appears as one moment per slide (an underline, a small dot, a sunburst mark). Never as a background flood.
- **Every slide could stand alone as an X post screenshot** — that's the viral bar. If a slide fails that test, it hasn't earned its place.
- **The meta wink at slide 10** — "this deck was built by /explain" — the demo IS the proof. This is what makes the deck memorable + shareable.

### Reuse pattern

Copy `explain-slides.html` as a starting point for your own decks. Preserve the CSS token block (`:root { ... }`) — that's the design system. Replace the slide `<section>` blocks with your content. Keep the keyboard-nav script at the bottom unchanged.

For decks about a different topic in a different aesthetic:
- Swap the color tokens in `:root { ... }`
- Swap the font `@import` at the top
- Keep the structural CSS + JS

## Anti-patterns rejected on sight (from the reference deck)

| Symptom | Fix |
|---|---|
| More than one primary idea per slide | Split into two slides. Attention fragments. |
| Emoji in section headers | Remove. Ages instantly, screams AI. |
| Coral as a full background | Restrain to a signal — underline, dot, or 8-pointed asterisk. |
| Rounded-XL cards with drop shadows | Flat surfaces + hairline dividers. Nothing after 2015 needs a card shadow. |
| Text at < 2vh in slide mode | Increase — projector distance readability minimum. |
| Emoji-decorated bullet lists | Numbered + labeled, or drop the visual noise entirely. |
| Purple / blue-purple gradients anywhere | Straight to trash. Never. |
| Stock hero photos | Inline SVG diagrams or nothing. |

## The design system this deck ships with

Colors: warm off-white bone (`#FAF9F7`), cream surface (`#F2EFEA`), deep espresso ink (`#2A2622`), Claude coral (`#DA7756`).

Fonts: Fraunces (display, weights 400/600/900), Inter (body, 400/500/600/700), JetBrains Mono (data, 400/500). All from Google Fonts, one `<link>` tag.

Type scale: display-xl clamp(72px, 12vw, 160px) · display-lg clamp(48px, 7vw, 96px) · display-md clamp(32px, 4vw, 56px) · heading 28px · body 20px · label 12px UPPERCASE · data 18px monospace.

Ornament: an 8-pointed asterisk in coral as the brand mark — gestures at the Claude sunburst logo without copying it.

This same set of tokens is what /explain will produce for any explainer artifact when the repo does NOT have a `design-system/styles.css` to auto-detect. If a repo DOES have one, /explain uses those instead — the deck for Nothing Superapp would look like Nothing OS, not like Anthropic.
