#!/usr/bin/env node
/**
 * watch-drift.mjs — mark affected tasks as drift when spec.md changes mid-flight.
 *
 * Called by the orchestrator whenever it applies a watch-mode spec amendment.
 * Compares the amendment (a diff of spec.md) to each task's owned_files +
 * acceptance_criteria + spec_section reference, marks affected tasks as
 * `drift` in status.json, and appends the affected list to progress.md.
 *
 * Detection heuristic (deliberately conservative — err toward marking more
 * tasks as drift; false-positive costs a re-check, false-negative costs
 * a stale build):
 *   - Task's spec_section is inside the amended range → drift
 *   - Task's owned files or off-limits are mentioned in the amendment → drift
 *   - Task's acceptance criteria keywords appear in the amendment → drift
 *
 * Usage:
 *   node scripts/watch-drift.mjs --loop <path> --amendment <text-of-amendment>
 *   node scripts/watch-drift.mjs --loop <path> --spec-diff <path-to-diff>
 *
 * Zero dependencies. Node >= 18.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
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

if (!args.loop || (!args.amendment && !args['spec-diff'])) {
  console.error('usage: watch-drift.mjs --loop <path> --amendment "<text>"  OR  --spec-diff <path>');
  process.exit(2);
}

const loopDir = resolve(args.loop);
const amendment = args.amendment || await readFile(resolve(args['spec-diff']), 'utf8');

// ─── read task files ─────────────────────────────────────────────────────────
async function readTasks() {
  const tasksDir = join(loopDir, 'tasks');
  const files = (await readdir(tasksDir)).filter((f) => f.endsWith('.md'));
  const tasks = [];
  for (const f of files) {
    const raw = await readFile(join(tasksDir, f), 'utf8');
    const id = f.replace(/\.md$/, '');
    const specSectionMatch = raw.match(/spec_section:\s*"([^"]+)"/);
    const ownedMatch = raw.match(/## Files you own\s*\n([\s\S]*?)\n##/);
    const offLimitsMatch = raw.match(/## Files off-limits[^\n]*\n([\s\S]*?)\n##/);
    const acceptanceMatch = raw.match(/## Acceptance criteria\s*\n([\s\S]*?)\n##/);
    tasks.push({
      id,
      spec_section: specSectionMatch?.[1] || '',
      owned: extractPaths(ownedMatch?.[1] || ''),
      off_limits: extractPaths(offLimitsMatch?.[1] || ''),
      acceptance_keywords: extractAcceptanceKeywords(acceptanceMatch?.[1] || ''),
    });
  }
  return tasks;
}

function extractPaths(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

function extractAcceptanceKeywords(text) {
  // Extract noun-heavy words as heuristic — anything > 4 chars, not a common word
  const stopWords = new Set(['user', 'when', 'this', 'that', 'from', 'with', 'have', 'must', 'should', 'renders', 'shows', 'exit', 'code']);
  return [...new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !stopWords.has(w))
  )];
}

// ─── detect drift ────────────────────────────────────────────────────────────
function isDrift(task, amendment) {
  const lc = amendment.toLowerCase();
  // Path match
  for (const p of [...task.owned, ...task.off_limits]) {
    if (lc.includes(p.toLowerCase())) return { drifted: true, reason: `path ${p} mentioned in amendment` };
  }
  // Spec section match
  const sectionRef = task.spec_section.match(/§\s*(\d+(?:\.\d+)*)/);
  if (sectionRef && lc.includes(sectionRef[0].toLowerCase())) {
    return { drifted: true, reason: `spec section ${sectionRef[0]} mentioned in amendment` };
  }
  // Keyword match (2+ keywords hit)
  const hits = task.acceptance_keywords.filter((k) => lc.includes(k));
  if (hits.length >= 2) {
    return { drifted: true, reason: `acceptance keywords hit: ${hits.slice(0, 3).join(', ')}` };
  }
  return { drifted: false, reason: '' };
}

// ─── main ────────────────────────────────────────────────────────────────────
const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 16);

const tasks = await readTasks();
const status = JSON.parse(await readFile(join(loopDir, 'status.json'), 'utf8'));
const drifted = [];

for (const t of tasks) {
  const { drifted: isD, reason } = isDrift(t, amendment);
  if (isD) {
    const currentState = status.tasks[t.id]?.state;
    // Only mark drift for states that make sense to requeue
    if (['pending', 'running', 'done', 'failed'].includes(currentState)) {
      status.tasks[t.id].state = 'drift';
      status.tasks[t.id].drift_reason = reason;
      status.tasks[t.id].updated_at = nowIso();
      drifted.push({ id: t.id, reason });
    }
  }
}

status.updated_at = nowIso();
await writeFile(join(loopDir, 'status.json'), JSON.stringify(status, null, 2));

// Append to progress.md
const progressEntry = `\n## Watch-mode drift — ${nowIso()}\n\n`
  + `Amendment applied (summary): ${amendment.slice(0, 200).replace(/\n/g, ' ')}${amendment.length > 200 ? '…' : ''}\n\n`
  + `Affected tasks (${drifted.length}):\n`
  + (drifted.length ? drifted.map((d) => `- **${d.id}** — ${d.reason}`).join('\n') : '- (none)')
  + '\n\nAll affected tasks marked `drift`. Orchestrator will requeue on next turn.\n';

const progressPath = join(loopDir, 'progress.md');
const existing = await readFile(progressPath, 'utf8');
await writeFile(progressPath, existing + progressEntry);

console.log(`Marked ${drifted.length} task(s) as drift.`);
for (const d of drifted) console.log(`  - ${d.id}  (${d.reason})`);
