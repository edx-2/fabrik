"""Catalog of every sound effect Fabrik needs, with the ElevenLabs prompt.

Each SfxSpec maps to ONE generated audio file and ONE entry in the game's
sfx_manifest.js (keyed by `game_id`, which js/audio.js plays via FAB.sfx(id)).

Style: friendly, cute, low-contrast cartoon sounds for children aged 6-8 — never
harsh or startling. Loops are seamless (the v2 model supports loop=True).
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import List

STYLE = "Cute, soft, friendly cartoon sound for a children's video game (ages 6-8), clean, not harsh or scary."


@dataclass
class SfxSpec:
    id: str                 # cli id / game_id used by FAB.sfx(...)
    category: str           # ui | world | factory | car | event
    prompt: str
    duration: float         # seconds (0.5 - 30)
    loop: bool = False
    volume: float = 0.7     # default playback volume in-game (0..1)
    influence: float = 0.3  # prompt_influence (0..1)
    loop_end: float = None  # loop only the first N seconds (skip a trailing stop)

    @property
    def game_id(self) -> str:
        return self.id


def _s(id, category, prompt, duration, loop=False, volume=0.7, influence=0.3, loop_end=None):
    return SfxSpec(id=id, category=category, prompt=f"{STYLE} {prompt}",
                   duration=duration, loop=loop, volume=volume, influence=influence, loop_end=loop_end)


SPECS: List[SfxSpec] = [
    # ---- UI ---------------------------------------------------------------
    _s("click", "ui", "A soft, gentle button click blip, very short and clean.", 0.5, volume=0.5),
    _s("open", "ui", "A light pleasant pop-whoosh opening a little menu panel.", 0.5, volume=0.5),
    _s("close", "ui", "A soft low pop closing a menu panel.", 0.5, volume=0.5),
    _s("error", "ui", "A gentle friendly low 'nope' bloop, kind and soft, not harsh, very short.", 0.5, volume=0.5),

    # ---- world / player ---------------------------------------------------
    _s("mine", "world", "A light bouncy cartoon pickaxe clink chipping a rock, very short.", 0.5, volume=0.55),
    _s("pickup", "world", "A cheerful bright collect chime pop, picking up an item, very short.", 0.5, volume=0.55),
    _s("ambient", "world", "A calm gentle outdoor meadow ambience: a continuous soft breeze with a few faraway birds. A constant, unbroken background bed at an even level the whole time, with NO fade in, NO fade out and NO pause, designed to loop perfectly seamlessly forever.", 14.0, loop=True, volume=0.18),

    # ---- factory ----------------------------------------------------------
    _s("place", "factory", "A satisfying soft chunky thunk placing a toy machine block down.", 0.5, volume=0.55),
    _s("remove", "factory", "A soft reverse whoosh pop picking an object back up.", 0.5, volume=0.5),
    _s("craft", "factory", "A light pleasant mechanical ding-clink as a little machine finishes a part.", 0.5, volume=0.4),
    _s("belt_loop", "factory", "A smooth, continuous, CONSTANT low mechanical hum of a running conveyor belt — one unbroken steady drone at a flat, even level the entire time. It must have NO beginning and NO end, NO fade in or out, and NO pauses or gaps; the very start and very end match so it loops perfectly seamlessly with no click.", 7.0, loop=True, volume=0.22, loop_end=6.0),

    # ---- car --------------------------------------------------------------
    _s("car_ready", "car", "A cute toy car engine rev followed by a happy little chime, friendly.", 1.8, volume=0.65),
    _s("drive_loop", "car", "A small friendly toy-car engine running: a smooth, continuous, steady motor drone at a constant even level. NO fade in or out, NO pauses; the start and end match so it loops perfectly seamlessly with no click.", 7.0, loop=True, volume=0.3),
    _s("grapple", "car", "A springy magnet claw grab, a playful boing with a soft metallic clank.", 0.8, volume=0.55),

    # ---- events -----------------------------------------------------------
    _s("milestone", "event", "A happy triumphant celebratory success fanfare with sparkles and a cheerful chime, joyful level-complete.", 2.5, volume=0.8),
]

BY_ID = {s.id: s for s in SPECS}
CATEGORIES = sorted({s.category for s in SPECS})


def specs_for_category(cat: str) -> List[SfxSpec]:
    return [s for s in SPECS if s.category == cat]
