"""Catalog of every art asset Fabrik needs, with the prompt used to generate it.

Each AssetSpec maps to ONE generated PNG and ONE entry in the game's
manifest.js (keyed by `game_id`, which the JS asset manager looks up).

Sprite sheets (e.g. the player) are produced as a single gridded image; the
game slices them at draw time using (rows, cols), so the grid layout in the
prompt MUST match the rows/cols here.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, List


# --------------------------------------------------------------------------- style
# A shared style preamble keeps every asset looking like it belongs together.
STYLE = (
    "Children's video-game art for ages 6-8. Cute, chunky, rounded cartoon style, "
    "bright saturated friendly colors, soft thick outlines, simple readable shapes, "
    "smooth flat shading, no text, no letters, no watermark."
)

# We ask for a flat keyable background and remove it in post-processing, because
# transparency from generative models is unreliable. This exact phrase is keyed
# out by postprocess.py (pure magenta).
KEY_BG = (
    "Place the subject perfectly centered on a completely flat, solid, uniform "
    "pure magenta background (hex #FF00FF), no gradient, no shadow on the "
    "background, so the background can be removed cleanly."
)

TOPDOWN = "Orthographic top-down view, as seen from directly above, for a 2D tile game."


@dataclass
class AssetSpec:
    id: str                 # unique id for the CLI (e.g. "player", "machine_drill")
    category: str           # player | machines | items | cars | tiles
    game_id: str            # key used in manifest.js / the JS asset manager
    prompt: str
    cell: int = 64          # output cell size in px (per frame for sheets)
    rows: int = 1
    cols: int = 1
    aspect: str = "1:1"
    bg: str = "key"         # "key" -> chroma-key magenta out ; "keep" -> leave as is
    ref: Optional[str] = None   # id of another asset to pass as a consistency reference

    @property
    def is_sheet(self) -> bool:
        return self.rows > 1 or self.cols > 1


def _machine(id_, name, look, cell=64):
    return AssetSpec(
        id="machine_" + id_, category="machines", game_id="machine_" + id_,
        cell=cell,
        prompt=(
            f"{STYLE} A single factory machine for a kids' building game: a {name}. "
            f"{look} {TOPDOWN} The machine fills most of the frame, sits flat on the "
            f"ground. {KEY_BG}"
        ),
    )


def _item(id_, name, look):
    return AssetSpec(
        id="item_" + id_, category="items", game_id="item_" + id_, cell=48,
        prompt=(
            f"{STYLE} A single small game item icon: {name}. {look} One object, "
            f"centered, simple and instantly recognizable at tiny size. {KEY_BG}"
        ),
    )


def _car(id_, extra):
    return AssetSpec(
        id="car_" + id_, category="cars", game_id="car_" + id_, cell=128,
        prompt=(
            f"{STYLE} A cute cartoon race car seen from directly above (top-down), "
            f"nose pointing UP toward the top of the image. Rounded toy-like body, "
            f"four visible wheels, a windshield. {extra} {TOPDOWN} {KEY_BG}"
        ),
    )


def _tile(id_, name, look, suffix="", variation=""):
    # suffix "" = base texture; "_2","_3" = diversity variants the renderer blends in
    return AssetSpec(
        id="tile_" + id_ + suffix, category="tiles", game_id="tile_" + id_ + suffix,
        cell=96, bg="keep",
        prompt=(
            f"{STYLE} A seamless, tileable top-down ground texture of {name}. {look} "
            f"{variation} Flat even lighting, no objects sticking out, no shadows, edges "
            f"that tile seamlessly with copies of itself. Fills the whole square frame "
            f"edge to edge."
        ),
    )


# --------------------------------------------------------------------------- catalog
SPECS: List[AssetSpec] = []

# ---- player: a 4x4 walk sprite sheet --------------------------------------
# ROW order MUST be: up(away), right, down(toward), left  -> matches js/game.js
SPECS.append(AssetSpec(
    id="player", category="player", game_id="player", cell=64, rows=4, cols=4,
    prompt=(
        f"{STYLE} A 4x4 sprite-sheet grid (16 equal cells, 4 rows by 4 columns) of "
        "the SAME happy little child engineer character in EVERY cell - identical "
        "hair, skin, and bright overalls with a tool-belt, consistent across all 16 "
        "cells. The four ROWS are four facing directions, top to bottom: "
        "row 1 facing UP / away from viewer (we see the back of the head), "
        "row 2 facing RIGHT, "
        "row 3 facing DOWN / toward the viewer (we see the face), "
        "row 4 facing LEFT. "
        "The four COLUMNS are four frames of a simple walk cycle (legs in different "
        "positions). Each character is centered in its own invisible cell, full body, "
        "consistent size, evenly spaced. Slightly top-down 3/4 view. "
        "IMPORTANT: do NOT draw any grid lines, cell borders, frames, boxes, outlines, "
        "or dividing lines between the characters. The cells are invisible. Leave the "
        "gutters between characters as clean, empty, flat magenta with nothing in them. "
        + KEY_BG
    ),
))

# ---- machines -------------------------------------------------------------
SPECS += [
    _machine("drill", "mining drill", "A sturdy orange drill with a big spinning bit and a small chute spout on one side."),
    _machine("furnace", "smelting furnace", "A stone-and-metal furnace glowing warm orange inside, small chimney."),
    _machine("assembler", "assembler workshop", "A blue robotic workbench with little arms and gears assembling parts."),
    _machine("crusher", "rock crusher", "A heavy grey machine with toothed rollers crushing rocks into sand."),
    _machine("sawmill", "sawmill", "A wooden machine with a round saw blade cutting logs into planks."),
    _machine("pump", "oil pump", "A pumpjack that nods up and down to pull up dark oil, on a metal base."),
    _machine("refinery", "oil refinery", "A purple refinery with tanks and pipes turning oil into materials."),
    _machine("car_factory", "car factory", "A big cheerful pink factory building with a roll-up door and a car silhouette, smokestacks.", cell=128),
    _machine("box", "storage box", "A simple wooden storage crate with metal corners, lid open showing it can hold items."),
]

# ---- cars -----------------------------------------------------------------
SPECS += [
    _car("basic", "A plain happy little car, glossy bright red body, no spoiler."),
    _car("sporty", "A sporty fast car with a black rear spoiler/wing, racing stripes, bright red body."),
    _car("super", "A super cool race car with a rear spoiler AND a red magnet-claw grappler mounted on the front bumper, bright red body."),
]

# ---- ground tiles (optional polish; game uses flat colors if absent) ------
# Each biome has a base texture plus 2 diversity VARIANTS ("_2","_3"). The renderer
# tiles the base and softly blends a variant in with noise so big areas don't look
# repetitive. Keep variants the SAME overall colour/brightness as the base so they
# blend invisibly — only the small detail should differ.
_TILES = [
    ("meadow", "green grassy meadow", "Lush soft green grass.",
        ["with a few tiny flowers.", "with little white daisies and clover.", "with short and long grass tufts."]),
    ("forest", "forest floor", "Darker green mossy ground under trees.",
        ["with scattered moss patches.", "with a few fallen leaves and twigs.", "with small ferns and roots."]),
    ("rocky", "rocky hills ground", "Grey cracked rock and pebbles.",
        ["with fine gravel.", "with bigger cracked boulders.", "with mossy stone patches."]),
    ("quarry", "sandy quarry ground", "Pale tan sand and gravel.",
        ["with rippled sand.", "with small scattered pebbles.", "with dry cracked earth."]),
    ("marsh", "oily marsh ground", "Murky greenish-brown muddy marsh.",
        ["with little dark puddles.", "with reeds and bubbles.", "with oily rainbow sheen spots."]),
    ("lake", "shallow water", "Calm bright blue water.",
        ["with gentle ripples.", "with soft wave highlights.", "with little sparkles."]),
    ("rainbow", "magical pastel hills", "Soft pastel rainbow-tinted grass.",
        ["whimsical and dreamy.", "with tiny sparkles.", "with faint pastel swirls."]),
]
for _b, _name, _look, _vars in _TILES:
    SPECS.append(_tile(_b, _name, _look, "", _vars[0]))
    SPECS.append(_tile(_b, _name, _look, "_2", _vars[1]))
    SPECS.append(_tile(_b, _name, _look, "_3", _vars[2]))

# ---- item icons -----------------------------------------------------------
# (item_id, friendly name, look) — small icons shown on belts and in the bag.
_ITEMS = [
    ("iron_ore", "a chunk of iron ore", "A rough grey rock with shiny metallic flecks."),
    ("copper_ore", "a chunk of copper ore", "A rough rock with orange-brown shiny streaks."),
    ("coal", "a lump of coal", "A shiny black lump of coal."),
    ("stone", "a stone", "A smooth grey rounded stone."),
    ("wood", "a wooden log", "A short brown log with rings on the end."),
    ("iron_plate", "an iron plate", "A flat shiny silver-grey metal plate."),
    ("copper_plate", "a copper plate", "A flat shiny orange-brown metal plate."),
    ("steel", "a steel ingot", "A solid dark-grey metal ingot."),
    ("sand", "a pile of sand", "A small pile of pale yellow sand."),
    ("glass", "a glass pane", "A clear light-blue glass square, slightly shiny."),
    ("plank", "a wooden plank", "A flat brown wooden plank."),
    ("plastic", "a plastic block", "A glossy white-grey plastic cube."),
    ("rubber", "a rubber blob", "A glossy black rounded rubber blob."),
    ("paint", "a paint bucket", "A little open paint bucket with colorful paint."),
    ("iron_gear", "a metal gear", "A shiny silver cog gear with teeth."),
    ("copper_wire", "a coil of copper wire", "A neat coil of orange copper wire."),
    ("magnet", "a horseshoe magnet", "A classic red horseshoe magnet with grey tips."),
    ("bolts", "some bolts", "A few shiny silver nuts and bolts."),
    ("steel_beam", "a steel beam", "A grey I-beam girder."),
    ("plastic_panel", "a plastic panel", "A flat glossy blue plastic panel."),
    ("tire", "a rubber tire", "A black rubber tire with treads, top-down ring."),
    ("rim", "a wheel rim", "A shiny silver metal wheel rim."),
    ("piston", "an engine piston", "A metal piston with a rod."),
    ("cable", "a cable", "A coiled brown-and-copper cable."),
    ("claw", "a metal claw", "A small silver mechanical grabber claw."),
    ("windshield", "a windshield", "A curved light-blue glass car windshield."),
    ("wheel", "a car wheel", "A black tire on a silver rim, top-down."),
    ("wheel_set", "a set of four wheels", "Four black wheels grouped together."),
    ("motor", "a car motor", "A chunky metal engine motor block with an orange tint."),
    ("chassis", "a car chassis", "A blue-grey car body frame without wheels, top-down."),
    ("spoiler", "a car spoiler", "A sleek black rear wing spoiler."),
    ("grappler", "a grappler claw", "A red magnet claw on a small arm."),
    ("car", "a tiny red car", "A cute glossy red toy car, three-quarter view."),
]
SPECS += [_item(i, n, look) for (i, n, look) in _ITEMS]


# --------------------------------------------------------------------------- lookups
BY_ID = {s.id: s for s in SPECS}
CATEGORIES = sorted({s.category for s in SPECS})


def specs_for_category(cat: str) -> List[AssetSpec]:
    return [s for s in SPECS if s.category == cat]
