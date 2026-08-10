#!/usr/bin/env bash
# snap.sh — take a timestamped screenshot of the booted simulator and
# print the path so the agent can immediately Read it.
#
# Usage:
#   scripts/snap.sh                    # /tmp/nsa-<epoch>.png
#   scripts/snap.sh calorie-add        # /tmp/nsa-<epoch>-calorie-add.png (adds label)
#   scripts/snap.sh -d "iPhone 17 Pro" # target a specific sim
#
# Prints ONLY the file path on stdout so it can be piped:
#   img=$(scripts/snap.sh) && open "$img"

set -euo pipefail

DEVICE="booted"
LABEL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--device) DEVICE="$2"; shift 2 ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *) LABEL="$1"; shift ;;
  esac
done

TS=$(date +%s)
SUFFIX=""
[[ -n "$LABEL" ]] && SUFFIX="-${LABEL}"
OUT="/tmp/nsa-${TS}${SUFFIX}.png"

xcrun simctl io "$DEVICE" screenshot "$OUT" >/dev/null 2>&1
echo "$OUT"
