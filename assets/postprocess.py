"""Post-processing for generated art.

Generative image models won't reliably give us clean transparency or pixel-perfect
sprite grids, so we fix that here:

  * chroma_key()   - remove the flat magenta background -> transparent
  * normalize_single() - trim, center, and resize a single sprite to a square cell
  * normalize_sheet()  - resize a gridded sprite sheet so each cell is exactly `cell`

Only Pillow + numpy are required.
"""

from __future__ import annotations
import numpy as np
from PIL import Image


# The keyable background color requested in the prompts (pure magenta).
KEY_COLOR = (255, 0, 255)


def chroma_key(img: "Image.Image", color=KEY_COLOR, threshold: int = 110) -> "Image.Image":
    """Make pixels close to `color` fully transparent. Returns RGBA."""
    img = img.convert("RGBA")
    arr = np.asarray(img).astype(np.int32)  # int32 avoids overflow in the squares
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    # distance to key color; magenta has high R, low G, high B
    dist = np.sqrt((r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2)
    mask = dist < threshold
    out = arr.copy()
    out[..., 3] = np.where(mask, 0, arr[..., 3])
    # soften the halo: pixels that are partly magenta get reduced alpha
    halo = (dist >= threshold) & (dist < threshold + 50)
    out[..., 3] = np.where(halo, (out[..., 3] * 0.6).astype(np.int32), out[..., 3])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def _bbox_of_opaque(img: "Image.Image", thresh: int = 16):
    alpha = np.asarray(img.convert("RGBA"))[..., 3]
    ys, xs = np.where(alpha > thresh)
    if len(xs) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def _fit_cell(img: "Image.Image", cell: int, pad: float, thresh: int = 16) -> "Image.Image":
    """Trim transparent margins and fit the sprite centered into a cell x cell canvas."""
    img = img.convert("RGBA")
    box = _bbox_of_opaque(img, thresh)
    if box:
        img = img.crop(box)
    inner = max(1, int(cell * (1 - 2 * pad)))
    w, h = img.size
    scale = min(inner / w, inner / h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    canvas.paste(img, ((cell - nw) // 2, (cell - nh) // 2), img)
    return canvas


def normalize_single(img: "Image.Image", cell: int, pad: float = 0.06) -> "Image.Image":
    """Trim transparent margins, then fit the sprite centered into a cell x cell canvas."""
    return _fit_cell(img, cell, pad, thresh=16)


def normalize_sheet(img: "Image.Image", rows: int, cols: int, cell: int,
                    gutter: float = 0.08, pad: float = 0.06) -> "Image.Image":
    """Slice a gridded sheet into clean, evenly-spaced cells on a transparent grid.

    Generative models tend to draw thin grid/border lines between cells, and those
    lines sit in the gutters at the cell boundaries. Instead of rescaling the whole
    sheet (which keeps the lines), we crop each cell with an inset that DISCARDS the
    gutter (and any line in it), trim to the character, and recenter it. The result
    is a clean (cols*cell) x (rows*cell) sheet with no dividing lines.
    """
    img = img.convert("RGBA")
    W, H = img.size
    cw, ch = W / cols, H / rows
    inset_x = max(int(round(cw * gutter)), 2)
    inset_y = max(int(round(ch * gutter)), 2)
    out = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    for r in range(rows):
        for c in range(cols):
            left = int(round(c * cw)) + inset_x
            top = int(round(r * ch)) + inset_y
            right = int(round((c + 1) * cw)) - inset_x
            bottom = int(round((r + 1) * ch)) - inset_y
            if right <= left or bottom <= top:
                continue
            sub = img.crop((left, top, right, bottom))
            # higher alpha threshold so faint keyed-line halos are ignored when trimming
            sub = _fit_cell(sub, cell, pad, thresh=48)
            out.paste(sub, (c * cell, r * cell), sub)
    return out


def normalize_ground(img: "Image.Image", cell: int) -> "Image.Image":
    """Square-crop and resize an opaque ground tile (kept fully opaque)."""
    img = img.convert("RGBA")
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return img.resize((cell, cell), Image.LANCZOS)


def process(img: "Image.Image", spec) -> "Image.Image":
    """Apply the right pipeline for an AssetSpec."""
    if spec.bg == "key":
        img = chroma_key(img)
    if spec.category == "tiles":
        return normalize_ground(img, spec.cell)
    if spec.is_sheet:
        return normalize_sheet(img, spec.rows, spec.cols, spec.cell)
    return normalize_single(img, spec.cell)
