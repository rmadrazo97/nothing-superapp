---
name: dev-loop
description: Turn one raw dev requirement into a formal spec + parallelizable task pack + run-to-green executor in one interactive session. Per-task model-tier routing (executor / advisor / judge), evidence-based DoD (shell exit code, never adjectives), harness-agnostic tier config, durable workspace state at `docs/dev-loop/<slug>/` (Ralph-loop pattern — resumable across chat compaction), watch-mode spec amendments during execution with a confirm gate. Enforces locked `stack-blueprint.md` + `design-system/styles.css`; refuses to invent stack or styling. Interactive — asks a short question flow, drafts spec with Opus advisor, decomposes into tracer-bullet vertical slices, runs Sonnet workers in parallel with Haiku judges. Use whenever the user says "build X", "implement this feature", "let's tackle Y" after stack + design system are locked. Not for reverse-engineering; not for org-scale PR pipelines.
license: MIT
metadata:
  author: jmadrazo7 (Nothing Superapp Build Kit)
  version: "0.2.0"
  changes: "v0.2.0 — applied Fable-tier panel review: (a) watch mode Class A now confirm-gated; drift matrix uses impact filter; race-conditions closed via monotonic spec_version; (b) SKILL Rule 5 gains contract-task exception; Rules 15 (rollback per task) + 16 (no task modifies orchestrator files) added; when-not-to-use expanded; Phase 7 gains preview-deploy + DoD-output-print + diff-open options; (c) task-brief reordered — worker turn protocol + escape hatch at top; missing escape hatches added (DoD-broken, reusable-mismatch, criterion-untestable); (d) anatomy reordered — DoD + AC above ownership; ownership merged; progress-log-contract now required section; reject-on-sight anti-patterns catalogued. Script-level spec_version tracking scheduled for v0.3."
---

# dev-loop

Take one raw development requirement through **7 gated phases**: **Size → Clarify → Spec → Decompose → Approve → Execute → Deliver.**  Produce a working branch with tests green — bounded, resumable, and cheap.

The skill is **interactive** at Phase 1 (ambiguity elimination) and at Phases 4 + 7 (human approval). Between them, the skill runs. The spec, the task pack, and every judge verdict live on disk under `docs/dev-loop/<slug>/` so the loop survives chat compaction, session restarts, and mid-flight direction changes.

**dev-loop is the successor to swarm-dev's execution phases** — its executor is bespoke to the task-brief shape produced here (per-task tier map, evidence-based DoD, advisor-consultation triggers, watch-mode drift checks). It is not a wrapper around swarm-dev.

## When to use

- User says "build X", "implement this feature", "add Y to the app", "let's tackle Z next", "the next thing we need is …".
- The stack is locked (`stack-blueprint.md` exists) and the design system is locked (`design-system/styles.css` exists) — dev-loop refuses to invent either.
- You want a **cost-controlled** ship where an executor (Sonnet) does the bulk work and only escalates to an advisor (Opus / Fable) at decision points.
- The user is running iteratively, wants to loop the same skill many times per week without rebuilding the pattern each time.

**When NOT to use:**
- Green-field: you're deciding tech + hosting → use `stack-architect` first.
- Design decisions before code → use `design-system-builder` first.
- One-shot inline edits < 20 LOC in a single obvious file → just do it.
- Full org-scale PR pipeline with dedicated review swarms, land automation, release gates → chain to `/land-and-deploy` after dev-loop's Gate B.
- **Pure bug fix with a failing test in hand** → skip Phase 2 spec, produce a single-task pack directly. dev-loop over-ceremonies a red-test fix.
- **Spike / throwaway prototype** where the goal is *learn* not *ship* → use a scratch branch; dev-loop's DoD-and-judge rigor is wrong for exploration.
- **Data migration / one-time backfill scripts** → different DoD shape (idempotency + dry-run) that the current spec template doesn't cover well. Use a scripted approach with manual review.

## What you produce

Every invocation writes to `docs/dev-loop/<slug>/` — the Ralph-loop workspace. The chat context is disposable; these files carry the state.

