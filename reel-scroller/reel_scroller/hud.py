"""The preview window: camera feed plus what the gesture engine is seeing."""

from __future__ import annotations

import math
from typing import Callable, Optional, Sequence, Tuple

import cv2
import numpy as np

from .gestures import Event, GestureEngine, State

HAND_CONNECTIONS = (
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20), (0, 17),
)

# BGR
WHITE = (245, 245, 245)
INK = (28, 28, 32)
MUTED = (175, 175, 180)
STATE_COLORS = {
    State.NO_HAND: (107, 107, 255),  # coral
    State.SETTLING: (60, 193, 255),  # amber
    State.READY: (160, 230, 90),  # mint
    State.SWIPING: (255, 190, 60),  # sky
    State.KNOB: (255, 124, 183),  # violet
    State.HOLD: (170, 170, 170),
}
STATE_LABELS = {
    State.NO_HAND: "NO HAND",
    State.SETTLING: "HOLD STILL",
    State.READY: "READY",
    State.SWIPING: "SWIPE",
    State.KNOB: "VOLUME KNOB",
    State.HOLD: "FIST - PAUSED",
}
FONT = cv2.FONT_HERSHEY_DUPLEX
SMALL = cv2.FONT_HERSHEY_SIMPLEX
AA = cv2.LINE_AA
FLASH_TIME = 0.7

Pt = Tuple[int, int]


def _blend(img: np.ndarray, alpha: float, draw: Callable[[np.ndarray], None]) -> None:
    """Draw onto a copy and mix it back in, for translucent shapes."""
    overlay = img.copy()
    draw(overlay)
    cv2.addWeighted(overlay, alpha, img, 1.0 - alpha, 0, dst=img)


