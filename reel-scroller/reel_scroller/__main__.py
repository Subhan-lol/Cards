"""python -m reel_scroller [options]"""

from __future__ import annotations

import argparse
import sys

from . import __version__


def _camera(value: str):
    return int(value) if value.isdigit() else value


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        prog="reel_scroller",
        description="Scroll reels and change the volume with hand gestures in front of your webcam.",
    )
    p.add_argument("--camera", type=_camera, default=0,
                   help="webcam index (0, 1, ...) or a phone-camera stream URL (default: 0)")
    p.add_argument("--list-cameras", action="store_true", help="list the webcams that can be opened, then exit")
    p.add_argument("--mode", choices=("scroll", "keys"), default="scroll",
                   help="scroll: mouse wheel over the reel (default). keys: Up/Down arrow keys")
    p.add_argument("--scroll-notches", type=float, default=1.0, help="wheel notches per swipe (default: 1)")
    p.add_argument("--invert", action="store_true", help="swipe down for the next reel instead of up")
    p.add_argument("--volume-step", type=int, default=2, help="percent per knob click (default: 2)")
    p.add_argument("--knob-degrees", type=float, default=8.0,
                   help="degrees of twist per knob click; smaller = faster volume (default: 8)")
    p.add_argument("--volume-method", choices=("keys", "exact"), default="keys",
                   help="keys: media keys with the Windows volume popup (default). exact: set it directly")
    p.add_argument("--sensitivity", type=float, default=1.0,
                   help="above 1 = shorter swipes/smaller twists count, below 1 = need bigger ones")
    p.add_argument("--no-preview", action="store_true", help="run without the camera preview window")
    p.add_argument("--preview-width", type=int, default=480, help="preview window width in pixels")
    p.add_argument("--no-topmost", action="store_true", help="don't keep the preview on top of other windows")
    p.add_argument("--resolution", default="640x480", help="camera resolution (default: 640x480)")
    p.add_argument("--dry-run", action="store_true", help="print gestures instead of scrolling or changing volume")
    p.add_argument("--download-model", action="store_true", help="download the hand model, then exit")
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    if args.download_model:
        from .tracker import ensure_model

        print(f"Model ready: {ensure_model()}")
        return 0
    if args.list_cameras:
        from .camera import list_cameras

        cams = list_cameras()
        if not cams:
            print("No webcams found.")
        for index, w, h in cams:
            print(f"  --camera {index}   ({w}x{h})")
        return 0

    try:
        width, height = (int(v) for v in args.resolution.lower().split("x"))
    except ValueError:
        print("--resolution must look like 640x480", file=sys.stderr)
        return 2

    from .app import Options, run

    return run(Options(
        camera=args.camera,
        width=width,
        height=height,
        mode=args.mode,
        scroll_notches=args.scroll_notches,
        invert=args.invert,
        volume_method=args.volume_method,
        volume_step=args.volume_step,
        knob_degrees=args.knob_degrees,
        sensitivity=args.sensitivity,
        preview=not args.no_preview,
        preview_width=args.preview_width,
        topmost=not args.no_topmost,
        dry_run=args.dry_run,
    ))


if __name__ == "__main__":
    sys.exit(main())
