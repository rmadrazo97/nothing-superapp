#!/usr/bin/env node
/**
 * build-taskpack.mjs — Phase 3 assembler.
 *
 * Reads a locked spec.md + a task-pack.json (produced by the orchestrator at
 * Phase 3 after advisor decomposition) and writes the full task pack to disk:
 *   - docs/dev-loop/<slug>/tasks/NN-<slug>.md   (one per task)
 *   - docs/dev-loop/<slug>/tier-config.yaml
 *   - docs/dev-loop/<slug>/deps.json
 *   - docs/dev-loop/<slug>/status.json (all pending)
 *   - docs/dev-loop/<slug>/progress.md (seed)
 *
 * task-pack.json schema:
 *   {
 *     "feature_slug": "calorie-tile",
 *     "feature_title": "Calorie counter tile",
 *     "tier": "M",
 *     "harness": { ... from detect-harness },
 *     "mode": "advisor",
 *     "watch_mode": true,
 *     "defaults": { executor, advisor, judge, ... },
 *     "tasks": [
 *       {
 *         "id": "01", "slug": "drizzle-schema",
 *         "title": "…", "intent": "…", "spec_section": "§ 3",
 *         "tier": { executor, advisor, judge, tier_rationale, ... },
 *         "blocked_by": [], "blocks": ["02", "03"],
 *         "owned_files": [...], "off_limits_files": [...],
 *         "reusable_patterns": [...],
 *         "advisor_triggers": [...],
 *         "acceptance_criteria": [...],
 *         "dod_command": "...",
 *         "test_pattern": "..."
 *       }, ...
 *     ]
 *   }
 *
 * Usage:
 *   node scripts/build-taskpack.mjs --pack <task-pack.json> --out <docs/dev-loop/slug/>
 *   node scripts/build-taskpack.mjs --validate <docs/dev-loop/slug/>   # QA-only, no writes
 *
 * Zero dependencies. Node >= 18.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, '..');
const templatesDir = join(skillRoot, 'templates');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) {
      const k = cur.slice(2);
      const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
      acc.push([k, v]);
    }
    return acc;
  }, [])
);

if (args.validate) {
  await validatePack(resolve(args.validate));
  process.exit(0);
}

if (!args.pack || !args.out) {
  console.error('usage: build-taskpack.mjs --pack <task-pack.json> --out <docs/dev-loop/slug/>');
  console.error('   or: build-taskpack.mjs --validate <docs/dev-loop/slug/>');
  process.exit(2);
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const substitute = (str, vars) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), str);

const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 16);
const today = () => new Date().toISOString().slice(0, 10);

// ─── validation ──────────────────────────────────────────────────────────────
function validateTaskInPack(task, pack) {
  const errors = [];
  const required = ['id', 'slug', 'title', 'intent', 'spec_section', 'tier',
    'owned_files', 'off_limits_files', 'reusable_patterns', 'advisor_triggers',
    'acceptance_criteria', 'dod_command'];
  for (const f of required) {
    if (task[f] === undefined || task[f] === null || task[f] === '') {
      errors.push(`task ${task.id || '?'} missing required field: ${f}`);
    }
  }
  // Tier fields
  if (task.tier) {
    for (const t of ['executor', 'judge']) {
      if (!task.tier[t]) errors.push(`task ${task.id}: missing tier.${t}`);
    }
    if (task.tier.advisor === undefined) errors.push(`task ${task.id}: missing tier.advisor (null is OK for no-advisor tasks)`);
  }
  // Owned surface non-empty
  if (Array.isArray(task.owned_files) && task.owned_files.length === 0) {
    errors.push(`task ${task.id}: owned_files is empty`);
  }
  // DoD command is not adjectives
  if (typeof task.dod_command === 'string' && /polish|improve|clean|nice|better/i.test(task.dod_command)) {
    errors.push(`task ${task.id}: dod_command contains adjective language ("polish"/"improve"/"clean") — must be shell command with exit code`);
  }
  return errors;
}

function detectOwnedFileOverlaps(tasks) {
  const errors = [];
  const claims = new Map(); // file -> task_id
  for (const task of tasks) {
    for (const owned of (task.owned_files || [])) {
      if (claims.has(owned)) {
        errors.push(`owned overlap: "${owned}" claimed by tasks ${claims.get(owned)} AND ${task.id}`);
      } else {
        claims.set(owned, task.id);
      }
    }
  }
  return errors;
}

function detectCycles(tasks) {
  const errors = [];
  const graph = new Map(tasks.map((t) => [t.id, t.blocked_by || []]));
  function visit(id, seen) {
    if (seen.has(id)) {
      errors.push(`dependency cycle detected involving task ${id}: ${[...seen, id].join(' -> ')}`);
      return;
    }
    seen.add(id);
    for (const dep of (graph.get(id) || [])) visit(dep, new Set(seen));
  }
  for (const t of tasks) visit(t.id, new Set());
  return errors;
}

async function validatePack(outDir) {
  const errors = [];
  const tasksDir = join(outDir, 'tasks');
  let files;
  try { files = await readdir(tasksDir); }
  catch { errors.push(`tasks/ directory missing at ${tasksDir}`); }
  if (files) {
    if (files.length === 0) errors.push('no task files in tasks/');
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const raw = await readFile(join(tasksDir, f), 'utf8');
      const requiredHeadings = ['## Spec source', '## Files you own', '## Files off-limits',
        '## Reusable patterns to grep', '## When to consult the advisor',
        '## Acceptance criteria', '## Definition of done', '## Stop condition'];
      for (const h of requiredHeadings) {
        if (!raw.includes(h)) errors.push(`${f}: missing section "${h}"`);
      }
      if (raw.includes('{{')) errors.push(`${f}: unfilled placeholder(s)`);
    }
  }
  const configPath = join(outDir, 'tier-config.yaml');
  try { await readFile(configPath, 'utf8'); }
  catch { errors.push(`tier-config.yaml missing at ${configPath}`); }
  const depsPath = join(outDir, 'deps.json');
  try {
    const deps = JSON.parse(await readFile(depsPath, 'utf8'));
    if (!Array.isArray(deps.tasks) && typeof deps !== 'object') errors.push('deps.json has invalid shape');
  } catch (e) { errors.push(`deps.json missing or invalid: ${e.message}`); }
  const statusPath = join(outDir, 'status.json');
  try { await readFile(statusPath, 'utf8'); }
  catch { errors.push(`status.json missing at ${statusPath}`); }
  if (errors.length) {
    console.error('VALIDATION FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  } else {
    console.log('OK — task pack passes validation.');
  }
}

// ─── build ───────────────────────────────────────────────────────────────────
const pack = JSON.parse(await readFile(args.pack, 'utf8'));
const outDir = resolve(args.out);
await mkdir(outDir, { recursive: true });
await mkdir(join(outDir, 'tasks'), { recursive: true });

// Cross-task validation
const structuralErrors = [];
for (const t of pack.tasks) structuralErrors.push(...validateTaskInPack(t, pack));
structuralErrors.push(...detectOwnedFileOverlaps(pack.tasks));
structuralErrors.push(...detectCycles(pack.tasks));
if (structuralErrors.length) {
  console.error('PACK VALIDATION FAILED (before write):');
  for (const e of structuralErrors) console.error(`  - ${e}`);
  process.exit(1);
}

// Load templates
const taskBriefTpl = await readFile(join(templatesDir, 'task-brief.md.txt'), 'utf8');
const tierConfigTpl = await readFile(join(templatesDir, 'tier-config.yaml.txt'), 'utf8');
const progressTpl = await readFile(join(templatesDir, 'progress.md.txt'), 'utf8');

// Write each task-brief
for (const t of pack.tasks) {
  const filename = `${String(t.id).padStart(2, '0')}-${t.slug}.md`;
  const filled = substitute(taskBriefTpl, {
    TASK_ID: t.id,
    TASK_SLUG: t.slug,
    TASK_TITLE: t.title,
    TASK_INTENT: t.intent,
    FEATURE_SLUG: pack.feature_slug,
    SPEC_SECTION_REF: t.spec_section,
    EXECUTOR_MODEL: t.tier.executor,
    ADVISOR_MODEL: t.tier.advisor || 'null',
    JUDGE_MODEL: t.tier.judge,
    ADVISOR_CALL_BUDGET: t.tier.advisor_call_budget ?? pack.defaults.advisor_call_budget ?? 15,
    MAX_WORKER_TURNS: t.tier.max_worker_turns ?? pack.defaults.max_worker_turns ?? 15,
    EXECUTOR_WHY: t.tier.tier_rationale?.executor || '',
    ADVISOR_WHY: t.tier.tier_rationale?.advisor || 'no advisor for this task',
    JUDGE_WHY: t.tier.tier_rationale?.judge || '',
    BLOCKED_BY_JSON: JSON.stringify(t.blocked_by || []),
    BLOCKS_JSON: JSON.stringify(t.blocks || []),
    OWNED_FILES_LIST: t.owned_files.map((f) => `- \`${f}\``).join('\n'),
    OFF_LIMITS_FILES_LIST: t.off_limits_files.map((f) => `- \`${f}\``).join('\n'),
    REUSABLE_PATTERNS_LIST: t.reusable_patterns.map((p) => `- ${p}`).join('\n'),
    ADVISOR_TRIGGERS_LIST: t.advisor_triggers.length
      ? t.advisor_triggers.map((tr, i) => `${i + 1}. ${tr}`).join('\n')
      : '(none — this task should not need the advisor; if it does, spec is wrong)',
    ACCEPTANCE_CRITERIA_CHECKLIST: t.acceptance_criteria.map((c) => `- [ ] ${c}`).join('\n'),
    DOD_COMMAND: t.dod_command,
    TEST_PATTERN: t.test_pattern || 'apps/**/*.test.ts',
  });
  await writeFile(join(outDir, 'tasks', filename), filled);
}