def _rounded_rect(img: np.ndarray, p1: Pt, p2: Pt, radius: int, color) -> None:
    (x1, y1), (x2, y2) = p1, p2
    r = max(0, min(radius, (x2 - x1) // 2, (y2 - y1) // 2))
    cv2.rectangle(img, (x1 + r, y1), (x2 - r, y2), color, -1, AA)
    cv2.rectangle(img, (x1, y1 + r), (x2, y2 - r), color, -1, AA)
    for c in ((x1 + r, y1 + r), (x2 - r, y1 + r), (x1 + r, y2 - r), (x2 - r, y2 - r)):
        cv2.circle(img, c, r, color, -1, AA)


def _text_center(img: np.ndarray, text: str, center: Pt, scale: float, color, thickness: int = 1, font=FONT) -> None:
    (w, h), _ = cv2.getTextSize(text, font, scale, thickness)
    cv2.putText(img, text, (center[0] - w // 2, center[1] + h // 2), font, scale, color, thickness, AA)


def _chevron(img: np.ndarray, center: Pt, half_width: int, height: int, up: bool, color, thickness: int) -> None:
    cx, cy = center
    dy = -height // 2 if up else height // 2
    pts = np.array([(cx - half_width, cy - dy), (cx, cy + dy), (cx + half_width, cy - dy)], np.int32)
    cv2.polylines(img, [pts], False, color, thickness, AA)


class Hud:
    def __init__(self, width: int = 480, invert: bool = False, knob_step_deg: float = 8.0):
        self.width = width
        self.invert = invert
        self.knob_step_deg = knob_step_deg
        self._swipe_flash: Optional[Tuple[Event, float]] = None
        self._volume_flash: Optional[Tuple[int, float]] = None
        self._warning: Optional[Tuple[str, float]] = None

    def on_event(self, event: Event, t: float) -> None:
        if event in (Event.SWIPE_UP, Event.SWIPE_DOWN):
            self._swipe_flash = (event, t)
        else:
            self._volume_flash = (1 if event is Event.VOLUME_UP else -1, t)

    def warn(self, text: str, t: float) -> None:
        self._warning = (text, t)

    def render(
        self,
        frame: np.ndarray,
        landmarks: Optional[Sequence[Tuple[float, float]]],
        engine: GestureEngine,
        volume: Optional[float],
        fps: float,
        paused: bool,
        now: float,
    ) -> np.ndarray:
        h0, w0 = frame.shape[:2]
        W = self.width
        H = int(round(h0 * W / w0))
        img = cv2.resize(frame, (W, H), interpolation=cv2.INTER_AREA)
        img = cv2.convertScaleAbs(img, alpha=0.72, beta=0)  # dim the feed so overlays pop

        state = engine.state
        color = STATE_COLORS[state]

        if paused:
            self._draw_paused(img)
            self._draw_volume_meter(img, volume, now)
            return img

        if landmarks is not None:
            self._draw_trail(img, engine, color, now, H)
            self._draw_skeleton(img, landmarks, color, W, H)
        if engine.knob is not None:
            self._draw_knob(img, engine, volume, H)
        if state is State.NO_HAND:
            _blend(img, 0.55, lambda o: _rounded_rect(o, (W // 2 - 150, H // 2 - 26), (W // 2 + 150, H // 2 + 26), 14, INK))
            _text_center(img, "Show your hand to the camera", (W // 2, H // 2 - 7), 0.52, WHITE)
            _text_center(img, "point a finger up, palm facing you", (W // 2, H // 2 + 13), 0.4, MUTED, font=SMALL)

        self._draw_swipe_flash(img, now)
        self._draw_warning(img, now)
        self._draw_volume_meter(img, volume, now)
        self._draw_status(img, STATE_LABELS[state], color)
        self._draw_hints(img)
        cv2.putText(img, f"{fps:4.0f} fps", (W - 92, 24), SMALL, 0.45, MUTED, 1, AA)
        return img

    # ------------------------------------------------------------------ pieces

    def _draw_status(self, img: np.ndarray, label: str, color) -> None:
        (tw, th), _ = cv2.getTextSize(label, FONT, 0.5, 1)
        x, y = 12, 10
        _rounded_rect(img, (x, y), (x + tw + 30, y + th + 14), 12, color)
        cv2.circle(img, (x + 12, y + (th + 14) // 2), 4, INK, -1, AA)
        cv2.putText(img, label, (x + 22, y + th + 7), FONT, 0.5, INK, 1, AA)

    def _draw_hints(self, img: np.ndarray) -> None:
        H, W = img.shape[:2]
        _blend(img, 0.6, lambda o: cv2.rectangle(o, (0, H - 26), (W, H), INK, -1))
        next_dir, back_dir = ("DOWN", "UP") if self.invert else ("UP", "DOWN")
        items = ((f"swipe {next_dir}", "next"), (f"swipe {back_dir}", "back"), ("twist", "volume"), ("fist", "pause"))
        x = 10
        for key, action in items:
            cv2.putText(img, key, (x, H - 9), SMALL, 0.4, WHITE, 1, AA)
            x += cv2.getTextSize(key, SMALL, 0.4, 1)[0][0] + 4
            cv2.putText(img, action, (x, H - 9), SMALL, 0.4, MUTED, 1, AA)
            x += cv2.getTextSize(action, SMALL, 0.4, 1)[0][0] + 14

    def _draw_skeleton(self, img, landmarks, color, W: int, H: int) -> None:
        pts = [(int(x * W), int(y * H)) for x, y in landmarks]
        for a, b in HAND_CONNECTIONS:
            cv2.line(img, pts[a], pts[b], (215, 215, 220), 2, AA)
        for i, p in enumerate(pts):
            cv2.circle(img, p, 3, WHITE, -1, AA)
        tip = pts[8]
        cv2.circle(img, tip, 9, color, 2, AA)
        cv2.circle(img, tip, 4, color, -1, AA)

    def _draw_trail(self, img, engine: GestureEngine, color, now: float, H: int) -> None:
        pts = [(int(s.tip[0] * H), int(s.tip[1] * H)) for s in engine.history if now - s.t < 0.45]
        n = len(pts)
        for i in range(1, n):
            cv2.line(img, pts[i - 1], pts[i], color, 1 + (5 * i) // n, AA)

    def _draw_knob(self, img, engine: GestureEngine, volume: Optional[float], H: int) -> None:
        knob = engine.knob
        cur = engine.current
        if knob is None or cur is None:
            return
        center = (int(cur.palm[0] * H), int(cur.palm[1] * H))
        radius = max(40, int(1.4 * cur.scale * H))
        violet = STATE_COLORS[State.KNOB]
        _blend(img, 0.45, lambda o: cv2.circle(o, center, radius + 14, INK, -1, AA))
        cv2.circle(img, center, radius, (90, 90, 96), 3, AA)
        # Detent ticks, one per volume step, around the top of the dial.
        step = self.knob_step_deg
        k = -int(135 // step)
        while k * step <= 135:
            a = math.radians(-90 + k * step)
            p1 = (int(center[0] + (radius - 6) * math.cos(a)), int(center[1] + (radius - 6) * math.sin(a)))
            p2 = (int(center[0] + (radius + 6) * math.cos(a)), int(center[1] + (radius + 6) * math.sin(a)))
            cv2.line(img, p1, p2, (120, 120, 128), 1, AA)
            k += 1
        total = max(-170.0, min(170.0, knob.total))
        start, end = (-90, -90 + total) if total >= 0 else (-90 + total, -90)
        cv2.ellipse(img, center, (radius, radius), 0, start, end, violet, 6, AA)
        a = math.radians(-90 + total)
        dot = (int(center[0] + radius * math.cos(a)), int(center[1] + radius * math.sin(a)))
        cv2.circle(img, dot, 9, violet, -1, AA)
        cv2.circle(img, dot, 9, WHITE, 2, AA)
        label = f"{round(volume * 100)}%" if volume is not None else ("VOL +" if total >= 0 else "VOL -")
        _text_center(img, label, center, 0.8, WHITE, 2)

    def _draw_swipe_flash(self, img, now: float) -> None:
        if self._swipe_flash is None:
            return
        event, t = self._swipe_flash
        age = now - t
        if age > FLASH_TIME:
            self._swipe_flash = None
            return
        H, W = img.shape[:2]
        up = event is Event.SWIPE_UP
        forward = up != self.invert
        k = age / FLASH_TIME
        alpha = 1.0 - k * k
        shift = int((-1 if up else 1) * 40 * k)
        cx, cy = W // 2, H // 2 + shift
        color = STATE_COLORS[State.SWIPING]

        def draw(o):
            _rounded_rect(o, (cx - 80, cy - 70), (cx + 80, cy + 70), 26, INK)
            for i, off in enumerate((-18, 12) if up else (18, -12)):
                _chevron(o, (cx, cy + off - 8), 34, 26, up, color if i else WHITE, 8)
            _text_center(o, "NEXT" if forward else "BACK", (cx, cy + 48), 0.7, WHITE, 2)

        _blend(img, max(0.0, alpha), draw)

    def _draw_warning(self, img, now: float) -> None:
        if self._warning is None:
            return
        text, t = self._warning
        if now - t > 3.0:
            self._warning = None
            return
        H, W = img.shape[:2]
        (tw, th), _ = cv2.getTextSize(text, FONT, 0.55, 1)
        x1, y1 = (W - tw) // 2 - 16, 52
        _rounded_rect(img, (x1, y1), (x1 + tw + 32, y1 + th + 18), 12, STATE_COLORS[State.SETTLING])
        cv2.putText(img, text, (x1 + 16, y1 + th + 9), FONT, 0.55, INK, 1, AA)

    def _draw_volume_meter(self, img, volume: Optional[float], now: float) -> None:
        H, W = img.shape[:2]
        x1, x2 = W - 26, W - 16
        top, bottom = 48, H - 64
        flash = self._volume_flash
        if flash is not None and now - flash[1] > FLASH_TIME:
            self._volume_flash = flash = None
        if volume is None and flash is None:
            return
        violet = STATE_COLORS[State.KNOB]
        _blend(img, 0.55, lambda o: _rounded_rect(o, (x1 - 8, top - 8), (x2 + 8, bottom + 30), 10, INK))
        _rounded_rect(img, (x1, top), (x2, bottom), 5, (70, 70, 76))
        if volume is not None:
            fill_top = int(bottom - (bottom - top) * max(0.0, min(1.0, volume)))
            if bottom - fill_top > 2:
                _rounded_rect(img, (x1, fill_top), (x2, bottom), 5, violet)
            _text_center(img, f"{round(volume * 100)}", ((x1 + x2) // 2, bottom + 14), 0.42, WHITE, font=SMALL)
        if flash is not None:
            sign = "+" if flash[0] > 0 else "-"
            _text_center(img, sign, (x1 - 22, (top + bottom) // 2), 1.2, violet, 2)

    def _draw_paused(self, img) -> None:
        H, W = img.shape[:2]
        _blend(img, 0.6, lambda o: cv2.rectangle(o, (0, 0), (W, H), INK, -1))
        cx, cy = W // 2, H // 2 - 10
        for dx in (-14, 6):
            _rounded_rect(img, (cx + dx, cy - 38), (cx + dx + 10, cy - 6), 3, WHITE)
        _text_center(img, "PAUSED", (cx, cy + 16), 0.8, WHITE, 2)
        _text_center(img, "Ctrl+Alt+P to resume", (cx, cy + 44), 0.45, MUTED, font=SMALL)
