"""Webcam capture on a background thread, so we always process the newest frame."""

from __future__ import annotations

import threading
import time
from typing import List, Optional, Tuple, Union

import cv2

from .winapi import IS_WINDOWS

Source = Union[int, str]


def _backends() -> List[int]:
    if IS_WINDOWS:
        # DirectShow opens most webcams much faster than Media Foundation.
        return [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    return [cv2.CAP_ANY]


def open_capture(source: Source, width: int, height: int, fps: int) -> cv2.VideoCapture:
    if isinstance(source, str):  # phone camera / IP camera URL
        cap = cv2.VideoCapture(source)
        if cap.isOpened() and cap.read()[0]:
            return cap
        cap.release()
        raise RuntimeError(f"Could not open the camera stream {source}")
    for backend in _backends():
        cap = cv2.VideoCapture(source, backend)
        if not cap.isOpened():
            cap.release()
            continue
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        cap.set(cv2.CAP_PROP_FPS, fps)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        for _ in range(5):  # some cameras return a few empty frames while starting
            if cap.read()[0]:
                return cap
            time.sleep(0.05)
        cap.release()
    raise RuntimeError(
        f"Could not open camera {source}. Close other apps using the webcam (Zoom, Teams, "
        f"the Camera app), or try another index with --camera 1. List them with --list-cameras."
    )


def list_cameras(max_index: int = 6) -> List[Tuple[int, int, int]]:
    found = []
    for index in range(max_index):
        for backend in _backends():
            cap = cv2.VideoCapture(index, backend)
            ok = cap.isOpened() and cap.read()[0]
            if ok:
                found.append((index, int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))))
            cap.release()
            if ok:
                break
    return found


class Camera:
    def __init__(self, source: Source, width: int = 640, height: int = 480, fps: int = 30):
        self._cap = open_capture(source, width, height, fps)
        self._cond = threading.Condition()
        self._frame = None
        self._t = 0.0
        self._seq = 0
        self._read_seq = 0
        self._running = True
        self.failed = False
        self._thread = threading.Thread(target=self._loop, name="camera", daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        misses = 0
        while self._running:
            ok, frame = self._cap.read()
            now = time.monotonic()
            if not ok or frame is None:
                misses += 1
                if misses > 60:  # about 2-3 seconds of nothing: the camera is gone
                    with self._cond:
                        self.failed = True
                        self._cond.notify_all()
                    return
                time.sleep(0.03)
                continue
            misses = 0
            with self._cond:
                self._frame, self._t = frame, now
                self._seq += 1
                self._cond.notify_all()

    def read(self, timeout: float = 1.0) -> Tuple[Optional[object], float]:
        """Wait for a frame newer than the last one returned. Returns (frame, capture_time)."""
        with self._cond:
            self._cond.wait_for(lambda: self._seq != self._read_seq or self.failed, timeout)
            if self._seq == self._read_seq:
                return None, 0.0
            self._read_seq = self._seq
            return self._frame, self._t

    def close(self) -> None:
        self._running = False
        self._thread.join(timeout=1.0)
        self._cap.release()
