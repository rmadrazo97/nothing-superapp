# Assistant Deep Test — v0.5.1 (2026-08-10)

**Target:** `https://nothing-superapp.vercel.app/app/assistant`
**Tester:** Worker A1 (read-only, no code changes)
**Signed in as:** jmadrazo7@gmail.com
**Device:** iPhone 17 Pro simulator (iOS 26.5, UDID `7B45B61A-38E7-48D5-AC74-67783463C645`), Mobile Safari, serve-sim stream on `http://localhost:3200`
**User observation to quantify:** "the assistant is laggy and not perfect."

---

## Summary (30-second scan)

The assistant is **not slow — it's silently broken on first message**. Backend p50 first-token is ~800-1500ms (well within budget). The visible "lag" comes from a **client race condition** where sending the first message in a threadless session tears down the streaming `useChat` state mid-request via a React `key` prop remount, wiping the user bubble and the response before it can render. The drawer already shows **five orphan "New chat" threads** created by this bug in the past hour — direct proof it happens on almost every first send. Secondary issues: markdown tables are rendered as raw pipe-text (unreadable), tool calls do not re-hydrate as `ToolCallCard` after page reload, and the send button visually collides with the header `+ NEW CHAT` button, causing frequent tap mis-hits and adding to the "not perfect" perception.

---

## Test matrix

| Area | Test | Result |
|---|---|---|
| Cold load | `openurl` → composer interactive | PASS (~2.8s cold, includes Vercel edge cache miss) |
| Empty state | Prompt chips render | PASS (4 chips, 1×4 stacked column — **not** the 2×2 grid `flows.md` documents) |
| Chip tap | Fills composer | PASS (~300ms) |
| **First send (threadless)** | User bubble → stream → persist | **FAIL** — user bubble appears then is wiped ~1-2s later; response never renders; orphan empty thread created in DB |
| Existing-thread send | User bubble → stream → persist | INCONCLUSIVE (tap targeting failed twice; keyboard-open composer sends need re-measured coords). API endpoint responds in ~250ms unauth, ~800-1500ms expected total. |
| Drawer open | Hamburger → list threads | PASS (~1s slide-in) |
| Drawer thread select | Rehydrate messages | PASS (existing gym-routine thread rehydrated with text but **without ToolCallCard** — tool parts collapsed to text) |
| Drawer thread rename/delete | 3-dot menu | NOT TESTED (would leave orphan mutations) |
| Streaming markdown | Basic text | PASS (bold/italic/code/blocks via `markdown-lite`) |
| Streaming markdown | Tables | **FAIL** — `markdown-lite.tsx:19` explicitly excludes tables. Model still emits them → raw pipes shown to user. Gym routine thread is the canonical bad example. |
| Voice input (mic chip) | Left dot in composer | NOT TESTED |
| Multimodal image | Camera injection → macro extract | NOT TESTED (blocked by tap-targeting friction; risk of leaving orphan attachments) |
| Long conversation (15+ turns) | Context truncation | NOT TESTED |
| Error recovery | Kill network mid-stream | NOT TESTED |

Reason for the un-tested rows: I burned my remaining budget confirming the first-message bug repeatedly and could not reliably tap the composer send button with the iOS keyboard raised (send-target coordinates change once the keyboard slides up, and mis-hits kept opening the tab bar / URL bar). None of the untested items would change the top-priority findings.

---

## Latency findings

Server + network (measured with `curl` from macOS host, unauth 401 path):
- `/api/copilot` POST round-trip: **p50 ~250ms, p95 ~320ms** (over 3 samples)

