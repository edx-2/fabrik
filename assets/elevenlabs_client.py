"""Thin, robust wrapper around the ElevenLabs Text-to-Sound-Effects API.

Reference: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert

    POST https://api.elevenlabs.io/v1/sound-generation
    header: xi-api-key: <key>
    json body: { text, model_id, duration_seconds, prompt_influence, loop }
    query:     output_format=mp3_44100_128
    response:  binary audio bytes

This client needs no third-party packages (it uses urllib from the standard
library). If the official `elevenlabs` SDK happens to be installed it is used
instead; otherwise we fall back to a direct HTTPS request.
"""

from __future__ import annotations
import json
import os
import time
import urllib.request
import urllib.error
from typing import Optional

API_URL = "https://api.elevenlabs.io/v1/sound-generation"
DEFAULT_MODEL = "eleven_text_to_sound_v2"          # the model that supports loop=True
DEFAULT_FORMAT = "mp3_44100_128"


class ElevenLabsSfxClient:
    def __init__(self, api_key: Optional[str] = None, model_id: str = DEFAULT_MODEL,
                 output_format: str = DEFAULT_FORMAT):
        api_key = (
            api_key
            or os.environ.get("ELEVENLABS_API_KEY")
            or os.environ.get("ELEVEN_API_KEY")
            or os.environ.get("XI_API_KEY")
        )
        if not api_key:
            raise SystemExit(
                "No ElevenLabs API key found.\n"
                "  - pass --api-key YOUR_KEY, or\n"
                "  - set the ELEVENLABS_API_KEY environment variable.\n"
                "Get a key at https://elevenlabs.io/app/settings/api-keys"
            )
        self.api_key = api_key
        self.model_id = model_id
        self.output_format = output_format
        # use the official SDK only if it is already installed
        self._sdk = None
        try:
            from elevenlabs import ElevenLabs  # type: ignore
            self._sdk = ElevenLabs(api_key=api_key)
        except Exception:
            self._sdk = None

    # ------------------------------------------------------------------ generate
    def generate(self, text: str, duration_seconds: Optional[float] = None,
                 prompt_influence: float = 0.3, loop: bool = False, retries: int = 3) -> bytes:
        """Generate a sound effect and return the raw audio bytes."""
        if duration_seconds is not None:
            duration_seconds = max(0.5, min(30.0, float(duration_seconds)))  # API allows 0.5..30
        last = None
        for attempt in range(1, retries + 1):
            try:
                if self._sdk is not None:
                    try:
                        return self._via_sdk(text, duration_seconds, prompt_influence, loop)
                    except TypeError:
                        # older SDK without some kwargs -> fall back to HTTP
                        self._sdk = None
                return self._via_http(text, duration_seconds, prompt_influence, loop)
            except Exception as exc:  # transient / network
                last = exc
                wait = min(2 ** attempt, 12)
                print(f"    ! attempt {attempt} failed ({exc}); retrying in {wait}s")
                time.sleep(wait)
        raise RuntimeError(f"sound generation failed after {retries} attempts: {last}")

    # ------------------------------------------------------------------ backends
    def _via_sdk(self, text, duration_seconds, prompt_influence, loop) -> bytes:
        res = self._sdk.text_to_sound_effects.convert(
            text=text, model_id=self.model_id, duration_seconds=duration_seconds,
            prompt_influence=prompt_influence, loop=loop, output_format=self.output_format,
        )
        if isinstance(res, (bytes, bytearray)):
            return bytes(res)
        return b"".join(res)  # streaming generator of byte chunks

    def _via_http(self, text, duration_seconds, prompt_influence, loop) -> bytes:
        body = {
            "text": text,
            "model_id": self.model_id,
            "prompt_influence": prompt_influence,
            "loop": bool(loop),
        }
        if duration_seconds is not None:
            body["duration_seconds"] = float(duration_seconds)
        url = API_URL + "?output_format=" + self.output_format
        req = urllib.request.Request(
            url, data=json.dumps(body).encode("utf-8"), method="POST",
            headers={
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
                "Accept": "application/octet-stream",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "ignore")[:300]
            except Exception:
                pass
            raise RuntimeError(f"HTTP {e.code} from ElevenLabs: {detail}")
