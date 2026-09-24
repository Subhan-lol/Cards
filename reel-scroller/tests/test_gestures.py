"""Gesture engine tests driven by synthetic hand movements.

Run from the reel-scroller folder:  python -m unittest discover -s tests
"""

import math
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from reel_scroller.gestures import Event, GestureConfig, GestureEngine, State  # noqa: E402

# A right hand, palm to the camera, index finger pointing up. Units: palm lengths,
# wrist at the origin, y pointing down.
_OPEN = [
    (0.0, 0.0),
    (-0.35, -0.15), (-0.6, -0.35), (-0.75, -0.55), (-0.85, -0.75),
    (-0.35, -0.95), (-0.4, -1.35), (-0.42, -1.6), (-0.44, -1.85),
    (-0.05, -1.0), (-0.05, -1.45), (-0.05, -1.72), (-0.05, -1.95),
    (0.22, -0.95), (0.26, -1.35), (0.28, -1.58), (0.3, -1.78),
    (0.45, -0.82), (0.52, -1.12), (0.56, -1.3), (0.6, -1.47),
]


def _curl(points, finger):
    mcp, pip, dip, tip = finger
    pts = list(points)
    mx, my = pts[mcp]
    pts[pip] = (mx, my - 0.3)
    pts[dip] = (mx + 0.05, my - 0.1)
    pts[tip] = (mx + 0.05, my + 0.1)
    return pts


_POINT = _OPEN
for _f in ((9, 10, 11, 12), (13, 14, 15, 16), (17, 18, 19, 20)):
    _POINT = _curl(_POINT, _f)
_FIST = _curl(_POINT, (5, 6, 7, 8))

FPS = 30.0
ASPECT = 4 / 3


class Hand:
    """Moves a synthetic hand around and feeds frames to the engine."""

    def __init__(self, engine, x=0.65, y=0.75, size=0.15, noise=0.002, fps=FPS, seed=1):
        self.engine = engine
        self.x, self.y, self.size, self.angle = x, y, size, 0.0
        self.pose = _POINT
        self.noise = noise
        self.dt = 1.0 / fps
        self.t = 10.0
        self.rng = random.Random(seed)
        self.events = []
        self.states = []

    def landmarks(self):
        a = math.radians(self.angle)
        ca, sa = math.cos(a), math.sin(a)
        out = []
        for px, py in self.pose:
            rx, ry = px * ca - py * sa, px * sa + py * ca  # clockwise on screen
            out.append((
                self.x + rx * self.size + self.rng.gauss(0, self.noise),
                self.y + ry * self.size + self.rng.gauss(0, self.noise),
            ))
        return out

    def frame(self, visible=True):
        self.t += self.dt
        self.events += self.engine.update(self.t, self.landmarks() if visible else None)
        self.states.append(self.engine.state)

    def hold(self, seconds, visible=True):
        for _ in range(int(round(seconds / self.dt))):
            self.frame(visible)

    def move(self, seconds, dx=0.0, dy=0.0, dangle=0.0):
        n = max(1, int(round(seconds / self.dt)))
        x0, y0, a0 = self.x, self.y, self.angle
        for i in range(1, n + 1):
            k = 0.5 - 0.5 * math.cos(math.pi * i / n)  # ease in/out, like a real hand
            self.x, self.y, self.angle = x0 + dx * k, y0 + dy * k, a0 + dangle * k
            self.frame()


def new(**kw):
    return Hand(GestureEngine(GestureConfig()), **kw)


