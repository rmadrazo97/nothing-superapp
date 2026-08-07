---
name: stack-architect
description: Pick the right tech stack + hosting + folder structure for a new product in one interactive session. Green-field decision skill (not codebase reverse-engineering) — asks about distribution targets (web / PWA / native / cross-platform / desktop / API / MCP / CLI), preferred technologies, hosting preferences, and budget (free tier is a first-class option) — then outputs a single `stack-blueprint.md` that names every choice, cites cost + trade-offs, and hands a ready-to-run scaffold to the next builder skill. Supports multi-target products (a PWA primary + native shells + MCP server, sharing what can be shared). Use for "pick our stack", "what should we build this with", "which hosting", "help me choose between X and Y", or the architecture phase of any new product (comes after the design system, before code). Not for reverse-engineering an existing codebase — for that use `technology-stack-blueprint-generator`.
license: MIT
metadata:
  author: jmadrazo7 (Nothing Superapp Build Kit)
  version: "0.2.0"
  changes: "v0.2.0 — added mandatory § 11 Prerequisites & Access section (accounts to create + env vars + local dev prerequisites + configuration steps) so the blueprint is not just 'stack decided' but 'ready to actually start coding'. Expanded rule set to require analytics/observability integration details (SDK choice, key events, GDPR posture), not just the vendor name."
---

# Stack Architect

Pick the right stack for a new product **in one interactive session** and hand the next builder skill a single markdown blueprint it can execute against. Green-field, opinionated, budget-aware.

The skill is **interactive by default**: you (the agent) walk a short question flow to gather intent — product concept, distribution targets, tech preferences, hosting preferences, budget — then propose a lock, get confirmation, and generate `stack-blueprint.md`. The blueprint IS the deliverable.

