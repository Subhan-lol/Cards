"""Hand tracking with MediaPipe's HandLandmarker."""

from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path
from typing import List, Optional, Tuple

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/latest/hand_landmarker.task"
)
MODEL_PATH = Path(__file__).resolve().parent / "models" / "hand_landmarker.task"


def ensure_model(path: Path = MODEL_PATH) -> Path:
    """Download the hand model (about 8 MB) the first time the app runs."""
    if path.exists() and path.stat().st_size > 1_000_000:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print("Downloading the hand-tracking model (one time, ~8 MB)...")
    tmp = path.with_suffix(".part")
    try:
        context = None
        try:
            import ssl

            import certifi  # installed with mediapipe; avoids missing-root-cert errors

            context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
        with urllib.request.urlopen(MODEL_URL, timeout=60, context=context) as resp, open(tmp, "wb") as out:
            total = int(resp.headers.get("Content-Length") or 0)
            done = 0
            while True:
                chunk = resp.read(1 << 16)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                if total:
                    sys.stdout.write(f"\r  {done * 100 // total:3d}%")
                    sys.stdout.flush()
        print()
        os.replace(tmp, path)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise SystemExit(
            f"Could not download the hand model: {exc}\n"
            f"Download it manually from\n  {MODEL_URL}\nand save it as\n  {path}"
        ) from exc
    return path


class HandTracker:
    """Finds one hand per frame and returns its 21 landmarks, normalised to 0..1."""

    def __init__(self, model_path: Path, min_detection: float = 0.6, min_tracking: float = 0.5):
        import mediapipe as mp

        self._mp = mp
        vision = mp.tasks.vision
        options = vision.HandLandmarkerOptions(
            # Pass the bytes rather than the path: MediaPipe can't open paths
            # containing non-ASCII characters (e.g. some Windows user names).
            base_options=mp.tasks.BaseOptions(model_asset_buffer=Path(model_path).read_bytes()),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=1,
            min_hand_detection_confidence=min_detection,
            min_hand_presence_confidence=min_tracking,
            min_tracking_confidence=min_tracking,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)
        self._last_ms = -1

    def detect(self, rgb, t: float) -> Optional[List[Tuple[float, float]]]:
        """`rgb` is an RGB uint8 image, `t` the capture time in seconds."""
        ms = max(int(t * 1000), self._last_ms + 1)  # timestamps must strictly increase
        self._last_ms = ms
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, ms)
        if not result.hand_landmarks:
            return None
        return [(p.x, p.y) for p in result.hand_landmarks[0]]

    def close(self) -> None:
        self._landmarker.close()
