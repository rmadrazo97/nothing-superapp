# Examples -- gold-standard reference systems

The two Claude Design-shipped skins below are the bar this skill aims for. When you are generating a new system, open one of them side-by-side and check: does your output *feel* as considered? If not, iterate on `readme.md` prose and/or ramp choice -- not the templates.

## Nocturne -- dark ground, mono blurple, Inter/Inter

Claude Design ships Nocturne as its dark-interface reference. Study:

- `styles.css` -- the token block + component layer. Note the OKLCH-derived ramps at consistent perceptual step size, the ground-aware shadow tokens, and the `color-mix()` hovers over ramp steps for interactive states.
- `readme.md` -- the tone bar. Every choice is explained with WHY, not WHAT. The "Do" and "Don't" sections read like a designer briefing an engineer.
- `theme.json` -- the machine-readable seed.

## Broadsheet -- light ground, duo cyan+magenta, Source Serif 4

Claude Design ships Broadsheet as its editorial-print reference. Study:

- The duo scheme -- two accents at similar L, ~130 degrees apart in hue. Polychrome without the polychromatic mess.
- The halftone image treatment -- a signature aesthetic move that is one CSS class.
- The serif type direction -- same family for display + body, weight (600) driving heading contrast rather than a second family.

## Where to find the raw files

If you have the Claude Design MCP or you have downloaded the reference zips (as this skill's author did during authoring), the exemplars live at (paths may vary):

```
/tmp/ds-refs/Nocturne/
/tmp/ds-refs/Broadsheet/
```

They are NOT bundled inside this skill -- they are Anthropic's shipped reference material, not ours to redistribute. Recreate them by loading the skins in Claude Design if you want a fresh copy.

## When your output falls short of the bar

Symptoms to fixes:

| Symptom | Fix |
|---|---|
| The system feels "flat" -- swatches are lively but the composition reads generic | The `readme.md` direction paragraph is too weak. Rewrite it with concrete moves (which classes, when to reach for which ramp step, image treatment rationale). |
| Colors feel like a random palette, not a system | Ramps drifted in chroma across steps. Regenerate via `scripts/generate-ramps.mjs`. |
| Buttons look "off" against the ground | Wrong `buttonStyle` choice for the ground. Outline reads editorial; filled reads consumer. Reconsider. |
| The whole thing looks like Bootstrap | You are using too many colors and too little type contrast. Cut back to one accent, lift the heading weight up. |
| Focus rings are inconsistent across components | You edited `outline: none` somewhere. Search-and-destroy. |
