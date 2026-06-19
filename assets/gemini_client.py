"""Thin, robust wrapper around Google's Gemini image-generation API.

Uses the unified Google Gen AI SDK ("from google import genai").  The image
models return inline image bytes inside the response parts; we pull out the
first image as a Pillow RGBA image.

Reference: https://ai.google.dev/gemini-api/docs/image-generation

Current image-capable model IDs (newest first):
    gemini-3-pro-image       - highest quality, "professional asset production"
    gemini-3.1-flash-image   - fast / high volume
    gemini-2.5-flash-image   - efficient, GA ("Nano Banana"); good default

Character consistency: pass one or more previously generated images back in as
reference images (the SDK accepts PIL.Image objects in `contents`) together with
phrasing like "this exact character".  Up to ~14 reference images are supported.
"""

from __future__ import annotations
import io
import os
import time
from typing import List, Optional

try:
    from google import genai
    from google.genai import types
except Exception as exc:  # pragma: no cover - import guard
    raise SystemExit(
        "Could not import the Google Gen AI SDK.\n"
        "Install it with:  pip install google-genai\n"
        f"(original error: {exc})"
    )

try:
    from PIL import Image
except Exception as exc:  # pragma: no cover
    raise SystemExit("Pillow is required:  pip install Pillow\n" f"({exc})")


DEFAULT_MODEL = "gemini-3.1-flash-image"


class GeminiImageClient:
    def __init__(self, api_key: Optional[str] = None, model: str = DEFAULT_MODEL):
        api_key = (
            api_key
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
        )
        if not api_key:
            raise SystemExit(
                "No API key found.\n"
                "  - pass --api-key YOUR_KEY, or\n"
                "  - set the GEMINI_API_KEY environment variable.\n"
                "Get a key at https://aistudio.google.com/apikey"
            )
        self.client = genai.Client(api_key=api_key)
        self.model = model

    # ------------------------------------------------------------------ generate
    def generate(
        self,
        prompt: str,
        references: Optional[List["Image.Image"]] = None,
        aspect_ratio: Optional[str] = None,
        retries: int = 3,
    ) -> "Image.Image":
        """Generate a single image. Returns a PIL RGBA image.

        `references` are PIL images passed alongside the prompt for character /
        style consistency. `aspect_ratio` (e.g. "1:1") is requested when the
        installed SDK supports it; otherwise we fall back gracefully and rely on
        layout wording inside the prompt.
        """
        contents: list = [prompt]
        for ref in references or []:
            contents.append(ref)

        last_err = None
        for attempt in range(1, retries + 1):
            try:
                resp = self._call(contents, aspect_ratio)
                return self._extract_image(resp)
            except Exception as exc:  # network / transient / parsing
                last_err = exc
                wait = min(2 ** attempt, 12)
                print(f"    ! attempt {attempt} failed ({exc}); retrying in {wait}s")
                time.sleep(wait)
        raise RuntimeError(f"generation failed after {retries} attempts: {last_err}")

    def _call(self, contents, aspect_ratio):
        """Call the model, tolerating differences between SDK versions."""
        # Try with a config that requests an image (+ optional aspect ratio).
        config = None
        try:
            config = types.GenerateContentConfig(response_modalities=["IMAGE"])
            if aspect_ratio:
                try:
                    config.image_config = types.ImageConfig(aspect_ratio=aspect_ratio)
                except Exception:
                    pass  # older SDK: ignore, rely on prompt wording
        except Exception:
            config = None
        try:
            return self.client.models.generate_content(
                model=self.model, contents=contents, config=config
            )
        except Exception:
            # Last resort: no config at all (maximum compatibility).
            return self.client.models.generate_content(
                model=self.model, contents=contents
            )

    # ------------------------------------------------------------------ parsing
    @staticmethod
    def _iter_parts(resp):
        try:
            for cand in resp.candidates or []:
                for p in cand.content.parts or []:
                    yield p
        except Exception:
            for p in getattr(resp, "parts", []) or []:
                yield p

    def _extract_image(self, resp) -> "Image.Image":
        text_bits = []
        for part in self._iter_parts(resp):
            inline = getattr(part, "inline_data", None)
            if inline is not None and getattr(inline, "data", None):
                return Image.open(io.BytesIO(inline.data)).convert("RGBA")
            # Newer SDKs expose a convenience accessor
            if hasattr(part, "as_image"):
                try:
                    img = part.as_image()
                    if img is not None:
                        return img.convert("RGBA")
                except Exception:
                    pass
            txt = getattr(part, "text", None)
            if txt:
                text_bits.append(txt)
        raise RuntimeError(
            "Response contained no image. Model said: "
            + (" ".join(text_bits)[:400] or "(nothing)")
        )
