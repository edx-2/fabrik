# ▶️ How to Run Fabrik

Fabrik is a browser game written in plain HTML5 + JavaScript — **no build step**.

## Play the game

**Easiest:** double-click **`index.html`** to open it in your browser. That's it.

> The game uses classic `<script>` tags (not ES modules) specifically so it runs
> straight from the file system. Saving uses your browser's local storage.

If your browser is strict about local files, serve the folder instead:

```bash
# from the project folder
python -m http.server 8000
# then open http://localhost:8000
```

The game starts with friendly **placeholder art** so it's fully playable before
you generate any pictures.

## Controls

| | |
|---|---|
| **Move** | Arrow keys / WASD |
| **Mine** (hold near a resource) | Space |
| **Build menu** | B (or the 🧰 button) |
| **Pick a machine to place** | number keys 1–9, or click the hotbar |
| **Place machine** | left-click on the map |
| **Draw belts/pipes** | click **and drag** to lay a whole line (belts auto-turn at corners) |
| **Rotate** belt/drill/arm/pump | R (or mouse wheel) |
| **Remove** a machine (refunds its contents) | X or right-click |
| **Set a machine's recipe / car colour** | click the machine |
| **Backpack** | Tab |
| **Help / hint** | H |
| **Get in / out of a car** | E |
| **Drive** | arrows; **Space** = handbrake; **F** = grappler (Super Car) |

## First few minutes (Milestone 1)

1. Walk to the grey **Iron Ore** patch and **hold Space** to hand-mine a few.
2. Press **1** to pick the **Drill**, click on an iron tile to place it.
3. Press **2**… actually in Milestone 1 you place a **Furnace** next to the drill
   (the drill's arrow should point into the furnace, or build a belt later).
4. Click the furnace → choose **Iron Plate**. Watch plates appear!
5. The milestone card (top-left) tracks your progress. Hit the goal to unlock the
   next tech. 🎉

Each completed milestone unlocks new machines (belts, grabber arms, assemblers,
oil refining, …) all the way up to building and **driving your own cars**.

## Make it pretty (optional): generate art with Gemini

See **`assets/README.md`**. In short:

```bash
cd assets
pip install -r requirements.txt
export GEMINI_API_KEY="your-key"          # PowerShell: $env:GEMINI_API_KEY="..."
python generate_assets.py --asset player  # one asset
python generate_assets.py --all           # everything
```

Reload the page and the generated art replaces the placeholders automatically.