class SwipeTests(unittest.TestCase):
    def test_still_hand_does_nothing(self):
        h = new(noise=0.004)
        h.hold(5.0)
        self.assertEqual(h.events, [])
        self.assertIs(h.engine.state, State.READY)

    def test_swipe_up(self):
        h = new()
        h.hold(0.6)
        h.move(0.2, dy=-0.28)
        h.hold(0.6)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_swipe_down(self):
        h = new(y=0.45)
        h.hold(0.6)
        h.move(0.2, dy=0.28)
        h.hold(0.6)
        self.assertEqual(h.events, [Event.SWIPE_DOWN])

    def test_quick_small_flick_counts(self):
        h = new()
        h.hold(0.6)
        h.move(0.15, dy=-0.18)
        h.hold(0.5)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_return_stroke_is_ignored(self):
        h = new()
        h.hold(0.6)
        h.move(0.2, dy=-0.28)
        h.hold(0.15)
        h.move(0.3, dy=0.28)  # bring the hand back down
        h.hold(0.8)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_return_stroke_after_a_pause_is_ignored(self):
        h = new()
        h.hold(0.6)
        h.move(0.2, dy=-0.28)
        h.hold(0.3)
        h.move(0.25, dy=0.28)
        h.hold(0.8)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_repeated_swipes(self):
        h = new()
        h.hold(0.6)
        for _ in range(3):
            h.move(0.2, dy=-0.28)
            h.hold(0.3)
            h.move(0.5, dy=0.28)  # slow return
            h.hold(0.4)
        self.assertEqual(h.events, [Event.SWIPE_UP] * 3)

    def test_swipe_back_after_block(self):
        h = new(y=0.6)
        h.hold(0.6)
        h.move(0.2, dy=-0.25)
        h.hold(1.2)
        h.move(0.2, dy=0.25)
        h.hold(0.5)
        self.assertEqual(h.events, [Event.SWIPE_UP, Event.SWIPE_DOWN])

    def test_slow_drift_is_ignored(self):
        h = new()
        h.hold(0.6)
        h.move(2.0, dy=-0.3)
        h.hold(0.5)
        self.assertEqual(h.events, [])

    def test_sideways_motion_is_ignored(self):
        h = new()
        h.hold(0.6)
        h.move(0.2, dx=-0.35)
        h.hold(0.3)
        h.move(0.2, dx=0.35)
        h.hold(0.5)
        self.assertEqual(h.events, [])

    def test_diagonal_mostly_vertical_counts(self):
        h = new()
        h.hold(0.6)
        h.move(0.2, dx=0.1, dy=-0.28)
        h.hold(0.5)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_hand_entering_from_bottom_is_ignored(self):
        h = new(y=1.05)
        h.move(0.3, dy=-0.45)  # raise the hand into view
        h.hold(0.6)
        self.assertEqual(h.events, [])

    def test_hand_dropping_out_of_view_is_ignored(self):
        h = new(y=0.5)
        h.hold(0.6)
        # Drop the hand fast; the tracker loses it as it leaves the frame.
        for _ in range(6):
            h.y += 0.07
            h.frame(visible=h.y < 0.85)
        h.hold(0.6, visible=False)
        self.assertEqual(h.events, [])
        self.assertIs(h.engine.state, State.NO_HAND)

    def test_brief_tracking_dropout_mid_swipe(self):
        h = new()
        h.hold(0.6)
        n = 6
        for i in range(1, n + 1):
            h.y -= 0.28 / n
            h.frame(visible=i not in (3,))  # one lost frame from motion blur
        h.hold(0.5)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_fist_pauses_gestures(self):
        h = new()
        h.hold(0.6)
        h.pose = _FIST
        h.hold(0.2)
        h.move(0.2, dy=-0.28)
        h.hold(0.3)
        self.assertEqual(h.events, [])
        self.assertIs(h.engine.state, State.HOLD)

    def test_open_hand_swipes_too(self):
        h = new()
        h.pose = _OPEN
        h.hold(0.6)
        h.move(0.2, dy=-0.28)
        h.hold(0.5)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_far_away_hand(self):
        h = new(size=0.07, noise=0.0015)
        h.hold(0.6)
        h.move(0.2, dy=-0.14)
        h.hold(0.5)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_low_frame_rate(self):
        h = new(fps=15)
        h.hold(0.6)
        h.move(0.2, dy=-0.28)
        h.hold(0.6)
        self.assertEqual(h.events, [Event.SWIPE_UP])

    def test_high_frame_rate(self):
        h = new(fps=60)
        h.hold(0.6)
        h.move(0.2, dy=0.28)
        h.hold(0.6)
        self.assertEqual(h.events, [Event.SWIPE_DOWN])


