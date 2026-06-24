# Fabrik tests

A comprehensive regression suite that surfaces **behavioral** and **visual**
changes. No npm dependencies — everything uses Node's built-ins, plus headless
Chrome for the screenshots.

## Running

```bash
npm test                 # behavior + screenshots
npm run test:behavior    # logic/simulation tests only (fast, no browser)
npm run test:screens     # compare screenshots against the committed goldens
npm run test:update      # regenerate the golden screenshots (after an intended change)
```

Equivalent without npm:

```bash
node tests/run-behavior.js
node tests/run-screens.js
node tests/run-screens.js --update
node tests/run-screens.js --scene=bridge        # just one scene
```

The screenshot runner finds Chrome automatically on Windows/macOS/Linux; override
with `CHROME=/path/to/chrome`.

## Behavioral tests (`tests/behavior/*.test.js`)

Plain Node. `tests/lib/env.js` loads the game's `<script>` modules under tiny
browser shims and exposes helpers (`flatWorld`, `newFactory`, `stubGame`,
`newGame`). `tests/lib/harness.js` is a minimal `describe`/`test` + assertions
runner. Coverage includes: world generation determinism, belt movement &
corner/bridge shape detection, auto-bridge on cross-drag, belt-bridge lane
direction (incl. the falsy-`0`/north case), crafting + the 10-item output buffer,
miners/arms/pumps, car-factory road delivery, milestone goals (incl. M9/M10
needing a real car), the build bar, save/load round-trips, and tutorials.

Add a test by dropping a `*.test.js` file in `tests/behavior/`; `test`, `eq`,
`ok`, `deepEq`, … and `env`/`FAB` are available as globals.

## Screenshot tests (`tests/screens/`)

`harness.html` renders a single named scene **deterministically** — it freezes
`performance.now`/`Date.now`, seeds the world, halts the rAF loop and renders one
frame after the assets load. `scenes.js` defines every scene (and is also read by
the Node runner for the scene list + canvas sizes). `run-screens.js` captures each
scene with headless Chrome into `out/`, decodes both PNGs (`tests/lib/png.js`,
zlib-only) and compares them to `golden/` with a small per-pixel tolerance.

- A changed scene prints `CHANGED — N px` and writes a highlighted diff to
  `tests/screens/diff/<scene>.png` (changed pixels in magenta).
- If the change is intended, run `npm run test:update` and commit the new goldens.
- `out/` and `diff/` are git-ignored; `golden/` **is** committed.

Add a scene by adding a builder to `SCENES` and an entry to `META` in
`scenes.js`, then `node tests/run-screens.js --update --scene=<name>`.

### Note on goldens

Goldens are pixel snapshots from one machine's Chrome. Small font/AA differences
across very different Chrome versions or OSes can exceed the tolerance; if you see
broad low-level diffs after a browser upgrade (and the scenes look correct),
regenerate the goldens with `--update`.
