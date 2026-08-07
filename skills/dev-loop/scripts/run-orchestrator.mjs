#!/usr/bin/env node
/**
 * run-orchestrator.mjs — Phase 5-6 driver.
 *
 * This script is intentionally MINIMAL — it's the trace/lifecycle glue that
 * a real orchestrator (the main agent) uses to keep durable state coherent.
 * The heavy lifting (spawning workers, invoking advisors, watching for chat)
 * happens in the agent's own tool calls, NOT in this script.
 *
 * What this script does:
 *   1. Read status.json + deps.json + tier-config.yaml
 *   2. Compute the READY set (pending tasks with all deps done)
 *   3. Compute the DRIFT set (tasks marked drift by watch-drift.mjs)
 *   4. Print a dispatch plan (which tasks the agent should launch this turn)
 *   5. Optionally update status.json when the agent reports back
 *
 * The agent calls this at the top of every orchestrator turn and uses its
 * output as the plan for that turn.
 *
 * Usage:
 *   node scripts/run-orchestrator.mjs --loop <docs/dev-loop/slug/>            # print dispatch plan
 *   node scripts/run-orchestrator.mjs --loop <path> --mark <task-id> <state>  # update status
 *   node scripts/run-orchestrator.mjs --loop <path> --summary                 # print current summary
 *
 * Zero dependencies. Node >= 18.
 */

import { readFile, writeFile } from 'node:fs/promises';
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
  console.error('usage: run-orchestrator.mjs --loop <docs/dev-loop/slug/> [--mark <task-id> <state>] [--summary]');
  process.exit(2);
}

const loopDir = resolve(args.loop);

// ─── read state ──────────────────────────────────────────────────────────────
async function readState() {
  const status = JSON.parse(await readFile(join(loopDir, 'status.json'), 'utf8'));
  const deps = JSON.parse(await readFile(join(loopDir, 'deps.json'), 'utf8'));
  const configRaw = await readFile(join(loopDir, 'tier-config.yaml'), 'utf8');
  // ultra-minimal YAML parse — we only need mode / defaults / parallel_workers
  const mode = (configRaw.match(/^mode:\s*(\S+)/m) || [])[1] || 'advisor';
  const parallelWorkers = parseInt((configRaw.match(/parallel_workers:\s*(\d+)/) || [])[1] || '4', 10);
  const maxJudgeIterations = parseInt((configRaw.match(/max_judge_iterations:\s*(\d+)/) || [])[1] || '10', 10);
  return { status, deps, mode, parallelWorkers, maxJudgeIterations };
}

const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

// ─── compute ready + drift sets ──────────────────────────────────────────────
function computeReady(status, deps) {
  const depsById = Object.fromEntries(deps.tasks.map((t) => [t.id, t.blocked_by]));
  const ready = [];
  for (const [id, entry] of Object.entries(status.tasks)) {
    if (entry.state !== 'pending') continue;
    const blockers = depsById[id] || [];
    const allDone = blockers.every((b) => status.tasks[b]?.state === 'done');
    if (allDone) ready.push(id);
  }
  return ready;
}

function computeDrift(status) {
  return Object.entries(status.tasks)
    .filter(([, entry]) => entry.state === 'drift')
    .map(([id]) => id);
}

function computeRunning(status) {
  return Object.entries(status.tasks)
    .filter(([, entry]) => entry.state === 'running')
    .map(([id]) => id);
}

// ─── modes ───────────────────────────────────────────────────────────────────

if (args.mark) {
  const taskId = args.mark;
  const newState = args._[0];
  if (!newState) { console.error('usage: --mark <task-id> <state>'); process.exit(2); }
  const validStates = ['pending', 'running', 'done', 'blocked-needs-review', 'failed', 'drift'];
  if (!validStates.includes(newState)) {
    console.error(`invalid state: ${newState}. valid: ${validStates.join(', ')}`);
    process.exit(2);
  }
  const { status } = await readState();
  if (!status.tasks[taskId]) { console.error(`unknown task: ${taskId}`); process.exit(2); }
  status.tasks[taskId].state = newState;
  status.tasks[taskId].updated_at = nowIso();
  if (newState === 'running') status.tasks[taskId].worker_turn_count = (status.tasks[taskId].worker_turn_count || 0) + 1;
  status.updated_at = nowIso();
  // Recompute overall run_state
  const all = Object.values(status.tasks);
  const terminals = ['done', 'failed', 'blocked-needs-review'];
  if (all.every((t) => terminals.includes(t.state))) status.run_state = 'closed';
  else if (all.some((t) => t.state === 'running')) status.run_state = 'executing';
  else status.run_state = 'ready';
  await writeFile(join(loopDir, 'status.json'), JSON.stringify(status, null, 2));
  console.log(`marked ${taskId} → ${newState}`);
  process.exit(0);
}

const state = await readState();
const ready = computeReady(state.status, state.deps);
const drift = computeDrift(state.status);
const running = computeRunning(state.status);

if (args.summary) {
  const counts = { pending: 0, running: 0, done: 0, failed: 0, blocked: 0, drift: 0 };
  for (const t of Object.values(state.status.tasks)) {
    if (t.state === 'blocked-needs-review') counts.blocked++;
    else counts[t.state] = (counts[t.state] || 0) + 1;
  }
  console.log(`\n=== ${loopDir} ===`);
  console.log(`run_state: ${state.status.run_state}`);
  console.log(`mode: ${state.mode}`);
  console.log(`counts: pending=${counts.pending} running=${counts.running} done=${counts.done} failed=${counts.failed} blocked=${counts.blocked} drift=${counts.drift}`);
  console.log('');
  for (const [id, entry] of Object.entries(state.status.tasks)) {
    console.log(`  ${id.padEnd(40)} ${entry.state.padEnd(20)} judge iter: ${entry.judge_iteration_count || 0}`);
  }
  process.exit(0);
}

// ─── default: print dispatch plan ────────────────────────────────────────────
const dispatchable = ready.slice(0, state.parallelWorkers - running.length);
const plan = {
  run_state: state.status.run_state,
  mode: state.mode,
  parallel_worker_limit: state.parallelWorkers,
  currently_running: running,
  ready_to_dispatch: dispatchable,
  ready_but_over_limit: ready.slice(dispatchable.length),
  drift_needs_requeue: drift,
  pending_total: Object.values(state.status.tasks).filter((t) => t.state === 'pending').length,
  next_actions: [],
};

if (drift.length > 0) plan.next_actions.push(`Requeue ${drift.length} drift task(s) — clear drift flag by --mark <id> pending`);
if (dispatchable.length > 0) plan.next_actions.push(`Dispatch ${dispatchable.length} worker(s) for: ${dispatchable.join(', ')}`);
else if (ready.length > 0) plan.next_actions.push(`Wait for running tasks to complete (${running.length} in flight); ${ready.length} ready but over parallel limit`);
else if (running.length > 0) plan.next_actions.push(`Wait for ${running.length} running task(s); no other ready work`);
else {
  const anyPending = Object.values(state.status.tasks).some((t) => t.state === 'pending');
  if (anyPending) plan.next_actions.push('Pending tasks exist but are blocked; check deps.json + running tasks');
  else plan.next_actions.push('No pending or running work — loop can close. Print Phase 7 report.');
}

console.log(JSON.stringify(plan, null, 2));
