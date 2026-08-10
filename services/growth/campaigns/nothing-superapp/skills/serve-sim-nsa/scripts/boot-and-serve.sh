#!/usr/bin/env bash
# boot-and-serve.sh — thin wrapper around repo's scripts/serve-sim-up.sh.
# Kept here so the skill is self-contained even if the repo helper moves.
#
# Usage:
#   scripts/boot-and-serve.sh                    # default: prod URL
#   scripts/boot-and-serve.sh http://localhost:3000
#   URL=https://foo scripts/boot-and-serve.sh

set -euo pipefail

# Resolve repo root via git — survives symlinked installs where the
# skill lives outside the tree.
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || echo "")"

if [[ -n "${REPO_ROOT}" && -x "${REPO_ROOT}/scripts/serve-sim-up.sh" ]]; then
  exec "${REPO_ROOT}/scripts/serve-sim-up.sh" "$@"
fi

# Fallback: repo helper missing — run the manual sequence.
URL="${1:-${URL:-https://nothing-superapp.vercel.app}}"

UDID="$(xcrun simctl list devices booted 2>/dev/null \
  | awk -F'[()]' '/Booted/ {print $2; exit}')"

if [[ -z "$UDID" ]]; then
  UDID="$(xcrun simctl list devices available 2>/dev/null \
    | awk -F'[()]' '/iPhone 17 Pro/ && /Shutdown/ {print $2; exit}')"
  if [[ -z "$UDID" ]]; then
    echo "no iPhone 17 Pro available. run: xcrun simctl list devicetypes" >&2
    exit 1
  fi
  xcrun simctl boot "$UDID"
fi

open -a Simulator >/dev/null 2>&1 || true
sleep 2
xcrun simctl openurl "$UDID" "$URL"
open "http://localhost:3200" >/dev/null 2>&1 || true
exec npx --yes serve-sim@latest --panes devices,tools --fit --theme dark
