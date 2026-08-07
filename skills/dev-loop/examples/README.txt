# Examples

Real dev-loop runs that other users (or future-you) can read side-by-side while running their own loop, to see the tone bar for spec.md, task briefs, and judge-log entries.

## Nothing Superapp -- Calorie tile (first real feature)

- Location: `docs/dev-loop/calorie-tile/`
- Tier: M
- Primary target: PWA + Capacitor native shells
- Backend: Supabase Edge Function (Deno/TS) for LLM parse
- Model tier config: advisor mode -- Sonnet exec + Opus advisor + Haiku judge
- Task count: ~6 (Drizzle schema, parse endpoint, tile UI, detail page, HealthKit calorie deltas, tests)
- Loop wall time: ~35 min (start-to-green with 2 judge iterations across the pack)
- Cost profile: ~$1.10 (advisor mode; would be ~$3.20 in direct mode with Opus executor)

Read this to see:
- A real spec.md with all 13 sections filled from stack blueprint + design system pins
- Task briefs that pass the 10-section anatomy check
- Watch-mode intercept mid-flight when user realized meal timestamps needed timezone handling
- Advisor consultation for server-vs-client-side parse decision (documented in decisions.md)
- Judge verdicts + one re-queue after a missing empty-state test

## Anti-patterns to reject on sight

| Symptom | Fix |
|---|---|
| Task brief has vague DoD ("looks good", "clean") | Rewrite DoD as a shell command with exit code |
| Task file missing "reusable patterns to grep" section | Add it -- run: rg "helper|hook|useX" apps/web/src/ against the acceptance criteria |
| Owned files overlap between two tasks | Re-decompose -- one owner per file |
| Judge complaining about "code quality" | The judge is not a reviewer -- fix DoD instead |
| Watch mode ate a question as a spec amendment | Improve the classifier prompt in references/watch-mode.txt |
| Same task fails judge 3+ times with the same complaint | Spec is wrong -- escalate to advisor, don't just retry |
| Advisor called on every worker turn | Trigger list is too permissive -- tighten it in the task brief |
| Task > 200 LOC or > 3 new files | Split into vertical slices; horizontal-layer split is wrong |

## How to use a past run as a template

For the Nth run of a similar-shape feature (e.g. building the next tile after calorie):

1. Copy `docs/dev-loop/calorie-tile/spec.md` → `docs/dev-loop/<new-slug>/spec.md`
2. Rewrite the Outcome + User Stories + Acceptance sections; keep the Stack/Design pins mostly intact
3. Copy the task pack folder if the shape maps 1:1; else regenerate at Phase 3
4. Run scripts/build-taskpack.mjs --validate <new-slug>/ before executing

Reuse of the past-run shape saves ~5 min of Phase 2 drafting per feature.