// tier-config.yaml
const perTaskOverrides = pack.tasks
  .filter((t) => Object.keys(t.tier || {}).length > 0)
  .map((t) => `  ${String(t.id).padStart(2, '0')}-${t.slug}:
    executor: ${t.tier.executor}
    advisor:  ${t.tier.advisor || 'null'}
    judge:    ${t.tier.judge}`)
  .join('\n');

const tierConfig = substitute(tierConfigTpl, {
  FEATURE_SLUG: pack.feature_slug,
  HARNESS_RUNTIME: pack.harness.runtime,
  HARNESS_VERSION: pack.harness.version,
  HAS_ADVISOR: pack.harness.features.advisor,
  HAS_AGENT_TOOL: pack.harness.features.agent_tool,
  HAS_ASK_USER: pack.harness.features.ask_user_question,
  HAS_SUBAGENT_CTX: pack.harness.features.subagent_context,
  HAS_PARALLEL: pack.harness.features.parallel_workers,
  MODE: pack.mode,
  WATCH_MODE: pack.watch_mode ?? true,
  DEFAULT_EXECUTOR: pack.defaults.executor,
  DEFAULT_ADVISOR: pack.defaults.advisor || 'null',
  DEFAULT_JUDGE: pack.defaults.judge,
  ADVISOR_BUDGET_PER_TASK: pack.defaults.advisor_call_budget ?? 15,
  MAX_WORKER_TURNS: pack.defaults.max_worker_turns ?? 15,
  MAX_JUDGE_ITERATIONS: pack.defaults.max_judge_iterations ?? 10,
  PARALLEL_WORKER_LIMIT: pack.defaults.parallel_workers ?? 4,
  PER_TASK_OVERRIDES: perTaskOverrides,
  ADVISOR_BUDGET_PER_RUN: pack.budgets?.total_advisor_tokens_per_run ?? 100000,
  EXECUTOR_BUDGET_PER_RUN: pack.budgets?.total_executor_tokens_per_run ?? 500000,
  JUDGE_BUDGET_PER_RUN: pack.budgets?.total_judge_tokens_per_run ?? 50000,
});
await writeFile(join(outDir, 'tier-config.yaml'), tierConfig);

