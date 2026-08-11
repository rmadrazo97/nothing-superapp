#!/usr/bin/env node
/**
 * scripts/cleanup-orphan-threads.mjs — sweep empty copilot_threads rows.
 *
 * Background:
 *   The v0.5.2/v0.5.3 first-message flow briefly created a copilot_threads row
 *   BEFORE the first user message landed. If the send failed / the tab closed
 *   during that window, the row was left behind with zero messages — an
 *   "orphan" thread that shows up as an empty "New chat" in the drawer.
 *
 *   The race is fixed in v0.5.3 (ensureThreadForFirstMessage no longer races
 *   the useChat transport rebuild), but legacy orphans are still in prod, and
 *   any future regression would silently accumulate more. This script is the
 *   defensive sweep — one-shot to clean the backlog, and wired to an hourly
 *   GitHub Actions cron (.github/workflows/orphan-threads-tick.yml).
 *
 * Safety:
 *   - Only deletes threads with 0 rows in copilot_messages.
 *   - Only deletes threads OLDER than 5 minutes (in-flight first-message
 *     window). A legit thread that took 4 minutes to see its first turn is
 *     rare but possible; the 5-min cushion is conservative.
 *   - Never touches threads with any messages — no matter how old.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/cleanup-orphan-threads.mjs
 *
 * Local dev tip: source apps/web/.env.local first —
 *   set -a && . apps/web/.env.local && set +a && node scripts/cleanup-orphan-threads.mjs
 *
 * Exits 0 on success (including 0-deleted). Exits 0 (with a warning) when
 * creds are absent so the CI cron never fails in preview branches.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn(
    'cleanup-orphan-threads: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Skipping cleanly — CI runs without creds should be no-ops.',
  );
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// 5-minute grace window — a first-message thread must be at least this old
// before we consider it orphan-eligible. Guards against racing an in-flight
// stream whose persistTurn hasn't landed yet.
const GRACE_MS = 5 * 60 * 1000;

async function main() {
  const cutoffIso = new Date(Date.now() - GRACE_MS).toISOString();

  // Pull candidate threads: older than the grace window. We include
  // ARCHIVED threads deliberately — a soft-deleted empty "New chat" row is
  // still an orphan (no messages, no recoverable content), and the legacy
  // backlog from v0.5.2/v0.5.3 mostly lives there because users hit the
  // drawer's delete on empty rows they never intended to create. We do the
  // messages-count filter in JS so we don't need a stored proc — the
  // candidate set is small (should be <1000 even on a bad day) and we're
  // on the service-role client.
  const { data: candidates, error: candErr } = await supabase
    .from('copilot_threads')
    .select('id, created_at, title, archived_at')
    .lt('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (candErr) {
    console.error(`cleanup-orphan-threads: candidate query failed: ${candErr.message}`);
    process.exit(1);
  }

  const candidateIds = (candidates ?? []).map((r) => r.id);
  console.log(`cleanup-orphan-threads: ${candidateIds.length} candidate threads older than ${cutoffIso}.`);

  if (candidateIds.length === 0) {
    await logRun(0);
    console.log('cleanup-orphan-threads: nothing to inspect. Done.');
    return;
  }

  // Fetch the DISTINCT thread_ids that DO have messages, in chunks so the
  // .in() filter doesn't blow past Postgrest's URL length cap.
  const withMessages = new Set();
  const CHUNK = 200;
  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const slice = candidateIds.slice(i, i + CHUNK);
    const { data: msgRows, error: msgErr } = await supabase
      .from('copilot_messages')
      .select('thread_id')
      .in('thread_id', slice);
    if (msgErr) {
      console.error(`cleanup-orphan-threads: messages query failed: ${msgErr.message}`);
      process.exit(1);
    }
    for (const row of msgRows ?? []) {
      withMessages.add(row.thread_id);
    }
  }

  const orphanIds = candidateIds.filter((id) => !withMessages.has(id));
  console.log(`cleanup-orphan-threads: ${orphanIds.length} orphan threads to delete.`);

  if (orphanIds.length === 0) {
    await logRun(0);
    return;
  }

  // Hard-delete — these rows have zero messages so nothing cascades. Chunk
  // the delete for the same URL-length reason as above.
  let deleted = 0;
  for (let i = 0; i < orphanIds.length; i += CHUNK) {
    const slice = orphanIds.slice(i, i + CHUNK);
    const { error: delErr, count } = await supabase
      .from('copilot_threads')
      .delete({ count: 'exact' })
      .in('id', slice);
    if (delErr) {
      console.error(`cleanup-orphan-threads: delete failed on chunk ${i}: ${delErr.message}`);
      process.exit(1);
    }
    deleted += count ?? slice.length;
  }

  console.log(`cleanup-orphan-threads: deleted ${deleted} orphan threads.`);
  await logRun(deleted);
}

/**
 * Best-effort log to backfill_log. If migration 028 hasn't landed yet the
 * insert 404s — we log a warning and keep going. The script's real work is
 * already done at this point.
 */
async function logRun(rowsAffected) {
  try {
    const { error } = await supabase
      .from('backfill_log')
      .insert({
        script_name: 'cleanup-orphan-threads',
        rows_affected: rowsAffected,
        notes: `grace_ms=${GRACE_MS}`,
      });
    if (error) {
      console.warn(
        `cleanup-orphan-threads: backfill_log insert failed (non-fatal): ${error.message}`,
      );
    } else {
      console.log('cleanup-orphan-threads: logged to backfill_log.');
    }
  } catch (err) {
    console.warn(
      `cleanup-orphan-threads: backfill_log insert threw (non-fatal): ${err?.message ?? err}`,
    );
  }
}

main().catch((err) => {
  console.error(`cleanup-orphan-threads: fatal — ${err?.message ?? err}`);
  process.exit(1);
});
