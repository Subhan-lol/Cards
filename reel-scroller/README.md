# Reel Scroller

Scroll Instagram Reels, YouTube Shorts and TikTok on Windows without touching anything. Your webcam watches your finger:

| Gesture | Action |
| --- | --- |
| Swipe your finger **up** | Next reel |
| Swipe your finger **down** | Previous reel |
| **Twist** your hand **clockwise**, like turning a volume knob | Volume up |
| Twist **anticlockwise** | Volume down |
| Make a **fist** | Pause gestures while you move your hand around |

Everything runs on your PC. The camera video is never saved or uploaded.

## Install

1. On GitHub, click **Code → Download ZIP**, extract it, and open the `reel-scroller` folder.
2. Double-click **`start.bat`**. If Windows shows "Windows protected your PC", click **More info → Run anyway**.

That's it. The first time, `start.bat` sets everything up by itself, which takes a few minutes:

- **Python**: if you don't have 64-bit Python 3.10 or newer, it downloads the official Python 3.12 installer from python.org, checks that it's signed by the Python Software Foundation, and installs it for your user account. No admin rights are needed. If that download fails, it tries `winget` instead.
- **Packages**: installed into a private `.venv` folder inside `reel-scroller`, so nothing else on your PC is affected.
- **Hand-tracking model**: about 8 MB, downloaded once.
- **Desktop shortcut**: a "Reel Scroller" shortcut on your desktop.

After that, it starts in a few seconds.

## Use it

1. Double-click **`start.bat`** or the desktop shortcut. A small preview window opens in the bottom-right corner of your screen and stays on top.
2. Open your reels in the browser (instagram.com/reels, youtube.com/shorts, tiktok.com) and **leave the mouse pointer over the video**.
3. Sit about an arm's length from the webcam. Raise your hand with your index finger pointing up and your palm facing the camera.

The badge in the preview's top-left corner shows what the app sees:

| Badge | Meaning |
| --- | --- |
| NO HAND | It can't see your hand |
| HOLD STILL | Keep your finger still for a moment to get ready |
| READY | Swipe or twist now |
| SWIPE | A swipe is in progress |
| VOLUME KNOB | You're holding the knob. The dial shows how far you've turned |
| FIST - PAUSED | Gestures are ignored until you open your hand |

### Swiping

- Wait for **READY** (green), then move your finger up or down about the length of your hand, quickly, and stop. The reel changes as soon as your finger stops, like lifting your finger off a phone screen.
- Move your hand back at a relaxed pace. For one second after a swipe, movement in the other direction is ignored, so bringing your hand back won't take you back a reel.
- A swipe that ends outside the camera view doesn't count. That way, dropping your hand into your lap doesn't change the reel.

### The volume knob

- Wait for **READY**, then turn your hand clockwise like a dial, with your finger going from 12 o'clock towards 1 or 2 o'clock. Each 8° of turn is one click (2%), and you get the normal Windows volume popup.
- While you're holding the knob, turning back lowers the volume again, just like a real knob.
- To keep turning past what your wrist allows, make a **fist** (this lets go of the knob), untwist, open your hand and turn again.
- The knob lets go by itself when you stop turning for about 0.7 seconds.

### Shortcuts (work from any window)

- **Ctrl+Alt+P**: pause or resume
- **Ctrl+Alt+Q**: quit (closing the preview window also quits)

## Options

Add options after `start.bat` in a terminal (for example `start.bat --invert`). To keep them, put them on the `set "OPTIONS=..."` line at the top of `start.bat`.

| Option | What it does |
| --- | --- |
| `--sensitivity 1.3` | Above 1: shorter swipes and smaller twists are enough. Below 1: fewer accidental triggers |
| `--invert` | Swipe **down** for the next reel instead |
| `--mode keys` | Press the Down and Up arrow keys instead of scrolling. Click the browser once so it has keyboard focus |
| `--scroll-notches 2` | Scroll further per swipe, for sites that need more than one wheel notch |
| `--knob-degrees 5` | Less twisting per volume click (faster volume) |
| `--volume-step 4` | Percent per volume click (default 2) |
| `--volume-method exact` | Set the volume directly instead of pressing the volume keys (no Windows popup) |
| `--camera 1` | Use a different webcam. `--list-cameras` shows which ones exist |
| `--camera http://PHONE-IP:4747/video` | Use your phone as a wireless webcam through an app like DroidCam or IP Webcam |
| `--no-preview` | Run without the preview window |
| `--no-topmost` | Don't keep the preview on top |
| `--preview-width 360` | Smaller or larger preview |
| `--dry-run` | Print the gestures without scrolling or changing the volume, for testing |

## Tips

- Light your hand from the front. A bright window behind you makes tracking worse.
- Keep your whole hand in view while you gesture.
- If swipes are missed, try `--sensitivity 1.3`. If it triggers when you don't want it to, try `--sensitivity 0.8`, or make a fist while you move your hand.
- In the default scroll mode, the swipe goes to whatever is under the mouse pointer, so keep the pointer on the reel and not on the preview window.

## Troubleshooting

- **"Could not open camera"**: close other apps using the webcam (Zoom, Teams, the Camera app), or try `--camera 1`. Also check that **Settings → Privacy & security → Camera → Let desktop apps access your camera** is on.
- **The reel doesn't change**: move the mouse pointer over the video. If the site ignores the scroll wheel, try `--mode keys` and click the page once.
- **Nothing happens in some apps**: Windows blocks simulated input to apps running as administrator.
- **Python won't install** (for example, a work PC that blocks installers): install Python 3.12 yourself from [python.org](https://www.python.org/downloads/), tick "Add python.exe to PATH", then run `start.bat` again.
- **Setup stopped halfway**: run `start.bat` again. It picks up where it left off. To start completely fresh, delete the `.venv` folder first.

## How it works

- [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) finds 21 points on your hand in every frame, on the CPU.
- **Swipes** (`reel_scroller/gestures.py`): the fingertip has to travel about one palm length vertically within 0.35 seconds, mostly straight up or down, without the hand turning. Distances are measured in palm lengths, so the gesture feels the same close to the camera or far from it. The finger has to pause before a swipe, and the swipe fires when it stops.
- **Knob**: the app measures how much the palm (wrist and four knuckles) has rotated with a best-fit rotation. Bending your finger doesn't count as turning, only rotating your hand does.
- **Reels** change through a mouse-wheel notch or an arrow key sent with the Windows `SendInput` API. **Volume** changes through the media volume keys, or through the Core Audio API with `--volume-method exact`.

Run the tests (no webcam needed) from this folder:

```
python -m unittest discover -s tests
```
