/* Rail Dash - the world: track, scenery, obstacle/coin generation.
 *
 * Coordinates: the player always stays at z = 0 and runs toward -z.
 * Everything in the world has an "s" value (distance along the track);
 * an object's z on screen is (traveled - s). */
(function () {
  'use strict';
  const RD = window.RD, C = RD.C, M = RD.models, TX = RD.tex;
  const W = (RD.world = {});

  const HORIZON = 190;
  const SCENE_HORIZON = 230;
  const CHUNK = 20;
  const MOVING_SPEED = 9;
  const ACTIVATE_DIST = 125;
  const MAX_COINS = 700;
  const SLEEPER = 1.3;
  W.JET_Y = 10;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const chance = (p) => Math.random() < p;
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const others = (l) => [0, 1, 2].filter((x) => x !== l);
  function pickW(weights) {
    let total = 0;
    for (const k in weights) total += Math.max(0, weights[k]);
    let r = Math.random() * total;
    for (const k in weights) {
      r -= Math.max(0, weights[k]);
      if (r <= 0) return k;
    }
    return Object.keys(weights)[0];
  }

  /* ======================================================================
   * Setup
   * ==================================================================== */
  W.init = function (scene) {
    W.scene = scene;
    W.root = new THREE.Group();
    scene.add(W.root);
    W.obstacles = [];
    W.coins = [];
    W.powerups = [];
    W.scenery = [];
    W.particles = [];

    const std = M.std;
    const scrollTex = (tex, rx, ry, tile) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      W.scroll.push({ t, tile });
      return t;
    };
    W.scroll = [];

    // gravel ground with relief
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 320),
      std('#d2cabf', { map: scrollTex(TX.gravel(), 4, 80, 4), normalMap: scrollTex(TX.gravelNormal(), 4, 80, 4), ns: 1.2, r: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -130;
    ground.receiveShadow = true;
    scene.add(ground);

    // grass beyond the walls
    const grassMat = std('#ffffff', { map: scrollTex(TX.grass(), 35, 80, 4), r: 0.95 });
    for (const side of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(140, 320), grassMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(side * 78, -0.02, -130);
      g.receiveShadow = true;
      scene.add(g);
    }

    // raised ballast bed under each track
    const bedMat = std('#a89f94', { map: scrollTex(TX.gravel(), 0.8, 80, 4), normalMap: scrollTex(TX.gravelNormal(), 0.8, 80, 4), ns: 1.4, r: 0.95 });
    const beds = [];
    for (const x of C.LANES) beds.push({ geo: M.G.rbox(3.1, 0.12, 320, 0.05, 2), mat: bedMat, pos: [x, 0.0, -130] });
    const bedMesh = M.bake(beds, false);
    scene.add(bedMesh);

    // wooden sleepers: one instanced mesh that slides by the sleeper spacing
    const wood = std('#ffffff', { map: TX.wood(), normalMap: TX.woodNormal(), ns: 1.5, r: 0.9 });
    const plate = std('#3b3d42', { m: 0.7, r: 0.5 }), bolt = std('#8c9097', { m: 0.9, r: 0.3 });
    const sParts = [{ geo: new THREE.BoxGeometry(2.5, 0.09, 0.26), mat: wood, pos: [0, 0.1, 0] }];
    for (const o of [-0.72, 0.72]) {
      sParts.push({ geo: new THREE.BoxGeometry(0.26, 0.02, 0.24), mat: plate, pos: [o, 0.15, 0] });
      for (const d of [-0.09, 0.09]) sParts.push({ geo: new THREE.BoxGeometry(0.03, 0.03, 0.03), mat: bolt, pos: [o + d, 0.165, d * 0.6] });
    }
    const sg = M.merge(sParts);
    const PER = 262;
    W.sleepers = new THREE.InstancedMesh(sg.geo, sg.mats, PER * 3);
    const d = new THREE.Object3D();
    let n = 0;
    for (const x of C.LANES) {
      for (let k = 0; k < PER; k++) {
        d.position.set(x, 0, 20 - k * SLEEPER);
        d.rotation.y = (((k * 7919) % 13) - 6) * 0.004;
        d.updateMatrix();
        W.sleepers.setMatrixAt(n++, d.matrix);
      }
    }
    W.sleepers.receiveShadow = true;
    W.sleepers.frustumCulled = false;
    scene.add(W.sleepers);

    // rails (steel profile) and overhead wires never move: they look the same everywhere
    const railShape = new THREE.Shape();
    [[-0.07, 0], [0.07, 0], [0.07, 0.018], [0.016, 0.032], [0.016, 0.085], [0.036, 0.095], [0.036, 0.125], [-0.036, 0.125], [-0.036, 0.095], [-0.016, 0.085], [-0.016, 0.032], [-0.07, 0.018]]
      .forEach(([x, y], i) => (i ? railShape.lineTo(x, y) : railShape.moveTo(x, y)));
    const railGeo = new THREE.ExtrudeGeometry(railShape, { depth: 330, bevelEnabled: false });
    const railMat = std('#6a7078', { m: 0.8, r: 0.5 }), railTop = std('#e8edf2', { m: 1, r: 0.12 }), wire = std('#2d2f33', { m: 0.6, r: 0.5 });
    const parts = [];
    for (const x of C.LANES) {
      for (const o of [-0.72, 0.72]) {
        parts.push({ geo: railGeo, mat: railMat, pos: [x + o, 0.16, -305] });
        parts.push({ geo: new THREE.BoxGeometry(0.066, 0.008, 330), mat: railTop, pos: [x + o, 0.289, -140] });
      }
      parts.push({ geo: new THREE.BoxGeometry(0.03, 0.03, 330), mat: wire, pos: [x, 6.05, -140] });
      parts.push({ geo: new THREE.BoxGeometry(0.025, 0.025, 330), mat: wire, pos: [x, 6.45, -140] });
    }
    const rails = M.bake(parts, false);
    scene.add(rails);

    // coins: one instanced mesh for all of them
    const cg = M.coinGeoMats();
    W.coinMesh = new THREE.InstancedMesh(cg.geo, cg.mats, MAX_COINS);
    W.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    W.coinMesh.frustumCulled = false;
    W.coinMesh.count = 0;
    W.coinMesh.castShadow = true;
    scene.add(W.coinMesh);
    W._dummy = new THREE.Object3D();
    W._spin = new THREE.Quaternion();
    W._up = new THREE.Vector3(0, 1, 0);

    // particle pool
    W.sparkMat = new THREE.SpriteMaterial({ map: TX.sparkle(), color: 0xffe066, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    W.dustMat = new THREE.SpriteMaterial({ map: TX.glow(), color: 0xcfc6b8, transparent: true, opacity: 0.6, depthWrite: false });
    for (let i = 0; i < 80; i++) {
      const s = new THREE.Sprite(W.sparkMat);
      s.visible = false;
      scene.add(s);
      W.particles.push({ sprite: s, life: 0, vx: 0, vy: 0, vz: 0, grow: 0 });
    }
  };

  /* ======================================================================
   * Adding things
   * ==================================================================== */
  function addObstacle(type, lane, s, opt) {
    opt = opt || {};
    const o = { type, lane, s, x: C.LANES[lane], meshOff: 0, bottom: 0, walk: false, moving: false, active: false, dead: false };
    if (type === 'train') {
      const scheme = pick(TX.SCHEMES);
      o.cars = opt.cars || 1;
      o.len = M.trainLength(o.cars);
      o.mesh = M.makeTrain(o.cars, scheme, ri(0, TX.TRAIN_VARIANTS - 1), !!opt.moving);
      o.hw = C.TRAIN_W / 2;
      o.top = C.TRAIN_H;
      o.walk = true;
      o.moving = !!opt.moving;
    } else if (type === 'ramp') {
      o.len = C.RAMP_L;
      o.mesh = M.makeRamp();
      o.hw = C.TRAIN_W / 2;
      o.top = C.TRAIN_H;
      o.walk = true;
    } else if (type === 'hurdle') {
      o.len = 0.4;
      o.meshOff = 0.2;
      o.mesh = M.makeHurdle();
      o.hw = 1.1;
      o.top = 1.05;
    } else if (type === 'overhead') {
      o.len = 0.35;
      o.meshOff = 0.175;
      o.mesh = M.makeOverhead();
      o.hw = 1.1;
      o.bottom = 1.25;
      o.top = 3.4;
    } else if (type === 'block') {
      o.len = 0.7;
      o.meshOff = 0.35;
      o.mesh = M.makeBlock();
      o.hw = 1.1;
      o.top = 2.8;
    }
    o.mesh.position.x = o.x;
    o.mesh.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    W.root.add(o.mesh);
    W.obstacles.push(o);
    return o;
  }

  function addCoin(x, s, y) {
    if (W.coins.length >= MAX_COINS) return;
    W.coins.push({ x, s, y, mag: false, rx: 0, ry: 0, rz: 0 });
  }

  const POWER_TYPES = { magnet: 3, multiplier: 2, sneakers: 2, jetpack: 1.4 };
  function addPowerup(type, lane, s, y) {
    const x = C.LANES[lane];
    // make room: drop coins that would overlap the pickup
    W.coins = W.coins.filter((c) => !(Math.abs(c.x - x) < 0.5 && Math.abs(c.s - s) < 2.5 && Math.abs(c.y - y) < 1.5));
    const mesh = M.makePowerup(type);
    mesh.position.x = x;
    W.root.add(mesh);
    W.powerups.push({ type, x, s, y, mesh, t: Math.random() * 6 });
  }

  function maybePowerup(lane, s, y) {
    if (s - W.lastPowerS < 260 || !chance(0.6)) return;
    W.lastPowerS = s;
    addPowerup(pickW(POWER_TYPES), lane, s, y || 0);
  }

  function coinLine(lane, s0, s1, y, step) {
    step = step || 2.3;
    for (let s = s0; s <= s1 + 0.01; s += step) addCoin(C.LANES[lane], s, y);
  }
  function coinArc(lane, sc, baseY) {
    const half = Math.max(4, W._speed * 0.3);
    for (let i = -3; i <= 3; i++) {
      const t = i / 3.6;
      addCoin(C.LANES[lane], sc + (i * half) / 3, baseY + 2.1 * (1 - t * t));
    }
  }
  function coinRamp(lane, rs) {
    for (let k = 0; k < 4; k++) {
      const s = rs + 0.8 + k * 2.3;
      addCoin(C.LANES[lane], s, ((s - rs) / C.RAMP_L) * C.TRAIN_H);
    }
  }
  function placeBarrier(kind, lane, s) {
    if (kind === 'none') return;
    addObstacle(kind, lane, s);
  }
  function train(lane, s, cars, moving) {
    return addObstacle('train', lane, s, { cars, moving });
  }
  function rampTo(lane, s) {
    addObstacle('ramp', lane, s);
    coinRamp(lane, s);
    return s + C.RAMP_L;
  }

  /* ======================================================================
   * Level templates - each returns where its content ends
   * ==================================================================== */
  const TPL = {
    coinRun(s) {
      const lane = ri(0, 2), len = ri(24, 40);
      coinLine(lane, s, s + len, 0);
      maybePowerup(pick(others(lane)), s + len * 0.6, 0);
      return s + len;
    },

    barrierRow(s, d) {
      const kinds = [0, 1, 2].map(() => pickW({ hurdle: 3, overhead: 3, block: d > 0.1 ? 2.5 : 0, none: 1.4 }));
      if (kinds.every((k) => k === 'block')) kinds[ri(0, 2)] = 'hurdle';
      const open = [0, 1, 2].filter((l) => kinds[l] !== 'block');
      const coinLane = pick(open);
      const at = s + 8;
      kinds.forEach((k, l) => placeBarrier(k, l, at));
      const k = kinds[coinLane];
      if (k === 'hurdle') {
        coinLine(coinLane, s, s + 2, 0);
        coinArc(coinLane, at, 0);
      } else {
        coinLine(coinLane, s, s + 14, 0);
      }
      const free = kinds.indexOf('none');
      if (free >= 0 && free !== coinLane) maybePowerup(free, at, 0);
      return s + 16;
    },

    stagger(s, d) {
      let lane = ri(0, 2), cur = s + 4;
      const n = ri(3, 4 + Math.round(d * 2));
      const spacing = 12 + W._speed * 0.35;
      for (let i = 0; i < n; i++) {
        const kind = pickW({ hurdle: 3, overhead: 3, block: d > 0.1 ? 2 : 0 });
        placeBarrier(kind, lane, cur);
        if (kind === 'hurdle') coinArc(lane, cur, 0);
        else if (kind === 'overhead') coinLine(lane, cur - 3, cur + 3, 0);
        lane = pick(others(lane));
        cur += spacing;
      }
      return cur;
    },

    trainPair(s, d) {
      const free = ri(0, 2);
      let end = s + 10;
      for (const lane of others(free)) {
        const cars = ri(1, d > 0.3 ? 3 : 2);
        const ramp = chance(0.35);
        let s0 = s + rnd(0, 10);
        if (ramp) {
          s0 = rampTo(lane, s0);
          coinLine(lane, s0 + 1.5, s0 + M.trainLength(cars) - 1.5, C.TRAIN_H);
        }
        train(lane, s0, cars);
        end = Math.max(end, s0 + M.trainLength(cars));
      }
      const mid = (s + end) / 2, r = Math.random();
      if (r < 0.45) {
        coinLine(free, s, end, 0);
      } else if (r < 0.75) {
        placeBarrier('hurdle', free, mid);
        coinArc(free, mid, 0);
      } else {
        placeBarrier('overhead', free, mid);
        coinLine(free, mid - 3, mid + 3, 0);
      }
      return end;
    },

    rampTrain(s, d) {
      const lane = ri(0, 2), cars = ri(2, 3);
      const t0 = rampTo(lane, s);
      train(lane, t0, cars);
      const tl = M.trainLength(cars);
      coinLine(lane, t0 + 1.5, t0 + tl - 6, C.TRAIN_H);
      maybePowerup(lane, t0 + tl - 3, C.TRAIN_H);
      let end = t0 + tl;
      for (const l of others(lane)) {
        const r = Math.random();
        if (r < 0.45) {
          const c2 = ri(1, 2), s2 = t0 + rnd(0, 8);
          train(l, s2, c2);
          end = Math.max(end, s2 + M.trainLength(c2));
        } else if (r < 0.75) {
          placeBarrier(pickW({ hurdle: 1, overhead: 1, block: d > 0.15 ? 1 : 0 }), l, s + rnd(4, 14));
        }
      }
      return end;
    },

    rooftops(s) {
      const rl = ri(0, 2);
      const t0 = rampTo(rl, s);
      let end = 0;
      for (let l = 0; l < 3; l++) {
        const cars = ri(2, 3);
        const s0 = l === rl ? t0 : t0 + rnd(1, 6);
        train(l, s0, cars);
        const e = s0 + M.trainLength(cars);
        if (l === rl) coinLine(l, s0 + 1.5, e - 1.5, C.TRAIN_H);
        end = Math.max(end, e);
      }
      maybePowerup(pick(others(rl)), t0 + 12, C.TRAIN_H);
      return end;
    },

    oncoming(s) {
      const lane = ri(0, 2), cars = ri(1, 2);
      const ts = s + 65;
      train(lane, ts, cars, true);
      const [a, b] = chance(0.5) ? others(lane) : others(lane).reverse();
      coinLine(a, s + 5, s + 60, 0);
      const r = Math.random();
      if (r < 0.5) train(b, s + rnd(8, 25), ri(1, 2));
      else if (r < 0.8) placeBarrier(pick(['hurdle', 'overhead']), b, s + rnd(15, 40));
      return ts + M.trainLength(cars);
    },

    tunnel(s) {
      const cars = 3, len = M.trainLength(cars);
      const rampSide = chance(0.5) ? pick([0, 2]) : -1;
      for (const l of [0, 2]) {
        let s0 = s;
        if (l === rampSide) {
          s0 = rampTo(l, s);
          coinLine(l, s0 + 1.5, s0 + len - 1.5, C.TRAIN_H);
        }
        train(l, s0, cars);
      }
      let cur = s + 10;
      const spacing = 12 + W._speed * 0.3;
      while (cur < s + len - 4) {
        const k = pick(['hurdle', 'overhead']);
        placeBarrier(k, 1, cur);
        if (k === 'hurdle') coinArc(1, cur, 0);
        else coinLine(1, cur - 2, cur + 2, 0);
        cur += spacing;
      }
      return s + len + (rampSide >= 0 ? C.RAMP_L : 0);
    },
  };

  function templateWeights(d) {
    return {
      coinRun: 2.2 - 1.6 * d,
      barrierRow: 3,
      stagger: 1 + 2 * d,
      trainPair: 3,
      rampTrain: 2,
      rooftops: d > 0.15 ? 1.5 : 0,
      oncoming: d > 0.07 ? 0.8 + 2 * d : 0,
      tunnel: d > 0.25 ? 1 + d : 0,
    };
  }

  function skyCoins(s, until) {
    let lane = W.skyLane;
    const segEnd = Math.min(until, s + ri(28, 40));
    let cur = s;
    for (; cur <= segEnd; cur += 2.2) addCoin(C.LANES[lane], cur, W.JET_Y);
    // diagonal hop to a neighbouring lane
    const next = lane === 1 ? pick([0, 2]) : 1;
    for (let k = 1; k <= 3; k++) {
      cur += 2.2;
      if (cur > until) break;
      addCoin(C.LANES[lane] + ((C.LANES[next] - C.LANES[lane]) * k) / 4, cur, W.JET_Y);
    }
    W.skyLane = next;
    return cur;
  }

  function generate(s) {
    if (W.skyUntil > 0 && s < W.skyUntil + 45) {
      if (s < W.skyUntil - 10) return skyCoins(s, W.skyUntil - 10) - W.gap() + 2.2;
      return W.skyUntil + 45 - W.gap();
    }
    const d = Math.min(1, s / 5000);
    // the first stretch of every run is gentle
    const weights = s < 220 ? { coinRun: 2, barrierRow: 2, trainPair: 3 } : templateWeights(d);
    let t = pickW(weights);
    if (t === W.lastTpl) t = pickW(weights);
    W.lastTpl = t;
    return TPL[t](s, d);
  }

  W.gap = () => 10 + W._speed * 0.55;

  /* ======================================================================
   * Scenery chunks
   * ==================================================================== */
  function genChunk(s0) {
    const g = new THREE.Group();
    W.chunkIndex = (W.chunkIndex || 0) + 1;
    // stations: a run of three chunks with platforms on both sides
    if (!W.stationLeft && W.chunkIndex > 8 && W.chunkIndex - W.lastStation > 14 && chance(0.3)) {
      W.stationLeft = 3;
      W.lastStation = W.chunkIndex;
      W.stationName = ri(0, 5);
    }
    const station = W.stationLeft > 0;
    if (station) W.stationLeft--;
    const bridge = !station && s0 - W.lastBridgeS > 260 && chance(0.2);
    for (const side of [-1, 1]) {
      if (station) {
        g.add(M.makePlatform(side, W.stationLeft === 1, W.stationName, ri(0, 4)));
      } else if (chance(0.82)) {
        const w = M.makeWall(ri(0, TX.WALL_VARIANTS - 1), side);
        w.position.x = side * 7.0;
        g.add(w);
      } else {
        const f = M.makeFence();
        f.position.x = side * 7.0;
        g.add(f);
        for (let i = 0; i < 3; i++) {
          const b = M.makeBush();
          b.position.set(side * rnd(7.6, 8.6), 0, -rnd(1, 19));
          b.rotation.y = rnd(0, 6);
          g.add(b);
        }
      }
      if (!bridge) {
        const w = pick([8, 10, 12]), h = pick([9, 12, 15, 18, 21, 24]), d = pick([14, 16, 18]);
        const b = M.makeBuilding(w, h, d, ri(0, TX.BUILDING_COLORS.length - 1), side);
        b.position.set(side * (10 + w / 2 + rnd(0, 3) + (station ? 1.5 : 0)), 0, -10);
        g.add(b);
      }
      if (chance(0.4)) {
        const t = M.makeTree(ri(0, 2));
        t.position.set(side * rnd(8.3, 9.2), 0, -rnd(2, 18));
        t.rotation.y = rnd(0, 6);
        g.add(t);
      }
      if (!station && W.chunkIndex % 2 === 1) {
        const l = M.makeLamp(side);
        l.position.set(side * 6.3, 0, -rnd(3, 17));
        g.add(l);
      }
    }
    if (bridge) {
      const b = M.makeBridge();
      b.position.z = -10;
      g.add(b);
      W.lastBridgeS = s0;
    } else if (!station && W.chunkIndex % 2 === 0) {
      g.add(M.makeGantry());
    }
    if (!station && chance(0.25)) {
      const sig = M.makeSignal();
      sig.position.set(pick([-1, 1]) * 4.5, 0, -rnd(4, 16));
      g.add(sig);
    }
    W.root.add(g);
    W.scenery.push({ s: s0, len: CHUNK, mesh: g });
  }

  /* ======================================================================
   * Reset / special setups
   * ==================================================================== */
  function removeAll(list) {
    for (const o of list) if (o.mesh) W.root.remove(o.mesh);
    list.length = 0;
  }

  W.reset = function () {
    removeAll(W.obstacles);
    removeAll(W.powerups);
    removeAll(W.scenery);
    W.coins.length = 0;
    W.coinMesh.count = 0;
    W.planS = 45;
    W.sceneS = -60;
    W.lastPowerS = 60;
    W.lastBridgeS = -200;
    W.lastTpl = '';
    W.skyUntil = 0;
    W.skyLane = 1;
    W._speed = 14;
    W.chunkIndex = 0;
    W.stationLeft = 0;
    W.lastStation = -20;
    for (const p of W.particles) {
      p.life = 0;
      p.sprite.visible = false;
    }
    // a parked train next to the start line
    train(2, -6, 2);
    train(0, 14, 1);
    coinLine(1, 12, 34, 0);
    while (W.sceneS < SCENE_HORIZON) {
      genChunk(W.sceneS);
      W.sceneS += CHUNK;
    }
    W.update(0, { traveled: 0, speed: 14, playing: false });
  };

  // Jetpack: clear a safe landing strip and fill the sky with coins.
  W.startSky = function (tr, endS) {
    W.skyUntil = endS;
    W.skyLane = 1;
    for (const o of W.obstacles) {
      const near = o.s, far = o.s + o.len;
      const inLanding = far > endS - 25 && near < endS + 45;
      const movingThreat = o.moving && near > tr && near < endS + 160;
      if ((inLanding || movingThreat) && near > tr + 12) {
        o.dead = true;
        W.root.remove(o.mesh);
      }
    }
    W.obstacles = W.obstacles.filter((o) => !o.dead);
    W.coins = W.coins.filter((c) => !(c.s > endS - 25 && c.s < endS + 45));
    // coins for the stretch that has already been generated
    let s = tr + 14;
    const until = Math.min(W.planS, endS - 10);
    while (s < until) s = skyCoins(s, until) + 2.2;
    if (W.planS < s) W.planS = s;
  };

  W.removeObstacle = function (o) {
    o.dead = true;
    W.root.remove(o.mesh);
    W.obstacles.splice(W.obstacles.indexOf(o), 1);
  };

  /* ======================================================================
   * Per-frame update
   * ==================================================================== */
  W.update = function (dt, st) {
    const tr = st.traveled;
    W._speed = st.speed;

    if (st.playing) {
      while (W.planS < tr + HORIZON) {
        const end = generate(W.planS);
        W.planS = end + W.gap();
      }
    }
    while (W.sceneS < tr + SCENE_HORIZON) {
      genChunk(W.sceneS);
      W.sceneS += CHUNK;
    }

    // ground scroll
    for (const sc of W.scroll) sc.t.offset.y = (tr / sc.tile) % 1;
    W.sleepers.position.z = tr % SLEEPER;

    // obstacles
    for (let i = W.obstacles.length - 1; i >= 0; i--) {
      const o = W.obstacles[i];
      if (o.moving && st.playing) {
        if (!o.active && o.s - tr < ACTIVATE_DIST) {
          o.active = true;
          if (RD.audio) RD.audio.horn();
        }
        if (o.active) {
          o.vel = MOVING_SPEED;
          o.s -= MOVING_SPEED * dt;
        }
      }
      if (o.s + o.len < tr - 25) {
        W.root.remove(o.mesh);
        W.obstacles.splice(i, 1);
        continue;
      }
      o.mesh.position.z = tr - (o.s + o.meshOff);
      if (o.mesh.userData.lamp) o.mesh.userData.lamp.material.opacity = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
    }

    // scenery
    for (let i = W.scenery.length - 1; i >= 0; i--) {
      const c = W.scenery[i];
      if (c.s + c.len < tr - 30) {
        W.root.remove(c.mesh);
        W.scenery.splice(i, 1);
        continue;
      }
      c.mesh.position.z = tr - c.s;
    }

    // power-ups bob and spin
    for (let i = W.powerups.length - 1; i >= 0; i--) {
      const p = W.powerups[i];
      if (p.s < tr - 20) {
        W.root.remove(p.mesh);
        W.powerups.splice(i, 1);
        continue;
      }
      p.t += dt;
      p.mesh.position.set(p.x, p.y + 1.25 + Math.sin(p.t * 3) * 0.15, tr - p.s);
      p.mesh.userData.ring.rotation.y = p.t * 2.5;
      p.mesh.userData.ring.rotation.x = Math.sin(p.t) * 0.4;
    }

    updateParticles(dt, st.speed * dt);
  };

  // Coins: magnet attraction, collection and instanced rendering.
  W.updateCoins = function (dt, tr, P, magnet, onCollect, time) {
    const py = P.y + 0.9;
    const k = Math.min(1, dt * 11);
    for (let i = W.coins.length - 1; i >= 0; i--) {
      const c = W.coins[i];
      let x, y, z;
      if (c.mag) {
        c.rx += (P.x - c.rx) * k;
        c.ry += (py - c.ry) * k;
        c.rz += (0 - c.rz) * k;
        x = c.rx;
        y = c.ry;
        z = c.rz;
      } else {
        x = c.x;
        y = c.y + 0.9;
        z = tr - c.s;
        if (magnet && z < 2 && z > -32 && Math.abs(y - py) < 8) {
          c.mag = true;
          c.rx = x;
          c.ry = y;
          c.rz = z;
        }
      }
      if (z > 10) {
        W.coins[i] = W.coins[W.coins.length - 1];
        W.coins.pop();
        continue;
      }
      if (P.alive && Math.abs(z) < 0.9 && Math.abs(x - P.x) < 0.95 && Math.abs(y - py) < 1.25) {
        onCollect(x, y, z);
        W.coins[i] = W.coins[W.coins.length - 1];
        W.coins.pop();
      }
    }
    // render
    const d = W._dummy;
    W._spin.setFromAxisAngle(W._up, time * 3.2);
    let n = 0;
    for (const c of W.coins) {
      if (c.mag) d.position.set(c.rx, c.ry, c.rz);
      else {
        const z = tr - c.s;
        if (z < -200) continue;
        d.position.set(c.x, c.y + 0.9, z);
      }
      d.quaternion.copy(W._spin);
      d.updateMatrix();
      W.coinMesh.setMatrixAt(n++, d.matrix);
    }
    W.coinMesh.count = n;
    W.coinMesh.instanceMatrix.needsUpdate = true;
  };

  W.checkPowerups = function (tr, P, onCollect) {
    for (let i = W.powerups.length - 1; i >= 0; i--) {
      const p = W.powerups[i];
      const z = tr - p.s;
      if (Math.abs(z) < 1.2 && Math.abs(p.x - P.x) < 1.1 && Math.abs(p.y + 1.25 - (P.y + 0.9)) < 1.6) {
        W.root.remove(p.mesh);
        W.powerups.splice(i, 1);
        onCollect(p.type, p.x, p.y + 1.25, z);
      }
    }
  };

  /* ---------- particles ---------- */
  W.burst = function (x, y, z, opts) {
    opts = opts || {};
    const n = opts.count || 8;
    for (let i = 0; i < n; i++) {
      const p = W.particles.find((q) => q.life <= 0);
      if (!p) return;
      p.life = p.maxLife = opts.life || rnd(0.35, 0.6);
      p.sprite.material = opts.dust ? W.dustMat : W.sparkMat;
      p.sprite.position.set(x + rnd(-0.2, 0.2), y + rnd(-0.2, 0.2), z + rnd(-0.2, 0.2));
      const sp = opts.speed || 4;
      p.vx = rnd(-1, 1) * sp;
      p.vy = rnd(0.2, 1.2) * sp;
      p.vz = rnd(-1, 1) * sp;
      p.size = opts.size || rnd(0.25, 0.5);
      p.grow = opts.dust ? 2.5 : 0;
      p.gravity = opts.dust ? 0 : 12;
      p.sprite.scale.setScalar(p.size);
      p.sprite.visible = true;
    }
  };

  function updateParticles(dt, dz) {
    for (const p of W.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt + dz * 0.6;
      p.size += p.grow * dt;
      const f = p.life / p.maxLife;
      p.sprite.scale.setScalar(p.size * (p.grow ? 1 : 0.4 + f));
    }
  }
})();
