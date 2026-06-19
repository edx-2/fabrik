# Fabrik Asset Pipeline (Google Gemini)

Generate all of Fabrik's art — the player sprite sheet, machines, item icons,
cars, and ground tiles — with Google's **Gemini image models** ("Nano Banana"),
then drop it straight into the game. Until you generate art, the game runs on
built-in placeholder graphics, so this step is optional polish.

---

## 1. Quick start

```bash
cd assets
pip install -r requirements.txt

# get a key at https://aistudio.google.com/apikey
export GEMINI_API_KEY="your-key-here"        # Windows PowerShell:  $env:GEMINI_API_KEY="..."

python generate_assets.py --list             # see everything that can be made
python generate_assets.py --asset player     # just the player walk sprite sheet
python generate_assets.py --all              # generate the whole game (~53 images)
```

Then reload `index.html` — the new art appears automatically (the script writes
`generated/manifest.js`, which the game loads on start).

---

## 2. Regenerate one thing or everything

The script is built around the request to **re-generate individual assets or all
of them**:

| Command | What it does |
|---|---|
| `python generate_assets.py --all` | Generate every asset. |
| `python generate_assets.py --asset player` | Just the player sprite sheet. |
| `python generate_assets.py --asset machine_drill car_super item_motor` | A specific set. |
| `python generate_assets.py --category machines` | A whole category (`player`, `machines`, `items`, `cars`, `tiles`). |
| `python generate_assets.py` | Interactive menu. |
| `python generate_assets.py --list` | List all asset ids. |

Useful flags: `--force` (redo even if the PNG exists), `--model <id>`,
`--api-key <key>`, `--out <dir>`, `--no-postprocess`, `--keep-raw`.

By default, assets that already exist are **skipped** — so `--all` after a
partial run only fills in the gaps. Use `--force` to redo them.

---

## 3. How the Gemini API is used (research notes)

This pipeline uses the unified **Google Gen AI SDK** (`pip install google-genai`,
`from google import genai`). Key facts that shaped the design:

- **Image models** (newest first):
  - `gemini-3-pro-image` — highest quality, aimed at "professional asset production".
  - `gemini-3.1-flash-image` — fast / high-volume.
  - `gemini-2.5-flash-image` — efficient, generally available ("Nano Banana"). **Default here.**
  Switch with `--model`. For the crispest art, try `--model gemini-3-pro-image`.

- **Generating an image** — call `client.models.generate_content(model=..., contents=[prompt, ...])`.
  The image comes back as bytes inside the response parts; we read the first
  `part.inline_data.data` (or `part.as_image()`) and open it with Pillow. See
  `gemini_client.py`.

- **Character / style consistency** — you can pass previously generated images
  back in as **reference images** (PIL images in `contents`, up to ~14) together
  with wording like *"this exact character"*. An `AssetSpec.ref` field supports
  this if you want, e.g., every machine to match a style reference.

- **Sprite sheets** — the models don't emit a perfectly aligned grid or true
  transparency on demand, so the reliable recipe is:
  1. Prompt for an explicit **N×M grid** with one consistent subject per cell
     (see the player prompt in `asset_specs.py`).
  2. Ask for a **flat solid magenta background** (`#FF00FF`).
  3. In post-processing, **chroma-key** the magenta to transparency and **resize**
     the sheet so every cell is exactly `cell` px. The game slices it at draw
     time using `rows`/`cols` from the manifest.

  This is exactly the "4×4 sprite of a consistent character in all directions"
  idea: the player asset is a 4×4 sheet — **rows = facing (up, right, down, left)**,
  **columns = walk frames** — matching the slicing in `js/game.js`.

- **Pricing heads-up** — roughly `$0.067`/image for the default
  `gemini-3.1-flash-image` at 1K (image output is `$60`/1M tokens; a 1024px
  image ≈ 1120 tokens). Higher resolutions cost more (2K ≈ `$0.10`, 4K ≈ `$0.15`);
  `gemini-2.5-flash-image` is cheaper at ≈ `$0.039`. The script prints a rough
  cost estimate before generating.

---

## 4. What gets produced

```
assets/generated/
  manifest.js          <- loaded by the game; lists every asset present
  player.png           <- 4x4 walk sprite sheet (256x256)
  machine_drill.png    <- single sprites, transparent background
  item_iron_ore.png
  car_super.png
  tile_meadow.png      <- opaque, seamless ground tiles
  ...
```

`generated/` is git-ignored (it's regenerable output). Each PNG's name is the
asset's `game_id`; the JS asset manager (`js/assets.js`) looks these up.

---

## 5. Files

| File | Role |
|---|---|
| `generate_assets.py` | CLI orchestrator (selection, generation loop, manifest). |
| `asset_specs.py` | The catalog: every asset's id, category, grid layout, and prompt. |
| `gemini_client.py` | Robust wrapper over the Gemini image API (retries, parsing). |
| `postprocess.py` | Chroma-key background removal, trim/center, sheet/tile normalize. |
| `requirements.txt` | `google-genai`, `Pillow`, `numpy`. |

To **add a new asset**: add an `AssetSpec` to `asset_specs.py` with a `game_id`
the game can reference, then `python generate_assets.py --asset <your_id>`.

---

## 6. Sources

- Gemini API — image generation (Nano Banana): https://ai.google.dev/gemini-api/docs/image-generation
- Gemini 2.5 Flash Image announcement: https://developers.googleblog.com/introducing-gemini-2-5-flash-image/
- Production update / aspect ratios: https://developers.googleblog.com/gemini-2-5-flash-image-now-ready-for-production-with-new-aspect-ratios/