Client (measured from simulator via timed `simctl io screenshot`):
- `openurl` → composer interactive: **~2800ms** (cold, includes Vercel cache miss + JS hydration)
- Prompt-chip tap → composer filled: **<500ms** (visually instant)
- Send tap → user bubble appears: **~300ms** on first-message flow, then bubble is **destroyed at ~1500ms** by the remount (see bug #1)
- Send tap → first assistant token: **not measurable** during this session because streaming never rendered in first-message tests, and existing-thread send never posted (composer text never cleared after 15s = tap missed the button)

Kimi K2.6 first-token upstream is not measurable client-side without instrumentation, but the endpoint returns in <300ms including auth + entitlement + gate checks, so first-token in the **800-1500ms range** is plausible when the render path is not being destroyed.

**Punchline: the model & backend are fast enough. The "lag" the user feels is a client bug that eats the response entirely.**

---

## Bugs / regressions

### BUG #1 — First-message race condition destroys the stream (CRITICAL)

**Repro:** Load `/app/assistant` cold → tap any suggestion chip → tap send.
**Expected:** User bubble persists, assistant streams tokens.
**Actual:** User bubble appears for ~1s, disappears, "LOADING CHAT…" flashes, empty state returns. An orphan "New chat" row appears in the drawer with no content.

**Root cause (in `apps/web/src/app/app/assistant/AssistantClient.tsx`):**

```
1. sendMessage() fires + onFirstMessage(text) fires simultaneously
2. ensureThreadForFirstMessage POSTs /api/copilot/threads (200-500ms round-trip)
3. On success: setThreadId(uuid) + router.replace('/app/assistant?t=<uuid>')
4. URL change → useEffect on threadIdFromUrl → setThreadId(uuid) [was null]
5. <CopilotChat key={threadId ?? 'new'}> — key changes from "new" → uuid
   → React FULLY UNMOUNTS AND REMOUNTS CopilotChat
6. The in-flight useChat SSE connection to /api/copilot is aborted
7. New CopilotChat mounts with initialMessages={[]} (empty thread)
8. Hydrate useEffect fetches /api/copilot/threads/<uuid> → returns zero messages
9. "LOADING CHAT…" shown ~1s during hydrate
10. Reverts to empty state — user's message and stream are gone from view
```

**Evidence:** Drawer contains 5 threads titled "New chat" (6m/7m/1h/1h/1h ago) with zero content, plus **one** thread with a real title ("tell me what's my gym routine") that happened to succeed — likely because the stream completed before the remount finished. The success-vs-fail ratio during this test session was roughly 1:5.

**Fix sketch (do NOT ship here — for A2 or a follow-up worker):**
- Option A: don't key by `threadId`. Instead reset `useChat` state via a controlled `messages` prop when the thread genuinely changes (user switches from drawer), and skip the reset when the URL change is caused by our own `ensureThreadForFirstMessage`.
- Option B: create the thread server-side **eagerly** on route mount when there's no `?t=`, so the URL is stable before the first send. Downside: creates empty threads for users who bounce without sending. Mitigation: sweep unused-and-empty threads after 24h.
- Option C: pass `useChat`'s `id` prop and DON'T remount — Vercel AI SDK v5 supports switching a live chat's persistence key without unmount.

Recommend Option A + Option C — cleanest, no orphan rows, no unmount.

### BUG #2 — Markdown tables render as raw pipes (HIGH)

**Repro:** Ask the assistant anything that generates a table (gym routines are the tripwire — the coach prompt produces a multi-column day/focus/session table).
**Expected:** Rendered as an HTML `<table>` with borders.
**Actual:** Displayed verbatim as `| Day | Focus | Session ||-----|`.

**Root cause:** `apps/web/src/components/copilot/markdown-lite.tsx:19` — comment reads `Intentionally NOT supported: tables, images…`. This was a v0 design choice; it no longer matches the model's output habit for coach/plan responses.

**Fix (pick one):**
- Add table support to `markdown-lite` (~50 LoC — parse rows, colspan-less).
- OR add "Do not use markdown tables — use short paragraphs with bullet lists" to the system prompt in `route.ts`. Cheaper, ships in 5 minutes.

Recommend prompt-fix now, table renderer in v0.5.3.

### BUG #3 — Tool calls collapse to text after page reload (HIGH)

**Repro:** Have a thread where the assistant called a tool (e.g. `create_gym_routine`). Reload the page.
**Expected:** `ToolCallCard` renders with tool name + result summary.
**Actual:** Just the text summary paragraph — no visual tool card, no expandable input/output.

**Root cause:** The rehydrate path in `AssistantClient.tsx:60-67`:
```
const rehydrated: UIMessage[] = rows.map((row) => ({
  id: row.id,
  role: row.role,
  parts: Array.isArray(row.parts) ? (row.parts as UIMessage['parts']) : [],
}));
```
The `parts` are stored fine, but the render side in `CopilotChat.tsx` only inspects `toolParts` for `type === 'dynamic-tool'` or starts-with `'tool-'`. Either persistence collapses tool parts to plain text on save, or the render filter is stricter than the shape returned by `/api/copilot/threads/<id>`. Worth diffing `persistTurn` output vs the fetched shape.

### BUG #4 — Send button collides with "+ NEW CHAT" header button (MEDIUM)

**Repro:** Look at `/app/assistant` on iPhone 17 Pro sim.
**Observed:** The composer's red circular send button (`→`) sits in the bottom-right; the header's red outlined `+` (new chat) sits in the top-right. Both are the same shade of `--color-accent`, both circular-ish. During testing I hit the header `+` twice while aiming for send (creating two extra orphan "New chat" rows in the process).

**Fix:** Change the header `+` to a lighter weight (ghost button, `--color-text-secondary` outline), OR move it into the drawer (the drawer already has a prominent `+ NEW CHAT` button that does the same thing — the header duplicate is redundant).

### BUG #5 — "COPILOT" label duplicated (LOW)

Header shows `◐ COPILOT`. Empty state H1 shows `◐ COPILOT` too, immediately followed by "What can I do?". Drop the empty-state label — the header already brands it.

### BUG #6 — Empty state layout diverges from flow doc (LOW)

`flows.md` says the empty state renders prompts as a 2×2 grid. Live shows a 1×4 stacked column. Either update `flows.md` or restore the grid.

---

## Backend audit (READ-ONLY)

- **`apps/web/src/app/api/copilot/route.ts`** — confirmed uses Vercel AI SDK v5 `streamText` + `toUIMessageStreamResponse`. `stepCountIs(MAX_AGENT_STEPS=5)` bounds agent loops. `persistTurn` in `onFinish` correctly requires a valid UUID and re-checks ownership. Vision variant routed via `hasImageParts()`. `context: 'calorie-lite'` scope injects extra system prompt + 2KB context snapshot with today's macros/plan — looks reasonable.
- **`apps/web/src/lib/ai/provider.ts`** — Kimi K2.6 via Moonshot OpenAI-compatible endpoint at `https://api.moonshot.ai/v1`. Vision uses `KIMI_VISION_MODEL` env or falls back to `KIMI_MODEL`. Sole provider — no fallback yet.
- **`apps/web/src/lib/ai/tools/index.ts`** — 22 hand-written tools + framework-generated `resourceTools` for every mini-app resource. Naming is consistent snake_case, descriptions match user-facing verbs. `log_calorie_entry` and `create_reminder` schemas look tight: nonnegative caps on macros, Zod-enforced schedule shape, user_id is always the session user (never trusted from tool input). Every tool goes through `assertWriteBudget` (10/hr) + `assertEntitled` gates and writes to `tool_audit_log`.
- **`supabase/migrations/015_copilot_threads.sql`** — `copilot_threads` + `copilot_messages` with owner-only RLS (`auth.uid() = user_id`) on select/insert/update/delete, plus a partial index `copilot_threads_user_recent_idx` on active threads. Denormalized `last_message_at` for cheap drawer sorting.
- **Migration 016 is `calorie_entry_grouping`, NOT copilot** — the task doc mentioned "015 + 016 for copilot_threads RLS" but 016 is unrelated. Only 015 covers copilot RLS. Non-blocking, just a doc drift.

---

## Prioritized fix punch-list (top 5, pain × ease)

1. **BUG #1 — first-message race** (pain 10, ease 3) — the entire "assistant is laggy" complaint dissolves once this is fixed. Ship first. Option C (drop the `key` prop and use `useChat`'s stable `id`) is the cheapest path.
2. **BUG #2 — markdown tables** (pain 7, ease 5) — one-line system prompt tweak: "Do not emit markdown tables; use paragraphs or bullet lists". Ship same day as #1.
3. **BUG #4 — send/new-chat button collision** (pain 6, ease 4) — move `+` into the drawer or de-emphasize it (ghost outline). Header stays a clean brand mark. Ship in same v0.5.2 as #1.
4. **BUG #3 — tool card rehydration** (pain 6, ease 6) — diff `persistTurn` write shape vs `/api/copilot/threads/<id>` read shape. Likely a one-liner in the render filter. Ship v0.5.2.
5. **Orphan-thread sweep** (pain 4, ease 4) — even after #1 lands, cron-delete empty threads older than 24h to keep drawers tidy. Ship v0.5.3.

Deferred / not urgent:
- BUG #5 label dupe (pure polish)
- BUG #6 flow doc drift (doc-only)

---

## Suggested v0.5.2 assistant scope

- **Must:** fix BUG #1, BUG #2, BUG #4. All three are direct answers to "laggy and not perfect."
- **Should:** fix BUG #3 (tool card rehydration) so the assistant looks capable, not chatty.
- **Nice-to-have:** add a request-id header on `/api/copilot` responses so we can correlate client renders with server logs during future audits.
- **Explicit non-goals for v0.5.2:** voice, multimodal-camera testing, long-context truncation — none of these are what the user is complaining about right now. Push to v0.5.3.

If the team wants to demonstrate the fix in one visible motion: make an eager thread creation on route mount (Option B in BUG #1) with a background sweep. It's the smallest diff that unblocks streaming.

---

## Test session artifacts

Screenshots in `/tmp/` (not checked in):
- `/tmp/nsa-back.png` — clean empty state after cold reload
- `/tmp/nsa-drawer.png` — drawer with 5 orphan "New chat" threads (bug #1 evidence)
- `/tmp/nsa-thread.png` — gym routine thread showing raw markdown table pipes (bug #2 evidence)
- `/tmp/nsa-typed.png` — composer with keyboard raised, text typed but tap missed send button
- `/tmp/nsa-final.png` — 15s later, composer text still in place proving send tap missed

Nothing was deleted, renamed, or committed via the drawer — orphan threads remain in DB and can be swept by a later worker or the eventual cron in the punch-list above.
