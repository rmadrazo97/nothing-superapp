#!/usr/bin/env bash
# check-prereqs.sh — verify the host can run serve-sim + drive a booted sim
# for Nothing Superapp testing. Exits 0 if ready, non-zero with a fix line.
#
# Agent usage: run this once at the start of a session. If it exits
# non-zero, surface the printed fix to the user — do NOT paper over it.

set -u

fail() {
  echo "❌ $1" >&2
  [[ -n "${2:-}" ]] && echo "   fix: $2" >&2
  exit 1
}

ok() { echo "✓ $1"; }

# 1. macOS
if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "not macOS ($(uname -s))" "serve-sim only runs on macOS"
fi
ok "macOS"

# 2. Apple Silicon (arm64)
if [[ "$(uname -m)" != "arm64" ]]; then
  fail "not Apple Silicon ($(uname -m))" "the serve-sim-bin helper is arm64-only"
fi
ok "Apple Silicon (arm64)"

# 3. Xcode CLI tools
if ! command -v xcrun >/dev/null 2>&1; then
  fail "no xcrun on PATH" "xcode-select --install"
fi
if ! xcrun --version >/dev/null 2>&1; then
  fail "xcrun installed but not working" "xcode-select --install (or open Xcode to accept the license)"
fi
ok "Xcode CLI tools ($(xcrun --version | head -1))"

# 4. Node ≥ 20
if ! command -v node >/dev/null 2>&1; then
  fail "no node on PATH" "install Node 20+ from nodejs.org or via nvm/asdf"
fi
NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node $(node -v) is too old (need ≥ 20)" "upgrade Node — serve-sim refuses EOL versions"
fi
ok "Node $(node -v)"

# 5. macOS version (only required for camera injection — warn, don't fail)
MACOS=$(sw_vers -productVersion)
MACOS_MAJOR=${MACOS%%.*}
if [[ "$MACOS_MAJOR" -lt 14 ]]; then
  echo "⚠  macOS ${MACOS} — 'serve-sim camera' subcommand requires macOS 14+; everything else works."
else
  ok "macOS ${MACOS} (camera injection supported)"
fi

# 6. Booted simulator (nice-to-have; boot-and-serve.sh handles cold-start)
BOOTED=$(xcrun simctl list devices booted 2>/dev/null | awk -F'[()]' '/Booted/ {print $2; exit}' || true)
if [[ -n "${BOOTED}" ]]; then
  ok "simulator booted (${BOOTED})"
else
  echo "⚠  no booted simulator — scripts/boot-and-serve.sh will boot one for you"
fi

# 7. Repo helper exists (this skill wraps it)
# `git rev-parse` handles nested repos + symlinked skill installs cleanly,
# whereas relative `../` chains break the moment the skill is copied elsewhere.
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -n "${REPO_ROOT}" && -x "${REPO_ROOT}/scripts/serve-sim-up.sh" ]]; then
  ok "repo helper: scripts/serve-sim-up.sh"
else
  echo "⚠  scripts/serve-sim-up.sh not found or not executable at ${REPO_ROOT}"
  echo "   this skill still works via 'npx serve-sim' directly, just less convenient."
fi

echo
echo "READY."
