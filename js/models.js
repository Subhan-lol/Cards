/* Rail Dash - 3D models built from primitives.
 * The runner ("Kai"), the patrol bot, trains, barriers and scenery. */
(function () {
  'use strict';
  const RD = window.RD;
  const M = (RD.models = {});

  const C = (RD.C = {
    LANES: [-2.6, 0, 2.6],
    TRAIN_W: 2.3,
    TRAIN_H: 3.3,
    CAR_L: 10.5,
    CAR_GAP: 0.35,
    RAMP_L: 8.5,
    HIP_Y: 0.97,
  });

  /* ---------- materials ---------- */
  const mats = {};
  function toon(color, extra) {
    const key = 't' + color + (extra ? JSON.stringify(extra) : '');
    if (!mats[key]) {
      mats[key] = new THREE.MeshToonMaterial(Object.assign({ color: color, gradientMap: RD.tex.toonGradient() }, extra || {}));
    }
    return mats[key];
  }
  function lambert(color, extra) {
    const key = 'l' + color + (extra ? JSON.stringify(extra) : '');
    if (!mats[key]) mats[key] = new THREE.MeshLambertMaterial(Object.assign({ color: color }, extra || {}));
    return mats[key];
  }
  function basic(color, extra) {
    const key = 'b' + color + (extra ? JSON.stringify(extra) : '');
    if (!mats[key]) mats[key] = new THREE.MeshBasicMaterial(Object.assign({ color: color }, extra || {}));
    return mats[key];
  }
  function texMat(key, texFn, Type, extra) {
    if (!mats[key]) mats[key] = new (Type || THREE.MeshLambertMaterial)(Object.assign({ map: texFn() }, extra || {}));
    return mats[key];
  }
  M.toon = toon;
  M.lambert = lambert;
  M.basic = basic;

  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1522, side: THREE.BackSide });

  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }

  function outline(m, t) {
    const o = new THREE.Mesh(m.geometry, outlineMat);
    o.scale.setScalar(1 + (t || 0.08));
    m.add(o);
    return m;
  }

  /* ---------- geometry merging (fewer draw calls) ---------- */
  // parts: [{ geo, mat: Material | Material[], pos, rot, scale }]
  function merge(parts) {
    const buckets = new Map();
    const order = [];
    const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3();
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
    for (const p of parts) {
      const geo = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      e.set(...(p.rot || [0, 0, 0]));
      q.setFromEuler(e);
      sc.set(...(p.scale || [1, 1, 1]));
      m4.compose(v.set(...(p.pos || [0, 0, 0])), q, sc);
      nm.getNormalMatrix(m4);
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = Array.isArray(p.mat) ? p.mat[gr.materialIndex] : p.mat;
        let b = buckets.get(mat);
        if (!b) {
          b = { pos: [], nor: [], uv: [] };
          buckets.set(mat, b);
          order.push(mat);
        }
        const end = Math.min(gr.start + gr.count, pos.count);
        for (let i = gr.start; i < end; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m4);
          b.pos.push(v.x, v.y, v.z);
          n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
          b.nor.push(n.x, n.y, n.z);
          if (uv) b.uv.push(uv.getX(i), uv.getY(i));
          else b.uv.push(0, 0);
        }
      }
    }
    const P = [], N = [], U = [];
    const out = new THREE.BufferGeometry();
    let start = 0;
    order.forEach((mat, i) => {
      const b = buckets.get(mat);
      P.push(...b.pos);
      N.push(...b.nor);
      U.push(...b.uv);
      const count = b.pos.length / 3;
      out.addGroup(start, count, i);
      start += count;
    });
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    out.computeBoundingSphere();
    return { geo: out, mats: order };
  }
  M.merge = merge;

  const geoCache = {};
  function cachedMesh(key, build, shadow) {
    if (!geoCache[key]) geoCache[key] = merge(build());
    const c = geoCache[key];
    const m = new THREE.Mesh(c.geo, c.mats);
    m.castShadow = shadow !== false;
    m.receiveShadow = true;
    return m;
  }

  /* ======================================================================
   * Runners. Every look shares the same skeleton so animation is identical.
   *  - kai:    street artist, orange hoodie, backpack, purple spiky hair
   *  - friend: your friend - his real face from a photo, messy black
   *            hair, black tee and jeans
   * ==================================================================== */
  M.RUNNERS = {
    kai: {
      label: 'KAI', skin: '#e3a574', skinDark: '#d18d5c', hair: '#3d2a6b', hairHi: '#4b3580',
      top: '#ff7b1c', topDark: '#e0620c', pants: '#2f5597', pantsDark: '#264780',
      shoe: '#ffffff', shoeAccent: '#ff3b5c', outfit: 'hoodie', hairStyle: 'spiky', face: 'smile',
      backpack: true, headphones: true, headband: '#20d0f0',
    },
    friend: {
      label: 'FRIEND', skin: '#b97855', skinDark: '#a5664a', hair: '#161217', hairHi: '#2a2230',
      top: '#2b2c34', topDark: '#1c1d23', pants: '#3b4a66', pantsDark: '#2f3b52',
      shoe: '#f2f2f2', shoeAccent: '#3a3b44', outfit: 'tee', hairStyle: 'messy', face: 'photo',
      headScale: [0.95, 1.12, 0.97],
    },
  };

  M.makeRunner = function (styleId) {
    const col = M.RUNNERS[styleId] || M.RUNNERS.kai;
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = C.HIP_Y;
    root.add(body);

    const pelvis = outline(mesh(new THREE.CapsuleGeometry(0.2, 0.06, 4, 12), toon(col.pants), 0, 0.02, 0), 0.06);
    pelvis.scale.set(1.12, 1, 0.82);
    body.add(pelvis);

    const torso = new THREE.Group();
    torso.position.y = 0.08;
    body.add(torso);
    const chest = outline(mesh(new THREE.CapsuleGeometry(0.24, 0.24, 6, 14), toon(col.top), 0, 0.3, 0), 0.06);
    chest.scale.set(1.12, 1, 0.84);
    torso.add(chest);
    if (col.outfit === 'hoodie') {
      torso.add(mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), toon(col.topDark), 0, 0.15, -0.2));
      torso.add(mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), toon('#ffffff'), 0, 0.36, -0.215));
      const hood = mesh(new THREE.SphereGeometry(0.2, 14, 10), toon(col.topDark), 0, 0.55, 0.13);
      hood.scale.set(1.15, 0.62, 0.8);
      torso.add(hood);
    } else {
      // t-shirt: crew collar and a hem band
      const collar = mesh(new THREE.TorusGeometry(0.105, 0.028, 8, 20), toon(col.topDark), 0, 0.575, 0.01);
      collar.rotation.x = Math.PI / 2;
      torso.add(collar);
      const hem = mesh(new THREE.CylinderGeometry(0.272, 0.268, 0.05, 20), toon(col.topDark), 0, 0.02, 0);
      hem.scale.set(1, 1, 0.84);
      torso.add(hem);
    }

    // backpack with a spray can
    const pack = new THREE.Group();
    pack.position.set(0, 0.33, 0.25);
    if (col.backpack) {
      torso.add(pack);
      pack.add(outline(mesh(new THREE.BoxGeometry(0.4, 0.44, 0.2), toon('#22b573')), 0.05));
      pack.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), toon('#1a8a57'), 0, -0.1, 0.11));
      pack.add(mesh(new THREE.BoxGeometry(0.42, 0.05, 0.22), toon('#ffd23f'), 0, 0.13, 0));
      pack.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 10), toon('#ff3b5c'), 0.25, 0.02, 0));
      pack.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.05, 8), toon('#ffffff'), 0.25, 0.15, 0));
      for (const s of [-1, 1]) torso.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.05), toon('#1a8a57'), s * 0.14, 0.34, -0.2));
    }

    // neck & head
    const neck = new THREE.Group();
    neck.position.y = 0.6;
    torso.add(neck);
    neck.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 8), toon(col.skin), 0, 0.02, 0));
    if (col.headphones) {
      const phones = mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20), toon('#20d0f0'), 0, -0.02, 0.02);
      phones.rotation.x = Math.PI / 2 + 0.25;
      neck.add(phones);
      for (const s of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 12), toon('#1b1b2f'), s * 0.16, -0.02, -0.03);
        cup.rotation.z = Math.PI / 2;
        neck.add(cup);
      }
    }

    const head = new THREE.Group();
    head.position.y = 0.27;
    if (col.headScale) head.scale.set(...col.headScale);
    neck.add(head);
    const skull = outline(mesh(new THREE.SphereGeometry(0.26, 22, 16), toon(col.skin)), 0.05);
    head.add(skull);
    for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), toon(col.skin), s * 0.255, -0.01, 0));
    if (col.face === 'smile') {
      for (const s of [-1, 1]) {
        const eye = mesh(new THREE.SphereGeometry(0.066, 12, 10), basic('#ffffff'), s * 0.095, 0.02, -0.215);
        eye.scale.set(1, 1.28, 0.6);
        head.add(eye);
        head.add(mesh(new THREE.SphereGeometry(0.036, 10, 8), basic('#1b1030'), s * 0.093, 0.012, -0.252));
        head.add(mesh(new THREE.SphereGeometry(0.012, 6, 6), basic('#ffffff'), s * 0.093 + 0.012, 0.03, -0.285));
        const brow = mesh(new THREE.BoxGeometry(0.1, 0.028, 0.03), toon(col.hair), s * 0.1, 0.125, -0.225);
        brow.rotation.z = s * -0.18;
        head.add(brow);
      }
      head.add(mesh(new THREE.SphereGeometry(0.036, 8, 8), toon(col.skinDark), 0, -0.03, -0.26));
      const smile = mesh(new THREE.TorusGeometry(0.055, 0.013, 6, 12, Math.PI), basic('#5a1d1d'), 0, -0.085, -0.235);
      smile.rotation.z = Math.PI;
      head.add(smile);
    } else if (col.face === 'photo' && RD.FRIEND_FACE) {
      // the photo is projected straight on from the front, so it looks right
      // face-on and wraps naturally around the cheeks
      const R = 0.263, hw = 0.255, y1 = 0.21, y0 = -0.26;
      const t0 = Math.acos(y1 / R), t1 = Math.acos(y0 / R);
      const geo = new THREE.SphereGeometry(R, 36, 28, Math.PI * 1.5 - 1.5, 3.0, t0, t1 - t0);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 - pos.getX(i) / (2 * hw), (pos.getY(i) - y0) / (y1 - y0));
      if (!M._faceTex) {
        M._faceTex = new THREE.TextureLoader().load(RD.FRIEND_FACE);
        M._faceTex.anisotropy = 8;
      }
      // a little self-lighting keeps the photo as bright as the toon-shaded skin
      const mat = new THREE.MeshLambertMaterial({ map: M._faceTex, emissive: 0x555555, emissiveMap: M._faceTex, transparent: true });
      head.add(new THREE.Mesh(geo, mat));
    }

    // hair
    if (col.hairStyle === 'spiky') {
      const cap = mesh(new THREE.SphereGeometry(0.28, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), toon(col.hair), 0, 0.02, 0.025);
      cap.rotation.x = -0.35;
      head.add(outline(cap, 0.04));
      const spikes = [
        [0, 0.26, -0.08, -0.5, 0], [0.13, 0.22, -0.02, -0.7, -0.5], [-0.13, 0.22, -0.02, -0.7, 0.5],
        [0, 0.24, 0.1, -1.2, 0], [0.16, 0.15, 0.12, -1.5, -0.6], [-0.16, 0.15, 0.12, -1.5, 0.6],
        [0, 0.12, 0.22, -2.0, 0], [0.09, 0.28, 0.02, -0.9, -0.2], [-0.09, 0.28, 0.02, -0.9, 0.2],
      ];
      for (const [x, y, z, rx, rz] of spikes) {
        const sp = mesh(new THREE.ConeGeometry(0.075, 0.26, 6), toon(col.hair), x, y, z);
        sp.rotation.set(rx, 0, rz);
        head.add(sp);
      }
    } else {
      // messy mop: a cap plus lots of soft clumps, and bangs over the forehead
      let seed = 11;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const cap = mesh(new THREE.SphereGeometry(0.285, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(col.hair), 0, 0.03, 0.02);
      cap.rotation.x = col.face === 'photo' ? 0.52 : 0.28;
      head.add(outline(cap, 0.04));
      const dir = new THREE.Vector3();
      for (let ring = 0; ring < 7; ring++) {
        const theta = 0.12 + ring * 0.26;
        const count = Math.max(4, Math.round(Math.sin(theta) * 16));
        for (let k = 0; k < count; k++) {
          const phi = (k / count) * Math.PI * 2 + rand() * 0.4 + ring * 0.3;
          dir.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
          const front = -dir.z;
          if (theta > 0.5 && front > 0.3) continue; // keep the face clear
          if (theta > 1.2 && front > -0.35) continue; // only the back reaches the nape
          const r = 0.082 + rand() * 0.04;
          const d = 0.245 + rand() * 0.025;
          const clump = mesh(new THREE.SphereGeometry(r, 9, 7), toon(rand() < 0.3 ? col.hairHi : col.hair), dir.x * d, dir.y * d + 0.02, dir.z * d);
          clump.scale.set(1, 0.85 + rand() * 0.3, 1);
          head.add(clump);
        }
      }
      // bangs falling onto the forehead (the photo face already has its own)
      for (let k = 0; k < (col.face === 'photo' ? 0 : 6); k++) {
        const x = -0.15 + k * 0.058 + (rand() - 0.5) * 0.02;
        const y = 0.172 - Math.abs(x) * 0.25;
        const z = -(Math.sqrt(Math.max(0.001, 0.26 * 0.26 - y * y - x * x)) + 0.018);
        const bang = mesh(new THREE.CapsuleGeometry(0.036, 0.075 + rand() * 0.04, 4, 8), toon(k % 2 ? col.hairHi : col.hair), x, y, z);
        bang.rotation.set(0.45, 0, 0.25 + (rand() - 0.5) * 0.5);
        head.add(bang);
      }
      // sideburns
      for (const s of [-1, 1]) {
        const sb = mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), toon(col.hair), s * 0.245, 0.02, -0.07);
        sb.rotation.z = s * 0.1;
        head.add(sb);
      }
    }
    if (col.headband) {
      const band = mesh(new THREE.TorusGeometry(0.262, 0.028, 6, 24), toon(col.headband), 0, 0.1, 0);
      band.rotation.x = Math.PI / 2 - 0.3;
      head.add(band);
    }

    // arms
    function arm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.31, 0.47, 0);
      torso.add(shoulder);
      shoulder.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(col.top)));
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      if (col.outfit === 'tee') {
        // short sleeves, bare arms
        shoulder.add(outline(mesh(new THREE.CapsuleGeometry(0.078, 0.16, 4, 8), toon(col.skin), 0, -0.15, 0), 0.08));
        shoulder.add(outline(mesh(new THREE.CylinderGeometry(0.104, 0.11, 0.17, 12), toon(col.top), 0, -0.07, 0), 0.05));
        elbow.add(outline(mesh(new THREE.CapsuleGeometry(0.07, 0.14, 4, 8), toon(col.skin), 0, -0.12, 0), 0.08));
      } else {
        shoulder.add(outline(mesh(new THREE.CapsuleGeometry(0.085, 0.16, 4, 8), toon(col.top), 0, -0.15, 0), 0.08));
        elbow.add(outline(mesh(new THREE.CapsuleGeometry(0.076, 0.14, 4, 8), toon(col.top), 0, -0.12, 0), 0.08));
        elbow.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10), toon(col.topDark), 0, -0.23, 0));
      }
      elbow.add(mesh(new THREE.SphereGeometry(0.083, 10, 8), toon(col.skin), 0, -0.3, 0));
      return { shoulder, elbow };
    }
    // legs
    function leg(side) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.12, -0.02, 0);
      body.add(hip);
      hip.add(outline(mesh(new THREE.CapsuleGeometry(0.105, 0.22, 4, 8), toon(col.pants), 0, -0.21, 0), 0.07));
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);
      knee.add(outline(mesh(new THREE.CapsuleGeometry(0.092, 0.22, 4, 8), toon(col.pants), 0, -0.2, 0), 0.07));
      knee.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), toon(col.pantsDark), 0, -0.36, 0));
      const ankle = new THREE.Group();
      ankle.position.y = -0.42;
      knee.add(ankle);
      ankle.add(mesh(new THREE.BoxGeometry(0.2, 0.07, 0.36), toon(col.shoe), 0, -0.085, -0.05));
      ankle.add(outline(mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), toon(col.shoeAccent), 0, -0.02, -0.03), 0.06));
      ankle.add(mesh(new THREE.BoxGeometry(0.185, 0.04, 0.1), toon('#ffffff'), 0, 0.01, -0.12));
      return { hip, knee, ankle };
    }

    const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

    // hoverboard (shown while the shield board is active)
    const board = new THREE.Group();
    board.visible = false;
    root.add(board);
    const boardMat = texMat('boardMat', RD.tex.board, THREE.MeshToonMaterial, { gradientMap: RD.tex.toonGradient() });
    const deck = mesh(new THREE.BoxGeometry(0.56, 0.07, 1.25), [toon('#2b1d4d'), toon('#2b1d4d'), boardMat, toon('#2b1d4d'), toon('#2b1d4d'), toon('#2b1d4d')]);
    board.add(deck);
    for (const z of [-0.62, 0.62]) {
      const tip = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 18, 1, false, 0, Math.PI), toon('#ff2f92'), 0, 0, z);
      tip.rotation.y = z < 0 ? Math.PI / 2 : -Math.PI / 2;
      board.add(tip);
    }
    const boardGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.glow(), color: 0x00f0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    boardGlow.scale.set(1.4, 0.5, 1);
    boardGlow.position.y = -0.14;
    board.add(boardGlow);

    // jetpack (shown while flying)
    const jet = new THREE.Group();
    jet.visible = false;
    jet.position.set(0, 0.32, 0.42);
    torso.add(jet);
    const flames = [];
    for (const s of [-1, 1]) {
      jet.add(outline(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.46, 12), toon('#cfd6de'), s * 0.13, 0, 0), 0.05));
      jet.add(mesh(new THREE.ConeGeometry(0.11, 0.14, 12), toon('#ff3344'), s * 0.13, 0.3, 0));
      jet.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.08, 10), toon('#555a66'), s * 0.13, -0.27, 0));
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.5, 10), basic('#ffb020', { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.rotation.x = Math.PI;
      f.position.set(s * 0.13, -0.56, 0);
      jet.add(f);
      flames.push(f);
    }
    jet.add(mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), toon('#6c5ce7'), 0, 0, -0.05));

    // blob shadow for readability when high up
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 1;

    return { root, body, torso, neck, head, armL, armR, legL, legR, board, boardGlow, jet, flames, blob, pack };
  };

  /* ======================================================================
   * The chaser: a hovering patrol bot with a siren.
   * ==================================================================== */
  M.makeChaser = function () {
    const root = new THREE.Group();
    const hover = new THREE.Group();
    root.add(hover);
    const navy = toon('#2b3a67'), steel = toon('#c7ced8');
    const bodyM = outline(mesh(new THREE.SphereGeometry(0.5, 22, 16), navy, 0, 0.75, 0), 0.05);
    bodyM.scale.set(1, 1.08, 0.95);
    hover.add(bodyM);
    const belly = mesh(new THREE.SphereGeometry(0.33, 16, 12), toon('#e9eef5'), 0, 0.66, -0.36);
    belly.scale.set(1, 1, 0.35);
    hover.add(belly);
    const badge = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 6), toon('#ffcf33'), 0.2, 0.95, -0.44);
    badge.rotation.x = Math.PI / 2;
    hover.add(badge);
    // head
    const head = outline(mesh(new THREE.SphereGeometry(0.36, 20, 14), toon('#3a4d85'), 0, 1.4, 0), 0.05);
    hover.add(head);
    const visor = mesh(new THREE.CapsuleGeometry(0.1, 0.34, 4, 10), basic('#0b1020'), 0, 1.42, -0.29);
    visor.rotation.z = Math.PI / 2;
    visor.scale.set(1, 1, 0.6);
    hover.add(visor);
    const eyes = [];
    for (const s of [-1, 1]) {
      const e = mesh(new THREE.SphereGeometry(0.055, 10, 8), basic('#ff3355'), s * 0.12, 1.43, -0.36);
      hover.add(e);
      eyes.push(e);
    }
    // patrol cap with siren
    hover.add(mesh(new THREE.CylinderGeometry(0.3, 0.33, 0.14, 18), toon('#1d2745'), 0, 1.72, 0));
    hover.add(mesh(new THREE.BoxGeometry(0.46, 0.04, 0.22), toon('#1d2745'), 0, 1.66, -0.3));
    const sirenMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
    const siren = mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 12), sirenMat, 0, 1.87, 0);
    hover.add(siren);
    const sirenGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.glow(), color: 0xff2233, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sirenGlow.scale.set(1.2, 1.2, 1);
    sirenGlow.position.y = 1.9;
    hover.add(sirenGlow);
    // arms
    function arm(side) {
      const sh = new THREE.Group();
      sh.position.set(side * 0.52, 0.95, 0);
      hover.add(sh);
      sh.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), steel));
      sh.add(outline(mesh(new THREE.CapsuleGeometry(0.08, 0.36, 4, 8), navy, 0, -0.26, 0), 0.08));
      sh.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), steel, 0, -0.52, 0));
      return sh;
    }
    const armL = arm(-1), armR = arm(1);
    // thruster
    const noz = mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.2, 14), steel, 0, 0.2, 0);
    hover.add(noz);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.glow(), color: 0x33ccff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.scale.set(0.9, 1.1, 1);
    flame.position.y = -0.05;
    hover.add(flame);
    return { root, hover, siren, sirenMat, sirenGlow, armL, armR, flame, eyes };
  };

  /* ======================================================================
   * Trains
   * ==================================================================== */
  M.trainLength = (cars) => cars * C.CAR_L + (cars - 1) * C.CAR_GAP;

  M.makeTrain = function (cars, scheme, variant, moving) {
    const key = ['train', cars, scheme.id, variant, moving ? 1 : 0].join('_');
    const bodyY0 = 0.55, bodyH = C.TRAIN_H - bodyY0 - 0.1, W = C.TRAIN_W;
    const m = cachedMesh(key, () => {
      const parts = [];
      const roofMat = toon(scheme.roof);
      const under = lambert('#2a2b30');
      const endMat = texMat('te' + scheme.id, () => RD.tex.trainEnd(scheme), THREE.MeshToonMaterial, { gradientMap: RD.tex.toonGradient() });
      const frontMat = texMat('tf' + scheme.id + (moving ? 'L' : ''), () => RD.tex.trainFront(scheme, moving), THREE.MeshToonMaterial, {
        gradientMap: RD.tex.toonGradient(),
      });
      for (let i = 0; i < cars; i++) {
        const z0 = -i * (C.CAR_L + C.CAR_GAP);
        const zc = z0 - C.CAR_L / 2;
        const v = (variant + i) % RD.tex.TRAIN_VARIANTS;
        const sideMat = texMat('ts' + scheme.id + '_' + v, () => RD.tex.trainSide(scheme, v), THREE.MeshToonMaterial, {
          gradientMap: RD.tex.toonGradient(),
        });
        const front = i === 0 ? frontMat : endMat;
        const back = i === cars - 1 ? frontMat : endMat;
        parts.push({ geo: new THREE.BoxGeometry(W, bodyH, C.CAR_L), mat: [sideMat, sideMat, roofMat, under, front, back], pos: [0, bodyY0 + bodyH / 2, zc] });
        // rounded roof
        parts.push({
          geo: new THREE.CylinderGeometry(1, 1, C.CAR_L - 0.2, 16, 1, false, -Math.PI / 2, Math.PI),
          mat: roofMat,
          pos: [0, C.TRAIN_H - 0.1, zc],
          rot: [-Math.PI / 2, 0, 0],
          scale: [W / 2 - 0.02, 1, 0.1],
        });
        // roof units
        parts.push({ geo: new THREE.BoxGeometry(1.1, 0.16, 1.8), mat: toon('#b8bec6'), pos: [0, C.TRAIN_H + 0.02, zc - 2.2] });
        parts.push({ geo: new THREE.BoxGeometry(1.1, 0.16, 1.8), mat: toon('#b8bec6'), pos: [0, C.TRAIN_H + 0.02, zc + 2.2] });
        // undercarriage and bogies
        parts.push({ geo: new THREE.BoxGeometry(W - 0.5, 0.3, C.CAR_L - 2.4), mat: under, pos: [0, 0.42, zc] });
        for (const bz of [zc + C.CAR_L / 2 - 1.7, zc - C.CAR_L / 2 + 1.7]) {
          parts.push({ geo: new THREE.BoxGeometry(1.8, 0.3, 2.0), mat: under, pos: [0, 0.4, bz] });
          for (const wz of [bz - 0.6, bz + 0.6]) {
            parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.3, 1.7, 12), mat: lambert('#44464d'), pos: [0, 0.3, wz], rot: [0, 0, Math.PI / 2] });
          }
        }
        if (i > 0) {
          parts.push({ geo: new THREE.BoxGeometry(1.5, 2.3, C.CAR_GAP + 0.2), mat: lambert('#1e1e22'), pos: [0, bodyY0 + 1.3, z0 + C.CAR_GAP / 2] });
        }
      }
      return parts;
    });
    const g = new THREE.Group();
    g.add(m);
    if (moving) {
      const glowMat = new THREE.SpriteMaterial({ map: RD.tex.glow(), color: 0xfff1a8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const x of [-0.8, 0.8]) {
        const s = new THREE.Sprite(glowMat);
        s.scale.set(1.8, 1.8, 1);
        s.position.set(x, bodyY0 + bodyH * 0.15, 0.3);
        g.add(s);
      }
    }
    return g;
  };

  /* ---------- ramp up onto a train ---------- */
  M.makeRamp = function () {
    return cachedMesh('ramp', () => {
      const L = C.RAMP_L, H = C.TRAIN_H, W = C.TRAIN_W / 2;
      // wedge: near end at z=0 (height 0) rising to z=-L (height H)
      const p = [];
      const quad = (a, b, c, d) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
      quad([-W, 0, 0], [W, 0, 0], [W, H, -L], [-W, H, -L]); // slope
      p.push(W, 0, 0, W, 0, -L, W, H, -L); // right side
      p.push(-W, 0, 0, -W, H, -L, -W, 0, -L); // left side
      const slope = new THREE.BufferGeometry();
      slope.setAttribute('position', new THREE.Float32BufferAttribute(p.slice(0, 18), 3));
      slope.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 4, 0, 0, 1, 4, 0, 4], 2));
      slope.computeVertexNormals();
      const sides = new THREE.BufferGeometry();
      sides.setAttribute('position', new THREE.Float32BufferAttribute(p.slice(18), 3));
      sides.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
      sides.computeVertexNormals();
      const plate = texMat('rampPlate', RD.tex.rampPlate, THREE.MeshToonMaterial, { gradientMap: RD.tex.toonGradient() });
      const parts = [
        { geo: slope, mat: plate },
        { geo: sides, mat: toon('#5d6570') },
      ];
      // support legs
      for (const z of [-L * 0.45, -L * 0.8]) {
        const h = (-z / L) * H;
        for (const x of [-W + 0.15, W - 0.15]) parts.push({ geo: new THREE.BoxGeometry(0.16, h, 0.16), mat: toon('#40454d'), pos: [x, h / 2, z] });
      }
      return parts;
    });
  };

  /* ---------- barriers ---------- */
  M.makeHurdle = function () {
    return cachedMesh('hurdle', () => {
      const stripe = texMat('hurdleStripe', () => RD.tex.stripes('#e8302e', '#ffffff', 'rw'), THREE.MeshToonMaterial, { gradientMap: RD.tex.toonGradient() });
      const white = toon('#f2f2f2'), dark = toon('#3a3a40');
      const parts = [];
      for (const x of [-1.0, 1.0]) {
        parts.push({ geo: new THREE.BoxGeometry(0.12, 1.05, 0.12), mat: white, pos: [x, 0.52, 0] });
        parts.push({ geo: new THREE.BoxGeometry(0.2, 0.08, 0.7), mat: dark, pos: [x, 0.04, 0] });
      }
      parts.push({ geo: new THREE.BoxGeometry(2.2, 0.42, 0.1), mat: stripe, pos: [0, 0.8, 0] });
      parts.push({ geo: new THREE.BoxGeometry(2.1, 0.08, 0.08), mat: white, pos: [0, 0.35, 0] });
      return parts;
    });
  };

  M.makeOverhead = function () {
    const g = new THREE.Group();
    g.add(
      cachedMesh('overhead', () => {
        const sign = texMat('rollSign', RD.tex.rollSign, THREE.MeshToonMaterial, { gradientMap: RD.tex.toonGradient() });
        const post = toon('#e6e6e6'), dark = toon('#3a3a40'), yel = toon('#ffcc00');
        const parts = [];
        for (const x of [-1.15, 1.15]) {
          parts.push({ geo: new THREE.BoxGeometry(0.14, 3.3, 0.14), mat: post, pos: [x, 1.65, 0] });
          parts.push({ geo: new THREE.BoxGeometry(0.4, 0.1, 0.5), mat: dark, pos: [x, 0.05, 0] });
        }
        parts.push({ geo: new THREE.BoxGeometry(2.5, 0.16, 0.16), mat: yel, pos: [0, 3.3, 0] });
        parts.push({ geo: new THREE.BoxGeometry(2.2, 1.35, 0.1), mat: [dark, dark, dark, dark, sign, sign], pos: [0, 1.95, 0] });
        return parts;
      })
    );
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.glow(), color: 0xff5522, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    lamp.scale.set(0.8, 0.8, 1);
    lamp.position.set(0, 3.5, 0);
    g.add(lamp);
    g.userData.lamp = lamp;
    return g;
  };

  M.makeBlock = function () {
    return cachedMesh('block', () => {
      const face = texMat('blockFace', RD.tex.blockFace, THREE.MeshToonMaterial, { gradientMap: RD.tex.toonGradient() });
      const conc = toon('#b3ada2');
      return [
        { geo: new THREE.BoxGeometry(2.2, 2.7, 0.7), mat: [conc, conc, conc, conc, face, face], pos: [0, 1.35, 0] },
        { geo: new THREE.BoxGeometry(2.3, 0.15, 0.8), mat: toon('#8e897f'), pos: [0, 2.75, 0] },
      ];
    });
  };

  /* ---------- coins ---------- */
  M.coinGeometry = function () {
    const g = new THREE.CylinderGeometry(0.4, 0.4, 0.09, 22);
    g.rotateX(Math.PI / 2);
    return g;
  };
  M.coinMaterials = function () {
    const face = new THREE.MeshToonMaterial({ map: RD.tex.coinFace(), gradientMap: RD.tex.toonGradient(), emissive: 0x4a3000 });
    const edge = new THREE.MeshToonMaterial({ color: 0xf0b000, gradientMap: RD.tex.toonGradient(), emissive: 0x3a2600 });
    return [edge, face, face];
  };

  /* ---------- power-up pickup ---------- */
  M.makePowerup = function (type) {
    const g = new THREE.Group();
    const colors = { magnet: 0xff4466, jetpack: 0xffa020, multiplier: 0xb44dff, sneakers: 0x35e07a };
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.glow(), color: colors[type], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(2.3, 2.3, 1);
    g.add(glow);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.icon(type), transparent: true, depthWrite: false }));
    icon.scale.set(1.25, 1.25, 1);
    g.add(icon);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 32), basic('#ffffff', { transparent: true, opacity: 0.8 }));
    g.add(ring);
    g.userData.ring = ring;
    return g;
  };

  /* ======================================================================
   * Scenery
   * ==================================================================== */
  M.makeWall = function (variant, side) {
    const key = 'wall' + variant + '_' + side;
    return cachedMesh(
      key,
      () => {
        const face = texMat('wall' + variant, () => RD.tex.wall(variant), THREE.MeshLambertMaterial);
        const conc = texMat('concrete', RD.tex.concrete, THREE.MeshLambertMaterial);
        const top = lambert('#c4bfb5');
        // inner face points toward the tracks
        const mat = side < 0 ? [face, conc, top, conc, conc, conc] : [conc, face, top, conc, conc, conc];
        return [{ geo: new THREE.BoxGeometry(0.6, 3.8, 20), mat, pos: [0, 1.9, -10] }];
      },
      false
    );
  };

  M.makeFence = function () {
    return cachedMesh(
      'fence',
      () => {
        const t = RD.tex.fence();
        const fm = texMat('fenceMat', () => {
          const tt = t.clone();
          tt.needsUpdate = true;
          tt.repeat.set(10, 1.2);
          return tt;
        }, THREE.MeshLambertMaterial, { transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
        const post = lambert('#9aa0a8');
        const parts = [{ geo: new THREE.PlaneGeometry(20, 2.6), mat: fm, pos: [0, 1.3, -10], rot: [0, Math.PI / 2, 0] }];
        for (let z = 0; z >= -20; z -= 5) parts.push({ geo: new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), mat: post, pos: [0, 1.4, z] });
        parts.push({ geo: new THREE.CylinderGeometry(0.04, 0.04, 20, 6), mat: post, pos: [0, 2.6, -10], rot: [Math.PI / 2, 0, 0] });
        return parts;
      },
      false
    );
  };

  M.makeBuilding = function (w, h, d, colorIdx) {
    const key = ['bld', w, h, d, colorIdx].join('_');
    return cachedMesh(
      key,
      () => {
        const tex = RD.tex.building(colorIdx);
        const side = texMat('bldm' + colorIdx, () => tex, THREE.MeshLambertMaterial);
        const roof = lambert(RD.tex.shade(RD.tex.BUILDING_COLORS[colorIdx % RD.tex.BUILDING_COLORS.length], -25));
        const geo = new THREE.BoxGeometry(w, h, d);
        // scale UVs so windows keep a constant size (one tile = 5 x 5 units)
        const uv = geo.attributes.uv;
        for (let f = 0; f < 6; f++) {
          const fw = f < 2 ? d : w, fh = f === 2 || f === 3 ? d : h;
          for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * fw) / 5, (uv.getY(i) * fh) / 5);
        }
        const parts = [{ geo, mat: [side, side, roof, roof, side, side], pos: [0, h / 2, 0] }];
        parts.push({ geo: new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), mat: lambert('#77736c'), pos: [0, h + 0.2, 0] });
        if (h > 12) {
          parts.push({ geo: new THREE.CylinderGeometry(1.1, 1.1, 2, 12), mat: lambert('#8a5a3a'), pos: [w * 0.2, h + 1.4, d * 0.15] });
          parts.push({ geo: new THREE.ConeGeometry(1.2, 0.8, 12), mat: lambert('#6a4028'), pos: [w * 0.2, h + 2.8, d * 0.15] });
        } else {
          parts.push({ geo: new THREE.BoxGeometry(2, 1, 2.5), mat: lambert('#b9bec5'), pos: [-w * 0.2, h + 0.9, -d * 0.2] });
        }
        return parts;
      },
      false
    );
  };

  M.makeTree = function (v) {
    return cachedMesh(
      'tree' + v,
      () => {
        const leaf = toon(['#4caf50', '#5cbf45', '#3f9e4c'][v % 3]);
        const parts = [{ geo: new THREE.CylinderGeometry(0.2, 0.28, 3, 8), mat: toon('#7a5230'), pos: [0, 1.5, 0] }];
        parts.push({ geo: new THREE.SphereGeometry(1.5, 12, 10), mat: leaf, pos: [0, 3.8, 0] });
        parts.push({ geo: new THREE.SphereGeometry(1.1, 12, 10), mat: leaf, pos: [0.9, 3.2, 0.3] });
        parts.push({ geo: new THREE.SphereGeometry(1.1, 12, 10), mat: leaf, pos: [-0.8, 3.3, -0.4] });
        parts.push({ geo: new THREE.SphereGeometry(1.0, 12, 10), mat: leaf, pos: [0.1, 4.8, 0.2] });
        return parts;
      },
      false
    );
  };

  M.makeGantry = function () {
    return cachedMesh(
      'gantry',
      () => {
        const steel = toon('#7d8793'), dark = toon('#4a515b');
        const parts = [];
        for (const x of [-5.6, 5.6]) {
          parts.push({ geo: new THREE.BoxGeometry(0.3, 7.2, 0.3), mat: steel, pos: [x, 3.6, 0] });
          parts.push({ geo: new THREE.BoxGeometry(0.6, 0.3, 0.6), mat: dark, pos: [x, 0.15, 0] });
        }
        parts.push({ geo: new THREE.BoxGeometry(11.6, 0.3, 0.3), mat: steel, pos: [0, 7.0, 0] });
        parts.push({ geo: new THREE.BoxGeometry(11.2, 0.12, 0.12), mat: dark, pos: [0, 6.5, 0] });
        for (const x of C.LANES) parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), mat: dark, pos: [x, 6.45, 0] });
        return parts;
      },
      true
    );
  };

  M.makeSignal = function () {
    const g = new THREE.Group();
    g.add(
      cachedMesh('signal', () => [
        { geo: new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), mat: toon('#3a3f47'), pos: [0, 1.6, 0] },
        { geo: new THREE.BoxGeometry(0.4, 0.9, 0.3), mat: toon('#1d1f24'), pos: [0, 3.2, 0] },
      ])
    );
    const lampMat = new THREE.SpriteMaterial({ map: RD.tex.glow(), color: Math.random() < 0.5 ? 0x33ff66 : 0xff3322, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(lampMat);
    s.scale.set(0.7, 0.7, 1);
    s.position.set(0, 3.35, 0.18);
    g.add(s);
    return g;
  };

  M.makeBridge = function () {
    return cachedMesh(
      'bridge',
      () => {
        const conc = texMat('concrete', RD.tex.concrete, THREE.MeshLambertMaterial);
        const rail = toon('#e0a030'), dark = lambert('#5d5a55');
        const parts = [];
        parts.push({ geo: new THREE.BoxGeometry(40, 1.1, 7), mat: conc, pos: [0, 7.4, 0] });
        parts.push({ geo: new THREE.BoxGeometry(40, 0.3, 7.4), mat: dark, pos: [0, 6.8, 0] });
        for (const z of [-3.4, 3.4]) {
          parts.push({ geo: new THREE.BoxGeometry(40, 0.15, 0.15), mat: rail, pos: [0, 8.9, z] });
          for (let x = -19; x <= 19; x += 2) parts.push({ geo: new THREE.BoxGeometry(0.1, 0.9, 0.1), mat: rail, pos: [x, 8.4, z] });
        }
        for (const x of [-8.5, 8.5]) parts.push({ geo: new THREE.BoxGeometry(1.6, 7, 5), mat: conc, pos: [x, 3.5, 0] });
        return parts;
      },
      true
    );
  };

  M.makeBush = function () {
    return cachedMesh(
      'bush',
      () => {
        const leaf = toon('#4fae4a');
        return [
          { geo: new THREE.SphereGeometry(0.7, 10, 8), mat: leaf, pos: [0, 0.4, 0] },
          { geo: new THREE.SphereGeometry(0.55, 10, 8), mat: leaf, pos: [0.6, 0.3, 0.3] },
          { geo: new THREE.SphereGeometry(0.5, 10, 8), mat: leaf, pos: [-0.55, 0.3, -0.2] },
        ];
      },
      false
    );
  };
})();
