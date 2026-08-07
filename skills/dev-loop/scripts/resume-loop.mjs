#!/usr/bin/env node
/**
 * resume-loop.mjs — pick up an in-flight loop after chat compaction or restart.
 *
 * Reads the loop's status.json + progress.md tail + judge-log.md tail +
 * decisions.md tail and prints a resumption briefing the agent can consume
 * to rehydrate context in a fresh session.
 *
 * Usage:
 *   node scripts/resume-loop.mjs --loop <docs/dev-loop/slug/>
 *   node scripts/resume-loop.mjs --loop <path> --json    # machine-readable output
 *
 * Zero dependencies. Node >= 18.
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const rawArgs = process.argv.slice(2);
const args = { _: [] };
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const nxt = rawArgs[i + 1];
    if (nxt && !nxt.startsWith('--')) { args[key] = nxt; i++; }
    else args[key] = true;
  } else args._.push(a);
}

if (!args.loop) {
  console.error('usage: resume-loop.mjs --loop <docs/dev-loop/slug/> [--json]');
  process.exit(2);
}

const loopDir = resolve(args.loop);

async function safeRead(path, fallback = '') {
  try { return await readFile(path, 'utf8'); }
  catch { return fallback; }
}

function tail(text, n) {
  const lines = text.split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

// ─── read state ──────────────────────────────────────────────────────────────
const status = JSON.parse(await safeRead(join(loopDir, 'status.json'), '{}'));
const spec = await safeRead(join(loopDir, 'spec.md'));
const progressTail = tail(await safeRead(join(loopDir, 'progress.md')), 80);
const judgeTail = tail(await safeRead(join(loopDir, 'judge-log.md')), 60);
const decisionsTail = tail(await safeRead(join(loopDir, 'decisions.md')), 40);

const specTitle = (spec.match(/^# Spec — (.*)$/m) || [])[1] || '(unknown)';
const runState = status.run_state || 'unknown';

const tasks = status.tasks || {};
const counts = { pending: 0, running: 0, done: 0, failed: 0, blocked: 0, drift: 0 };
for (const t of Object.values(tasks)) {
  if (t.state === 'blocked-needs-review') counts.blocked++;
  else counts[t.state] = (counts[t.state] || 0) + 1;
}
const total = Object.keys(tasks).length;

// ─── output ──────────────────────────────────────────────────────────────────
if (args.json) {
  console.log(JSON.stringify({
    loop_dir: loopDir,
    spec_title: specTitle,
    run_state: runState,
    task_counts: counts,
    total_tasks: total,
    tasks_by_state: Object.fromEntries(
      Object.entries(tasks).map(([id, entry]) => [id, entry.state])
    ),
  }, null, 2));
  process.exit(0);
}

console.log(`\n╔════════════════════════════════════════════════════════════════════╗`);
console.log(`║  dev-loop — RESUME BRIEFING                                        ║`);
console.log(`╚════════════════════════════════════════════════════════════════════╝\n`);
console.log(`  Loop dir:   ${loopDir}`);
console.log(`  Feature:    ${specTitle}`);
console.log(`  Run state:  ${runState}`);
console.log(`  Tasks:      ${counts.done}/${total} done · ${counts.running} running · ${counts.pending} pending · ${counts.failed} failed · ${counts.blocked} blocked · ${counts.drift} drift\n`);

console.log(`─── task states ────────────────────────────────────────────────────`);
for (const [id, entry] of Object.entries(tasks)) {
  console.log(`  ${id.padEnd(40)} ${entry.state}${entry.judge_iteration_count ? ` (judge iter: ${entry.judge_iteration_count})` : ''}`);
}

console.log(`\n─── progress.md tail (last 80 lines) ───────────────────────────────`);
console.log(progressTail);

if (judgeTail.trim()) {
  console.log(`\n─── judge-log.md tail (last 60 lines) ──────────────────────────────`);
  console.log(judgeTail);
}

if (decisionsTail.trim()) {
  console.log(`\n─── decisions.md tail (last 40 lines) ──────────────────────────────`);
  console.log(decisionsTail);
}

console.log(`\n─── next step ──────────────────────────────────────────────────────`);
if (runState === 'closed' || counts.done === total) {
  console.log(`  Loop is CLOSED. Print Phase 7 report + hand-off options.`);
} else if (counts.drift > 0) {
  console.log(`  Requeue ${counts.drift} drift task(s): mark as pending, next turn dispatches them.`);
} else if (counts.running > 0) {
  console.log(`  ${counts.running} task(s) currently running — wait or check their progress.md entries.`);
} else if (counts.pending > 0) {
  console.log(`  Run: node scripts/run-orchestrator.mjs --loop ${loopDir}`);
  console.log(`  → will print the dispatch plan for this turn.`);
} else if (counts.failed > 0 || counts.blocked > 0) {
  console.log(`  ${counts.failed} failed + ${counts.blocked} blocked tasks — surface at Phase 7 as deferred items.`);
} else {
  console.log(`  All tasks in terminal states — close the loop with Phase 7 report.`);
}
console.log('');
