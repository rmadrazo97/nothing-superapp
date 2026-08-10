# Driving the simulator — CLI reference

All commands accept `-d <udid|device-name>` to target a specific simulator. Omit when only one is booted.

## The one rule about coordinates

**All coordinates are normalized `0..1`**, with `(0, 0)` at top-left and `(1, 1)` at bottom-right of the display. Do not pass pixel coordinates. Rotation is compensated by the helper — don't do it yourself.

## Tap

```sh
npx serve-sim tap 0.5 0.5           # dead center
npx serve-sim tap 0.5 0.94          # bottom center (usually a CTA above the tab bar)
npx serve-sim tap 0.94 0.06         # top-right (usually settings/close)
```

Use `tap`, not `gesture`, for any single-shot tap. `gesture` opens a new WebSocket per call and the latency between `begin` and `end` is interpreted as a **long press** by the simulator.

## Type text into the focused field

```sh
npx serve-sim type "log 300 kcal of oatmeal"
echo "from stdin" | npx serve-sim type --stdin
npx serve-sim type --file ./snippet.txt
```

US keyboard only. Make sure a text field is focused first — tap into it before typing.

## Hardware buttons

Six valid names — the CLI rejects anything else:

- `home` — press the home button (or trigger swipe-up-from-bottom for Face ID devices).
- `swipe_home` — explicit gesture form of home for edge devices.
- `app_switcher` — brings up the app switcher.
- `lock` — sleep/wake button.
- `siri` — invoke Siri.
- `side_button` — Face ID side button on newer models.

```sh
npx serve-sim button home
npx serve-sim button app_switcher
```

## Rotate

```sh
npx serve-sim rotate portrait
npx serve-sim rotate landscape_left
npx serve-sim rotate landscape_right
npx serve-sim rotate portrait_upside_down
```

Only these four values are valid. The helper remembers the orientation and rotates subsequent gestures client-side.

## Gesture — multi-step, dragging, swiping

Only use when you need multiple points threaded through the same WebSocket. Shape:

```json
{
  "steps": [
    {"type": "begin", "x": 0.5, "y": 0.9, "time": 0},
    {"type": "move",  "x": 0.5, "y": 0.5, "time": 200},
    {"type": "end",   "x": 0.5, "y": 0.1, "time": 400}
  ]
}
```

- `x`, `y` — normalized `0..1`.
- `time` — milliseconds since the gesture started.
- Multi-finger: add a `pointer` integer to each step (`0`, `1`, `2` …).

Common recipes:

```sh
# Swipe up from bottom (invoke home on Face ID devices — or use `button swipe_home`)
npx serve-sim gesture '{"steps":[
  {"type":"begin","x":0.5,"y":0.98,"time":0},
  {"type":"move","x":0.5,"y":0.5,"time":150},
  {"type":"end","x":0.5,"y":0.1,"time":300}
]}'

# Swipe down to close a drawer
npx serve-sim gesture '{"steps":[
  {"type":"begin","x":0.5,"y":0.1,"time":0},
  {"type":"move","x":0.5,"y":0.9,"time":200},
  {"type":"end","x":0.5,"y":0.95,"time":250}
]}'

# Two-finger pinch (zoom out — Nothing Superapp intentionally disables this)
npx serve-sim gesture '{"steps":[
  {"type":"begin","x":0.4,"y":0.5,"time":0,"pointer":0},
  {"type":"begin","x":0.6,"y":0.5,"time":0,"pointer":1},
  {"type":"move","x":0.48,"y":0.5,"time":200,"pointer":0},
  {"type":"move","x":0.52,"y":0.5,"time":200,"pointer":1},
  {"type":"end","x":0.5,"y":0.5,"time":300,"pointer":0},
  {"type":"end","x":0.5,"y":0.5,"time":300,"pointer":1}
]}'
```

## Two-tap confirm (Nothing Superapp × Delete pattern)

The app uses two-tap confirm on destructive actions — first tap arms the button (cadmium border), second tap fires. Auto-disarms after 3 s.

```sh
npx serve-sim tap 0.9 0.42          # first tap arms
sleep 0.5
npx serve-sim tap 0.9 0.42          # second tap confirms
```

## Camera injection

Replaces the sim's camera feed for one app. Requires macOS 14+. For PWAs, target Safari (`com.apple.mobilesafari`) — iOS routes `getUserMedia` through Safari's camera pipeline even inside home-screen installs.

```sh
# Static image (great for the calorie-lite "photo → macros" flow)
npx serve-sim camera com.apple.mobilesafari --file ~/Pictures/plate.jpg

# Looping video
npx serve-sim camera com.apple.mobilesafari --file ~/Movies/menu.mp4

# Live webcam
npx serve-sim camera com.apple.mobilesafari --webcam
npx serve-sim camera com.apple.mobilesafari --webcam "MacBook Pro Camera"

# Animated placeholder (default)
npx serve-sim camera com.apple.mobilesafari
```

Hot-swap source (no relaunch):

```sh
npx serve-sim camera switch webcam
npx serve-sim camera switch ~/Pictures/next-plate.jpg
```

Cleanup:

```sh
npx serve-sim camera --stop-webcam
```

## URL navigation

Open a URL in the sim's default browser (Safari) without a tap:

```sh
xcrun simctl openurl booted "https://nothing-superapp.vercel.app/app/calorie-lite"
xcrun simctl openurl booted "https://nothing-superapp.vercel.app/app/assistant?t=abc123"   # deep link into a specific thread
```

## Discovery + cleanup

```sh
npx serve-sim --list              # all running helpers, human-readable
npx serve-sim --list -q           # JSON — parse this in scripts
npx serve-sim --kill              # stop all
npx serve-sim --kill "iPhone 17 Pro"
```

Always parse `-q` JSON in agent code — the non-quiet output is human-formatted and may change between versions.

## When to use each output mode

| Situation | Command |
|---|---|
| Human review | plain (no `-q`) |
| Agent parsing | `-q` JSON |
| CI / logs | `-q` JSON, tee to a file |
