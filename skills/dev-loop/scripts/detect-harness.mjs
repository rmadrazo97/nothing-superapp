#!/usr/bin/env node
/**
 * detect-harness.mjs — Phase 0 harness feature detection.
 *
 * Inspects the runtime environment and reports which tier-routing features
 * are available. Writes the result to <out>/tier-config.yaml (or stdout if
 * --stdout). Used by run-orchestrator.mjs and build-taskpack.mjs to seed
 * the harness section of tier-config.yaml.
 *
 * Usage:
 *   node scripts/detect-harness.mjs [--out <path>] [--stdout]
 *
 * Zero dependencies. Node >= 18.
 */

import { writeFile, mkdir, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

// ─── detection ───────────────────────────────────────────────────────────────
async function hasCommand(cmd) {
  const { execFile } = await import('node:child_process');
  return new Promise((res) => {
    execFile('which', [cmd], (err, stdout) => res(!err && stdout.trim().length > 0));
  });
}

async function fileExists(path) {
  try { await access(path, fsConstants.F_OK); return true; } catch { return false; }
}

async function detect() {
  const env = process.env;

  // Claude Code detection
  let runtime = 'generic';
  let version = 'unknown';
  const features = {
    advisor: false,
    agent_tool: false,
    ask_user_question: false,
    subagent_context: false,
    parallel_workers: false,
  };

  if (env.CLAUDE_CODE_VERSION || env.CLAUDECODE) {
    runtime = 'claude-code';
    version = env.CLAUDE_CODE_VERSION || 'unknown';
    // Claude Code >= 2.1 has advisor + agent tool + ask user question
    const [major, minor] = version.split('.').map((n) => parseInt(n, 10) || 0);
    if ((major > 2) || (major === 2 && minor >= 1)) {
      features.advisor = true;
      features.agent_tool = true;
      features.ask_user_question = true;
      features.subagent_context = true;
      features.parallel_workers = true;
    } else {
      // Older Claude Code — Agent tool exists but no /advisor
      features.agent_tool = true;
      features.ask_user_question = true;
      features.subagent_context = true;
      features.parallel_workers = true;
    }
  } else if (env.CURSOR_SESSION || await fileExists('.cursor/config.json')) {
    runtime = 'cursor';
    version = env.CURSOR_VERSION || 'unknown';
    // Cursor: limited subagent + no advisor
    features.parallel_workers = false;
  } else if (await hasCommand('codex')) {
    runtime = 'codex';
    version = 'codex-cli';
    // Codex-cli: session forks via `codex exec`, no advisor
    features.subagent_context = true;
    features.parallel_workers = true;   // parallel `codex exec` calls
  } else if (env.TERM || env.SHELL) {
    runtime = 'generic';
    version = env.TERM_PROGRAM || env.SHELL || 'shell';
  }

  return { runtime, version, features };
}

function toYaml(detection) {
  const { runtime, version, features } = detection;
  return `harness:
  runtime: ${runtime}
  version: ${JSON.stringify(version)}
  features:
    advisor:            ${features.advisor}
    agent_tool:         ${features.agent_tool}
    ask_user_question:  ${features.ask_user_question}
    subagent_context:   ${features.subagent_context}
    parallel_workers:   ${features.parallel_workers}
`;
}

// ─── recommendation ──────────────────────────────────────────────────────────
function recommendMode(detection) {
  const { runtime, features } = detection;
  if (runtime === 'claude-code' && features.advisor) return 'advisor';
  if (runtime === 'claude-code' && features.agent_tool) return 'direct';
  if (runtime === 'cursor' || runtime === 'generic') return 'manual';
  if (runtime === 'codex') return 'direct';
  return 'manual';
}

// ─── main ────────────────────────────────────────────────────────────────────
const detection = await detect();
const yaml = toYaml(detection);
const recommended_mode = recommendMode(detection);

const output = {
  yaml,
  detection,
  recommended_mode,
};

if (args.stdout || !args.out) {
  console.log('# dev-loop harness detection\n');
  console.log(yaml);
  console.log(`# recommended mode: ${recommended_mode}`);
  console.log(`# reason: ${
    detection.runtime === 'claude-code' && detection.features.advisor
      ? 'Claude Code with /advisor — advisor mode gives best cost/quality'
      : detection.runtime === 'claude-code'
        ? 'Claude Code without /advisor — direct mode; advisor calls will use Task subagent fallback'
        : detection.runtime === 'codex'
          ? 'Codex CLI — direct mode; parallel `codex exec` for workers'
          : detection.runtime === 'cursor'
            ? 'Cursor detected — manual mode recommended (limited subagent support)'
            : 'Generic runtime — manual mode; user runs each task through their preferred tool'
  }`);
}

if (args.out) {
  const outPath = resolve(args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, yaml);
  console.log(`Wrote ${outPath}`);
}
