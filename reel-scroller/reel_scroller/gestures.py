"""Turns a stream of hand landmarks into swipe and volume-knob events.

This module is pure Python (no OpenCV or MediaPipe) so the logic can be unit
tested with synthetic hand movements.

Coordinates: points are (x, y) with y pointing down, x scaled so both axes use
the same unit (fractions of the frame height). The frame is mirrored before
tracking, so "clockwise" here is clockwise from the user's point of view.

Distances are measured in palm lengths, so gestures feel the same whether the
hand is close to the camera or far away.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Deque, List, Optional, Sequence, Tuple

from .filters import PointFilter

Point = Tuple[float, float]

# MediaPipe hand landmark indices.
WRIST = 0
INDEX_TIP = 8
PALM_POINTS = (0, 5, 9, 13, 17)  # wrist + the four knuckles: a nearly rigid shape
FINGERS = ((5, 6, 8), (9, 10, 12), (13, 14, 16), (17, 18, 20))  # (knuckle, middle joint, tip)


class Event(Enum):
    SWIPE_UP = "swipe up"
    SWIPE_DOWN = "swipe down"
    VOLUME_UP = "volume up"
    VOLUME_DOWN = "volume down"


class State(Enum):
    NO_HAND = "no hand"
    SETTLING = "hold still"
    READY = "ready"
    SWIPING = "swiping"
    KNOB = "volume knob"
    HOLD = "fist: paused"


@dataclass(frozen=True)
class GestureConfig:
    # Swipes
    swipe_distance: float = 1.0  # vertical fingertip travel, in palm lengths
    swipe_min_distance: float = 0.07  # ...and at least this fraction of the frame height
    swipe_window: float = 0.35  # seconds that travel has to happen within
    swipe_vertical_ratio: float = 1.4  # vertical travel must be this many times the sideways travel
    swipe_max_rotation: float = 25.0  # degrees; a hand that turns this much is twisting, not swiping
    stop_speed: float = 1.6  # palm lengths/s; a swipe fires once the finger slows below this...
    stop_fraction: float = 0.35  # ...or below this fraction of its peak speed
    max_pending: float = 0.35  # seconds to wait for a swipe to finish
    swipe_cooldown: float = 0.45  # seconds before another swipe in the same direction
    return_block: float = 1.0  # seconds the opposite direction is ignored (hand moving back)
    # A swipe that ends this close to the top/bottom edge is the hand leaving the frame
    # (e.g. dropping it into your lap), not a swipe.
    edge_margin_top: float = 0.03
    edge_margin_bottom: float = 0.1
    # Arming: the finger has to pause briefly before a swipe can start
    rest_speed: float = 1.2  # palm lengths/s; slower than this counts as still
    rest_time: float = 0.12  # seconds of stillness needed
    speed_window: float = 0.1  # seconds over which fingertip speed is measured
    acquire_time: float = 0.2  # seconds a hand must be tracked before it can gesture
    lost_grace: float = 0.15  # tracking dropouts shorter than this are ignored
    # Volume knob
    knob_engage_deg: float = 20.0  # twist needed to grab the knob
    knob_engage_window: float = 0.5  # ...within this many seconds
    knob_max_drift: float = 1.0  # palm lengths the hand may move while grabbing the knob
    knob_step_deg: float = 8.0  # degrees of twist per volume step
    knob_still_deg: float = 6.0  # twisting less than this over knob_release_time...
    knob_release_time: float = 0.7  # ...lets go of the knob
    knob_release_drift: float = 2.5  # palm lengths of movement that also lets go
    # Fist = hold
    fist_frames: int = 3  # consecutive frames of a fist before gestures pause

    def with_sensitivity(self, sensitivity: float) -> "GestureConfig":
        """Higher sensitivity = shorter swipes and smaller twists are enough."""
        s = max(0.2, sensitivity)
        return replace(
            self,
            swipe_distance=self.swipe_distance / s,
            swipe_min_distance=self.swipe_min_distance / s,
            knob_engage_deg=self.knob_engage_deg / s,
        )


@dataclass
class Sample:
    t: float
    tip: Point  # index fingertip (smoothed)
    palm: Point  # centre of the palm (smoothed)
    shape: Tuple[Point, ...]  # palm points relative to the palm centre
    scale: float  # palm length in frame units


@dataclass
class PendingSwipe:
    direction: Event
    start: Sample
    since: float
    peak_speed: float = 0.0


@dataclass
class Knob:
    anchor: Sample  # hand pose when the twist began
    since: float
    total: float  # degrees turned since the anchor, clockwise positive
    ref: float = 0.0  # twist at which the last volume step happened
    trace: Deque[Tuple[float, float]] = field(default_factory=deque)  # recent (t, total)


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _centroid(points: Sequence[Point]) -> Point:
    n = len(points)
    return sum(p[0] for p in points) / n, sum(p[1] for p in points) / n


def rotation_between(a: Sequence[Point], b: Sequence[Point]) -> float:
    """Best-fit rotation in degrees that turns centred shape `a` into `b`.

    Positive means clockwise on screen (y points down). This is the 2D Kabsch
    solution, so it uses every palm point instead of trusting a single vector.
    """
    num = den = 0.0
    for (ax, ay), (bx, by) in zip(a, b):
        num += ax * by - ay * bx
        den += ax * bx + ay * by
    return math.degrees(math.atan2(num, den))


def _wrap(deg: float) -> float:
    return (deg + 180.0) % 360.0 - 180.0


class GestureEngine:
    def __init__(self, config: Optional[GestureConfig] = None):
        self.cfg = config or GestureConfig()
        self.history: Deque[Sample] = deque()
        # Cooldowns outlive a lost hand, so briefly losing tracking can't double-fire.
        self.blocked_until = {Event.SWIPE_UP: -math.inf, Event.SWIPE_DOWN: -math.inf}
        self._filters = [PointFilter(min_cutoff=1.0, beta=12.0) for _ in range(len(PALM_POINTS) + 1)]
        self._reset()

    # ------------------------------------------------------------------ state

    def _reset(self) -> None:
        self.state = State.NO_HAND
        self.history.clear()
        self.acquired_t = 0.0
        self.last_seen_t: Optional[float] = None
        self.still_since: Optional[float] = None
        self.armed_t: Optional[float] = None
        self.scale: Optional[float] = None
        self.pending: Optional[PendingSwipe] = None
        self.knob: Optional[Knob] = None
        self._fist_count = 0
        for f in self._filters:
            f.reset()

    def _settle(self) -> None:
        """Disarm: the finger must pause again before the next gesture."""
        self.state = State.SETTLING
        self.pending = None
        self.knob = None
        self.still_since = None
        self.armed_t = None

    def _armed_or(self, default: float) -> float:
        return self.armed_t if self.armed_t is not None else default

    @property
    def current(self) -> Optional[Sample]:
        return self.history[-1] if self.history else None

    # ------------------------------------------------------------------ input

    def update(self, t: float, landmarks: Optional[Sequence[Point]]) -> List[Event]:
        """Feed one frame. `landmarks` is 21 points, or None if no hand is visible."""
        cfg = self.cfg
        if landmarks is None:
            if self.state is not State.NO_HAND and (
                self.last_seen_t is None or t - self.last_seen_t > cfg.lost_grace
            ):
                self._reset()
            return []

        if self.state is State.NO_HAND:
            self._reset()
            self.state = State.SETTLING
            self.acquired_t = t
        self.last_seen_t = t

        sample = self._make_sample(t, landmarks)
        self.history.append(sample)
        while self.history and t - self.history[0].t > 1.2:
            self.history.popleft()

        if self._is_fist(landmarks):
            self._settle()
            self.state = State.HOLD
            return []
        if self.state is State.HOLD:
            # Opening the hand moves every point; don't read that as a gesture.
            self._settle()
            self.history.clear()
            self.history.append(sample)
            return []

        if self.state is State.KNOB:
            return self._update_knob(sample)
        if self.state is State.SWIPING:
            return self._update_pending(sample)

        self._update_rest(sample)
        if self.state is State.READY:
            if self._try_knob(sample):
                return self._update_knob(sample)
            if self._try_swipe(sample):
                return self._update_pending(sample)
        return []

    def _make_sample(self, t: float, lm: Sequence[Point]) -> Sample:
        palm_pts = [f(lm[i], t) for f, i in zip(self._filters, PALM_POINTS)]
        tip = self._filters[-1](lm[INDEX_TIP], t)
        palm = _centroid(palm_pts)
        shape = tuple((x - palm[0], y - palm[1]) for x, y in palm_pts)
        # Palm length, using knuckle width when the hand is pointed at the camera.
        raw_scale = max(_dist(lm[0], lm[9]), 1.3 * _dist(lm[5], lm[17]), 1e-3)
        self.scale = raw_scale if self.scale is None else self.scale + 0.2 * (raw_scale - self.scale)
        return Sample(t, tip, palm, shape, self.scale)

    def _is_fist(self, lm: Sequence[Point]) -> bool:
        wrist = lm[WRIST]
        curled = all(_dist(wrist, lm[tip]) < _dist(wrist, lm[pip]) for _, pip, tip in FINGERS)
        self._fist_count = self._fist_count + 1 if curled else 0
        return self._fist_count >= self.cfg.fist_frames

    def _tip_speed(self, cur: Sample) -> float:
        """Fingertip speed in palm lengths per second."""
        old = cur
        for s in self.history:
            if cur.t - s.t <= self.cfg.speed_window:
                old = s
                break
        dt = cur.t - old.t
        if dt <= 0:
            return 0.0
        return _dist(cur.tip, old.tip) / dt / cur.scale

    def _update_rest(self, cur: Sample) -> None:
        cfg = self.cfg
        if self._tip_speed(cur) < cfg.rest_speed:
            if self.still_since is None:
                self.still_since = cur.t
        else:
            self.still_since = None
        if (
            self.state is State.SETTLING
            and self.still_since is not None
            and cur.t - self.still_since >= cfg.rest_time
            and cur.t - self.acquired_t >= cfg.acquire_time
        ):
            self.state = State.READY
            self.armed_t = self.still_since

    # ------------------------------------------------------------------ swipes

    def _try_swipe(self, cur: Sample) -> bool:
        cfg = self.cfg
        since = max(cur.t - cfg.swipe_window, self._armed_or(cur.t))
        window = [s for s in self.history if s.t >= since]
        if len(window) < 2:
            return False
        need = max(cfg.swipe_distance * cur.scale, cfg.swipe_min_distance)
        lowest = max(window, key=lambda s: s.tip[1])
        highest = min(window, key=lambda s: s.tip[1])
        for direction, start in ((Event.SWIPE_UP, lowest), (Event.SWIPE_DOWN, highest)):
            travel = start.tip[1] - cur.tip[1] if direction is Event.SWIPE_UP else cur.tip[1] - start.tip[1]
            if travel < need:
                continue
            if travel < cfg.swipe_vertical_ratio * abs(cur.tip[0] - start.tip[0]):
                continue
            if abs(rotation_between(start.shape, cur.shape)) > cfg.swipe_max_rotation:
                continue
            if cur.t < self.blocked_until[direction]:
                continue
            self.state = State.SWIPING
            self.pending = PendingSwipe(direction, start, cur.t)
            return True
        return False

    def _update_pending(self, cur: Sample) -> List[Event]:
        """Fire once the finger stops, so a hand dropping out of view never counts."""
        cfg = self.cfg
        p = self.pending
        assert p is not None
        dy = cur.tip[1] - p.start.tip[1]
        travel = -dy if p.direction is Event.SWIPE_UP else dy
        need = max(cfg.swipe_distance * cur.scale, cfg.swipe_min_distance)
        inside = cfg.edge_margin_top <= cur.tip[1] <= 1.0 - cfg.edge_margin_bottom
        if travel < 0.6 * need:  # came most of the way back: not a swipe
            self._settle()
            return []
        speed = self._tip_speed(cur)
        p.peak_speed = max(p.peak_speed, speed)
        stopped = speed < max(cfg.stop_speed, cfg.stop_fraction * p.peak_speed)
        timed_out = cur.t - p.since > cfg.max_pending
        if not (stopped or timed_out):
            return []
        if not inside:
            if timed_out:
                self._settle()
            return []
        opposite = Event.SWIPE_DOWN if p.direction is Event.SWIPE_UP else Event.SWIPE_UP
        self.blocked_until[p.direction] = cur.t + cfg.swipe_cooldown
        self.blocked_until[opposite] = max(self.blocked_until[opposite], cur.t + cfg.return_block)
        self._settle()
        return [p.direction]

    # ------------------------------------------------------------------ knob

    def _try_knob(self, cur: Sample) -> bool:
        cfg = self.cfg
        since = max(cur.t - cfg.knob_engage_window, self._armed_or(cur.t))
        best, best_rot = None, 0.0
        for s in self.history:
            if s.t < since:
                continue
            rot = rotation_between(s.shape, cur.shape)
            if abs(rot) > abs(best_rot):
                best, best_rot = s, rot
        if best is None or abs(best_rot) < cfg.knob_engage_deg:
            return False
        if _dist(best.palm, cur.palm) / cur.scale > cfg.knob_max_drift:
            return False
        self.state = State.KNOB
        self.pending = None
        # Anchor at the start of the twist, so the twist that grabbed the knob already counts.
        self.knob = Knob(anchor=best, since=cur.t, total=best_rot)
        return True

    def _update_knob(self, cur: Sample) -> List[Event]:
        cfg = self.cfg
        k = self.knob
        assert k is not None
        rot = rotation_between(k.anchor.shape, cur.shape)
        k.total += _wrap(rot - k.total)

        events: List[Event] = []
        while k.total - k.ref >= cfg.knob_step_deg:
            k.ref += cfg.knob_step_deg
            events.append(Event.VOLUME_UP)
        while k.total - k.ref <= -cfg.knob_step_deg:
            k.ref -= cfg.knob_step_deg
            events.append(Event.VOLUME_DOWN)

        k.trace.append((cur.t, k.total))
        while cur.t - k.trace[0][0] > cfg.knob_release_time:
            k.trace.popleft()
        recent = [total for _, total in k.trace]
        idle = cur.t - k.since >= cfg.knob_release_time and max(recent) - min(recent) < cfg.knob_still_deg
        drift = _dist(k.anchor.palm, cur.palm) / cur.scale
        if idle or drift > cfg.knob_release_drift:
            self._settle()
            for d in self.blocked_until:
                self.blocked_until[d] = max(self.blocked_until[d], cur.t + 0.3)
        return events
