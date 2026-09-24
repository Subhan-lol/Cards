# Rail Dash

A 3D endless runner that runs in your web browser. Race down three lanes of train tracks: dodge trains, jump barriers, roll under signs, collect coins and power-ups, and keep ahead of the police officer chasing you.

The world, trains, graffiti and music are all generated in code. The only images are the two photo faces used for the Friend runner and the police officer.

## Play on Windows

**Easiest: open it straight from the folder**

1. On GitHub, click **Code → Download ZIP**.
2. Right-click the ZIP and choose **Extract All…**
3. Open the extracted folder and double-click **`index.html`**. It opens in Edge or Chrome and you can play right away.

No install, no server, no internet needed. With internet access the game loads a nicer font; offline it uses a built-in one.

**Or host it for free with GitHub Pages**

Repository **Settings → Pages → Build and deployment → Deploy from a branch**, choose your branch and `/ (root)`, then open the link GitHub gives you (for example `https://<your-user>.github.io/<repo>/`).

## Characters

- **Runner**: pick on the menu with the ◀ ▶ buttons (or the arrow keys). **Friend** has a real face from a photo; **Kai** is a street artist. Your choice is saved.
- **Chaser**: a police officer (with another friend's face from a photo) who whistles and chases you when you stumble, and catches you when you crash.

## Graphics

The menu's **GRAPHICS** button switches between **HIGH** (bloom glow, smoother edges, sharper shadows) and **LOW** (faster). If the first seconds of a run are choppy on HIGH, the game switches to LOW by itself once.

## Controls

| Action              | Keyboard                | Touch            |
| ------------------- | ----------------------- | ---------------- |
| Switch lanes        | `←` `→` or `A` `D`      | Swipe left/right |
| Jump                | `↑` or `W`              | Swipe up         |
| Roll / dive         | `↓` or `S`              | Swipe down       |
| Hoverboard          | `Space`                 | Double-tap       |
| Pause               | `Esc` or `P`            | ❚❚ button        |
| Mute                | `M`                     | 🔊 button        |

## How it works

- **Trains**: running into the front of a train ends the run. Take a **ramp** to run along the roofs. Trains with bright headlights are **moving toward you**.
- **Barriers**: jump the low red-and-white hurdles, roll under the yellow "LOW" signs, and change lanes around the concrete blocks.
- **Stumbles**: scraping the side of a train or wall makes you stumble and the police officer closes in. Stumble again before he drops back and you're **caught**.
- **Power-ups**
  - 🧲 **Coin Magnet** pulls in nearby coins.
  - 🚀 **Jetpack** flies you over everything through a trail of sky coins.
  - ⭐ **2X Score** doubles your points.
  - 👟 **Spring Kicks** give super-high jumps (with a flip) that land you on train roofs.
- **Hoverboards**: press `Space` to ride one for 25 seconds. It absorbs one crash. You start with 3.
- **Shop**: spend coins on more hoverboards and on upgrades that make each power-up last longer.
- Speed and difficulty rise the longer you survive. Your best score, coins and upgrades are saved in the browser.

## Project layout

```
index.html            page, menus and HUD
css/style.css         UI styling
js/textures.js        procedural canvas textures (graffiti, trains, buildings, icons)
js/models.js          3D models: runners, police officer, trains, barriers, scenery, stations
js/faces.js           the two photo faces, embedded as data URLs
js/anim.js            keyframed run cycle, blended poses, springs for secondary motion
js/world.js           track, scenery streaming, level generator, coins, particles
js/player.js          movement, physics, collisions and animation
js/audio.js           synthesized sound effects and background music
js/game.js            main loop, camera, input, power-ups, shop and saving
js/vendor/three.bundle.js   three.js r149 + post-processing addons (MIT license, see THREE-LICENSE.txt)
```

The game is plain JavaScript with no build step. Edit a file and refresh the page to see your change.
