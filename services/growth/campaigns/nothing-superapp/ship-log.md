# Nothing Superapp — ship log

Append-only. One block per shippable moment. Highest at top.

## 2026-08-08 14:10 — 1,324 exercises seeded

- Downloaded MIT-licensed dataset (media © Gym visual, attribution required)
- Compacted 17MB multilingual JSON → 1.15MB English-only + text[] steps
- Applied migration `003_gym_and_exercises.sql`: `exercises`, `workout_routines`, `workout_sessions`
- Seeded via `\copy` in ~1s over the Supavisor pooler
- Distribution: 10 body parts × 28 equipment types × 1,324 total
- Attribution preserved as a table column so the UI can never accidentally strip it

**Angle:** "17MB → 1.15MB → live in Postgres in one session." The data-plumbing story that turns a raw open dataset into a shippable feature. Screen-record clip: the `psql \copy` returning `COPY 1324` in under a second.

## 2026-08-07 — v0.1 harness landed

See `README.md`.

## 2026-08-08 14:45 — v0.2 shipped

Three top-tier mini-apps landed:

**Pomodoro (◔)** — 25/5/15 cycle with Date.now-accurate timer (no drift when tab throttled), WebAudio two-tone chirp with Safari autoplay-policy handling, sessionStorage recovery so a reload resumes at the correct end timestamp. Skip logs an aborted session for auditability; Reset discards. Custom durations in a settings drawer, persisted per-user in localStorage.

**Gym (◈)** — 1,324 exercises browsable by 10 body parts, search over lowered name index, exercise detail with lazy-loaded animated GIFs on a rounded neutral plate (tried mix-blend-mode: screen — anatomical lines went ghostly, plate wins). Live session with rest timer using requestAnimationFrame + Date.now diffing. Server owns ended_at, client PATCHes {end:true} — no client-clock trust. Partial index on (user_id) where ended_at is null keeps resume O(1).

**Calorie Lite v2 (◐)** — from reference to top-tier. Surfaces macros (protein/carbs/fat) in the Add form + Today card + per-entry line + per-day history line. StreakChip with morning-grace (if today has no entries yet, walk starts from yesterday — prevents the streak flickering to 0 each morning). Sparkline card with 7-day bars + dashed target line, inline SVG, no chart deps. DST-safe date shifting via Date.setDate().

**Migrations:**
- `002_pomodoro_and_gym.sql` — pomodoro_sessions
- `003_gym_and_exercises.sql` — exercises + workout_routines + workout_sessions

**Route table:** 18 routes total (11 pages + 7 API handlers new this wave). All hex-color-free, all design-token driven.

**Commits since v0.1:**
- `79553f7` feat(mini-apps): pomodoro + gym-routine
- `bc5c54b` feat(calorie-lite): v2 — macros + streak + weekly sparkline

Angles worth posting about:
1. **"Same day: three mini-apps"** — the registry pattern paying off (folder + 6 lines of glue). Timelapse of the file tree filling up.
2. **"Same-shape timers, different UX"** — pomodoro rest timer + gym rest timer + calorie streak all use Date.now diffing. One pattern, three mini-apps. Screen recording of tab-switching mid-timer and watching the resume land clean.
3. **"1,324 exercises seeded in <1 second"** — the psql \copy clip.
4. **"Parallel subagents"** — two workers (pomodoro + gym) coordinated cleanly through shared files (schemas + client-registry + next.config) using a "add-only, never remove" convention.

