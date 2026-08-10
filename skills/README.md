# Nothing Superapp — Build Kit skills

Four operational Claude Code skills that live on-disk in this repo and are published to PromptVM for versioning + shareability.

Each skill is self-contained: a `SKILL.md` (the prompt), plus optional `templates/`, `references/`, `scripts/`, `examples/`.

| Skill | Purpose | Local path |
| --- | --- | --- |
| `stack-architect` | Green-field: pick tech stack + hosting + folder shape | [`stack-architect/`](./stack-architect/) |
| `design-system-builder` | Locked design system in a portable folder (Nothing OS aesthetic) | [`design-system-builder/`](./design-system-builder/) |
| `dev-loop` | One requirement → spec → task pack → parallel executor → judge (7 gated phases) | [`dev-loop/`](./dev-loop/) |
| `explain` | Turn a concept into a self-contained HTML artifact (report / landing / slides) | [`explain/`](./explain/) |

The recommended order for a new product: `stack-architect` → `design-system-builder` → `dev-loop` (loop this one per feature) → `explain` (whenever a concept needs a visual).

## Published to PromptVM

Source of truth stays on-disk under `skills/`. PromptVM holds a versioned copy of each `SKILL.md` (plus a manifest of the bundled reference/template/script files) so the skill can be resolved from any workstation via `promptvm prompts get` or the MCP.

- **Org:** `a071390f-8d04-4d76-bda5-a00405edcc37` (dev-api.promptvm.ai)
- **Workspace:** `nothing-superapp` — id `01c8ce23-44b6-4467-9b91-1037a99498eb`
- **Directory:** `skills` — id `95875791-e8e6-4e20-b597-7009761375fd`

| Skill | Prompt ID | Slug | Current version |
| --- | --- | --- | --- |
| `design-system-builder` | `84a3ef04-94bd-45e1-814e-149a37140ff5` | `design-system-builder-84a3ef04` | v1 |
| `dev-loop` | `870bbab0-d892-4a81-b618-2519e3a9e558` | `dev-loop-870bbab0` | v1 |
| `explain` | `e3ec9018-d331-4fc4-bb89-7182770c193c` | `explain-e3ec9018` | v1 |
| `stack-architect` | `20aabd8f-9716-4070-9c3a-31b28190991a` | `stack-architect-20aabd8f` | v1 |

### Bumping a skill version

Edit the local `SKILL.md`, then:

```bash
# 1. rebuild the bundle body (SKILL.md + bundled-files manifest)
python3 /tmp/nothing-superapp-promptvm/build_bundle.py \
  skills/<name> \
  /tmp/nothing-superapp-promptvm/<name>.md

# 2. append a new PromptVM version — never overwrite (versioning is the point)
promptvm prompts versions create <prompt-id> \
  -f /tmp/nothing-superapp-promptvm/<name>.md \
  -m "v0.X.Y — <what changed>"

# 3. verify
promptvm prompts get <prompt-id> -o json | jq '.data.currentVersion.versionNumber'
```

The bundle body layout is: header → summary (pulled from SKILL.md frontmatter) → manifest table of bundled files → full `SKILL.md` verbatim. The bundled files themselves stay in the repo — the manifest is a pointer, not a copy.

### CLI MIME quirk (heads-up)

The `promptvm` CLI rejects `.template` and `.md` files uploaded as attachments from inside subdirectories. The bundle-body approach above sidesteps it — we upload one big `.md` per skill as the prompt body, not per-file. If you ever need to attach individual files: rename to `.txt` in `/tmp/` first, upload from there, and keep the local originals unchanged.
