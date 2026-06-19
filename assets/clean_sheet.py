#!/usr/bin/env python3
"""Re-slice an already-generated sprite sheet to remove inter-cell grid lines.

Generative models often draw thin border/grid lines in the gutters between
sprite-sheet cells, which then show up during gameplay. This tool re-runs the
existing PNG through the per-cell slicing in postprocess.normalize_sheet (crop
each cell with an inset that discards the gutter, trim to the sprite, recenter).
It does NOT call the Gemini API, so it's free.

Usage:
  python clean_sheet.py                       # clean generated/player.png (4x4, 64px)
  python clean_sheet.py --file generated/player.png --rows 4 --cols 4 --cell 64
"""

from __future__ import annotations
import argparse
import os

from PIL import Image
import postprocess

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser(description="Remove grid lines from a sprite sheet.")
    ap.add_argument("--file", default=os.path.join(HERE, "generated", "player.png"))
    ap.add_argument("--rows", type=int, default=4)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--cell", type=int, default=64)
    ap.add_argument("--gutter", type=float, default=0.08,
                    help="fraction of each cell to discard at its edges (where lines live)")
    args = ap.parse_args()

    if not os.path.exists(args.file):
        raise SystemExit(f"File not found: {args.file}")

    img = Image.open(args.file).convert("RGBA")
    print(f"input : {args.file}  ({img.size[0]}x{img.size[1]})")
    clean = postprocess.normalize_sheet(
        img, rows=args.rows, cols=args.cols, cell=args.cell, gutter=args.gutter
    )
    clean.save(args.file)
    print(f"output: {args.file}  ({clean.size[0]}x{clean.size[1]}) — grid lines removed")


if __name__ == "__main__":
    main()
