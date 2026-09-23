/* Rail Dash - procedural textures.
 * Every texture in the game is painted at load time on a <canvas>,
 * so the game ships with no image files at all. */
(function () {
  'use strict';
  const RD = (window.RD = window.RD || {});
  const T = (RD.tex = {});

  const cache = {};
  function once(key, fn) {
    if (!cache[key]) cache[key] = fn();
    return cache[key];
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  T.rnd = rnd;
  T.pick = pick;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function toTexture(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function shade(hex, amt) {
    const c = new THREE.Color(hex);
    const f = amt / 100;
    if (f >= 0) c.lerp(new THREE.Color(1, 1, 1), f);
    else c.lerp(new THREE.Color(0, 0, 0), -f);
    return '#' + c.getHexString();
  }
  T.shade = shade;

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  T.roundRect = roundRect;

  // Draw a shape and its wrapped copies so repeating textures tile seamlessly.
  function wrapped(W, H, x, y, r, draw) {
    for (let ox = -W; ox <= W; ox += W) {
      for (let oy = -H; oy <= H; oy += H) {
        const px = x + ox, py = y + oy;
        if (px + r < 0 || px - r > W || py + r < 0 || py - r > H) continue;
        draw(px, py);
      }
    }
  }

  function noise(g, W, H, count, alpha) {
    for (let i = 0; i < count; i++) {
      const v = (Math.random() * 255) | 0;
      g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      g.fillRect(Math.random() * W, Math.random() * H, rnd(1, 3), rnd(1, 3));
    }
  }

  /* ---------- toon shading ramp ---------- */
  T.toonGradient = () =>
    once('toon', () => {
      const levels = [110, 185, 255];
      const data = new Uint8Array(levels.length * 4);
      levels.forEach((v, i) => data.set([v, v, v, 255], i * 4));
      const t = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    });

  /* ---------- ground ---------- */
  T.gravel = () =>
    once('gravel', () => {
      const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#857a6c';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 2200; i++) {
        const v = rnd(95, 180) | 0, tint = rnd(-10, 14) | 0;
        g.fillStyle = `rgb(${v + tint},${v},${v - tint - 10})`;
        const x = rnd(0, W), y = rnd(0, H), r = rnd(1.2, 3.4), rot = rnd(0, 3.14), sq = rnd(0.55, 1);
        wrapped(W, H, x, y, r, (px, py) => {
          g.beginPath();
          g.ellipse(px, py, r, r * sq, rot, 0, Math.PI * 2);
          g.fill();
        });
      }
      const t = toTexture(c, true);
      return t;
    });

  T.sleepers = () =>
    once('sleepers', () => {
      const W = 128, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#6f665b';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) {
        const v = rnd(70, 150) | 0;
        g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
        const x = rnd(0, W), y = rnd(0, H), r = rnd(1, 2.6);
        wrapped(W, H, x, y, r, (px, py) => {
          g.beginPath();
          g.arc(px, py, r, 0, Math.PI * 2);
          g.fill();
        });
      }
      // wooden sleeper
      const y0 = 46, h = 36;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(2, y0 + 4, W - 4, h);
      g.fillStyle = '#6b4a2e';
      g.fillRect(0, y0, W, h);
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = `rgba(${rnd(30, 60) | 0},${rnd(18, 34) | 0},10,0.5)`;
        g.lineWidth = rnd(1, 2);
        const yy = y0 + rnd(3, h - 3);
        g.beginPath();
        g.moveTo(0, yy);
        g.bezierCurveTo(40, yy + rnd(-3, 3), 90, yy + rnd(-3, 3), W, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,220,170,0.15)';
      g.fillRect(0, y0, W, 5);
      // tie plates under the rails
      for (const x of [24, 104]) {
        g.fillStyle = '#3b3b40';
        g.fillRect(x - 12, y0 + 4, 24, h - 8);
        g.fillStyle = '#8b8d94';
        g.fillRect(x - 9, y0 + 8, 4, 4);
        g.fillRect(x + 5, y0 + h - 12, 4, 4);
      }
      return toTexture(c, true);
    });

  T.grass = () =>
    once('grass', () => {
      const W = 128, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#6fae47';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 1400; i++) {
        const v = rnd(-30, 30) | 0;
        g.fillStyle = `rgb(${110 + v},${176 + v},${70 + v})`;
        g.fillRect(rnd(0, W), rnd(0, H), 2, rnd(2, 5));
      }
      return toTexture(c, true);
    });

  /* ---------- graffiti (original doodles and words) ---------- */
  const WORDS = ['DASH', 'RUSH', 'ZOOM', 'WILD', 'HYPE', 'GO!', 'YO!', 'FLY', 'BOOM', 'RAIL', 'NOVA', 'KAI', 'WOW', 'POW', 'RUN', 'ACE', 'VIBE', 'JUMP', 'EPIC', 'ZAP', 'FRESH', 'LOOP'];
  const PAIRS = [
    ['#ff3fa4', '#ffd23f'], ['#35d6ff', '#7cff5b'], ['#ff7a2f', '#fff14f'], ['#b36bff', '#ff5bd1'],
    ['#46e0a0', '#2f8cff'], ['#ff4040', '#ffb13f'], ['#00e5c3', '#f7ff5b'], ['#ff6ec7', '#7a5bff'],
  ];

  function graffitiWord(g, cx, cy, size, word) {
    word = word || pick(WORDS);
    const [c1, c2] = pick(PAIRS);
    g.save();
    g.translate(cx, cy);
    g.rotate(rnd(-0.14, 0.14));
    g.font = `900 ${size}px "Arial Black", "Lilita One", Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const w = g.measureText(word).width;
    // spray cloud behind
    const cloud = g.createRadialGradient(0, 0, size * 0.2, 0, 0, w * 0.7);
    cloud.addColorStop(0, 'rgba(255,255,255,0.18)');
    cloud.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cloud;
    g.fillRect(-w, -size, w * 2, size * 2);
    // 3D extrusion
    g.fillStyle = '#141414';
    for (let i = 1; i <= 6; i++) g.fillText(word, i * size * 0.012, i * size * 0.014);
    g.lineWidth = size * 0.22;
    g.strokeStyle = '#141414';
    g.strokeText(word, size * 0.07, size * 0.08);
    g.lineWidth = size * 0.17;
    g.strokeStyle = '#ffffff';
    g.strokeText(word, 0, 0);
    g.lineWidth = size * 0.07;
    g.strokeStyle = '#141414';
    g.strokeText(word, 0, 0);
    const gr = g.createLinearGradient(0, -size / 2, 0, size / 2);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.fillText(word, 0, 0);
    // drips
    g.fillStyle = c2;
    for (let i = 0; i < 4; i++) {
      const x = rnd(-w / 2.3, w / 2.3), len = rnd(size * 0.15, size * 0.5);
      g.fillRect(x, size * 0.25, size * 0.045, len);
      g.beginPath();
      g.arc(x + size * 0.022, size * 0.25 + len, size * 0.035, 0, Math.PI * 2);
      g.fill();
    }
    // shine
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(rnd(-w / 2.2, w / 2.2), rnd(-size * 0.3, -size * 0.1), rnd(2, size * 0.05), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function star(g, x, y, r, points, inner) {
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * inner : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  }

  function doodle(g, x, y, s) {
    const [c1, c2] = pick(PAIRS);
    g.save();
    g.lineJoin = 'round';
    g.lineWidth = s * 0.08;
    g.strokeStyle = '#141414';
    const kind = (Math.random() * 5) | 0;
    if (kind === 0) {
      star(g, x, y, s * 0.5, 5, 0.45);
      g.fillStyle = c1;
      g.fill();
      g.stroke();
    } else if (kind === 1) {
      // splat
      g.fillStyle = c1;
      g.beginPath();
      g.arc(x, y, s * 0.3, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 9; i++) {
        const a = rnd(0, Math.PI * 2), d = rnd(s * 0.3, s * 0.6);
        g.beginPath();
        g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(s * 0.04, s * 0.12), 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 2) {
      // smiley
      g.fillStyle = c2;
      g.beginPath();
      g.arc(x, y, s * 0.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#141414';
      g.beginPath();
      g.arc(x - s * 0.13, y - s * 0.08, s * 0.06, 0, Math.PI * 2);
      g.arc(x + s * 0.13, y - s * 0.08, s * 0.06, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x, y + s * 0.02, s * 0.22, 0.2, Math.PI - 0.2);
      g.stroke();
    } else if (kind === 3) {
      // arrow
      g.translate(x, y);
      g.rotate(rnd(-0.6, 0.6));
      g.beginPath();
      g.moveTo(-s * 0.5, -s * 0.1);
      g.lineTo(s * 0.15, -s * 0.1);
      g.lineTo(s * 0.15, -s * 0.28);
      g.lineTo(s * 0.5, 0);
      g.lineTo(s * 0.15, s * 0.28);
      g.lineTo(s * 0.15, s * 0.1);
      g.lineTo(-s * 0.5, s * 0.1);
      g.closePath();
      g.fillStyle = c1;
      g.fill();
      g.stroke();
    } else {
      // crown
      g.beginPath();
      g.moveTo(x - s * 0.4, y + s * 0.25);
      g.lineTo(x - s * 0.45, y - s * 0.25);
      g.lineTo(x - s * 0.2, y);
      g.lineTo(x, y - s * 0.35);
      g.lineTo(x + s * 0.2, y);
      g.lineTo(x + s * 0.45, y - s * 0.25);
      g.lineTo(x + s * 0.4, y + s * 0.25);
      g.closePath();
      g.fillStyle = '#ffd23f';
      g.fill();
      g.stroke();
    }
    g.restore();
  }

  /* ---------- walls ---------- */
  T.WALL_VARIANTS = 8;
  T.wall = (v) =>
    once('wall' + v, () => {
      const W = 1024, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      const base = pick(['#a19d95', '#9a958c', '#aaa59b', '#938f88']);
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      noise(g, W, H, 5000, 0.12);
      // panel joints
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 3;
      for (let x = 0; x <= W; x += 256) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      // top coping
      g.fillStyle = shade(base, 18);
      g.fillRect(0, 0, W, 14);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, 14, W, 4);
      // rust / water stains
      for (let i = 0; i < 18; i++) {
        const x = rnd(0, W), w = rnd(4, 18), h = rnd(30, 140);
        const gr = g.createLinearGradient(0, 18, 0, 18 + h);
        gr.addColorStop(0, 'rgba(70,55,40,0.35)');
        gr.addColorStop(1, 'rgba(70,55,40,0)');
        g.fillStyle = gr;
        g.fillRect(x, 18, w, h);
      }
      // graffiti pieces
      const n = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * W + rnd(-60, 60);
        graffitiWord(g, x, rnd(110, 150), rnd(80, 115));
      }
      for (let i = 0; i < 3; i++) doodle(g, rnd(40, W - 40), rnd(60, 200), rnd(50, 80));
      // grime at the bottom
      const gr = g.createLinearGradient(0, H * 0.75, 0, H);
      gr.addColorStop(0, 'rgba(40,35,30,0)');
      gr.addColorStop(1, 'rgba(40,35,30,0.45)');
      g.fillStyle = gr;
      g.fillRect(0, H * 0.75, W, H * 0.25);
      return toTexture(c);
    });

  T.concrete = () =>
    once('concrete', () => {
      const W = 128, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#9d9890';
      g.fillRect(0, 0, W, H);
      noise(g, W, H, 1500, 0.12);
      return toTexture(c, true);
    });

  T.fence = () =>
    once('fence', () => {
      const W = 128, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
      g.clearRect(0, 0, W, H);
      g.strokeStyle = '#c9ced4';
      g.lineWidth = 3;
      for (let i = -H; i < W + H; i += 16) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + H, H);
        g.stroke();
        g.beginPath();
        g.moveTo(i + H, 0);
        g.lineTo(i, H);
        g.stroke();
      }
      return toTexture(c, true);
    });

  /* ---------- buildings ---------- */
  T.BUILDING_COLORS = ['#c8765a', '#e2cba4', '#8fa4ba', '#d8d2c8', '#b85f5f', '#7f9a82', '#e59f5c', '#9d88b8'];
  T.building = (i) =>
    once('bld' + i, () => {
      const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      const base = T.BUILDING_COLORS[i % T.BUILDING_COLORS.length];
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      noise(g, W, H, 1200, 0.08);
      if (i % 3 === 0) {
        // brick courses
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = 1;
        for (let y = 0; y < H; y += 8) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
        }
      }
      // 2 x 2 windows per tile
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 2; k++) {
          const x = k * 128 + 30, y = r * 128 + 30, w = 68, h = 76;
          g.fillStyle = shade(base, -35);
          g.fillRect(x - 6, y - 6, w + 12, h + 16);
          const lit = Math.random() < 0.25;
          const gr = g.createLinearGradient(x, y, x + w, y + h);
          if (lit) {
            gr.addColorStop(0, '#fff3b0');
            gr.addColorStop(1, '#ffc766');
          } else {
            gr.addColorStop(0, '#9fd3ff');
            gr.addColorStop(1, '#3d6a9a');
          }
          g.fillStyle = gr;
          g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.beginPath();
          g.moveTo(x, y + h * 0.6);
          g.lineTo(x + w * 0.6, y);
          g.lineTo(x + w * 0.8, y);
          g.lineTo(x, y + h * 0.85);
          g.fill();
          g.fillStyle = shade(base, 30);
          g.fillRect(x - 4, y + h, w + 8, 8);
          g.fillStyle = shade(base, -45);
          g.fillRect(x + w / 2 - 2, y, 4, h);
        }
      }
      return toTexture(c, true);
    });

  /* ---------- trains ---------- */
  T.SCHEMES = [
    { id: 0, body: '#dfe4ea', stripe: '#1f73d6', stripe2: '#ffc81f', roof: '#9aa3ad', door: '#c9d0d8' },
    { id: 1, body: '#e5473a', stripe: '#fff0d6', stripe2: '#2b2b2b', roof: '#8b8f96', door: '#c93b30' },
    { id: 2, body: '#2fb57b', stripe: '#ffffff', stripe2: '#145c3d', roof: '#8c979b', door: '#28a06c' },
    { id: 3, body: '#f5b62c', stripe: '#333a48', stripe2: '#ffffff', roof: '#8c8f94', door: '#dd9f1c' },
    { id: 4, body: '#6c5ce7', stripe: '#00e5c3', stripe2: '#ffffff', roof: '#8e8aa8', door: '#5e4fd6' },
  ];
  T.TRAIN_VARIANTS = 3;

  function window_(g, x, y, w, h) {
    g.fillStyle = '#e6e9ee';
    roundRect(g, x - 5, y - 5, w + 10, h + 10, 12);
    g.fill();
    const gr = g.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, '#2d4a66');
    gr.addColorStop(1, '#162536');
    g.fillStyle = gr;
    roundRect(g, x, y, w, h, 9);
    g.fill();
    g.save();
    roundRect(g, x, y, w, h, 9);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.moveTo(x + w * 0.1, y + h);
    g.lineTo(x + w * 0.55, y);
    g.lineTo(x + w * 0.8, y);
    g.lineTo(x + w * 0.35, y + h);
    g.fill();
    g.restore();
  }

  T.trainSide = (scheme, variant) =>
    once('ts' + scheme.id + '_' + variant, () => {
      const W = 1024, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, shade(scheme.body, 22));
      gr.addColorStop(0.5, scheme.body);
      gr.addColorStop(1, shade(scheme.body, -22));
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      noise(g, W, H, 1500, 0.05);
      // roof edge
      g.fillStyle = shade(scheme.body, -30);
      g.fillRect(0, 0, W, 8);
      // stripes
      g.fillStyle = scheme.stripe;
      g.fillRect(0, H * 0.66, W, H * 0.11);
      g.fillStyle = scheme.stripe2;
      g.fillRect(0, H * 0.79, W, H * 0.03);
      g.fillStyle = scheme.stripe;
      g.fillRect(0, H * 0.1, W, H * 0.025);
      // doors
      const doors = [W * 0.2, W * 0.8];
      const doorW = 118;
      for (const dx of doors) {
        const x = dx - doorW / 2;
        g.fillStyle = scheme.door;
        g.fillRect(x, H * 0.14, doorW, H * 0.86);
        g.strokeStyle = 'rgba(0,0,0,0.45)';
        g.lineWidth = 4;
        g.strokeRect(x, H * 0.14, doorW, H * 0.86);
        g.beginPath();
        g.moveTo(dx, H * 0.14);
        g.lineTo(dx, H);
        g.stroke();
        window_(g, x + 12, H * 0.22, doorW / 2 - 22, H * 0.34);
        window_(g, dx + 10, H * 0.22, doorW / 2 - 22, H * 0.34);
        g.fillStyle = scheme.stripe;
        g.fillRect(x, H * 0.66, doorW, H * 0.11);
      }
      // passenger windows
      for (let x = 20; x < W - 60; x += 96) {
        const inDoor = doors.some((d) => x + 76 > d - doorW / 2 - 10 && x < d + doorW / 2 + 10);
        if (inDoor) continue;
        window_(g, x, H * 0.2, 74, H * 0.36);
      }
      // graffiti on some cars
      if (variant > 0) {
        const x = pick([W * 0.5, W * 0.38, W * 0.62]);
        graffitiWord(g, x, H * 0.72, rnd(70, 95));
        if (variant > 1) doodle(g, pick([W * 0.08, W * 0.94]), H * 0.72, 60);
      }
      // grime
      const dirt = g.createLinearGradient(0, H * 0.8, 0, H);
      dirt.addColorStop(0, 'rgba(50,40,30,0)');
      dirt.addColorStop(1, 'rgba(50,40,30,0.4)');
      g.fillStyle = dirt;
      g.fillRect(0, H * 0.8, W, H * 0.2);
      return toTexture(c);
    });

  T.trainFront = (scheme, lit) =>
    once('tf' + scheme.id + (lit ? 'L' : ''), () => {
      const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, shade(scheme.body, 20));
      gr.addColorStop(1, shade(scheme.body, -20));
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      // route display
      g.fillStyle = '#151515';
      roundRect(g, 60, 10, 136, 26, 5);
      g.fill();
      g.fillStyle = '#ffb31f';
      g.font = 'bold 20px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(pick(['EXPRESS', 'LINE 7', 'CITY', 'LOOP 3', 'METRO']), 128, 24);
      // windshield
      g.fillStyle = '#1b1b1b';
      roundRect(g, 18, 44, 220, 100, 18);
      g.fill();
      const wg = g.createLinearGradient(0, 50, 0, 140);
      wg.addColorStop(0, '#4a7598');
      wg.addColorStop(1, '#1c3044');
      g.fillStyle = wg;
      roundRect(g, 26, 52, 204, 84, 14);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.moveTo(40, 136);
      g.lineTo(110, 52);
      g.lineTo(140, 52);
      g.lineTo(70, 136);
      g.fill();
      // stripe
      g.fillStyle = scheme.stripe;
      g.fillRect(0, 168, W, 26);
      // headlights
      for (const x of [48, 208]) {
        g.fillStyle = '#222';
        g.beginPath();
        g.arc(x, 214, 20, 0, Math.PI * 2);
        g.fill();
        const hg = g.createRadialGradient(x, 214, 2, x, 214, 16);
        hg.addColorStop(0, lit ? '#ffffff' : '#fffbe0');
        hg.addColorStop(1, lit ? '#ffe066' : '#b8b39a');
        g.fillStyle = hg;
        g.beginPath();
        g.arc(x, 214, 15, 0, Math.PI * 2);
        g.fill();
      }
      // coupler plate
      g.fillStyle = '#2a2a2a';
      g.fillRect(100, 204, 56, 40);
      g.fillStyle = '#ffd21f';
      for (let i = 0; i < 4; i++) g.fillRect(104 + i * 14, 206, 6, 36);
      return toTexture(c);
    });

  T.trainEnd = (scheme) =>
    once('te' + scheme.id, () => {
      const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = shade(scheme.body, -10);
      g.fillRect(0, 0, W, H);
      g.fillStyle = scheme.stripe;
      g.fillRect(0, 168, W, 26);
      g.fillStyle = '#2b2b2b';
      roundRect(g, 78, 30, 100, 226, 10);
      g.fill();
      window_(g, 96, 50, 64, 70);
      return toTexture(c);
    });

  /* ---------- obstacles ---------- */
  T.stripes = (c1, c2, key) =>
    once('str' + key, () => {
      const W = 256, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = c1;
      g.fillRect(0, 0, W, H);
      g.fillStyle = c2;
      for (let x = -H; x < W + H; x += 64) {
        g.beginPath();
        g.moveTo(x, H);
        g.lineTo(x + 32, H);
        g.lineTo(x + 32 + H, 0);
        g.lineTo(x + H, 0);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 6;
      g.strokeRect(0, 0, W, H);
      return toTexture(c, true);
    });

  T.rollSign = () =>
    once('rollSign', () => {
      const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#ffcc00';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#1b1b1b';
      for (let x = -H; x < W + H; x += 80) {
        g.beginPath();
        g.moveTo(x, H);
        g.lineTo(x + 40, H);
        g.lineTo(x + 40 + H, 0);
        g.lineTo(x + H, 0);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#ffffff';
      roundRect(g, 40, 34, W - 80, H - 68, 20);
      g.fill();
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 8;
      g.stroke();
      g.fillStyle = '#e8302e';
      for (const x of [150, 256, 362]) {
        g.beginPath();
        g.moveTo(x - 42, 80);
        g.lineTo(x, 118);
        g.lineTo(x + 42, 80);
        g.lineTo(x + 42, 116);
        g.lineTo(x, 156);
        g.lineTo(x - 42, 116);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#1b1b1b';
      g.font = '900 34px "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.fillText('LOW', 256, 200);
      return toTexture(c);
    });

  T.blockFace = () =>
    once('blockFace', () => {
      const W = 256, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#b9b3a8';
      g.fillRect(0, 0, W, H);
      noise(g, W, H, 2000, 0.12);
      g.fillStyle = '#ffcc00';
      g.fillRect(0, 180, W, 60);
      g.fillStyle = '#1b1b1b';
      for (let x = -60; x < W + 60; x += 50) {
        g.beginPath();
        g.moveTo(x, 240);
        g.lineTo(x + 25, 240);
        g.lineTo(x + 85, 180);
        g.lineTo(x + 60, 180);
        g.closePath();
        g.fill();
      }
      // no-entry sign
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(128, 90, 70, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8302e';
      g.beginPath();
      g.arc(128, 90, 62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(78, 78, 100, 24);
      return toTexture(c);
    });

  T.rampPlate = () =>
    once('rampPlate', () => {
      const W = 128, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#8b939c';
      g.fillRect(0, 0, W, H);
      noise(g, W, H, 800, 0.1);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let y = 8; y < H; y += 16) {
        for (let x = (y / 16) % 2 ? 8 : 0; x < W; x += 16) {
          g.save();
          g.translate(x + 4, y);
          g.rotate(0.7);
          g.fillRect(-5, -1.5, 10, 3);
          g.restore();
        }
      }
      g.fillStyle = '#ffcc00';
      g.fillRect(0, 0, 10, H);
      g.fillRect(W - 10, 0, 10, H);
      return toTexture(c, true);
    });

  /* ---------- coins & effects ---------- */
  T.coinFace = () =>
    once('coinFace', () => {
      const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
      const gr = g.createRadialGradient(50, 44, 6, 64, 64, 64);
      gr.addColorStop(0, '#fff7b0');
      gr.addColorStop(0.55, '#ffd21f');
      gr.addColorStop(1, '#e09a00');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, W);
      g.strokeStyle = '#c98500';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(64, 64, 50, 0, Math.PI * 2);
      g.stroke();
      star(g, 64, 66, 30, 5, 0.45);
      g.fillStyle = '#ffe56b';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#c98500';
      g.stroke();
      return toTexture(c);
    });

  T.glow = () =>
    once('glow', () => {
      const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.7)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, W);
      return toTexture(c);
    });

  T.sparkle = () =>
    once('sparkle', () => {
      const W = 64, c = makeCanvas(W, W), g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      star(g, 32, 32, 30, 4, 0.22);
      g.fill();
      return toTexture(c);
    });

  T.sky = () =>
    once('sky', () => {
      const c = makeCanvas(4, 512), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, '#2f8fe8');
      gr.addColorStop(0.45, '#6cc2ff');
      gr.addColorStop(0.72, '#bfe7ff');
      gr.addColorStop(1, '#e9f7ff');
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 512);
      const t = toTexture(c);
      return t;
    });

  T.cloud = (v) =>
    once('cloud' + v, () => {
      const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
      for (let i = 0; i < 14; i++) {
        const x = rnd(50, 206), y = rnd(55, 85), r = rnd(22, 42);
        const gr = g.createRadialGradient(x, y - r * 0.3, 2, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.7, 'rgba(245,250,255,0.95)');
        gr.addColorStop(1, 'rgba(230,240,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      return toTexture(c);
    });

  T.board = () =>
    once('board', () => {
      const W = 64, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#ff2f92');
      gr.addColorStop(1, '#7a3cff');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#00f0ff';
      g.fillRect(26, 0, 12, H);
      star(g, 32, 128, 20, 5, 0.45);
      g.fillStyle = '#ffe14d';
      g.fill();
      return toTexture(c);
    });

  /* ---------- power-up icons (used in 3D and in the HUD) ---------- */
  function drawIcon(g, type, S) {
    const s = S / 128;
    g.save();
    g.scale(s, s);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (type === 'magnet') {
      g.lineWidth = 30;
      g.strokeStyle = '#1b1b1b';
      g.beginPath();
      g.arc(64, 60, 34, Math.PI, 0, true);
      g.lineTo(98, 30);
      g.moveTo(30, 60);
      g.lineTo(30, 30);
      g.stroke();
      g.lineWidth = 22;
      g.strokeStyle = '#ff3344';
      g.beginPath();
      g.arc(64, 60, 34, Math.PI, 0, true);
      g.lineTo(98, 36);
      g.moveTo(30, 60);
      g.lineTo(30, 36);
      g.stroke();
      g.fillStyle = '#e8eef5';
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 4;
      g.fillRect(19, 14, 22, 22);
      g.strokeRect(19, 14, 22, 22);
      g.fillRect(87, 14, 22, 22);
      g.strokeRect(87, 14, 22, 22);
    } else if (type === 'jetpack') {
      for (const x of [40, 88]) {
        g.fillStyle = '#ff9a1f';
        g.beginPath();
        g.moveTo(x - 12, 92);
        g.quadraticCurveTo(x, 130, x + 12, 92);
        g.fill();
        g.fillStyle = '#fff04f';
        g.beginPath();
        g.moveTo(x - 6, 92);
        g.quadraticCurveTo(x, 114, x + 6, 92);
        g.fill();
        g.fillStyle = '#cfd6de';
        g.strokeStyle = '#1b1b1b';
        g.lineWidth = 5;
        roundRect(g, x - 20, 26, 40, 66, 16);
        g.fill();
        g.stroke();
        g.fillStyle = '#ff3344';
        roundRect(g, x - 20, 26, 40, 20, 10);
        g.fill();
        g.stroke();
      }
      g.fillStyle = '#6c5ce7';
      g.fillRect(56, 44, 16, 34);
    } else if (type === 'multiplier') {
      star(g, 64, 66, 58, 5, 0.5);
      g.fillStyle = '#b44dff';
      g.fill();
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 6;
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = '900 40px "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeText('2X', 64, 70);
      g.fillText('2X', 64, 70);
    } else if (type === 'sneakers') {
      // spring
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 7;
      g.beginPath();
      for (let i = 0; i <= 6; i++) g.lineTo(i % 2 ? 50 : 78, 84 + i * 6);
      g.stroke();
      g.strokeStyle = '#d7dde5';
      g.lineWidth = 4;
      g.beginPath();
      for (let i = 0; i <= 6; i++) g.lineTo(i % 2 ? 50 : 78, 84 + i * 6);
      g.stroke();
      // shoe
      g.fillStyle = '#35e07a';
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(22, 82);
      g.lineTo(26, 38);
      g.quadraticCurveTo(50, 30, 58, 50);
      g.quadraticCurveTo(90, 56, 108, 70);
      g.quadraticCurveTo(114, 82, 104, 84);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fillRect(22, 78, 86, 10);
      g.strokeRect(22, 78, 86, 10);
      g.fillStyle = '#1b1b1b';
      for (let i = 0; i < 3; i++) g.fillRect(52 + i * 12, 50 + i * 2, 8, 4);
    } else if (type === 'board') {
      g.translate(64, 64);
      g.rotate(-0.6);
      g.fillStyle = '#ff2f92';
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 6;
      roundRect(g, -22, -56, 44, 112, 22);
      g.fill();
      g.stroke();
      g.fillStyle = '#00f0ff';
      g.fillRect(-5, -52, 10, 104);
      star(g, 0, 0, 14, 5, 0.45);
      g.fillStyle = '#ffe14d';
      g.fill();
    }
    g.restore();
  }

  T.icon = (type) =>
    once('icon' + type, () => {
      const c = makeCanvas(128, 128);
      drawIcon(c.getContext('2d'), type, 128);
      return toTexture(c);
    });

  T.iconURL = (type) =>
    once('iconURL' + type, () => {
      const c = makeCanvas(96, 96);
      drawIcon(c.getContext('2d'), type, 96);
      return c.toDataURL();
    });
})();