```
docs/dev-loop/<feature-slug>/
├── spec.md                ← Phase 2 — the source of truth, reloaded every iteration
├── tasks/
│   ├── 01-<slug>.md       ← Phase 3 — one task = one self-contained subagent prompt
│   ├── 02-<slug>.md
│   └── …
├── tier-config.yaml       ← Phase 3 — per-run model routing (harness-detected + editable)
├── deps.json              ← Phase 3 — task_id → [blockers] dependency graph
├── status.json            ← Phase 5 — task_id → pending | running | done | blocked | failed | drift
├── progress.md            ← Phases 5-7 — append-only lab notebook (what happened, when, why)
├── judge-log.md           ← Phase 6 — per-task verdict + evidence (file:line refs)
└── decisions.md           ← Phase 5-6 — every advisor consultation + guidance + how applied
```

At the end you have: **the task pack on disk + a working feature branch with tests green + judge verdicts on every task**. Ready to hand to `/land-and-deploy` (or `/swarm-dev` for a heavier pre-land review if you want it).

## The output rules (14 — non-negotiable)

1. **Every task has evidence-based definition-of-done.** A shell command exit-code is the oracle. No adjectives ("polish", "improve", "clean up"). See `references/task-brief-anatomy.txt`.
2. **Every task cites its spec section.** No task orphaned from the spec.
3. **Every task names files it owns AND files off-limits.** Owned lists are checked against other tasks — no overlap.
4. **Every task specifies executor + advisor + judge tiers.** Routine tiers may inherit from `tier-config.yaml` defaults without per-task justification. Any override from defaults MUST include a one-line "why this tier" in `tier_rationale`.
5. **Every task is a tracer-bullet vertical slice.** Thin, demoable end-to-end, cuts all layers (schema → API → UI → tests). No horizontal-layer decompositions — with ONE exception: a **contract task** is allowed if it (a) produces only type/schema/migration artefacts, (b) is a blocker for ≥ 2 downstream vertical slices in `deps.json`, and (c) its DoD is a compile/typecheck/migrate-up command. Max one contract task per pack. Contract tasks land first (Phase 3 § "Ordering matters").
6. **Every task fits within a single vertical slice:** ≤ 1 migration + ≤ 1 endpoint + ≤ 1 UI surface + supporting tests, OR ≤ 200 LOC / 3 new files as a fallback heuristic when the slice shape isn't obvious. A 250-LOC React tile is fine; a 180-LOC schema+API+UI+worker is not. Split by slice count, not by LOC ceiling alone.
7. **Every task references the stack blueprint sections + design system tokens it must respect.** Non-negotiable stack-consistency.
8. **Every task has a "grep for reusable patterns" preamble.** Before writing new helpers, workers must check if one exists. Reuse > invent.
9. **Every task has a "when to consult the advisor" list.** Explicit escalation triggers, not vibes. Empty list = executor never needs the advisor.
10. **Every task has a stop condition** — bounded on ALL of: (a) turn cap (default 15), (b) wall-clock cap (default 30 min), (c) judge-fail streak (default 3 identical fails → escalate), (d) unrequested-file-touch (immediate stop on first boundary violation). Prevents runaway loops via multiple gates, not just one.
11. **Phase 4 human approval gate is non-negotiable.** Never auto-execute without an explicit "go".
12. **Judge loop bounded.** Default max 10 iterations per task (configurable in `tier-config.yaml`).
13. **The skill reads `stack-blueprint.md` and `design-system/styles.css` before Phase 2.** Refuses to invent stack or styling. If either is missing, punts back to the appropriate prior skill.
14. **Advisor consultations are logged** to `decisions.md` with input + guidance + how it was applied. Audit trail for future runs.
15. **Every task declares a rollback command** in its frontmatter — `git range` for pure code, feature-flag toggle for gated features, `migrate-down` command for schemas. A failed mid-pack task must be revertable without archaeology.
16. **No task modifies orchestrator files.** `spec.md`, `tier-config.yaml`, `deps.json`, `status.json`, `progress.md`, `judge-log.md`, `decisions.md`, and OTHER tasks' `.md` files are all off-limits by default — only the orchestrator (or the human via watch mode) writes them. Any task touching these = hard fail.

## The 7 phases

### Phase 0 — Size (30 seconds, mandatory)

Classify the requirement and state the tier + a one-line reason in your first message:

| Tier | Signals | Loop shape |
|---|---|---|
| **S** | Single file / < ~50 LOC / no schema or API change | No task pack — just do it inline, judge yourself, skip Phases 3-6. |
| **M** | Few files in one subsystem, one migration or endpoint | 3-6 tasks, 1-2 executors in parallel, 1 judge. |
| **L** | Cross-cutting, multiple subsystems, schema + API + UI + tests | Full 7-phase run; parallel executor fleet; judge per task. |

