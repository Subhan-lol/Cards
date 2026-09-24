"""Main loop: camera -> hand tracker -> gesture engine -> reels / volume."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional, Union

import cv2

from . import winapi
from .camera import Camera
from .controls import ReelControl, VolumeControl
from .gestures import Event, GestureConfig, GestureEngine
from .hud import Hud
from .tracker import HandTracker, ensure_model

WINDOW = "Reel Scroller"


@dataclass
class Options:
    camera: Union[int, str] = 0
    width: int = 640
    height: int = 480
    mode: str = "keys"
    scroll_notches: float = 1.0
    invert: bool = False
    volume_method: str = "keys"
    volume_step: int = 2
    knob_degrees: float = 8.0
    sensitivity: float = 1.0
    preview: bool = True
    preview_width: int = 480
    topmost: bool = True
    dry_run: bool = False


def _log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def _place_window(width: int, height: int) -> None:
    """Park the preview in the bottom-right corner, out of the way of the video."""
    area = winapi.work_area()
    if area is None:
        return
    left, top, right, bottom = area
    cv2.moveWindow(WINDOW, max(left, right - width - 24), max(top, bottom - height - 60))


def run(opts: Options) -> int:
    config = GestureConfig(knob_step_deg=opts.knob_degrees).with_sensitivity(opts.sensitivity)
    engine = GestureEngine(config)
    reels = ReelControl(opts.mode, opts.scroll_notches, opts.invert, opts.dry_run)
    volume = VolumeControl(opts.volume_method, opts.volume_step, opts.dry_run)
    hud = Hud(opts.preview_width, opts.invert, opts.knob_degrees)
    hotkeys = winapi.Hotkeys(pause="P", quit="Q")

    tracker = HandTracker(ensure_model())
    _log(f"Opening camera {opts.camera}...")
    camera = Camera(opts.camera, opts.width, opts.height)

    if reels.dry_run:
        _log("Dry run: gestures are printed instead of sent to Windows.")
    _log("Running. Swipe up = next reel, swipe down = previous, twist clockwise = volume up.")
    if opts.mode == "keys":
        _log("Click once on the page playing the reels, so the arrow keys go there.")
    else:
        _log("Keep the mouse pointer over the reel (scroll mode).")
    _log("Ctrl+Alt+P pauses/resumes, Ctrl+Alt+Q quits.")

    paused = False
    fps = 0.0
    last_t: Optional[float] = None
    window_ready = False
    try:
        while True:
            fired = hotkeys.poll()
            if "quit" in fired:
                break
            if "pause" in fired:
                paused = not paused
                _log("Paused." if paused else "Resumed.")

            frame, t = camera.read()
            if frame is None:
                if camera.failed:
                    _log("The camera stopped sending frames. Is another app using it?")
                    return 1
                if window_ready:
                    cv2.waitKey(1)  # keep the preview window responsive
                continue
            if last_t is not None and t > last_t:
                fps = 0.9 * fps + 0.1 / (t - last_t) if fps else 1.0 / (t - last_t)
            last_t = t

            frame = cv2.flip(frame, 1)  # mirror, so moving right looks like moving right
            landmarks = None
            if not paused:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                landmarks = tracker.detect(rgb, t)
            h, w = frame.shape[:2]
            aspect = w / h
            points = [(x * aspect, y) for x, y in landmarks] if landmarks else None

            for event in engine.update(t, points):
                if _handle(event, reels, volume):
                    hud.on_event(event, t)
                else:
                    hud.warn("Click your reels page first", t)

            if not opts.preview:
                continue
            level = volume.level()
            img = hud.render(frame, landmarks, engine, level, fps, paused, t)
            cv2.imshow(WINDOW, img)
            if not window_ready:
                window_ready = True
                cv2.waitKey(1)
                _place_window(img.shape[1], img.shape[0])
                winapi.make_overlay(WINDOW, opts.topmost)
            key = cv2.waitKey(1) & 0xFF
            if key in (27, ord("q")):
                break
            if key == ord("p"):
                paused = not paused
                _log("Paused." if paused else "Resumed.")
            if cv2.getWindowProperty(WINDOW, cv2.WND_PROP_VISIBLE) < 1:
                break  # window closed with the X button
    except KeyboardInterrupt:
        pass
    finally:
        camera.close()
        tracker.close()
        if opts.preview:
            cv2.destroyAllWindows()
    _log("Bye.")
    return 0


def _handle(event: Event, reels: ReelControl, volume: VolumeControl) -> bool:
    """Carry out a gesture. Returns False if it couldn't be delivered."""
    swipe = event in (Event.SWIPE_UP, Event.SWIPE_DOWN)
    if swipe and reels.mode == "keys" and not reels.dry_run and winapi.foreground_is_own(WINDOW):
        # The arrow key would land in our own preview or console window.
        _log("Swipe not sent: Reel Scroller's own window has focus. Click once on your reels page.")
        return False
    try:
        if event is Event.SWIPE_UP:
            reels.next()
            _log("Swipe up   -> next reel" if not reels.invert else "Swipe up   -> previous reel")
        elif event is Event.SWIPE_DOWN:
            reels.previous()
            _log("Swipe down -> previous reel" if not reels.invert else "Swipe down -> next reel")
        elif event is Event.VOLUME_UP:
            volume.change(+1)
            _log(f"Twist right -> volume +{volume.step}%")
        elif event is Event.VOLUME_DOWN:
            volume.change(-1)
            _log(f"Twist left  -> volume -{volume.step}%")
    except OSError as exc:
        _log(f"Windows blocked the input: {exc}")
    return True
