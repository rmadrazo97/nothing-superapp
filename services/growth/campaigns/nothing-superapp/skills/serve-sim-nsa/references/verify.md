# Verifying — screenshot loop + accessibility tree

You are a multimodal agent. Screenshotting and Reading the file is your primary verification tool — you see the actual pixels, not the DOM.

## Screenshot

```sh
xcrun simctl io booted screenshot /tmp/nsa-$(date +%s).png
```

Or use the helper — same thing but returns the path on stdout:

```sh
scripts/snap.sh
# → /tmp/nsa-1786321234.png
```

Then call `Read` on that path. You get PNG pixels. Look for:

- **Layout** — is content clipped by the Dynamic Island / home indicator? (safe-area padding).
- **Colors** — is the correct token used? (cadmium red should only appear on CTAs + write actions).
- **Typography** — is Doto used for hero numbers, Space Mono for data, Space Grotesk for body?
- **State** — is the correct tab active? Is the streaming cursor visible?
- **First-run overlays** — Safari's "View Bookmarks" tooltip covers the app on a fresh sim; dismiss it before serious testing.

## Before / after diffs

For a UI change, take a screenshot BEFORE landing the code AND after. The eye catches regressions between two adjacent frames that it misses on a single one.

```sh
scripts/snap.sh                   # captures /tmp/nsa-<t0>.png
# ← edit code, deploy →
scripts/snap.sh                   # captures /tmp/nsa-<t1>.png
```

Read both, compare.

## Accessibility tree — for content-driven taps

Instead of hunting for pixel coordinates ("where is the LOG button on this screen?"), fetch the AX tree:

```sh
curl -s http://localhost:3100/ax | jq
```

Returns axe-style JSON with each element's `role`, `label`, `frame` (with normalized coords), and `identifier`. Use it to tap by label:

```sh
# Example: find the "SEND MAGIC LINK" button and tap its center
LABEL="SEND MAGIC LINK"
X=$(curl -s http://localhost:3100/ax | jq -r --arg L "$LABEL" \
  '.. | objects | select(.label == $L) | (.frame.x + .frame.width/2)')
Y=$(curl -s http://localhost:3100/ax | jq -r --arg L "$LABEL" \
  '.. | objects | select(.label == $L) | (.frame.y + .frame.height/2)')
npx serve-sim tap "$X" "$Y"
```

If the label query returns empty, **fail loudly** — do not guess coordinates. A guessed tap is almost always worse than "target not found."

## Event log

Confirm your taps registered:

```sh
npx serve-sim event-log -d <udid>
```

Recent events include tap coordinates, gesture names, button presses. If you sent a tap and nothing changed on screen, the event log tells you whether the input actually reached the sim.

## Console + network from Safari

For deeper debug (JS errors, XHR calls), attach the desktop Safari's Web Inspector to the sim's Safari:

1. On the Mac: Safari → Settings → Advanced → check `Show Develop menu in menu bar`.
2. In Safari on the sim: navigate to `nothing-superapp.vercel.app`.
3. On the Mac: Safari → Develop → `<Simulator name>` → the tab. Full Web Inspector attaches.

This is out-of-band from serve-sim but often the fastest path to figuring out why a fetch is 500-ing or a component didn't hydrate.

## Video recording

For animations, streaming cursor, drawer slide-ins, etc:

```sh
xcrun simctl io booted recordVideo /tmp/nsa-flow.mov
# ← perform the flow →
# ctrl-c to stop
```

Then convert / trim as needed. `serve-sim` itself streams 60fps to `:3200`; the video recording is a separate `simctl` capability.
