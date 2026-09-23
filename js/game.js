/* Rail Dash - main loop, camera, input, HUD and menus. */
(function () {
  'use strict';
  const RD = window.RD, C = RD.C, W = RD.world, A = RD.audio;
  const $ = (id) => document.getElementById(id);

  const SPEED_START = 14;
  const SPEED_MAX = 31;
  const BOARD_TIME = 25;
  const POWER_INFO = {
    magnet: { name: 'Coin Magnet', desc: 'Pulls in every coin nearby.', base: 10, per: 2.5, color: '#ff4466' },
    multiplier: { name: '2X Score', desc: 'Doubles the points you earn.', base: 12, per: 3, color: '#b44dff' },
    sneakers: { name: 'Spring Kicks', desc: 'Super-high jumps onto trains.', base: 10, per: 2.5, color: '#35e07a' },
    jetpack: { name: 'Jetpack', desc: 'Fly above the tracks through a coin trail.', base: 7, per: 1.5, color: '#ffa020' },
  };
  const UPGRADE_COST = [250, 600, 1200, 2500, 5000];
  const BOARD_COST = 150;

  /* ---------- save data ---------- */
  const SAVE_KEY = 'raildash-save-v1';
  const save = { coins: 0, best: 0, boards: 3, runs: 0, muted: false, character: 'friend', up: { magnet: 0, multiplier: 0, sneakers: 0, jetpack: 0 } };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      Object.assign(save, s, { up: Object.assign(save.up, s.up || {}) });
    }
  } catch (e) {
    /* storage unavailable - play without saving */
  }
  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) {
      /* ignore */
    }
  }
  const duration = (type) => POWER_INFO[type].base + POWER_INFO[type].per * save.up[type];

  /* ---------- renderer / scene ---------- */
  const canvas = $('game');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    $('loading').innerHTML = 'Sorry - your browser could not start WebGL.<br>Try the latest Chrome, Edge or Firefox.';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = RD.tex.sky();
  scene.fog = new THREE.Fog(0xcdeeff, 70, 215);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 420);

  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x8d7b62, 0.62));
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const sun = new THREE.DirectionalLight(0xfff6e6, 0.72);
  sun.position.set(10, 24, 10);
  sun.target.position.set(0, 0, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 34, bottom: -30, near: 1, far: 90 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // sky decoration: sun glow and drifting clouds
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.glow(), color: 0xfff3c4, fog: false, transparent: true, depthWrite: false }));
  sunGlow.scale.set(120, 120, 1);
  sunGlow.position.set(140, 120, -330);
  scene.add(sunGlow);
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.cloud(i % 4), fog: false, transparent: true, depthWrite: false }));
    const sc = RD.tex.rnd(50, 90);
    s.scale.set(sc, sc / 2, 1);
    s.position.set(RD.tex.rnd(-220, 220), RD.tex.rnd(45, 105), RD.tex.rnd(-300, -360));
    scene.add(s);
    clouds.push(s);
  }

  W.init(scene);
  const CHARACTERS = Object.keys(RD.models.RUNNERS);
  if (!RD.models.RUNNERS[save.character]) save.character = 'friend';
  const P = new RD.Player(scene, save.character);

  const chaser = RD.models.makeChaser();
  chaser.root.scale.setScalar(0.78);
  scene.add(chaser.root);
  const ch = { x: 0, y: 0, z: 20, siren: 0 };

  /* ---------- game state ---------- */
  const G = {
    state: 'menu', traveled: 0, speed: 0, score: 0, coins: 0, time: 0,
    chaseT: 0, dangerT: 0, invT: 0, boardT: 0, dieT: 0, introT: 1, jetEndS: 0, jetStartS: 0,
    power: { magnet: 0, multiplier: 0, sneakers: 0, jetpack: 0 }, powerMax: { magnet: 1, multiplier: 1, sneakers: 1, jetpack: 1 },
    shake: 0, camY: 0, reason: '', hintT: 0,
  };
  const cam = { pos: new THREE.Vector3(0, 2, -5), look: new THREE.Vector3(0, 1.2, 0) };

  /* ---------- HUD ---------- */
  const hud = {
    score: $('score'), coins: $('coins'), mult: $('multBadge'), boardCount: $('boardCount'), boardBtn: $('boardBtn'),
    bars: $('powerbars'), hint: $('hint'), toast: $('toast'), last: {},
  };
  $('boardIco').src = RD.tex.iconURL('board');
  const barEls = {};
  for (const type of ['jetpack', 'magnet', 'multiplier', 'sneakers', 'board']) {
    const el = document.createElement('div');
    el.className = 'pbar hidden';
    el.innerHTML = `<img src="${RD.tex.iconURL(type)}" alt=""><div class="track"><div class="fill"></div></div>`;
    el.querySelector('.fill').style.background = type === 'board' ? '#00d8ff' : POWER_INFO[type].color;
    hud.bars.appendChild(el);
    barEls[type] = { el, fill: el.querySelector('.fill') };
  }

  function setText(el, key, v) {
    if (hud.last[key] !== v) {
      hud.last[key] = v;
      el.textContent = v;
    }
  }

  let toastTimer = 0;
  function toast(msg, secs) {
    hud.toast.textContent = msg;
    hud.toast.classList.add('show');
    toastTimer = secs || 1.8;
  }

  function updateHUD(dt) {
    setText(hud.score, 'score', String(Math.floor(G.score)));
    setText(hud.coins, 'coins', String(G.coins));
    const mult = multiplier();
    setText(hud.mult, 'mult', 'x' + mult);
    hud.mult.classList.toggle('hot', mult > 1);
    setText(hud.boardCount, 'boards', String(save.boards));
    hud.boardBtn.classList.toggle('empty', save.boards <= 0 || P.board);
    const show = (type, frac) => {
      const b = barEls[type];
      const on = frac > 0;
      if (b.on !== on) {
        b.on = on;
        b.el.classList.toggle('hidden', !on);
      }
      if (on) b.fill.style.width = (frac * 100).toFixed(1) + '%';
    };
    for (const t of ['magnet', 'multiplier', 'sneakers']) show(t, G.power[t] / G.powerMax[t]);
    show('jetpack', P.jet ? Math.max(0, (G.jetEndS - G.traveled) / (G.jetEndS - G.jetStartS)) : 0);
    show('board', P.board ? G.boardT / BOARD_TIME : 0);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) hud.toast.classList.remove('show');
    }
    if (G.hintT > 0) {
      G.hintT -= dt;
      if (G.hintT <= 0) hud.hint.classList.remove('show');
    }
  }

  const multiplier = () => (G.power.multiplier > 0 ? 2 : 1);

  /* ---------- screens ---------- */
  const screens = ['menu', 'shop', 'pause', 'over'];
  function showScreen(name) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== name);
    $('hud').classList.toggle('hidden', !(G.state === 'playing' || G.state === 'dying' || G.state === 'paused'));
  }

  function refreshMenu() {
    $('bestVal').textContent = save.best;
    $('bankVal').textContent = save.coins;
    $('boardsVal').textContent = save.boards;
    $('soundBtn').textContent = save.muted ? 'SOUND: OFF' : 'SOUND: ON';
    $('charName').textContent = RD.models.RUNNERS[save.character].label;
  }

  function cycleCharacter(dir) {
    const i = CHARACTERS.indexOf(save.character);
    save.character = CHARACTERS[(i + dir + CHARACTERS.length) % CHARACTERS.length];
    persist();
    P.setStyle(save.character);
    refreshMenu();
  }

  function buildShop() {
    $('shopCoins').textContent = save.coins;
    const list = $('shopList');
    list.innerHTML = '';
    const row = (icon, title, desc, extra, btnText, enabled, onBuy) => {
      const el = document.createElement('div');
      el.className = 'shop-item';
      el.innerHTML = `<img src="${RD.tex.iconURL(icon)}" alt=""><div class="info"><b>${title}</b><span>${desc}</span>${extra}</div>`;
      const b = document.createElement('button');
      b.textContent = btnText;
      b.disabled = !enabled;
      b.addEventListener('click', () => {
        onBuy();
        A.buy();
        persist();
        buildShop();
        refreshMenu();
      });
      el.appendChild(b);
      list.appendChild(el);
    };
    row('board', 'Hoverboard', 'Press SPACE (or double-tap) to ride. Survives one crash.', `<div class="pips">You own <b>${save.boards}</b></div>`, `BUY ${BOARD_COST}`, save.coins >= BOARD_COST, () => {
      save.coins -= BOARD_COST;
      save.boards++;
    });
    for (const type of ['magnet', 'jetpack', 'multiplier', 'sneakers']) {
      const lvl = save.up[type], info = POWER_INFO[type];
      const pips = '<div class="pips">' + [0, 1, 2, 3, 4].map((i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('') + ` ${duration(type).toFixed(1)}s</div>`;
      const maxed = lvl >= UPGRADE_COST.length;
      const cost = maxed ? 0 : UPGRADE_COST[lvl];
      row(type, info.name, info.desc, pips, maxed ? 'MAX' : `UPGRADE ${cost}`, !maxed && save.coins >= cost, () => {
        save.coins -= cost;
        save.up[type]++;
      });
    }
  }

  /* ---------- run lifecycle ---------- */
  let worldFresh = false;
  function toMenu() {
    G.state = 'menu';
    W.reset();
    P.reset();
    worldFresh = true;
    G.traveled = 0;
    G.speed = 0;
    G.chaseT = 0;
    A.jetStop();
    refreshMenu();
    showScreen('menu');
  }

  function startRun(skipIntro) {
    A.init();
    A.resume();
    A.startMusic();
    if (!worldFresh) {
      W.reset();
      P.reset();
    }
    worldFresh = false;
    Object.assign(G, {
      state: 'playing', traveled: 0, speed: SPEED_START, score: 0, coins: 0,
      chaseT: 3.2, dangerT: 0, invT: 0, boardT: 0, dieT: 0, introT: skipIntro ? 1 : 0, reason: '', camY: 0,
    });
    for (const k in G.power) G.power[k] = 0;
    P.superJump = false;
    save.runs++;
    persist();
    showScreen(null);
    if (save.runs <= 3) {
      hud.hint.classList.add('show');
      G.hintT = 7;
    }
  }

  function pause() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    A.suspend();
    showScreen('pause');
  }
  function resume() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    A.resume();
    showScreen(null);
  }

  function endRun(reason, obstacle) {
    if (!P.alive) return;
    P.die(obstacle);
    P.board = false;
    if (P.jet) endJet();
    G.state = 'dying';
    G.dieT = 0;
    G.reason = reason;
    G.lastHit = obstacle || null;
    G.shake = 0.7;
    A.crash();
    A.caught();
  }

  function gameOver() {
    G.state = 'over';
    const score = Math.floor(G.score);
    const newBest = score > save.best;
    if (newBest) save.best = score;
    save.coins += G.coins;
    persist();
    $('overTitle').textContent = G.reason === 'caught' ? 'CAUGHT!' : 'CRASHED!';
    $('overScore').textContent = score;
    $('overCoins').textContent = G.coins;
    $('overBest').textContent = save.best;
    $('newBest').classList.toggle('hidden', !newBest);
    refreshMenu();
    showScreen('over');
  }

  /* ---------- power-ups ---------- */
  function collectPower(type, x, y, z) {
    if (G.state !== 'playing' || !P.alive) return;
    A.powerup();
    W.burst(x, y, z, { count: 16, speed: 6 });
    toast(POWER_INFO[type].name + '!', 1.4);
    if (type === 'jetpack') {
      startJet();
      return;
    }
    G.power[type] = G.powerMax[type] = duration(type);
    if (type === 'sneakers') P.superJump = true;
  }

  function startJet() {
    const d = duration('jetpack');
    G.jetStartS = G.traveled;
    G.jetEndS = G.traveled + G.speed * d;
    W.startSky(G.traveled, G.jetEndS);
    P.jet = true;
    P.rollT = 0;
    P.vy = 0;
    A.jetStart();
  }

  function endJet() {
    P.jet = false;
    P.vy = 0;
    G.invT = 1.3;
    A.jetStop();
  }

  function useBoard() {
    if (G.state !== 'playing' || P.board || !P.alive) return;
    if (save.boards <= 0) {
      toast('No hoverboards left - buy more in the shop', 1.6);
      return;
    }
    save.boards--;
    persist();
    P.board = true;
    G.boardT = BOARD_TIME;
    A.boardOn();
    W.burst(P.x, P.y + 0.3, 0, { count: 12, speed: 4 });
  }

  function breakBoard() {
    P.board = false;
    G.boardT = 0;
    G.invT = 1.2;
    G.shake = 0.4;
    A.boardBreak();
    W.burst(P.x, P.y + 0.5, -0.5, { count: 20, speed: 7 });
    toast('Board smashed!', 1.2);
  }

  /* ---------- actions ---------- */
  function act(a) {
    if (G.state !== 'playing') return;
    if (a === 'left' || a === 'right') {
      const r = P.move(a === 'left' ? -1 : 1);
      if (r === 'wall') {
        A.bump();
        G.shake = Math.max(G.shake, 0.12);
      } else if (r) A.swipe();
    } else if (a === 'jump') {
      if (P.jump()) A.jump(P.superJump);
    } else if (a === 'roll') {
      if (P.roll()) A.roll();
    } else if (a === 'board') useBoard();
  }

  /* ---------- per-frame gameplay ---------- */
  const collisionCtx = {
    obstacles: null,
    onFront(o) {
      if (P.board) {
        breakBoard();
        W.burst(o.x, 1.5, G.traveled - o.s, { count: 18, speed: 8, size: 0.6 });
        W.removeObstacle(o);
        return;
      }
      endRun('crash', o);
    },
    onSide() {
      P.bounceBack();
      P.stumbleT = 0.6;
      G.shake = Math.max(G.shake, 0.3);
      A.stumble();
      if (P.board) {
        breakBoard();
        return;
      }
      // a second stumble while the bot is still on your heels means you're caught
      if (G.dangerT > 0) {
        endRun('caught');
        return;
      }
      G.dangerT = 7;
      G.chaseT = 7;
    },
    onLand() {
      A.land();
      W.burst(P.x, P.y + 0.1, 0.2, { count: 4, speed: 1.5, dust: true, life: 0.4, size: 0.5 });
    },
    onBufferedJump() {
      A.jump(P.superJump);
    },
  };

  function stepPlaying(dt) {
    G.speed = Math.min(SPEED_MAX, SPEED_START + G.traveled * 0.0042);
    const dz = G.speed * dt;
    G.traveled += dz;
    W.update(dt, { traveled: G.traveled, speed: G.speed, playing: true });

    collisionCtx.dt = dt;
    collisionCtx.traveled = G.traveled;
    collisionCtx.dz = dz;
    collisionCtx.obstacles = W.obstacles;
    collisionCtx.invulnerable = G.invT > 0 || P.jet;
    P.update(collisionCtx);
    if (G.state !== 'playing') return;

    if (P.jet && G.traveled >= G.jetEndS) endJet();
    for (const k of ['magnet', 'multiplier', 'sneakers']) {
      if (G.power[k] > 0) {
        G.power[k] = Math.max(0, G.power[k] - dt);
        if (G.power[k] === 0 && k === 'sneakers') P.superJump = false;
      }
    }
    if (P.board) {
      G.boardT -= dt;
      if (G.boardT <= 0) {
        P.board = false;
        toast('Hoverboard worn out', 1.2);
      }
    }
    G.invT = Math.max(0, G.invT - dt);
    G.chaseT = Math.max(0, G.chaseT - dt);
    G.dangerT = Math.max(0, G.dangerT - dt);

    W.updateCoins(dt, G.traveled, P, G.power.magnet > 0, (x, y, z) => {
      G.coins++;
      A.coin();
      W.burst(x, y, z, { count: 3, speed: 2.5, life: 0.3 });
    }, G.time);
    W.checkPowerups(G.traveled, P, collectPower);
    G.score += dz * multiplier();
  }

  function frameUpdate(dt) {
    G.time += dt;
    if (G.state === 'playing') {
      const n = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < n && G.state === 'playing'; i++) stepPlaying(dt / n);
      G.introT = Math.min(1, G.introT + dt / 1.2);
      P.animate(dt, G.speed, G.time, 'run');
      updateHUD(dt);
    } else if (G.state === 'dying') {
      G.dieT += dt;
      G.speed *= Math.max(0, 1 - dt * 6);
      G.traveled += G.speed * dt;
      W.update(dt, { traveled: G.traveled, speed: G.speed, playing: false });
      W.updateCoins(dt, G.traveled, P, false, () => {}, G.time);
      P.update({ dt });
      P.animate(dt, 0, G.time, 'run');
      updateHUD(dt);
      if (G.dieT > 1.5) gameOver();
    } else if (G.state === 'menu' || G.state === 'over') {
      W.update(dt, { traveled: G.traveled, speed: 0, playing: false });
      W.updateCoins(dt, G.traveled, P, false, () => {}, G.time);
      P.animate(dt, 0, G.time, G.state === 'menu' ? 'menu' : 'run');
    }
    updateChaser(dt);
    updateCamera(dt);
    for (const c of clouds) {
      c.position.x += dt * 1.5;
      if (c.position.x > 240) c.position.x = -240;
    }
  }

  /* ---------- chaser ---------- */
  function updateChaser(dt) {
    let tz = 16, tx = P.x + (P.lane === 2 ? -1 : 1) * 1.0, ty = P.groundY, face = 0;
    if (G.state === 'playing' && G.chaseT > 0 && !P.jet) tz = 3.2;
    if (G.state === 'dying' || G.state === 'over') {
      tz = 1.2;
      tx = P.x + (P.x > 0 ? -1.3 : 1.3);
      face = Math.PI * 0.75 * (P.x > 0 ? -1 : 1);
    }
    if (G.state === 'menu') tz = 30;
    const k = Math.min(1, dt * (tz < ch.z ? 3 : 1.4));
    ch.z += (tz - ch.z) * k;
    ch.x += (tx - ch.x) * Math.min(1, dt * 5);
    ch.y += (ty - ch.y) * Math.min(1, dt * 4);
    const r = chaser.root;
    r.visible = ch.z < 14;
    r.position.set(ch.x, ch.y + 0.35 + Math.sin(G.time * 5) * 0.08, ch.z);
    r.rotation.y += (face - r.rotation.y) * Math.min(1, dt * 4);
    ch.siren += dt;
    const red = Math.floor(ch.siren * 5) % 2 === 0;
    chaser.sirenMat.color.setHex(red ? 0xff2233 : 0x2266ff);
    chaser.sirenGlow.material.color.setHex(red ? 0xff2233 : 0x2266ff);
    chaser.armL.rotation.x = Math.sin(G.time * 9) * 0.7 - 0.3;
    chaser.armR.rotation.x = -Math.sin(G.time * 9) * 0.7 - 0.3;
    if (G.state === 'dying' || G.state === 'over') {
      chaser.armL.rotation.z = -0.4;
      chaser.armR.rotation.x = -2.2;
    }
    chaser.flame.scale.set(0.8 + Math.random() * 0.2, 1 + Math.random() * 0.3, 1);
  }

  /* ---------- camera ---------- */
  const tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3();
  function updateCamera(dt) {
    const wide = camera.aspect > 1.1;
    if (G.state === 'menu') {
      tmpPos.set(P.x - 1.3 + Math.sin(G.time * 0.25) * 0.5, 1.85, -4.7);
      tmpLook.set(P.x + (wide ? 1.35 : 0), 1.25, 0);
      cam.pos.lerp(tmpPos, Math.min(1, dt * 3));
      cam.look.lerp(tmpLook, Math.min(1, dt * 3));
    } else {
      let target;
      if (P.jet) target = P.y;
      else if (P.grounded || !P.alive) target = P.y;
      else target = Math.min(G.camY, P.y);
      G.camY += (target - G.camY) * Math.min(1, dt * (P.jet ? 2 : 4));
      const behind = new THREE.Vector3(P.x * 0.75, G.camY + (P.jet ? 3.8 : 4.4), P.jet ? 8.2 : 7.3);
      const lookB = new THREE.Vector3(P.x * 0.85, G.camY + 1.2, -8);
      if (G.introT < 1) {
        // swoop from the front view around to behind the runner
        const e = G.introT * G.introT * (3 - 2 * G.introT);
        const ang = Math.PI * (1 - e);
        const R = 4.7 + (7.3 - 4.7) * e;
        tmpPos.set(P.x + Math.sin(ang) * R * 0.9, 1.85 + (behind.y - 1.85) * e, Math.cos(ang) * R);
        tmpLook.set(P.x, 1.25, 0).lerp(lookB, e);
        cam.pos.copy(tmpPos);
        cam.look.copy(tmpLook);
      } else {
        const k = Math.min(1, dt * 7);
        cam.pos.lerp(behind, k);
        cam.look.lerp(lookB, k);
      }
    }
    camera.position.copy(cam.pos);
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt * 1.6);
      const s = G.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    camera.lookAt(cam.look);
    sun.position.set(P.x + 10, 24, 10);
    sun.target.position.set(P.x, 0, -14);
  }

  /* ---------- input ---------- */
  const KEYS = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'jump', w: 'jump', W: 'jump', ArrowDown: 'roll', s: 'roll', S: 'roll', ' ': 'board',
  };
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (KEYS[k] || k === ' ') e.preventDefault();
    if (e.repeat) return;
    if (k === 'm' || k === 'M') {
      toggleSound();
      return;
    }
    if (G.state === 'playing') {
      if (k === 'Escape' || k === 'p' || k === 'P') pause();
      else if (KEYS[k]) act(KEYS[k]);
    } else if (G.state === 'paused') {
      if (k === 'Escape' || k === 'p' || k === 'P' || k === 'Enter' || k === ' ') resume();
    } else if (G.state === 'menu' && !$('menu').classList.contains('hidden')) {
      if (k === 'Enter' || k === ' ') startRun(false);
      else if (KEYS[k] === 'left' || KEYS[k] === 'right') {
        A.init();
        A.click();
        cycleCharacter(KEYS[k] === 'left' ? -1 : 1);
      }
    } else if (G.state === 'over') {
      if (k === 'Enter' || k === ' ') startRun(true);
    }
  });

  // touch: swipe to move, double-tap for the hoverboard
  let touch = null, lastTap = 0;
  canvas.addEventListener(
    'touchstart',
    (e) => {
      const t = e.changedTouches[0];
      touch = { x: t.clientX, y: t.clientY, t: performance.now(), fired: false };
      e.preventDefault();
    },
    { passive: false }
  );
  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (!touch || touch.fired) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
      if (Math.hypot(dx, dy) > 28) {
        touch.fired = true;
        if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'left' : 'right');
        else act(dy < 0 ? 'jump' : 'roll');
      }
      e.preventDefault();
    },
    { passive: false }
  );
  canvas.addEventListener('touchend', (e) => {
    if (touch && !touch.fired && performance.now() - touch.t < 250) {
      const now = performance.now();
      if (now - lastTap < 320) {
        act('board');
        lastTap = 0;
      } else lastTap = now;
    }
    touch = null;
    e.preventDefault();
  });

  function toggleSound() {
    save.muted = !save.muted;
    A.setMuted(save.muted);
    persist();
    refreshMenu();
    $('muteBtn').textContent = save.muted ? '🔇' : '🔊';
  }

  function onClick(id, fn) {
    $(id).addEventListener('click', (e) => {
      e.stopPropagation();
      A.init();
      A.click();
      fn();
    });
  }
  onClick('playBtn', () => startRun(false));
  onClick('shopBtn', () => {
    buildShop();
    showScreen('shop');
  });
  onClick('shopBack', () => {
    refreshMenu();
    showScreen(G.state === 'over' ? 'over' : 'menu');
  });
  onClick('soundBtn', toggleSound);
  onClick('charPrev', () => cycleCharacter(-1));
  onClick('charNext', () => cycleCharacter(1));
  onClick('muteBtn', toggleSound);
  onClick('pauseBtn', pause);
  onClick('resumeBtn', resume);
  onClick('quitBtn', () => {
    A.resume();
    A.jetStop();
    toMenu();
  });
  onClick('againBtn', () => startRun(true));
  onClick('overMenuBtn', toMenu);
  onClick('overShopBtn', () => {
    buildShop();
    showScreen('shop');
  });
  $('boardBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    act('board');
  });
  ['pauseBtn', 'boardBtn'].forEach((id) => $(id).addEventListener('touchend', (e) => e.stopPropagation()));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('blur', pause);

  /* ---------- resize & main loop ---------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 72 : 62;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  A.muted = save.muted;
  $('muteBtn').textContent = save.muted ? '🔇' : '🔊';
  toMenu();

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (G.state !== 'paused') frameUpdate(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  $('loading').classList.add('hidden');

  // handy for debugging from the browser console
  RD.game = { G, P, W, save, startRun, act, toMenu, collectPower, useBoard, frameUpdate, renderer, scene, camera, pause, buildShop, showScreen };
})();
