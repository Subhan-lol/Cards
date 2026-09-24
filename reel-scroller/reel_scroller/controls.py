"""What the gestures actually do on the PC: change reels and change the volume."""

from __future__ import annotations

import time
from typing import Optional

from . import winapi


class ReelControl:
    """Moves to the next/previous reel.

    mode "keys" presses the Down (next) / Up (previous) arrow key in the
    focused window. mode "scroll" sends mouse-wheel notches to whatever is
    under the mouse pointer instead.
    """

    def __init__(self, mode: str = "keys", notches: float = 1.0, invert: bool = False, dry_run: bool = False):
        if mode not in ("scroll", "keys"):
            raise ValueError(f"unknown mode {mode!r}")
        self.mode = mode
        self.notches = notches
        self.invert = invert
        self.dry_run = dry_run or not winapi.IS_WINDOWS

    def next(self) -> None:
        self._go(forward=not self.invert)

    def previous(self) -> None:
        self._go(forward=self.invert)

    def _go(self, forward: bool) -> None:
        if self.dry_run:
            return
        if self.mode == "scroll":
            winapi.scroll_wheel(-self.notches if forward else self.notches)
        else:
            winapi.press_key(winapi.VK_DOWN if forward else winapi.VK_UP)


class VolumeControl:
    """Changes the Windows master volume.

    method "keys" presses the media volume keys, so Windows shows its own volume
    popup (each press is 2%). method "exact" sets the level directly through
    the Core Audio API (needs pycaw). The current level is read through pycaw
    when it is installed, for the on-screen meter.
    """

    KEY_STEP = 2  # percent per volume-key press on Windows

    def __init__(self, method: str = "keys", step_percent: int = 2, dry_run: bool = False):
        if method not in ("keys", "exact"):
            raise ValueError(f"unknown volume method {method!r}")
        self.method = method
        self.step = max(1, int(step_percent))
        self.dry_run = dry_run or not winapi.IS_WINDOWS
        self._endpoint = None
        self._endpoint_error_t = -1e9
        self._level: Optional[float] = None
        self._level_t = -1e9
        self._fake_level = 0.5
        if self.method == "exact" and not self.dry_run and self._get_endpoint() is None:
            print("  pycaw is not available; falling back to volume keys.")
            self.method = "keys"

    def _get_endpoint(self):
        if self._endpoint is not None or self.dry_run:
            return self._endpoint
        if time.monotonic() - self._endpoint_error_t < 5.0:
            return None
        try:
            from pycaw.pycaw import AudioUtilities

            speakers = AudioUtilities.GetSpeakers()
            endpoint = getattr(speakers, "EndpointVolume", None)  # pycaw >= 2024
            if endpoint is None:  # older pycaw returns the raw IMMDevice
                from ctypes import POINTER, cast

                from comtypes import CLSCTX_ALL
                from pycaw.pycaw import IAudioEndpointVolume

                iface = speakers.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
                endpoint = cast(iface, POINTER(IAudioEndpointVolume))
            self._endpoint = endpoint
        except Exception:
            self._endpoint_error_t = time.monotonic()
            self._endpoint = None
        return self._endpoint

    def level(self) -> Optional[float]:
        """Current volume 0..1, or None if it can't be read. Cached for 0.25s."""
        if self.dry_run:
            return self._fake_level
        now = time.monotonic()
        if now - self._level_t < 0.25:
            return self._level
        self._level_t = now
        endpoint = self._get_endpoint()
        if endpoint is None:
            self._level = None
            return None
        try:
            level = float(endpoint.GetMasterVolumeLevelScalar())
            self._level = 0.0 if endpoint.GetMute() else level
        except Exception:
            self._endpoint = None  # default device changed (e.g. headphones); re-open next time
            self._level = None
        return self._level

    def change(self, steps: int) -> None:
        if steps == 0:
            return
        if self.dry_run:
            self._fake_level = min(1.0, max(0.0, self._fake_level + steps * self.step / 100))
            return
        if self.method == "exact" and self._set_exact(steps):
            return
        presses = abs(steps) * max(1, round(self.step / self.KEY_STEP))
        winapi.press_key(winapi.VK_VOLUME_UP if steps > 0 else winapi.VK_VOLUME_DOWN, presses)
        self._level_t = -1e9  # re-read the level on the next frame

    def _set_exact(self, steps: int) -> bool:
        endpoint = self._get_endpoint()
        if endpoint is None:
            return False
        try:
            current = float(endpoint.GetMasterVolumeLevelScalar())
            new = min(1.0, max(0.0, round(current * 100 + steps * self.step) / 100))
            if steps > 0 and endpoint.GetMute():
                endpoint.SetMute(0, None)
            endpoint.SetMasterVolumeLevelScalar(new, None)
            self._level, self._level_t = new, time.monotonic()
            return True
        except Exception:
            self._endpoint = None
            return False
