# Fabrik Sound-Effects Pipeline (ElevenLabs)

Generate Fabrik's sound effects — clicks, mining, crafting, the milestone
fanfare, car engine, loops, etc. — with the **ElevenLabs Text-to-Sound-Effects
API**, then drop them straight into the game. Until you generate audio, the game
runs silently, so this step is optional.

---

## 1. Quick start

```bash
cd assets

# get a key at https://elevenlabs.io/app/settings/api-keys
export ELEVENLABS_API_KEY="your-key-here"     # Windows PowerShell: $env:ELEVENLABS_API_KEY="..."

python generate_sfx.py --list            # see every sound that can be made
python generate_sfx.py --sfx milestone   # just the milestone fanfare
python generate_sfx.py --all             # generate every sound (~16)
```

Then reload `index.html` — the sounds play automatically (the script writes
`generated/sfx_manifest.js`, which the game loads on start). There's a 🔊 mute
button in-game, and the mute state is remembered.

> **No extra Python packages required.** The client uses only the standard
> library (`urllib`). If you happen to have the official `elevenlabs` SDK
> installed, it's used automatically; otherwise it falls back to a direct HTTPS
> request.

---

## 2. Regenerate one sound or everything

| Command | What it does |
|---|---|
| `python generate_sfx.py --all` | Generate every sound. |
| `python generate_sfx.py --sfx milestone` | Just the milestone fanfare. |
| `python generate_sfx.py --sfx click place car_ready` | A specific set. |
| `python generate_sfx.py --category ui` | A whole category (`ui`, `world`, `factory`, `car`, `event`). |
| `python generate_sfx.py` | Interactive menu. |
| `python generate_sfx.py --list` | List all sound ids. |

Existing files are **skipped** unless you pass `--force`. Other flags:
`--api-key`, `--out`, `--model`, `--format`, `--duration <sec>` (override),
`--influence <0..1>` (override).

---

## 3. How the ElevenLabs API is used (research notes)

- **Endpoint:** `POST https://api.elevenlabs.io/v1/sound-generation`
- **Auth:** header `xi-api-key: <key>`
- **Body (JSON):**
  - `text` — the sound description (required).
  - `model_id` — default **`eleven_text_to_sound_v2`** (the model that supports looping).
  - `duration_seconds` — 0.5–30 (omit to let the model choose).
  - `prompt_influence` — 0–1 (default 0.3); higher = follow the prompt more strictly.
  - `loop` — `true/false`; produces a **seamless loop** (v2 model only). Used for
    the ambient, belt, and driving loops.
- **Query:** `output_format` (e.g. `mp3_44100_128`, the default here).
- **Response:** binary audio bytes — saved straight to `<id>.mp3`.

See `elevenlabs_client.py`. The official SDK call is equivalent:
`client.text_to_sound_effects.convert(text=..., duration_seconds=..., loop=...)`.

---

## 4. What gets produced

```
assets/generated/sfx/
  sfx_manifest.js  -> ../sfx_manifest.js   (written one level up, loaded by the game)
  click.mp3   open.mp3   close.mp3   error.mp3
  mine.mp3    pickup.mp3  ambient.mp3 (loop)
  place.mp3   remove.mp3  craft.mp3   belt_loop.mp3 (loop)
  car_ready.mp3  drive_loop.mp3 (loop)  grapple.mp3
  milestone.mp3
```

`generated/` is git-ignored by default (regenerable output). Each file's name is
the sound's id; `js/audio.js` plays it via `FAB.sfx('<id>')`.

---

## 5. How sounds are wired into the game

`js/audio.js` (`FAB.Audio`) loads the manifest and plays sounds; game code calls
the safe helpers `FAB.sfx(id, opts)`, `FAB.sfxLoop(id)`, `FAB.sfxStop(id)` (which
no-op if audio isn't present). Current hooks:

| Sound | When it plays |
|---|---|
| `click` / `open` / `close` | UI buttons / opening / closing dialogs |
| `error` | "Can't build there" |
| `mine` / `pickup` | hand-mining a resource |
| `place` / `remove` | placing / removing a machine (throttled while dragging belts) |
| `craft` | a machine finishes a part (gently throttled) |
| `milestone` | completing a milestone |
| `car_ready` | a car rolls onto the parking lot |
| `grapple` | the grappler grabs something |
| `ambient` (loop) | background ambience while playing |
| `belt_loop` (loop) | while any belts exist |
| `drive_loop` (loop) | while driving a car |

To **add a sound**: add a `SfxSpec` to `sfx_specs.py` with an `id`, then call
`FAB.sfx('your_id')` at the right spot in the JS and run
`python generate_sfx.py --sfx your_id`.

---

## 6. Files

| File | Role |
|---|---|
| `generate_sfx.py` | CLI orchestrator (selection, generation loop, manifest). |
| `sfx_specs.py` | The catalog: every sound's id, category, prompt, duration, loop, volume. |
| `elevenlabs_client.py` | Wrapper over the ElevenLabs SFX API (stdlib HTTP, retries; SDK if present). |

---

## 7. Sources

- Create sound effect (API reference): https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
- Sound effects overview: https://elevenlabs.io/docs/overview/capabilities/sound-effects
- Official Python SDK: https://github.com/elevenlabs/elevenlabs-python
