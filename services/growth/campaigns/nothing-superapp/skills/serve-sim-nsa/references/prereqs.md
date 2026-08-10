# Prerequisites — read once per session

serve-sim is macOS-only, Apple-Silicon-only, and needs a booted simulator. Run `scripts/check-prereqs.sh` — it prints the fix on any failure. Below is the manual walkthrough for the same checks so you can diagnose without the script.

## Host

| Check | Command | Expected |
|---|---|---|
| macOS | `uname -s` | `Darwin` |
| Apple Silicon | `uname -m` | `arm64` (the bundled `serve-sim-bin` helper does not run on Intel x86_64) |
| Xcode CLI tools | `xcrun --version` | prints a version, exits 0. If not: `xcode-select --install` |
| Node ≥ 20 | `node --version` | `v20.x` or newer. `serve-sim` refuses to run on end-of-life Node. |
| macOS 14+ (for camera only) | `sw_vers -productVersion` | ≥ `14.0` if you need `serve-sim camera` |

## Simulator

You need at least one booted simulator. `scripts/boot-and-serve.sh` handles this; here's what it does manually.

```sh
# See what's currently running
xcrun simctl list devices booted

# List all installed iPhone sims
xcrun simctl list devices available | grep -i "iPhone"

# Boot the newest iPhone 17 Pro on iOS 26.5 (adjust UDID)
xcrun simctl boot 7B45B61A-38E7-48D5-AC74-67783463C645
open -a Simulator
```

If none of the iPhone 17-family sims are installed, create one:

```sh
# List installable runtimes
xcrun simctl list runtimes | grep iOS

# Create + boot
xcrun simctl create "iPhone 17 Pro" \
  com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro \
  com.apple.CoreSimulator.SimRuntime.iOS-26-5
xcrun simctl boot "iPhone 17 Pro"
open -a Simulator
```

Older iPhone models work identically — pick whatever ships with the iOS you want to test on. Recommend iOS 26.5+ for the design tokens and Dynamic Island testing.

## Signing in to Nothing Superapp inside the sim

The PWA is subscription-gated. Two paths:

1. **Magic link** — type a real email into `/login`, receive the link on the same Mac, `xcrun simctl openurl booted "<link>"` to open it in the sim's Safari.
2. **Google OAuth** — tap `Continue with Google` on `/login`; Safari on the sim shows the OAuth screen. Requires the account to have an active subscription.

The founder account (`jmadrazo7@gmail.com`) has an active subscription and is the recommended test user.

## What "booted" means

serve-sim attaches to whatever `simctl` reports as `Booted`. If you `xcrun simctl shutdown <udid>` mid-session, serve-sim's helper for that device exits. Boot it again and re-run `scripts/boot-and-serve.sh` (idempotent — reuses the existing helper if any).
