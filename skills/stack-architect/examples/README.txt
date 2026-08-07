# Examples

Reference blueprints produced by this skill. Read one alongside a fresh run to see the tone bar.

## Nothing Superapp -- multi-target PWA + Capacitor + Supabase

- Location: `nothing-superapp/stack-blueprint.md`
- Primary: PWA (Next.js 16 + Tailwind + shadcn on the locked design system)
- Secondary: iOS + Android via Capacitor 6
- Budget: Free tier ($0/mo initial), bootstrap upgrade path (~$45/mo at ~10k DAU)
- Uses design tokens from `nothing-superapp/design-system/styles.css`

Read this to see:
- A real multi-target blueprint (PWA primary + native shells sharing one codebase).
- Free-tier cost envelope with the actual numbers.
- Every decision paired with the alternate considered.
- Scaffold commands that actually run in order.

## When your blueprint falls short of the bar

| Symptom | Fix |
|---|---|
| Blueprint reads generic -- could apply to any product | The rationale sections are too shallow. Reference the specific product concept in every "why". |
| Cost numbers are vague ("cheap", "generous") | Substitute the actual free-tier ceiling from `references/hosting-catalog.txt`. |
| Multi-target hand-wavy | The "What's shared vs per-target" section is where multi-target coherence lives. Draw the monorepo tree. |
| Scaffold commands don't run in order | Test-read the commands top-to-bottom. Does `npx create-next-app` run before `npx cap init`? Does the package manager stay consistent (npm vs pnpm)? |
| Trade-offs section is empty | Every green-field decision has a rejected alternative. Name it. |