Tier per phase, not just per task — a task can be M for spec but S for judging. Re-tier mid-run if scope grows.

### Phase 1 — Clarify (interactive intake, 1–3 short batches)

Ask the user, in batches of 2-4 questions via `AskUserQuestion`, only what the raw requirement doesn't already answer. Read `references/question-flow.txt` for the tree.

**Core coverage** (skip anything the requirement or the files under `docs/` already answer):
- Concrete outcome: "when this feature ships, a user can do WHAT?"
- Scope: what's IN vs OUT — a "non-goals" list is mandatory
- Files / paths the change lives inside (owned surface)
- Files / paths that MUST NOT change (immutable surface)
- Existing patterns to reuse (helper names, table names, existing endpoints)
- Definition of done: what shell command / manual check proves this shipped correctly
- Rollback plan if it breaks
- Any hard constraints (perf budget, byte-size cap, browser support minimum)

**Also do (silently, without asking):**
- Read `docs/architecture/stack-blueprint.md` — pin every tech choice.
- Read `design-system/styles.css` (or the appropriate design system entrypoint) — pin every visual choice.
- Read any existing `docs/dev-loop/*/spec.md` files for prior features that touch the same surface — check for design conflicts.

End Phase 1 with a **clarified-requirement summary**, formatted for the user to review. Await explicit "lock it" before Phase 2. This is the first gate but the lightest — one round-trip.

### Phase 2 — Formalize the spec

Detect the harness (see `references/tier-routing.txt`), consult the advisor at high effort to draft `spec.md`, executor at bulk-work tier to write. The spec follows the template at `templates/spec.md.txt` and includes:

