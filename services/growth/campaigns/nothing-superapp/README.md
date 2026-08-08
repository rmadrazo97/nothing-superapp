# Nothing Superapp — growth campaign log

Append-only lab notebook for what shipped, when, and what got learned. Feed same-day per project memory.

## 2026-08-07 — v0.1 harness landed

- One centralized shell (auth + Stripe $1/mo + Kimi K2 copilot + shared context)
- File-convention mini-app registry — new mini-app = folder + 6 lines of glue
- Paywall gates mini-apps; assistant + settings stay reachable so unentitled users can chat their way to the CTA
- Copilot reads across every mini-app the user touches — the actual "super" in superapp
- Reference mini-app: `calorie-lite` (add meal, running total vs target, 7-day history)
- Placeholder: `coming-soon` (proves the auto-discovery loader)
- Full Playwright golden path (signup → subscribe → mini-app → chat with copilot → verify copilot cites the meal → settings → signout) passes in 1.7 min against live Supabase + Stripe test-mode + Kimi

## 2026-08-08 — v0.2 mini-app expansion in progress

Adding three top-tier mini-apps:
1. **Gym Routine** — seeded 1,324 exercises from hasaneyldrm/exercises-dataset (MIT data + Gym Visual media w/ attribution). Browse by body part, build routines, live session with rest timer, history.
2. **Pomodoro** — 25/5/15 cycle, Date.now-based timer that survives tab switch, WebAudio beep, per-day pomodoro count with dot streak, custom durations in settings.
3. **Calorie Lite v2** — from reference to top-tier: macros (protein/carb/fat), quick-add favorites, weekly trend chart, streak counter.

Angles worth posting about:
- **"1,324 exercises seeded in 40s"** — the postgres seed clip
- **"Same day, three mini-apps"** — the registry pattern paying off
- **"Copilot cites data across all mini-apps"** — the actual product moment
- **"Superapp = one $1/mo instead of five \$5/mo subs"** — the pricing pitch
