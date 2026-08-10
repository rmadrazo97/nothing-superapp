#!/usr/bin/env bash
# smoke-nsa.sh — walk a subset of the canonical Nothing Superapp flows,
# taking one screenshot per step into a timestamped directory. Prints
# the directory path at the end so the agent can iterate the images with
# `ls` + Read.
#
# Skips anything that needs a logged-in user beyond opening the URL —
# this is a shallow smoke, not a full flow driver. For deep flows see
# references/flows.md and drive them manually with `scripts/snap.sh`
# after each interaction.
#
# Usage:
#   scripts/smoke-nsa.sh                        # prod
#   scripts/smoke-nsa.sh http://localhost:3000  # local dev

set -euo pipefail

BASE="${1:-https://nothing-superapp.vercel.app}"
TS=$(date +%s)
OUTDIR="/tmp/nsa-smoke-${TS}"
mkdir -p "$OUTDIR"

snap() {
  local name="$1"
  xcrun simctl io booted screenshot "${OUTDIR}/${name}.png" >/dev/null 2>&1
  echo "  ✓ ${name}"
}

open_url() {
  xcrun simctl openurl booted "$1"
  sleep 3   # let Safari load
}

echo "Smoke-testing ${BASE}"
echo "Output: ${OUTDIR}"
echo

for path in "/" "/login" "/app" "/app/calorie-lite" "/app/gym-routine" \
            "/app/pomodoro" "/app/reminders" "/app/assistant" "/app/settings"; do
  name=$(echo "$path" | sed 's|/|_|g; s|^_||; s|^$|root|')
  echo "→ ${path}"
  open_url "${BASE}${path}"
  snap "${name:-root}"
done

echo
echo "Index:"
ls -1 "$OUTDIR"
echo
echo "Screenshots: ${OUTDIR}"