**Not** for reverse-engineering an existing codebase (that's `technology-stack-blueprint-generator`). This skill decides what to build with **before** the code exists.

## When to use

- User says "pick our stack", "what should we build this with", "which hosting", "help me choose between X and Y", "kick off the architecture phase".
- User just finished a **PRD or design system** and needs to decide the tech + hosting + folder structure before code starts.
- User is comparing 2-3 stacks and wants a **budget-and-target-informed** recommendation.
- Product is **multi-target** (PWA + native + MCP + CLI) and needs a coherent shared-vs-per-target decision.

If a stack is already locked, **skip this skill** and hand off to the builder (`/next-gen-landing-builder` for landing, or whichever framework skill applies).

## What you produce

**One file: `stack-blueprint.md`** (default location: `./stack-blueprint.md` at the repo root, or `docs/architecture/stack-blueprint.md` in an existing repo). Structure:

```
 1. Product summary            — one-line concept + primary + secondary targets
 2. Locked decisions           — the concise decision matrix (framework / hosting / db / auth / payments / deploy per role)
 3. Rationale                  — 3-5 lines per major decision saying WHY this over the alternates
 4. Cost envelope              — free-tier limits, expected mo/yr cost at 100 / 1k / 10k users
 5. Folder structure           — full tree for each target (PWA / native / MCP / etc.), naming conventions
 6. What's shared vs per-target — the design tokens, the types, the API contract, the auth
 7. Scaffold commands          — the exact CLI commands to bootstrap this stack (npm create, capacitor init, etc.)
 8. Trade-offs accepted        — the honest "we're choosing X over Y and here's the cost" list
 9. Migration paths            — how to graduate from free-tier to paid if the app takes off
10. Next steps                 — hand-off line for the next skill / builder
11. Prerequisites & Access     — accounts, env vars, local dev prereqs, config steps needed BEFORE scaffold
```

This is a **decision brief**, not a tutorial. It should be readable in 5 minutes and executable immediately after.

## The output rules (non-negotiable)

1. **Free tier is a first-class choice.** If the user says "free" or "no budget", the blueprint must ship a stack that runs at $0/mo up to real user thresholds (~100-1k users). Never suggest "$X/mo starter plan" when a free tier exists that fits.
2. **Every locked decision cites at least ONE alternate.** "Chose Supabase" is not enough — must be "Chose Supabase over Neon+Clerk+S3 because [reason]." Reader learns what was rejected and why.
3. **Cost envelope is real numbers, not "cheap".** "$0/mo up to 50k rows + 500MB storage + 2GB egress" beats "affordable". Cite the actual free-tier ceiling.
4. **Folder structure is drawn, not described.** ASCII tree at each target's root. Naming conventions in a table below it.
5. **Multi-target products name what's shared.** Design tokens, TypeScript types, API contract, auth session — if it's shared across targets, the blueprint must call it out as `packages/shared/*` (or equivalent) with its own section.
6. **Scaffold commands are runnable.** No `pnpm create ...` if the user picked npm. No `pnpm workspace` in a stack that doesn't use workspaces. Test the sequence in your head before writing.
7. **Never invent a service that doesn't exist.** Check `references/hosting-catalog.txt` — if a service isn't listed, either add it (verified against current docs) or don't recommend it.
8. **Prefer boring over trendy for infra, and prefer trendy over boring for DX.** Postgres > any new SQL flavor; TanStack Query > hand-rolled fetch; Next.js > custom SSR; but pick the current best DX layer (shadcn > Bootstrap).
9. **Name the decision-maker.** Every section ends with "Locked by: <human-reason>" — user preference / budget constraint / design system pin / target constraint. So future-you can trace WHY.
10. **The blueprint is versioned.** Header includes date + "v1" + a change-log stub. When stack decisions change, we bump.
11. **Prerequisites section is not optional.** § 11 must include: (a) every account to create with signup URL, (b) every env var with format + where to source it, (c) local dev tools with min versions, (d) one-time config steps in each vendor's dashboard. Missing prereqs is what makes a "locked stack" fail to ship. See `references/credentials-catalog.txt` for the per-service credential inventory.
12. **Analytics + observability decisions include integration specifics, not just vendor names.** For each: (a) cloud vs self-hosted, (b) SDK(s) per target, (c) first-week event list to instrument, (d) session replay / privacy posture (opt-in, EU-hosted, PII masking), (e) any reverse-proxy pattern (e.g. PostHog through Next.js to bypass ad-blockers).

If a user request forces breaking one of these rules, ASK before doing it.

## Process — the 4 phases

### Phase 1 — Ground (1 message)

Ask ONE upfront question to route:

> "What are you deciding a stack for — a fresh product, or a specific piece of an existing product (e.g. just the API, just the mobile shell)?"
>
> Options: **Fresh product (full stack)** · **One layer of an existing product** · **Comparing 2-3 stacks head-to-head**.

Route:
- **Fresh product** → full intake (Phase 2).
- **One layer** → skip target questions, ask only about that layer + how it connects to the rest.
- **Head-to-head** → skip most preference questions, focus on the delta between the alternates.

Then ask (still in Phase 1): "Do you have a design system, PRD, or product brief I should read first?" If yes, read the files BEFORE asking any question those files would answer. `nothing-superapp/design-system/theme.json` and `nothing-superapp/services/growth/campaigns/nothing-superapp/brief.md` are the current-project canonical inputs.

### Phase 2 — Interactive intake (2-4 short batches)

Read `references/question-flow.txt` for the full tree. Ask in batches of **2-4 questions per turn**. Core coverage:

- **Product concept** (one paragraph — the user's own words)
- **Primary distribution target** — web / PWA / native iOS / native Android / cross-platform (React Native / Flutter / Capacitor) / desktop (Electron / Tauri) / API-only / MCP server / CLI
- **Secondary targets** (multi-select) — the other surfaces the same product ships to
- **Preferred tech (if any)** — React / Vue / Svelte / SwiftUI / Kotlin / Go / Rust / Python / Elixir / — or "you decide"
- **Preferred hosting** (if any) — Vercel / Cloudflare / Fly / Railway / Supabase / Firebase / AWS / self-hosted / — or "you decide, free-first"
- **Database preference** — Postgres / SQLite / D1 / DynamoDB / MongoDB / — or "you decide"
- **Auth** — social OAuth / email-magic-link / passkeys / SSO / anonymous — or "simplest that works"
- **Budget tier** — **free ($0/mo)** / **bootstrap (<$50/mo)** / **funded (<$500/mo)** / **enterprise (uncapped)**
- **Team size** — solo dev / 2-5 / 5+ (affects monorepo vs polyrepo, IaC choice, CI complexity)
- **Ship urgency** — this week / this month / this quarter (affects "boring choice" vs "learn a new tool" trade-offs)
- **Compliance / geography** — GDPR / HIPAA / SOC2 / data residency (affects hosting choice)
- **What we WON'T use** — the "no Firebase" / "no Vercel" / "no Google" / "no npm" rules if any

After the last batch, **echo back the locked answers** as a compact summary (target list + tech pref + hosting pref + budget + urgency + hard rules) and get a **yes/lock-it confirmation**.

### Phase 3 — Recommend + refine

The agent proposes a full stack across every role: **frontend framework, styling, state, forms, backend framework, database, ORM, auth, payments, storage, email, analytics, error tracking, CI/CD, hosting, domain, monitoring, feature flags**. Uses `references/target-recipes.txt` as the base (proven combos per target × budget), overlays user preferences and hard-rules, then presents:

```
STACK RECOMMENDATION — Nothing Superapp

Primary: PWA (Next.js 16 + Tailwind v4 + shadcn/ui)
Secondary: iOS + Android via Capacitor 6

Frontend         · Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui
State            · TanStack Query · Zustand · React Hook Form + Zod
Backend          · Next.js Route Handlers · Supabase Edge Functions for jobs
Database         · Supabase Postgres (Free: 500MB, 2GB egress)
Auth             · Supabase Auth (Apple / Google / magic link)
Payments         · Stripe (PWA) + RevenueCat (native)
Storage          · Supabase Storage (Free: 1GB)
Email            · Resend (Free: 3k/mo)
Deploy           · Vercel Hobby (Free) + Capacitor Live Updates via AppFlow (Free trial)
CI/CD            · GitHub Actions (Free: 2k mins/mo)
Monitoring       · Vercel Analytics + Sentry (Free: 5k events/mo)

Cost envelope    · $0/mo up to ~500 signed-in users. First paid dollar at ~$25/mo (Vercel Pro).
Multi-target     · PWA + iOS + Android from ONE Next.js codebase via Capacitor.

  Reply "lock it" to generate the blueprint, or tell me what to change.
```

If the user pushes back on any pick, swap that role without re-asking everything else — regenerate the summary.

Once locked, proceed to Phase 4.

### Phase 4 — Generate + deliver

1. **Write `stack-blueprint.md`** at the chosen path (default `./stack-blueprint.md`). Use `templates/stack-blueprint.md.txt` as the skeleton; fill every `{{...}}` placeholder with the locked answers + the reasoning from your Phase 3 recommendation.
2. **Sanity grep for unfilled placeholders:** `grep "{{" stack-blueprint.md` should return 0 hits.
3. **Print the handoff line:**
   > ✅ Stack locked at `./stack-blueprint.md`. Hand this to your framework builder (or `/swarm-dev` for a full PRD → PR cycle). Bootstrap commands are in § 7.
4. Offer the natural next step: "Want me to run the scaffold commands (§ 7) now, or leave it for you to review first?"

## Key file map inside this skill

| When you need to… | Load |
|---|---|
| Ask the right question at the right time | `references/question-flow.txt` |
| Recommend a framework by role (frontend / backend / db / auth / etc.) | `references/stack-catalog.txt` |
| Recommend a hosting service with its actual free-tier ceiling | `references/hosting-catalog.txt` |
| Recommend a full-stack recipe for a target (PWA, native, MCP, CLI) | `references/target-recipes.txt` |
| Draw the folder tree for the chosen stack | `references/folder-conventions.txt` |
| Understand what changes at each budget tier | `references/budget-tiers.txt` |
| Fill § 11 Prerequisites (accounts, env vars, config steps per service) | `references/credentials-catalog.txt` |
| Run the final QA pass before delivery | `references/qa-checklist.txt` |

## Bundled scripts

| Script | Purpose |
|---|---|
| `scripts/build-blueprint.mjs` | Reads a locked `answers.json`, substitutes the template, writes `stack-blueprint.md`. Optional convenience — the agent can also fill the template directly with the Edit tool. |

Dependency-free (Node ≥ 18). No install step.

## Voice + polish

- The blueprint reads like a **staff engineer briefing a team over coffee**. Not "we could use X" — "we chose X, here's why, here's what breaks if we change our mind." Confident, sourced.
- **No hedging.** "You might want to consider..." is banned. State the pick, cite the alternate, move on.
- **Free tier limits are always cited with the actual number.** "Vercel Hobby is free" is not enough — "Vercel Hobby: free up to 100 GB bandwidth / mo, 100k function invocations / day, 1k Middleware invocations / day; first paid dollar at $20/mo Pro."
- **Multi-target sections name the ONE codebase pattern.** Not "you'll build for iOS separately" — "The PWA and native shells share ONE Next.js codebase; Capacitor wraps the same build."

## Failure modes to catch yourself

- **Recommending a paid service when a free one covers the user's traffic.** Always check `hosting-catalog.txt` free-tier ceilings against the user's declared scale.
- **Multi-target confusion.** If the user picks PWA + iOS + Android, the blueprint MUST explicitly state whether they share a codebase (Capacitor / Expo Router) or not (SwiftUI + Kotlin separate). No handwaving.
- **Naming a service the user said no to.** Grep your recommendation against the "What we WON'T use" list from intake.
- **Missing a required role.** Every stack must name: frontend, backend, database (even if it's "none — client-only"), auth, deploy. Missing any = incomplete blueprint.
- **Trendy pick without a "why not the boring option".** If you pick Bun over Node, or Turso over Postgres, name what you'd lose. If you can't, pick the boring option.
- **Scaffold commands that don't run.** Test the sequence mentally: does `npx create-next-app` run before `npx cap init`? Do the flags exist in the current version?

## Handoff

When the blueprint is delivered, print two lines:

> ✅ Stack locked at `./stack-blueprint.md` — 10 sections, every decision sourced, free-tier cost envelope, runnable scaffold commands in § 7.
>
> Next step: hand it to your framework builder (`/next-gen-landing-builder`, `/swarm-dev`, or the target's canonical scaffold), or say "scaffold it" and I'll run § 7 now.