1. **Concrete outcome** (Phase 1's answer, restated as a single sentence).
2. **User stories** — narrow, numbered, `As <user> I want <action> so that <benefit>`.
3. **Acceptance criteria** — observable behavior, expressible as test assertions.
4. **Non-goals** — explicit list of what will NOT ship.
5. **Owned surface + immutable surface** — file/path boundaries.
6. **Stack pins** — every choice from `stack-blueprint.md` this feature depends on, cited.
7. **Design pins** — every design system class / token this feature uses.
8. **Reusable patterns to grep** — the helpers, hooks, tables, endpoints that already exist and MUST be reused.
9. **Data-model changes** — Drizzle schema diffs, migration plan, rollback SQL.
10. **API surface** — new / changed endpoints with request + response types.
11. **Definition of done (machine-verifiable)** — the shell command that returns exit 0 when this feature ships.
12. **Rollback plan** — how to undo if it breaks in prod.
13. **Assumptions list** — Phase 3 will verify each of these against the actual code.

Save to `docs/dev-loop/<slug>/spec.md`. This is the source of truth every subagent reads at every step.

### Phase 3 — Decompose

Turn the spec into a **task pack** — one `tasks/NN-<slug>.md` per parallelizable unit, plus `deps.json` for the dependency graph, plus `tier-config.yaml` for model routing.

Each task follows the template at `templates/task-brief.md.txt` (see `references/task-brief-anatomy.txt` for the full anatomy). Non-negotiables per task:
- ≤ 200 LOC / 3 new files (split otherwise)
- Vertical slice (schema → API → UI → tests), demoable in isolation
- Named owned files + off-limits files (no overlap with other tasks)
- Explicit tier map (executor / advisor / judge) with a one-line "why"
- Evidence-based DoD (shell command)
- Reusable-patterns grep preamble
- Advisor escalation triggers list

**Ordering matters.** First tasks should land the shared/contract layer (types, schemas, migrations). Downstream tasks depend on those and can then run in parallel.

**Tier assignment cheatsheet** (see `references/tier-routing.txt` for the harness-detection layer):

| Task nature | Default routing (Advisor Strategy) | Direct-tier alternative |
|---|---|---|
| Schema + migration | Sonnet exec + Opus advisor + Haiku judge | Opus exec + Sonnet review |
| Backend endpoint (routine CRUD) | Sonnet exec + no advisor + Haiku judge | Sonnet exec + Sonnet review |
| Backend endpoint (novel logic) | Sonnet exec + Opus advisor + Haiku judge | Opus exec + Sonnet review |
| Frontend tile (uses design system) | Sonnet exec + no advisor + Haiku judge | Sonnet exec + Sonnet review |
| Frontend tile (new interaction pattern) | Sonnet exec + Opus advisor + Sonnet judge | Opus exec + Sonnet review |
| Refactor / cleanup | Sonnet exec + no advisor + Haiku judge | Sonnet exec + no review |
| Documentation | Sonnet exec + no advisor + no judge | Sonnet exec |

User can override any task's tier in `tier-config.yaml` per-task or in the task's own frontmatter.

### Phase 4 — Approve (GATE A)

Print the task pack to the user in a compact table:

```
TASK PACK — <feature-slug>

  01  ▸ Drizzle schema for calorie_entries         [S, exec:sonnet, no adv, judge:haiku]  blocks: 02, 03
  02  ▸ POST /api/calorie/parse endpoint           [M, exec:sonnet, adv:opus, judge:haiku]  blocked by: 01
  03  ▸ Calorie tile UI (home grid + detail page)  [M, exec:sonnet, no adv, judge:haiku]  blocked by: 01
  04  ▸ HealthKit read for calorie deltas          [L, exec:sonnet, adv:opus, judge:sonnet]  blocked by: 03

  Total: 4 tasks · 2 parallelizable · estimated executor tokens: ~14k · estimated cost: ~$0.06

  Reply "execute" to run, or tell me what to change (split/merge/re-tier/re-order).
```

Await explicit "execute". User can request task-pack edits in prose — you edit `tier-config.yaml` / task files / deps and re-print.

### Phase 5 — Execute (parallel + watch-mode)

Spawn Agent workers per the dependency graph. See `references/phase-anatomy.txt` § Phase 5 for the full protocol. Rules:

- **Parallel where non-overlapping** (deps.json has no edge between tasks), **serial where blocked**.
- **Each worker gets its `tasks/NN-<slug>.md` file as its complete prompt.** No inline context beyond that. Self-contained by construction.
- **Workers write to `progress.md`** at meaningful step boundaries — that's how the orchestrator knows what's happening.
- **On worker completion**, orchestrator moves the task to `judge` phase 6.
- **Watch mode is on:** if a user message arrives during Phase 5, the orchestrator intercepts, treats it as a potential spec amendment (see `references/watch-mode.txt`), updates `spec.md` + affected task files if applicable, marks affected in-flight workers as "drift — will re-check after current turn", and continues.

### Phase 6 — Judge (evidence, not vibes)

For each completed task, spawn a **fresh-context** Haiku (default) or Sonnet judge with the task file + the actual diff + the DoD command's output. Judge returns:

```json
{
  "verdict": "pass" | "fail",
  "evidence_citations": ["src/api/calorie.ts:42", "…"],
  "unmet_criteria": ["…"],
  "unrequested_changes": ["…"],   // files touched that weren't in "owned"
  "reasoning": "…"
}
```

- **Pass** → mark done in `status.json`, log to `judge-log.md`, move on.
- **Fail** → re-queue with the judge's specific complaint appended to the task file, up to the bounded max (default 10 iterations from `tier-config.yaml`).
- **Unrequested changes** → hard fail. Boundary violations are non-negotiable.

Judges are cheap (Haiku), fresh (no context contamination), and narrow (one task, one DoD). This is where cost + reliability meet.

### Phase 7 — Deliver (GATE B)

Print the completion report:

```
✅ DELIVERED — <feature-slug>

  Tasks: 4 / 4 done · 0 failed · 3 judge iterations across the pack
  Branch: feat/calorie-tile · 12 commits · 187 LOC added / 3 modified
  Tests: pnpm test apps/web -- calorie ✓ · pnpm lint ✓ · pnpm typecheck ✓
  DoD command: passes (exit 0)

  Deferred: (none)

  Options:
  (a) Hand to /land-and-deploy for merge + prod deploy
  (b) Hand to /swarm-dev for a pre-land multi-dimension review
  (c) Open PR now (gh pr create) and let you review manually
  (d) Nothing — just leave it on the branch
  (e) Deploy to preview/staging URL first (Vercel/Fly preview) — the gap between "green branch" and "prod merge"
  (f) Print the DoD command output verbatim — eyeball what "passes" actually means before trusting the judges
  (g) Open the branch diff in the harness (`gh pr diff` / editor) for a 60-second human skim without full PR ceremony
```

Await user's choice. **Never merges on its own.**

## Key file map inside this skill

| When you need to… | Load |
|---|---|
| Ask the right clarifying question at Phase 1 | `references/question-flow.txt` |
| Understand the anatomy of a single task-brief MD | `references/task-brief-anatomy.txt` |
| Detect harness features + configure tier routing | `references/tier-routing.txt` |
| Run the judge phase correctly | `references/judge-protocol.txt` |
| Handle user chat mid-execution (spec amendments) | `references/watch-mode.txt` |
| Consult the advisor from inside a worker | `references/advisor-protocol.txt` |
| Understand each of the 7 phases in depth | `references/phase-anatomy.txt` |
| Run the final QA pass before Gate B | `references/qa-checklist.txt` |

## Bundled scripts

| Script | Purpose |
|---|---|
| `scripts/detect-harness.mjs` | Phase 0 — detect Claude Code vs Cursor vs generic, list available tier features, seed `tier-config.yaml`. |
| `scripts/build-taskpack.mjs` | Phase 3 — compile `spec.md` + `tier-config.yaml` into `tasks/*.md` + `deps.json`. |
| `scripts/run-orchestrator.mjs` | Phase 5-6 — dispatches workers per deps, watches for user chat, runs judges, drives to green. |
| `scripts/resume-loop.mjs` | Pick up an in-flight loop after chat compaction or restart. Reads `status.json`, resumes where it stopped. |
| `scripts/watch-drift.mjs` | Called from `run-orchestrator` when spec.md changes mid-flight — computes affected tasks + marks drift in `status.json`. |

All dependency-free (Node ≥ 18). Scripts are executable — the skill wraps them as documented but the user can also run any script directly.

## Bundled templates

| Template | Purpose |
|---|---|
| `templates/spec.md.txt` | The 13-section spec skeleton. Phase 2 fills it in. |
| `templates/task-brief.md.txt` | The per-task subagent prompt template — this is what a worker reads as its only input. |
| `templates/tier-config.yaml.txt` | The routing config — harness-detected defaults + per-task overrides. |
| `templates/judge-verdict.md.txt` | Judge output shape (JSON + narrative). |
| `templates/progress.md.txt` | Seed for the lab notebook. |

## Voice + polish

- **The spec + task files are your first-impression artifacts.** Read them as if a mid-level engineer with zero context should be able to open one file and know exactly what to build. Say WHY, not just WHAT.
- **No hedging.** "You might consider…" is banned. State the pick, cite the alternate, move on.
- **Every constraint has an escape hatch.** From `codex-first` — if you tell an executor "never do X", pair it with "if you find yourself needing to do X, STOP and write a status report — do not work around." Cornered workers hand-minify identifiers to pass gates; sanctioned exits prevent that.
- **Watch-mode intercepts are announced clearly.** Every intercept prints a `[watch]` line naming the class and action. Class A (spec amendment) is CONFIRM-GATED — preview the diff, wait for explicit "yes" from user, only then write. Never silent mutations. See `references/watch-mode.txt` for the full protocol.

## Failure modes to catch yourself

- **Skipping Phase 1.** Ambiguity that survives to Phase 2 becomes bugs in every task. Never auto-generate a spec without confirming the clarified requirement.
- **Skipping the stack + design pins.** A task that doesn't cite the stack blueprint sections it depends on will invent a service or pattern. Every task MUST cite.
- **Horizontal-layer decomposition.** "Task 1 = schemas, Task 2 = backend, Task 3 = frontend" is the wrong shape — tasks can't be verified in isolation. Vertical slices only.
- **200+ LOC tasks.** They lose the "demoable each" property. Split before running Phase 4.
- **Judge as reviewer.** The judge is not a reviewer — it's a verifier. It checks whether evidence matches DoD. If you find yourself asking the judge to "improve" code, you've misdesigned the DoD.
- **Auto-consuming ambiguous user messages during watch mode.** If a user message is a question (not a spec amendment), answer it and ask if they want to amend. Don't silently rewrite the spec.
- **Ignoring judge failures.** A failed task re-queued 3 times without progress = the DoD is wrong or the spec has a bug. Escalate to advisor, don't loop harder.

## Handoff

When the loop delivers at Gate B, print:

> ✅ Loop closed on `docs/dev-loop/<slug>/` — <N> tasks green, branch `<name>` at `<sha>`, DoD command passes.
>
> Next step: (a) `/land-and-deploy` for merge, (b) `/swarm-dev` for a heavier pre-land review, (c) `gh pr create` and review manually.
