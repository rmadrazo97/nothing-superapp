#!/usr/bin/env bash
# Boot an iPhone simulator, open Nothing Superapp in Safari, and start
# serve-sim so the sim is streamable at http://localhost:3200.
#
# Uses whichever iPhone 17 Pro / iOS 26.5 sim already exists, otherwise
# falls back to the first available booted sim. Idempotent — safe to
# re-run; serve-sim will attach to the existing helper.
#
# Usage:
#   scripts/serve-sim-up.sh                    # default sim + prod URL
#   scripts/serve-sim-up.sh <url>              # override URL
#   URL=http://localhost:3000 scripts/serve-sim-up.sh
#
# Requires: macOS Apple Silicon, Xcode CLI tools (`xcrun simctl`), Node 20+.
# Optional Claude Code plugin (run once, in Claude Code):
#   /plugin marketplace add EvanBacon/serve-sim
# — gives the agent native tool access to drive taps/gestures/type/camera.

set -euo pipefail

URL="${1:-${URL:-https://nothing-superapp.vercel.app}}"
PREFERRED_DEVICE="iPhone 17 Pro"

# 1. Pick a device.
UDID="$(xcrun simctl list devices booted 2>/dev/null \
  | awk -F'[()]' '/Booted/ {print $2; exit}')"

if [[ -z "$UDID" ]]; then
  echo "no booted sim — looking for ${PREFERRED_DEVICE}…"
  UDID="$(xcrun simctl list devices available 2>/dev/null \
    | awk -F'[()]' -v want="$PREFERRED_DEVICE" '$0 ~ want && $0 ~ /Shutdown/ {print $2; exit}')"
  if [[ -z "$UDID" ]]; then
    echo "no ${PREFERRED_DEVICE} available. run:  xcrun simctl list devicetypes" >&2
    exit 1
  fi
  echo "booting ${UDID}…"
  xcrun simctl boot "$UDID"
fi

# 2. Ensure Simulator.app is visible.
open -a Simulator >/dev/null 2>&1 || true
sleep 2

# 3. Load the URL.
echo "opening ${URL} in Safari on ${UDID}…"
xcrun simctl openurl "$UDID" "$URL"

# 4. Start serve-sim (foreground; ctrl-c to stop).
echo "starting serve-sim at http://localhost:3200"
echo "preview: open http://localhost:3200"
open "http://localhost:3200" >/dev/null 2>&1 || true
exec npx --yes serve-sim@latest --panes devices,tools --fit --theme dark