// deps.json
const deps = {
  tasks: pack.tasks.map((t) => ({
    id: `${String(t.id).padStart(2, '0')}-${t.slug}`,
    blocked_by: (t.blocked_by || []).map((id) => {
      const target = pack.tasks.find((x) => x.id === id);
      return target ? `${String(target.id).padStart(2, '0')}-${target.slug}` : id;
    }),
    blocks: (t.blocks || []).map((id) => {
      const target = pack.tasks.find((x) => x.id === id);
      return target ? `${String(target.id).padStart(2, '0')}-${target.slug}` : id;
    }),
  })),
};
await writeFile(join(outDir, 'deps.json'), JSON.stringify(deps, null, 2));

// status.json
const status = {
  run_state: 'ready',
  updated_at: nowIso(),
  tasks: Object.fromEntries(
    pack.tasks.map((t) => [
      `${String(t.id).padStart(2, '0')}-${t.slug}`,
      { state: 'pending', judge_iteration_count: 0, worker_turn_count: 0 },
    ])
  ),
};
await writeFile(join(outDir, 'status.json'), JSON.stringify(status, null, 2));

// progress.md seed (only if it doesn't exist yet)
const progressPath = join(outDir, 'progress.md');
try { await readFile(progressPath, 'utf8'); }
catch {
  const progress = substitute(progressTpl, {
    FEATURE_SLUG: pack.feature_slug,
    RUN_OPENED_TIMESTAMP: nowIso(),
    TIER_SIZE: pack.tier,
    ONE_LINE_REQUIREMENT: pack.feature_title,
    TASK_COUNT: pack.tasks.length,
    MODE: pack.mode,
    HARNESS_RUNTIME: pack.harness.runtime,
    HARNESS_VERSION: pack.harness.version,
    WATCH_MODE: pack.watch_mode ?? true,
  });
  await writeFile(progressPath, progress);
}

console.log(`✅ Task pack built at ${outDir}`);
console.log(`   ${pack.tasks.length} tasks · deps.json · status.json · tier-config.yaml · progress.md`);
console.log(`   next: review the pack, then run scripts/run-orchestrator.mjs --loop ${outDir}`);
