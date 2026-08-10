# serve-sim-nsa — Agent skill for testing Nothing Superapp on iOS

Ships a Claude Code / Cursor / Codex-CLI **Agent Skill** that teaches a coding agent how to:

1. Boot an iPhone simulator.
2. Point Safari at `nothing-superapp.vercel.app` (or local dev).
3. Drive taps + type + gestures via [`serve-sim`](https://github.com/EvanBacon/serve-sim).
4. Take screenshots and verify pixel output.
5. Walk the canonical Nothing Superapp smoke flows.

Companion to but **not** a replacement for [`malopezr7/serve-sim-skill`](https://github.com/malopezr7/serve-sim-skill) — that one is generic simulator driving; this one is repo-scoped, adds our routes + flows + dev-loop integration + helper scripts.

## Install

### Claude Code — from this repo

Skills in the campaign folder don't auto-load; symlink or copy into your local skill dir:

```sh
ln -s "$PWD/services/growth/campaigns/nothing-superapp/skills/serve-sim-nsa" \
      ~/.claude/skills/serve-sim-nsa
```

Or install the generic upstream skill for cross-project use:

```
/plugin marketplace add EvanBacon/serve-sim
```

### Other agents (Cursor, Codex CLI, Gemini CLI, etc)

Symlink into your agent's skills dir. The skill is a folder with a `SKILL.md` — no build step.

## What's inside

```
serve-sim-nsa/
├── SKILL.md                      loaded when the skill triggers
├── README.md                     you are here
├── references/
│   ├── prereqs.md                macOS/Xcode/Node checks + creating a sim
│   ├── drive.md                  CLI: tap / type / gesture / rotate / camera
│   ├── verify.md                 screenshot loop + AX tree
│   ├── flows.md                  canonical Nothing Superapp smoke flows
│   ├── dev-loop.md               land code → deploy → screenshot → verify
│   └── pitfalls.md               anti-patterns + recovery
├── scripts/
│   ├── check-prereqs.sh          verify host
│   ├── boot-and-serve.sh         wraps repo's serve-sim-up.sh
│   ├── snap.sh                   timestamped /tmp/nsa-<epoch>.png
│   └── smoke-nsa.sh              walk all flows + index
└── evals/
    └── evals.json                sample prompts for skill quality
```

## Design tips baked in

- **Progressive disclosure** — the frontmatter carries the trigger vocabulary; the SKILL.md is short; references load on demand.
- **Scripts, not prose** — anything the agent should DO is a runnable script it can pipe through Bash. Anything it should KNOW is a reference file.
- **Concrete over abstract** — every claim is verifiable against the linked source (serve-sim README, Nothing Superapp source, this repo's `scripts/serve-sim-up.sh`).
- **Repo-scoped** — teaches OUR routes, OUR flows, OUR deploy quirks (Vercel Git integration flakiness, `apps/web/.vercel` stale-link trap, PWA service-worker cache invalidation).
- **Anti-patterns** — the "don't do this" list is often more useful than the "do this" one.

## Verified against

- `serve-sim` ~0.1.28 (EvanBacon/serve-sim README + AGENTS.md, as of 2026-08-10).
- Nothing Superapp v0.5.0 mini-app route table.

## License

Apache-2.0 — matches serve-sim itself.