class KnobTests(unittest.TestCase):
    def test_clockwise_turns_volume_up(self):
        h = new()
        h.hold(0.6)
        h.move(0.6, dangle=48)
        h.hold(1.0)
        self.assertTrue(h.events, "no events")
        self.assertTrue(all(e is Event.VOLUME_UP for e in h.events), h.events)
        self.assertIn(len(h.events), (5, 6))
        self.assertIn(State.KNOB, h.states)

    def test_counterclockwise_turns_volume_down(self):
        h = new()
        h.hold(0.6)
        h.move(0.6, dangle=-48)
        h.hold(1.0)
        self.assertTrue(all(e is Event.VOLUME_DOWN for e in h.events), h.events)
        self.assertIn(len(h.events), (5, 6))

    def test_turn_back_while_holding_the_knob(self):
        h = new()
        h.hold(0.6)
        h.move(0.5, dangle=40)
        h.move(0.5, dangle=-40)
        h.hold(1.0)
        ups = h.events.count(Event.VOLUME_UP)
        downs = h.events.count(Event.VOLUME_DOWN)
        self.assertGreaterEqual(ups, 4)
        self.assertLessEqual(abs(ups - downs), 1)

    def test_small_wobble_does_not_change_volume(self):
        h = new()
        h.hold(0.6)
        for _ in range(4):
            h.move(0.3, dangle=10)
            h.move(0.3, dangle=-10)
        self.assertEqual(h.events, [])

    def test_fist_lets_go_to_keep_turning(self):
        h = new()
        h.hold(0.6)
        h.move(0.5, dangle=40)
        h.pose = _FIST
        h.hold(0.2)
        h.move(0.5, dangle=-40)  # un-twist with the knob released
        h.pose = _POINT
        h.hold(0.5)
        h.move(0.5, dangle=40)
        h.hold(1.0)
        self.assertNotIn(Event.VOLUME_DOWN, h.events)
        self.assertGreaterEqual(h.events.count(Event.VOLUME_UP), 8)

    def test_knob_does_not_swipe(self):
        h = new()
        h.hold(0.6)
        h.move(0.8, dangle=70)
        h.hold(1.0)
        self.assertNotIn(Event.SWIPE_UP, h.events)
        self.assertNotIn(Event.SWIPE_DOWN, h.events)

    def test_swipe_after_knob(self):
        h = new()
        h.hold(0.6)
        h.move(0.5, dangle=30)
        h.hold(1.0)  # knob lets go
        h.move(0.2, dy=-0.28)
        h.hold(0.5)
        self.assertEqual(h.events[-1], Event.SWIPE_UP)
        self.assertEqual(h.events.count(Event.SWIPE_UP), 1)

    def test_swipe_does_not_turn_knob(self):
        h = new()
        h.hold(0.6)
        h.move(0.2, dy=-0.28, dangle=8)  # a little natural wrist roll
        h.hold(0.5)
        self.assertEqual(h.events, [Event.SWIPE_UP])


class ConfigTests(unittest.TestCase):
    def test_sensitivity_scales_thresholds(self):
        cfg = GestureConfig().with_sensitivity(2.0)
        self.assertAlmostEqual(cfg.swipe_distance, 0.5)
        self.assertAlmostEqual(cfg.knob_engage_deg, 10.0)

    def test_low_sensitivity_ignores_small_swipe(self):
        h = Hand(GestureEngine(GestureConfig().with_sensitivity(0.5)))
        h.hold(0.6)
        h.move(0.15, dy=-0.18)
        h.hold(0.5)
        self.assertEqual(h.events, [])


if __name__ == "__main__":
    unittest.main()
