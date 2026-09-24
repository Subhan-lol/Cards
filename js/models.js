/* Rail Dash - 3D models built from primitives.
 * Runners, the police chaser, trains, barriers and scenery. Static pieces are
 * merged into as few meshes as possible so the detail stays cheap to draw. */
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
    FOOT_Y: 0.14, // characters stand on the sleepers, a little above y = 0
  });

  /* ---------- materials ---------- */
  const mats = {};
  const texKey = (k, v) => (v && v.isTexture ? v.uuid : v);
  function std(color, o) {
    o = o || {};
    const key = 's' + color + JSON.stringify(o, texKey);
    if (!mats[key]) {
      const p = { color, roughness: o.r !== undefined ? o.r : 0.72, metalness: o.m || 0 };
      if (o.map) p.map = o.map;
      if (o.normalMap) {
        p.normalMap = o.normalMap;
        p.normalScale = new THREE.Vector2(o.ns || 1, o.ns || 1);
      }
      if (o.e) {
        p.emissive = o.e;
        p.emissiveIntensity = o.ei !== undefined ? o.ei : 1;
      }
      if (o.emissiveMap) p.emissiveMap = o.emissiveMap;
      if (o.transparent) {
        p.transparent = true;
        p.opacity = o.opacity !== undefined ? o.opacity : 1;
        if (o.depthWrite === false) p.depthWrite = false;
      }
      if (o.side) p.side = o.side;
      if (o.alphaTest) p.alphaTest = o.alphaTest;
      if (o.env !== undefined) p.envMapIntensity = o.env;
      if (o.flat) p.flatShading = true;
      mats[key] = new THREE.MeshStandardMaterial(p);
    }
    return mats[key];
  }
  function basic(color, o) {
    o = o || {};
    const key = 'b' + color + JSON.stringify(o, texKey);
    if (!mats[key]) mats[key] = new THREE.MeshBasicMaterial(Object.assign({ color }, o));
    return mats[key];
  }
  M.std = std;
  M.basic = basic;
  M.toon = std; // older name, same thing

  function glowSprite(color, size, opacity) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: RD.tex.glow(), color, transparent: true, opacity: opacity || 1, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    s.scale.set(size, size, 1);
    return s;
  }
  M.glowSprite = glowSprite;

  /* ---------- geometry helpers ---------- */
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    rbox: (w, h, d, r, seg) => boxUV(new THREE.RoundedBoxGeometry(w, h, d, seg || 2, Math.min(r || 0.04, w / 2, h / 2, d / 2)), w, h, d),
    cyl: (rt, rb, h, seg, open, ts, tl) => new THREE.CylinderGeometry(rt, rb, h, seg || 16, 1, !!open, ts || 0, tl || Math.PI * 2),
    sph: (r, ws, hs) => new THREE.SphereGeometry(r, ws || 20, hs || 14),
    cap: (r, len, seg) => new THREE.CapsuleGeometry(r, len, 6, seg || 14),
    tor: (r, t, rs, ts, arc) => new THREE.TorusGeometry(r, t, rs || 8, ts || 24, arc || Math.PI * 2),
    ico: (r, d) => new THREE.IcosahedronGeometry(r, d || 1),
  };
  M.G = G;

  // RoundedBoxGeometry maps UVs differently from BoxGeometry; remap so textures
  // land exactly like on a plain box (and text on trains is not mirrored).
  function boxUV(geo, w, h, d) {
    const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
    const seen = new Uint8Array(pos.count);
    for (const gr of geo.groups) {
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        const v = idx ? idx.getX(i) : i;
        if (seen[v]) continue;
        seen[v] = 1;
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
        let u, t;
        switch (gr.materialIndex) {
          case 0: u = (d / 2 - z) / d; t = (y + h / 2) / h; break;
          case 1: u = (z + d / 2) / d; t = (y + h / 2) / h; break;
          case 2: u = (x + w / 2) / w; t = (d / 2 - z) / d; break;
          case 3: u = (x + w / 2) / w; t = (z + d / 2) / d; break;
          case 4: u = (x + w / 2) / w; t = (y + h / 2) / h; break;
          default: u = (w / 2 - x) / w; t = (y + h / 2) / h;
        }
        uv.setXY(v, u, t);
      }
    }
    return geo;
  }

  const P = (geo, mat, pos, rot, scale) => ({ geo, mat, pos, rot, scale });

  // Merge many primitives into one geometry with one group per material.
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
      const flip = m4.determinant() < 0;
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = Array.isArray(p.mat) ? p.mat[gr.materialIndex] : p.mat;
        if (!mat) continue;
        let b = buckets.get(mat);
        if (!b) {
          b = { pos: [], nor: [], uv: [] };
          buckets.set(mat, b);
          order.push(mat);
        }
        const end = Math.min(gr.start + gr.count, pos.count);
        for (let i = gr.start; i < end; i += 3) {
          const tri = flip ? [i, i + 2, i + 1] : [i, i + 1, i + 2];
          for (const k of tri) {
            v.fromBufferAttribute(pos, k).applyMatrix4(m4);
            b.pos.push(v.x, v.y, v.z);
            n.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize();
            b.nor.push(n.x, n.y, n.z);
            if (uv) b.uv.push(uv.getX(k), uv.getY(k));
            else b.uv.push(0, 0);
          }
        }
      }
    }
    const out = new THREE.BufferGeometry();
    const total = order.reduce((a, m) => a + buckets.get(m).pos.length, 0);
    const Pa = new Float32Array(total), Na = new Float32Array(total), Ua = new Float32Array((total / 3) * 2);
    let o3 = 0, o2 = 0, start = 0;
    order.forEach((mat, i) => {
      const b = buckets.get(mat);
      Pa.set(b.pos, o3);
      Na.set(b.nor, o3);
      Ua.set(b.uv, o2);
      o3 += b.pos.length;
      o2 += b.uv.length;
      const count = b.pos.length / 3;
      out.addGroup(start, count, i);
      start += count;
    });
    out.setAttribute('position', new THREE.BufferAttribute(Pa, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(Na, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(Ua, 2));
    out.computeBoundingSphere();
    return { geo: out, mats: order };
  }
  M.merge = merge;

  function bake(parts, shadow) {
    const r = merge(parts);
    const m = new THREE.Mesh(r.geo, r.mats);
    m.castShadow = shadow !== false;
    m.receiveShadow = true;
    return m;
  }
  M.bake = bake;

  const geoCache = {};
  function cached(key, build, shadow) {
    if (!geoCache[key]) geoCache[key] = merge(build());
    const c = geoCache[key];
    const m = new THREE.Mesh(c.geo, c.mats);
    m.castShadow = shadow !== false;
    m.receiveShadow = true;
    return m;
  }

  function starShape(r, inner, points) {
    const s = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
      const rr = i % 2 ? r * inner : r;
      if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    return s;
  }
  function shieldShape(w, h) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, h / 2);
    s.lineTo(w / 2, h / 2);
    s.lineTo(w / 2, 0);
    s.quadraticCurveTo(w / 2, -h * 0.35, 0, -h / 2);
    s.quadraticCurveTo(-w / 2, -h * 0.35, -w / 2, 0);
    s.closePath();
    return s;
  }
  const extrude = (shape, depth, bevel) =>
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 10 });

  /* ======================================================================
   * Photo faces: the photo is projected straight on from the front onto a
   * shell just above the head, so it looks right face-on and wraps
   * naturally around the cheeks.
   * ==================================================================== */
  const faceTex = {};
  function photoFace(key) {
    if (!faceTex[key]) {
      faceTex[key] = new THREE.TextureLoader().load(RD.FACES[key]);
      faceTex[key].encoding = THREE.sRGBEncoding;
      faceTex[key].anisotropy = 8;
    }
    const R = 0.263, hw = 0.255, y1 = 0.21, y0 = -0.26;
    const t0 = Math.acos(y1 / R), t1 = Math.acos(y0 / R);
    const geo = new THREE.SphereGeometry(R, 40, 30, Math.PI * 1.5 - 1.5, 3.0, t0, t1 - t0);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 - pos.getX(i) / (2 * hw), (pos.getY(i) - y0) / (y1 - y0));
    const mat = new THREE.MeshStandardMaterial({
      map: faceTex[key], roughness: 0.75, emissive: 0x383838, emissiveMap: faceTex[key], transparent: true,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    return m;
  }

  /* ======================================================================
   * Characters. All share one skeleton so every animation works for all:
   * root > body(hips) > torso > neck > head, shoulders > elbow > wrist,
   * hips > knee > ankle.
   * ==================================================================== */
  M.RUNNERS = {
    friend: {
      label: 'FRIEND', skin: '#b97855', skinDark: '#a5664a', face: 'photo', faceKey: 'friend', headScale: [0.95, 1.12, 0.97],
      hair: '#161217', hairHi: '#2a2230', hairStyle: 'messy', outfit: 'tee',
      top: '#2b2c34', topDark: '#1c1d23', pants: '#3b4a66', pantsDark: '#2f3b52', shoe: '#f2f2f2', shoeAccent: '#3a3b44', watch: true,
    },
    kai: {
      label: 'KAI', skin: '#e3a574', skinDark: '#d18d5c', face: 'smile', hair: '#3d2a6b', hairHi: '#4b3580', hairStyle: 'spiky',
      outfit: 'hoodie', top: '#ff7b1c', topDark: '#e0620c', pants: '#2f5597', pantsDark: '#264780', shoe: '#ffffff', shoeAccent: '#ff3b5c',
      backpack: true, headphones: true, headband: '#20d0f0',
    },
  };
  M.COP = {
    label: 'COP', skin: '#9c7663', skinDark: '#86624f', face: 'photo', faceKey: 'cop', headScale: [1.0, 1.08, 0.98],
    hair: '#141216', hairHi: '#221d24', hairStyle: 'short', outfit: 'police', build: 1.12,
    top: '#1d2a47', topDark: '#131b31', shirt: '#bcd2ec', pants: '#1a2340', pantsDark: '#121930', shoe: '#141414', shoeAccent: '#1f1f1f',
  };

  M.makeRunner = (styleId) => buildHumanoid(M.RUNNERS[styleId] || M.RUNNERS.friend);
  M.makeCop = () => buildHumanoid(M.COP);

  function buildHumanoid(col) {
    const b = col.build || 1;
    const police = col.outfit === 'police';
    const skin = std(col.skin, { r: 0.62 }), skinD = std(col.skinDark, { r: 0.62 });
    const top = std(col.top, { r: police ? 0.55 : 0.85 }), topD = std(col.topDark, { r: 0.85 });
    const pants = std(col.pants, { r: 0.82 }), pantsD = std(col.pantsDark, { r: 0.85 });
    const shoe = std(col.shoe, { r: police ? 0.25 : 0.55, m: police ? 0.1 : 0 }), shoeA = std(col.shoeAccent, { r: 0.55 });
    const white = std('#f4f4f4', { r: 0.6 }), sole = std(police ? '#1a1a1a' : '#ececec', { r: 0.7 });
    const gold = std('#e6b84a', { m: 1, r: 0.3 }), silver = std('#d0d4da', { m: 1, r: 0.25 }), black = std('#161616', { r: 0.5 });
    const hairM = std(col.hair, { r: 0.55 }), hairH = std(col.hairHi, { r: 0.5 });

    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = C.HIP_Y;
    root.add(body);

    // hips / shorts
    const hip = [
      P(G.cyl(0.2 * b, 0.19 * b, 0.22, 22), pants, [0, 0, 0], null, [1, 1, 0.82]),
      P(G.sph(0.19 * b, 22, 12), pants, [0, -0.1, 0], null, [1.05, 0.6, 0.82]),
      P(G.cyl(0.207 * b, 0.207 * b, 0.05, 22), police ? black : std('#2a1f18', { r: 0.45 }), [0, 0.09, 0], null, [1, 1, 0.83]),
      P(G.rbox(0.075, 0.055, 0.025, 0.01), silver, [0, 0.09, -0.172 * b]),
    ];
    if (!police) {
      for (const s of [-1, 1]) {
        hip.push(P(G.rbox(0.1, 0.1, 0.02, 0.012), pantsD, [s * 0.085 * b, -0.02, 0.163 * b], [0.1, 0, 0]));
        hip.push(P(G.box(0.02, 0.06, 0.02), std('#2a1f18', { r: 0.5 }), [s * 0.15 * b, 0.09, 0.12 * b]));
      }
    } else {
      hip.push(P(G.rbox(0.07, 0.12, 0.05, 0.015), black, [0.2 * b, 0.04, 0.03])); // radio
      hip.push(P(G.cyl(0.008, 0.008, 0.12, 6), black, [0.215 * b, 0.15, 0.03]));
      hip.push(P(G.rbox(0.08, 0.065, 0.045, 0.012), black, [-0.2 * b, 0.06, 0.05])); // cuff pouch
      hip.push(P(G.rbox(0.05, 0.1, 0.04, 0.012), black, [-0.12 * b, 0.05, 0.15 * b])); // torch
    }
    body.add(bake(hip));

    // torso: a smooth lathed chest
    const torso = new THREE.Group();
    torso.position.y = 0.1;
    body.add(torso);
    const prof = [[0.001, 0], [0.19, 0], [0.207, 0.06], [0.226, 0.18], [0.246, 0.3], [0.251, 0.38], [0.236, 0.45], [0.19, 0.51], [0.11, 0.55], [0.07, 0.57], [0.001, 0.575]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const chestZ = 0.8 * b;
    const front = (y) => -(0.25 * chestZ + 0.008) + Math.max(0, y - 0.4) * 0.3;
    const tp = [P(new THREE.LatheGeometry(prof, 28), top, [0, -0.02, 0], null, [1.12 * b, 1, chestZ])];
    if (col.outfit === 'tee') {
      tp.push(P(G.tor(0.105, 0.024, 8, 24), topD, [0, 0.548, 0.005], [Math.PI / 2, 0, 0]));
      tp.push(P(G.cyl(0.272 * b, 0.266 * b, 0.05, 24), topD, [0, 0.0, 0], null, [1.12, 1, chestZ]));
    } else if (col.outfit === 'hoodie') {
      tp.push(P(G.rbox(0.36, 0.14, 0.05, 0.03), topD, [0, 0.13, front(0.13) + 0.005]));
      tp.push(P(G.sph(0.2, 18, 12), topD, [0, 0.53, 0.14], null, [1.15, 0.62, 0.8]));
      tp.push(P(G.cyl(0.272 * b, 0.266 * b, 0.06, 24), topD, [0, 0.0, 0], null, [1.12, 1, chestZ]));
      for (const s of [-1, 1]) {
        tp.push(P(G.cyl(0.008, 0.008, 0.2, 6), white, [s * 0.06, 0.42, front(0.42) - 0.01], [0.1, 0, 0]));
        tp.push(P(G.cyl(0.013, 0.013, 0.03, 8), silver, [s * 0.06, 0.315, front(0.32) - 0.01]));
      }
    } else if (police) {
      // shirt collar, tie, badge, pockets, buttons
      for (const s of [-1, 1]) {
        tp.push(P(G.box(0.1, 0.07, 0.02), std(col.shirt, { r: 0.7 }), [s * 0.05, 0.525, -0.1], [0.5, 0, s * 0.6]));
        tp.push(P(G.rbox(0.1, 0.035, 0.025, 0.01), topD, [s * 0.1, 0.39, front(0.39) - 0.004]));
        tp.push(P(G.rbox(0.095, 0.09, 0.012, 0.01), top, [s * 0.1, 0.33, front(0.33) - 0.002]));
      }
      tp.push(P(G.box(0.07, 0.05, 0.02), std(col.shirt, { r: 0.7 }), [0, 0.52, -0.13], [0.35, 0, 0]));
      tp.push(P(G.rbox(0.045, 0.045, 0.03, 0.01), topD, [0, 0.5, -0.15]));
      tp.push(P(G.rbox(0.05, 0.2, 0.012, 0.01), topD, [0, 0.38, front(0.38) - 0.01], [0.05, 0, 0]));
      tp.push(P(extrude(shieldShape(0.075, 0.09), 0.01, 0.004), gold, [-0.1, 0.42, front(0.42) - 0.012], [0, Math.PI, 0]));
      tp.push(P(G.rbox(0.07, 0.018, 0.01, 0.004), silver, [0.1, 0.43, front(0.43) - 0.008]));
      for (let k = 0; k < 4; k++) tp.push(P(G.sph(0.011, 8, 6), gold, [0, 0.12 + k * 0.08, front(0.12 + k * 0.08) - 0.006]));
      tp.push(P(G.cyl(0.272 * b, 0.266 * b, 0.05, 24), topD, [0, 0.0, 0], null, [1.12, 1, chestZ]));
    }
    torso.add(bake(tp));

    // backpack
    const pack = new THREE.Group();
    pack.position.set(0, 0.33, 0.26);
    if (col.backpack) {
      torso.add(pack);
      const green = std('#22b573', { r: 0.8 }), dgreen = std('#1a8a57', { r: 0.8 });
      pack.add(
        bake([
          P(G.rbox(0.4, 0.46, 0.2, 0.06), green),
          P(G.rbox(0.3, 0.17, 0.07, 0.03), dgreen, [0, -0.1, 0.11]),
          P(G.box(0.26, 0.012, 0.012), std('#ffd23f', { r: 0.5 }), [0, -0.02, 0.145]),
          P(G.tor(0.05, 0.012, 6, 16, Math.PI), std('#333333', { r: 0.5 }), [0, 0.25, 0]),
          P(G.cyl(0.055, 0.055, 0.22, 14), std('#ff3b5c', { m: 0.5, r: 0.35 }), [0.25, 0.02, 0]),
          P(G.cyl(0.035, 0.045, 0.05, 10), white, [0.25, 0.15, 0]),
        ])
      );
      for (const s of [-1, 1]) torso.add(bake([P(G.rbox(0.06, 0.42, 0.04, 0.015), dgreen, [s * 0.14, 0.34, front(0.34) - 0.005], [0.05, 0, 0])]));
    }

    // neck & head
    const neck = new THREE.Group();
    neck.position.y = 0.6;
    torso.add(neck);
    const np = [P(G.cyl(0.07, 0.08, 0.15, 16), skin, [0, 0.02, 0])];
    if (col.headphones) {
      np.push(P(G.tor(0.16, 0.035, 10, 24), std('#20d0f0', { r: 0.35 }), [0, -0.02, 0.02], [Math.PI / 2 + 0.25, 0, 0]));
      for (const s of [-1, 1]) np.push(P(G.cyl(0.075, 0.075, 0.07, 16), std('#1b1b2f', { r: 0.4 }), [s * 0.16, -0.02, -0.03], [0, 0, Math.PI / 2]));
    }
    neck.add(bake(np));

    const head = new THREE.Group();
    head.position.y = 0.27;
    if (col.headScale) head.scale.set(...col.headScale);
    neck.add(head);
    const hp = [P(G.sph(0.26, 36, 26), skin)];
    for (const s of [-1, 1]) {
      hp.push(P(G.sph(0.06, 14, 10), skin, [s * 0.255, -0.01, 0.01], null, [0.55, 1, 0.8]));
      hp.push(P(G.sph(0.03, 10, 8), skinD, [s * 0.275, -0.01, 0.005], null, [0.4, 1, 0.8]));
    }
    if (col.face === 'smile') {
      for (const s of [-1, 1]) {
        hp.push(P(G.sph(0.066, 16, 12), std('#ffffff', { r: 0.2 }), [s * 0.095, 0.02, -0.215], null, [1, 1.28, 0.6]));
        hp.push(P(G.sph(0.04, 14, 10), std('#5a3a1e', { r: 0.2 }), [s * 0.093, 0.012, -0.244], null, [1, 1.1, 0.6]));
        hp.push(P(G.sph(0.022, 10, 8), std('#0d0a12', { r: 0.1 }), [s * 0.093, 0.012, -0.262]));
        hp.push(P(G.sph(0.011, 6, 6), std('#ffffff', { e: '#ffffff', ei: 0.6 }), [s * 0.093 + 0.012, 0.03, -0.276]));
        hp.push(P(G.rbox(0.1, 0.028, 0.03, 0.012), hairM, [s * 0.1, 0.125, -0.225], [0, 0, s * -0.18]));
      }
      hp.push(P(G.sph(0.036, 12, 10), skinD, [0, -0.03, -0.26]));
      hp.push(P(G.tor(0.055, 0.013, 8, 16, Math.PI), std('#5a1d1d', { r: 0.5 }), [0, -0.085, -0.235], [0, 0, Math.PI]));
    }
    head.add(bake(hp));
    if (col.face === 'photo') head.add(photoFace(col.faceKey));

    // hair on its own pivot so it can bounce
    const hair = new THREE.Group();
    hair.position.y = 0.05;
    head.add(hair);
    const hr = [];
    const hy = -0.05; // hair parts are authored in head space
    if (col.hairStyle === 'spiky') {
      hr.push(P(new THREE.SphereGeometry(0.28, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM, [0, 0.02 + hy, 0.025], [-0.35, 0, 0]));
      const spikes = [
        [0, 0.26, -0.08, -0.5, 0], [0.13, 0.22, -0.02, -0.7, -0.5], [-0.13, 0.22, -0.02, -0.7, 0.5],
        [0, 0.24, 0.1, -1.2, 0], [0.16, 0.15, 0.12, -1.5, -0.6], [-0.16, 0.15, 0.12, -1.5, 0.6],
        [0, 0.12, 0.22, -2.0, 0], [0.09, 0.28, 0.02, -0.9, -0.2], [-0.09, 0.28, 0.02, -0.9, 0.2],
      ];
      for (const [x, y, z, rx, rz] of spikes) hr.push(P(new THREE.ConeGeometry(0.075, 0.26, 8), hairM, [x, y + hy, z], [rx, 0, rz]));
      if (col.headband) hr.push(P(G.tor(0.262, 0.028, 8, 28), std(col.headband, { r: 0.4 }), [0, 0.1 + hy, 0], [Math.PI / 2 - 0.3, 0, 0]));
    } else if (col.hairStyle === 'messy') {
      let seed = 11;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      hr.push(P(new THREE.SphereGeometry(0.285, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, [0, 0.03 + hy, 0.02], [0.52, 0, 0]));
      const dir = new THREE.Vector3();
      for (let ring = 0; ring < 7; ring++) {
        const theta = 0.12 + ring * 0.26;
        const count = Math.max(5, Math.round(Math.sin(theta) * 18));
        for (let k = 0; k < count; k++) {
          const phi = (k / count) * Math.PI * 2 + rand() * 0.4 + ring * 0.3;
          dir.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
          const fr = -dir.z;
          if (theta > 0.5 && fr > 0.3) continue;
          if (theta > 1.2 && fr > -0.35) continue;
          const r = 0.08 + rand() * 0.04, d = 0.245 + rand() * 0.025;
          hr.push(P(G.sph(r, 12, 9), rand() < 0.3 ? hairH : hairM, [dir.x * d, dir.y * d + 0.02 + hy, dir.z * d], [rand(), rand(), 0], [1, 0.8 + rand() * 0.35, 1]));
        }
      }
      for (let k = 0; k < 10; k++) {
        const a = rand() * Math.PI * 2;
        hr.push(P(new THREE.ConeGeometry(0.03, 0.12, 6), hairM, [Math.cos(a) * 0.2, 0.2 + rand() * 0.08 + hy, Math.sin(a) * 0.2 + 0.03], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]));
      }
      for (const s of [-1, 1]) hr.push(P(G.rbox(0.03, 0.1, 0.05, 0.012), hairM, [s * 0.245, 0.02 + hy, -0.07], [0, 0, s * 0.1]));
    } else if (col.hairStyle === 'short') {
      hr.push(P(new THREE.SphereGeometry(0.268, 24, 12, Math.PI * 0.1, Math.PI * 1.8, Math.PI * 0.18, Math.PI * 0.42), hairM, [0, 0.01 + hy, 0.012], [0.25, 0, 0]));
    }
    if (hr.length) hair.add(bake(hr));

    // police peaked cap
    if (police) {
      const navy = std('#18223d', { r: 0.6 }), band = std('#111111', { r: 0.4 });
      hair.add(
        bake([
          P(G.cyl(0.3, 0.272, 0.13, 32), navy, [0, 0.215 + hy, 0.01], [-0.12, 0, 0]),
          P(G.cyl(0.318, 0.305, 0.035, 32), navy, [0, 0.29 + hy, 0.02], [-0.12, 0, 0]),
          P(G.cyl(0.276, 0.276, 0.07, 32), band, [0, 0.16 + hy, 0], [-0.12, 0, 0]),
          P(G.tor(0.278, 0.008, 6, 32, Math.PI), gold, [0, 0.13 + hy, -0.02], [Math.PI / 2 - 0.12, 0, Math.PI]),
          P(G.cyl(0.235, 0.235, 0.018, 28, false, Math.PI / 2, Math.PI), std('#0b0b0b', { r: 0.15, m: 0.2 }), [0, 0.12 + hy, -0.2], [-0.32, 0, 0], [1, 1, 0.75]),
          P(extrude(starShape(0.055, 0.45, 6), 0.012, 0.004), gold, [0, 0.22 + hy, -0.29], [-0.12, Math.PI, 0]),
        ])
      );
    }

    // arms
    const short = col.outfit === 'tee';
    const sleeve = top;
    function arm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.3 * b, 0.465, 0);
      torso.add(shoulder);
      const up = [P(G.sph(0.094 * b, 18, 12), sleeve)];
      if (short) {
        up.push(P(G.cyl(0.1 * b, 0.092 * b, 0.16, 18), sleeve, [0, -0.07, 0]));
        up.push(P(G.cyl(0.071, 0.063, 0.27, 16), skin, [0, -0.16, 0]));
      } else {
        up.push(P(G.cyl(0.084 * b, 0.071 * b, 0.3, 16), sleeve, [0, -0.15, 0]));
      }
      if (police) {
        up.push(P(G.rbox(0.14, 0.025, 0.1, 0.01), topD, [side * 0.02, 0.088, 0]));
        up.push(P(G.box(0.02, 0.028, 0.1), gold, [side * 0.07, 0.088, 0]));
        up.push(P(G.rbox(0.07, 0.08, 0.012, 0.02), std('#c8a44a', { r: 0.5 }), [side * 0.085, -0.08, 0], [0, (side * Math.PI) / 2, 0]));
      }
      shoulder.add(bake(up));
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const lo = [
        P(G.sph(short ? 0.064 : 0.07 * b, 14, 10), short ? skin : sleeve),
        P(G.cyl(short ? 0.064 : 0.07 * b, short ? 0.05 : 0.058 * b, 0.25, 16), short ? skin : sleeve, [0, -0.125, 0]),
      ];
      if (!short) lo.push(P(G.cyl(0.06 * b, 0.061 * b, 0.045, 16), police ? std(col.shirt, { r: 0.7 }) : topD, [0, -0.24, 0]));
      if (col.watch && side < 0) {
        lo.push(P(G.cyl(0.055, 0.055, 0.03, 18), black, [0, -0.215, 0]));
        lo.push(P(G.cyl(0.028, 0.028, 0.014, 18), silver, [0, -0.215, -0.052], [Math.PI / 2, 0, 0]));
      }
      elbow.add(bake(lo));
      const wrist = new THREE.Group();
      wrist.position.y = -0.26;
      elbow.add(wrist);
      wrist.add(
        bake([
          P(G.rbox(0.05, 0.1, 0.085, 0.022), skin, [0, -0.05, 0]),
          P(G.rbox(0.045, 0.075, 0.08, 0.02), skin, [0, -0.115, 0.008], [0.35, 0, 0]),
          P(G.cap(0.017, 0.045, 8), skin, [side * -0.012, -0.05, -0.045], [0.6, 0, side * -0.3]),
        ])
      );
      return { shoulder, elbow, wrist };
    }

    function leg(side) {
      const hipJ = new THREE.Group();
      hipJ.position.set(side * 0.115 * b, -0.03, 0);
      body.add(hipJ);
      const th = [P(G.sph(0.105 * b, 16, 12), pants), P(G.cyl(0.105 * b, 0.082, 0.44, 18), pants, [0, -0.21, 0])];
      if (police) th.push(P(G.box(0.014, 0.44, 0.03), std('#c8a44a', { r: 0.5 }), [side * 0.092 * b, -0.21, 0], [0, 0, side * -0.045]));
      hipJ.add(bake(th));
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hipJ.add(knee);
      const sh = [P(G.sph(0.084, 14, 10), pants), P(G.cyl(0.082, 0.066, 0.4, 18), pants, [0, -0.2, 0])];
      if (!police) sh.push(P(G.cyl(0.073, 0.075, 0.05, 18), pantsD, [0, -0.375, 0]));
      if (police) sh.push(P(G.box(0.014, 0.4, 0.03), std('#c8a44a', { r: 0.5 }), [side * 0.075, -0.2, 0], [0, 0, side * 0.04]));
      knee.add(bake(sh));
      const ankle = new THREE.Group();
      ankle.position.y = -0.42;
      knee.add(ankle);
      const sp = [
        P(G.rbox(0.13, 0.045, 0.31, 0.02), sole, [0, -0.085, -0.055]),
        P(G.rbox(0.118, 0.1, 0.25, 0.045), shoe, [0, -0.025, -0.035]),
        P(G.sph(0.062, 16, 10), shoe, [0, -0.045, -0.15], null, [1, 0.75, 1.15]),
        P(G.rbox(0.05, 0.065, 0.02, 0.008), shoeA, [0, 0.02, 0.087]),
      ];
      if (!police) {
        sp.push(P(G.cyl(0.058, 0.06, 0.06, 14), white, [0, 0.02, 0]));
        sp.push(P(G.rbox(0.124, 0.032, 0.15, 0.012), shoeA, [0, -0.035, -0.03], [0.22, 0, 0]));
        for (let k = 0; k < 3; k++) sp.push(P(G.box(0.075, 0.012, 0.014), white, [0, 0.022 - k * 0.013, -0.07 - k * 0.035], [0.35, 0, 0]));
      }
      ankle.add(bake(sp));
      return { hip: hipJ, knee, ankle };
    }

    const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

    // whistle (police) held in the right hand when blowing it
    let whistle = null;
    if (police) {
      whistle = bake([P(G.rbox(0.07, 0.03, 0.03, 0.012), silver, [0, 0, 0]), P(G.cyl(0.018, 0.018, 0.03, 10), silver, [0.03, 0, 0.005], [Math.PI / 2, 0, 0])]);
      whistle.position.set(0, -0.14, -0.04);
      whistle.visible = false;
      armR.wrist.add(whistle);
    }

    // hoverboard
    const board = new THREE.Group();
    board.visible = false;
    root.add(board);
    const deckTop = std('#ffffff', { map: RD.tex.board(), r: 0.35, m: 0.2 });
    const deckSide = std('#2b1d4d', { r: 0.4, m: 0.3 });
    const bshape = new THREE.Shape();
    bshape.absarc(0, 0.45, 0.28, 0, Math.PI, false);
    bshape.absarc(0, -0.45, 0.28, Math.PI, Math.PI * 2, false);
    bshape.closePath();
    const deckGeo = new THREE.ExtrudeGeometry(bshape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 16 });
    deckGeo.rotateX(Math.PI / 2);
    const duv = deckGeo.attributes.uv, dpos = deckGeo.attributes.position;
    for (let i = 0; i < duv.count; i++) duv.setXY(i, dpos.getX(i) / 0.62 + 0.5, -dpos.getZ(i) / 1.3 + 0.5);
    const hub = std('#3a3f4a', { m: 0.8, r: 0.3 }), thr = std('#00f0ff', { e: '#00e5ff', ei: 2.5 });
    board.add(
      bake([
        P(deckGeo, [deckTop, deckSide], [0, 0.03, 0]),
        P(G.rbox(0.3, 0.05, 0.22, 0.02), hub, [0, -0.035, 0.45]),
        P(G.rbox(0.3, 0.05, 0.22, 0.02), hub, [0, -0.035, -0.45]),
        P(G.cyl(0.08, 0.1, 0.04, 20), thr, [0, -0.07, 0.45]),
        P(G.cyl(0.08, 0.1, 0.04, 20), thr, [0, -0.07, -0.45]),
      ])
    );
    const boardGlow = glowSprite(0x00f0ff, 1, 0.8);
    boardGlow.scale.set(1.5, 0.55, 1);
    boardGlow.position.y = -0.14;
    board.add(boardGlow);

    // jetpack
    const jet = new THREE.Group();
    jet.visible = false;
    jet.position.set(0, 0.32, 0.4);
    torso.add(jet);
    const flames = [];
    const jp = [];
    for (const s of [-1, 1]) {
      jp.push(P(G.cap(0.11, 0.3, 16), std('#cfd6de', { m: 0.9, r: 0.25 }), [s * 0.13, 0, 0]));
      jp.push(P(new THREE.ConeGeometry(0.112, 0.16, 16), std('#ff3344', { r: 0.35, m: 0.3 }), [s * 0.13, 0.3, 0]));
      jp.push(P(G.cyl(0.06, 0.095, 0.1, 14), std('#3d414b', { m: 0.8, r: 0.35 }), [s * 0.13, -0.27, 0]));
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.55, 12), basic('#ffb020', { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      f.rotation.x = Math.PI;
      f.position.set(s * 0.13, -0.58, 0);
      jet.add(f);
      const core = glowSprite(0xff9a2a, 0.6, 0.9);
      core.position.set(s * 0.13, -0.42, 0);
      jet.add(core);
      flames.push(f);
    }
    jp.push(P(G.rbox(0.14, 0.32, 0.12, 0.03), std('#6c5ce7', { r: 0.4 }), [0, 0, -0.05]));
    jet.add(bake(jp));

    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 1;

    return { root, body, torso, neck, head, hair, armL, armR, legL, legR, board, boardGlow, jet, flames, blob, pack, whistle };
  }

  /* ======================================================================
   * Trains
   * ==================================================================== */
  M.trainLength = (cars) => cars * C.CAR_L + (cars - 1) * C.CAR_GAP;
  const BODY_Y0 = 0.72, BODY_TOP = 3.2, BODY_H = BODY_TOP - BODY_Y0;

  function trainWindows() {
    const W = 1024, H = 256, doors = [W * 0.2, W * 0.8], doorW = 118, out = [];
    for (const dx of doors) {
      out.push([dx - doorW / 2 + 12, H * 0.22, doorW / 2 - 22, H * 0.34]);
      out.push([dx + 10, H * 0.22, doorW / 2 - 22, H * 0.34]);
    }
    for (let x = 20; x < W - 60; x += 96) {
      if (doors.some((d) => x + 76 > d - doorW / 2 - 10 && x < d + doorW / 2 + 10)) continue;
      out.push([x, H * 0.2, 74, H * 0.36]);
    }
    return out;
  }

  M.makeTrain = function (cars, scheme, variant, moving) {
    const key = ['train', cars, scheme.id, variant, moving ? 1 : 0].join('_');
    const W = C.TRAIN_W, L = C.CAR_L;
    const m = cached(key, () => {
      const parts = [];
      const roof = std(scheme.roof, { r: 0.45, m: 0.5 });
      const under = std('#26272c', { r: 0.8 });
      const metal = std('#4a4d55', { m: 0.8, r: 0.4 });
      const steel = std('#9aa1aa', { m: 0.9, r: 0.3 });
      const glass = std('#0e1822', { r: 0.06, m: 0.6, env: 1.8 });
      const endMat = std('#ffffff', { map: RD.tex.trainEnd(scheme), r: 0.45, m: 0.25 });
      const frontMat = std('#ffffff', { map: RD.tex.trainFront(scheme, moving), r: 0.45, m: 0.25 });
      const headL = std('#fff8e0', { e: '#fff1c0', ei: moving ? 4 : 0.8, r: 0.2 });
      const tailL = std('#ff3322', { e: '#ff2211', ei: 1.6, r: 0.3 });
      const marker = std('#ffaa22', { e: '#ff9900', ei: 1.2 });
      const ledTex = RD.tex.ledText(moving ? 'EXPRESS' : ['CITY', 'LINE 7', 'LOOP 3', 'METRO'][scheme.id % 4], '#ffb31f');
      const led = std('#ffffff', { map: ledTex, emissiveMap: ledTex, e: '#ffffff', ei: 1.4 });
      const wins = trainWindows();
      const total = M.trainLength(cars);
      for (let i = 0; i < cars; i++) {
        const z0 = -i * (L + C.CAR_GAP);
        const zc = z0 - L / 2;
        const v = (variant + i) % RD.tex.TRAIN_VARIANTS;
        const side = std('#ffffff', { map: RD.tex.trainSide(scheme, v), r: 0.42, m: 0.25 });
        const fr = i === 0 ? frontMat : endMat;
        const bk = i === cars - 1 ? frontMat : endMat;
        parts.push(P(G.rbox(W, BODY_H, L, 0.09, 3), [side, side, roof, under, fr, bk], [0, BODY_Y0 + BODY_H / 2, zc]));
        parts.push(P(G.cyl(1, 1, L - 0.3, 20, false, -Math.PI / 2, Math.PI), roof, [0, BODY_TOP - 0.02, zc], [-Math.PI / 2, 0, 0], [W / 2 - 0.06, 1, 0.12]));
        // glass panes over the painted windows, both sides
        for (const [cx, cy, cw, ch] of wins) {
          const ww = (cw / 1024) * L * 0.9, wh = (ch / 256) * BODY_H * 0.88;
          const y = BODY_TOP - ((cy + ch / 2) / 256) * BODY_H;
          const u = (cx + cw / 2) / 1024;
          parts.push(P(G.box(0.012, wh, ww), glass, [W / 2 + 0.004, y, zc + L / 2 - u * L]));
          parts.push(P(G.box(0.012, wh, ww), glass, [-W / 2 - 0.004, y, zc - L / 2 + u * L]));
        }
        // roof equipment
        for (const dz of [-2.4, 2.4]) {
          parts.push(P(G.rbox(1.15, 0.2, 1.9, 0.05), std('#b8bec6', { r: 0.5, m: 0.4 }), [0, BODY_TOP + 0.08, zc + dz]));
          parts.push(P(G.box(0.9, 0.02, 1.5), std('#ffffff', { map: RD.tex.grille(), r: 0.6, m: 0.4 }), [0, BODY_TOP + 0.19, zc + dz]));
        }
        if (i === 0 && cars > 1) {
          const pz = zc - 0.4;
          parts.push(P(G.box(0.9, 0.08, 0.9), metal, [0, BODY_TOP + 0.12, pz]));
          parts.push(P(G.box(0.05, 0.05, 1.0), steel, [0, BODY_TOP + 0.38, pz - 0.2], [0.55, 0, 0]));
          parts.push(P(G.box(0.05, 0.05, 0.9), steel, [0, BODY_TOP + 0.62, pz - 0.15], [-0.6, 0, 0]));
          parts.push(P(G.box(1.2, 0.04, 0.08), steel, [0, BODY_TOP + 0.8, pz - 0.05]));
        }
        // side marker lights
        for (const sx of [-1, 1]) for (const ez of [z0 - 0.35, z0 - L + 0.35]) parts.push(P(G.box(0.02, 0.07, 0.12), marker, [sx * (W / 2 + 0.01), BODY_Y0 + 0.25, ez]));
        // undercarriage
        parts.push(P(G.box(W - 0.5, 0.2, L - 2.4), under, [0, 0.62, zc]));
        [-2.2, 0.6, 2.9].forEach((ez, k) => parts.push(P(G.rbox(1.3, 0.28, 1.2 + k * 0.3, 0.04), metal, [0, 0.48, zc + ez])));
        for (const bz of [zc + L / 2 - 1.8, zc - L / 2 + 1.8]) {
          parts.push(P(G.rbox(1.95, 0.2, 2.3, 0.05), under, [0, 0.52, bz]));
          for (const sx of [-1, 1]) parts.push(P(G.box(0.12, 0.26, 2.0), metal, [sx * 0.86, 0.5, bz]));
          for (const wz of [bz - 0.65, bz + 0.65]) {
            parts.push(P(G.cyl(0.05, 0.05, 1.6, 10), steel, [0, 0.55, wz], [0, 0, Math.PI / 2]));
            for (const sx of [-1, 1]) {
              parts.push(P(G.cyl(0.26, 0.26, 0.1, 22), metal, [sx * 0.72, 0.55, wz], [0, 0, Math.PI / 2]));
              parts.push(P(G.cyl(0.12, 0.12, 0.12, 14), steel, [sx * 0.72, 0.55, wz], [0, 0, Math.PI / 2]));
            }
          }
        }
        if (i > 0) {
          for (let k = 0; k < 4; k++) parts.push(P(G.rbox(1.5, 2.25, 0.07, 0.03), std('#1e1e22', { r: 0.9 }), [0, BODY_Y0 + 1.3, z0 + 0.05 + k * 0.085]));
        }
      }
      // cab ends: windshield glass, lights, LED sign, bumper
      const cab = (zf, dir, rear) => {
        const wy = BODY_TOP - 0.367 * BODY_H;
        parts.push(P(G.box(W * 0.8, 0.328 * BODY_H, 0.012), glass, [0, wy, zf + dir * 0.006]));
        for (const sx of [-1, 1]) {
          parts.push(P(G.cyl(0.11, 0.11, 0.035, 22), rear ? tailL : headL, [sx * 0.72, BODY_TOP - 0.836 * BODY_H, zf + dir * 0.018], [Math.PI / 2, 0, 0]));
          parts.push(P(G.box(0.012, 0.25, 0.012), std('#111111', { r: 0.4 }), [sx * 0.35, wy - 0.1, zf + dir * 0.014], [0, 0, sx * 0.5]));
        }
        parts.push(P(G.box(1.2, 0.22, 0.012), led, [0, BODY_TOP - 0.09 * BODY_H, zf + dir * 0.008], [0, dir < 0 ? Math.PI : 0, 0]));
        parts.push(P(G.rbox(W - 0.25, 0.22, 0.2, 0.05), under, [0, BODY_Y0 + 0.12, zf + dir * 0.09]));
        parts.push(P(G.box(W - 0.45, 0.28, 0.08), metal, [0, 0.5, zf + dir * 0.12]));
        parts.push(P(G.cyl(0.07, 0.07, 0.3, 10), steel, [0, 0.66, zf + dir * 0.25], [Math.PI / 2, 0, 0]));
      };
      cab(0, 1, false);
      cab(-total, -1, true);
      return parts;
    });
    const g = new THREE.Group();
    g.add(m);
    if (moving) {
      for (const x of [-0.72, 0.72]) {
        const s = glowSprite(0xfff1a8, 2.2, 1);
        s.position.set(x, BODY_TOP - 0.836 * BODY_H, 0.35);
        g.add(s);
      }
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      for (const x of [-0.72, 0.72]) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 9, 16, 1, true), beamMat);
        beam.rotation.x = -Math.PI / 2;
        beam.position.set(x, 0.9, 4.6);
        g.add(beam);
      }
    }
    return g;
  };

  /* ---------- ramp up onto a train ---------- */
  M.makeRamp = function () {
    return cached('ramp', () => {
      const L = C.RAMP_L, H = C.TRAIN_H, W = C.TRAIN_W / 2;
      const p = [];
      const quad = (a, b, c, d) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
      quad([-W, 0.02, 0], [W, 0.02, 0], [W, H, -L], [-W, H, -L]);
      p.push(W, 0, 0, W, 0, -L, W, H, -L);
      p.push(-W, 0, 0, -W, H, -L, -W, 0, -L);
      const slope = new THREE.BufferGeometry();
      slope.setAttribute('position', new THREE.Float32BufferAttribute(p.slice(0, 18), 3));
      slope.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 4, 0, 0, 1, 4, 0, 4], 2));
      slope.computeVertexNormals();
      const sides = new THREE.BufferGeometry();
      sides.setAttribute('position', new THREE.Float32BufferAttribute(p.slice(18), 3));
      sides.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
      sides.computeVertexNormals();
      const plate = std('#ffffff', { map: RD.tex.rampPlate(), r: 0.35, m: 0.7 });
      const frame = std('#55606c', { r: 0.4, m: 0.7 });
      const leg = std('#40454d', { m: 0.8, r: 0.35 });
      const parts = [P(slope, plate), P(sides, frame)];
      const ang = Math.atan2(H, L), len = Math.hypot(H, L);
      for (const sx of [-1, 1]) parts.push(P(G.box(0.1, 0.12, len), std('#ffcc00', { r: 0.4 }), [sx * (W - 0.02), H / 2 + 0.06, -L / 2], [ang, 0, 0]));
      for (const z of [-L * 0.3, -L * 0.55, -L * 0.8]) {
        const h = (-z / L) * H;
        for (const x of [-W + 0.18, W - 0.18]) parts.push(P(G.cyl(0.06, 0.07, h, 10), leg, [x, h / 2, z]));
        parts.push(P(G.box(W * 2 - 0.3, 0.08, 0.08), leg, [0, h * 0.5, z]));
      }
      return parts;
    });
  };

  /* ---------- barriers ---------- */
  M.makeHurdle = function () {
    return cached('hurdle', () => {
      const stripe = std('#ffffff', { map: RD.tex.stripes('#e8302e', '#ffffff', 'rw'), r: 0.35 });
      const white = std('#f2f2f2', { r: 0.4 }), dark = std('#3a3a40', { r: 0.6 }), lamp = std('#ffa020', { e: '#ff8800', ei: 2.2 });
      const parts = [];
      for (const x of [-1.0, 1.0]) {
        parts.push(P(G.cyl(0.055, 0.06, 1.05, 12), white, [x, 0.52, 0]));
        parts.push(P(G.rbox(0.22, 0.08, 0.7, 0.03), dark, [x, 0.04, 0]));
        parts.push(P(G.sph(0.07, 12, 10), lamp, [x, 1.1, 0]));
      }
      parts.push(P(G.rbox(2.2, 0.42, 0.1, 0.035), stripe, [0, 0.8, 0]));
      parts.push(P(G.rbox(2.1, 0.08, 0.08, 0.03), white, [0, 0.35, 0]));
      return parts;
    });
  };

  M.makeOverhead = function () {
    const g = new THREE.Group();
    g.add(
      cached('overhead', () => {
        const sign = std('#ffffff', { map: RD.tex.rollSign(), r: 0.4 });
        const post = std('#e6e6e6', { r: 0.4, m: 0.3 }), dark = std('#3a3a40', { r: 0.6 }), yel = std('#ffcc00', { r: 0.4 });
        const red = std('#ff3322', { e: '#ff2200', ei: 2.5 });
        const parts = [];
        for (const x of [-1.15, 1.15]) {
          parts.push(P(G.cyl(0.07, 0.08, 3.3, 12), post, [x, 1.65, 0]));
          parts.push(P(G.rbox(0.45, 0.1, 0.55, 0.03), dark, [x, 0.05, 0]));
          parts.push(P(G.sph(0.08, 12, 10), red, [x, 3.48, 0]));
        }
        parts.push(P(G.rbox(2.5, 0.16, 0.16, 0.04), yel, [0, 3.3, 0]));
        for (const x of [-0.6, 0.6]) parts.push(P(G.box(0.05, 0.7, 0.05), post, [x, 2.95, 0], [0, 0, x > 0 ? -0.5 : 0.5]));
        parts.push(P(G.rbox(2.2, 1.35, 0.1, 0.04), [dark, dark, dark, dark, sign, sign], [0, 1.95, 0]));
        return parts;
      })
    );
    const lamp = glowSprite(0xff5522, 0.9, 1);
    lamp.position.set(0, 3.55, 0);
    g.add(lamp);
    g.userData.lamp = lamp;
    return g;
  };

  M.makeBlock = function () {
    return cached('block', () => {
      const face = std('#ffffff', { map: RD.tex.blockFace(), r: 0.8 });
      const conc = std('#b3ada2', { map: RD.tex.concrete(), normalMap: RD.tex.concreteNormal(), r: 0.9 });
      const refl = std('#ff3322', { e: '#ff2200', ei: 1.2, r: 0.3 });
      const parts = [
        P(G.rbox(2.2, 2.6, 0.7, 0.06), [conc, conc, conc, conc, face, face], [0, 1.35, 0]),
        P(G.rbox(2.35, 0.2, 0.95, 0.05), std('#8e897f', { r: 0.9 }), [0, 0.1, 0]),
        P(G.rbox(2.3, 0.15, 0.8, 0.04), std('#8e897f', { r: 0.9 }), [0, 2.72, 0]),
      ];
      for (const x of [-0.9, 0.9]) parts.push(P(G.cyl(0.06, 0.06, 0.03, 14), refl, [x, 2.35, 0.36], [Math.PI / 2, 0, 0]));
      return parts;
    });
  };

  /* ---------- coins ---------- */
  M.coinGeoMats = function () {
    const face = std('#ffffff', { map: RD.tex.coinFace(), m: 0.9, r: 0.28, e: '#ff9a00', ei: 0.35 });
    const edge = std('#ffc21a', { m: 1, r: 0.22, e: '#ff9a00', ei: 0.3 });
    return merge([
      P(G.cyl(0.37, 0.37, 0.07, 28), [edge, face, face], [0, 0, 0], [Math.PI / 2, 0, 0]),
      P(G.tor(0.37, 0.042, 10, 32), edge, [0, 0, 0]),
    ]);
  };

  /* ---------- power-up pickup ---------- */
  M.makePowerup = function (type) {
    const g = new THREE.Group();
    const colors = { magnet: 0xff4466, jetpack: 0xffa020, multiplier: 0xb44dff, sneakers: 0x35e07a };
    g.add(glowSprite(colors[type], 2.4, 0.9));
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: RD.tex.icon(type), transparent: true, depthWrite: false }));
    icon.scale.set(1.25, 1.25, 1);
    g.add(icon);
    const ring = new THREE.Mesh(G.tor(0.78, 0.045, 10, 40), std('#ffffff', { e: '#' + colors[type].toString(16).padStart(6, '0'), ei: 1.5 }));
    g.add(ring);
    g.userData.ring = ring;
    return g;
  };

  /* ======================================================================
   * Scenery
   * ==================================================================== */
  M.makeWall = function (variant, side) {
    return cached(
      'wall' + variant + '_' + side,
      () => {
        const face = std('#ffffff', { map: RD.tex.wall(variant), normalMap: RD.tex.concreteNormal(), ns: 0.6, r: 0.92 });
        const conc = std('#ffffff', { map: RD.tex.concrete(), normalMap: RD.tex.concreteNormal(), r: 0.92 });
        const top = std('#c4bfb5', { r: 0.85 });
        const mat = side < 0 ? [face, conc, top, conc, conc, conc] : [conc, face, top, conc, conc, conc];
        const inner = -side * 0.3;
        const parts = [P(G.box(0.6, 3.8, 20), mat, [0, 1.9, -10])];
        parts.push(P(G.rbox(0.9, 0.22, 20, 0.05), top, [0, 3.88, -10]));
        for (let z = -2.5; z > -20; z -= 5) parts.push(P(G.box(0.22, 3.8, 0.45), conc, [inner, 1.9, z]));
        parts.push(P(G.cyl(0.07, 0.07, 20, 10), std('#6d737b', { m: 0.7, r: 0.4 }), [inner - side * 0.06, 3.35, -10], [Math.PI / 2, 0, 0]));
        parts.push(P(G.box(0.12, 0.18, 20), std('#55595f', { m: 0.6, r: 0.5 }), [inner - side * 0.02, 2.9, -10]));
        return parts;
      },
      false
    );
  };

  M.makeFence = function () {
    return cached(
      'fence',
      () => {
        const t = RD.tex.fence().clone();
        t.needsUpdate = true;
        t.repeat.set(10, 1.2);
        const fm = std('#ffffff', { map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, m: 0.6, r: 0.4 });
        const post = std('#9aa0a8', { m: 0.7, r: 0.4 });
        const parts = [P(new THREE.PlaneGeometry(20, 2.6), fm, [0, 1.3, -10], [0, Math.PI / 2, 0])];
        for (let z = 0; z >= -20; z -= 5) parts.push(P(G.cyl(0.06, 0.06, 2.8, 8), post, [0, 1.4, z]));
        parts.push(P(G.cyl(0.04, 0.04, 20, 8), post, [0, 2.6, -10], [Math.PI / 2, 0, 0]));
        return parts;
      },
      false
    );
  };

  // the facade faces the tracks; `side` is which side of the track the building is on
  M.makeBuilding = function (w, h, d, colorIdx, side) {
    const key = ['bld', w, h, d, colorIdx, side].join('_');
    return cached(
      key,
      () => {
        const i = colorIdx % RD.tex.BUILDING_COLORS.length;
        const wall = std('#ffffff', { map: RD.tex.building(i), normalMap: RD.tex.buildingNormal(i), ns: 0.8, emissiveMap: RD.tex.buildingGlow(i), e: '#ffffff', ei: 0.55, r: 0.85 });
        const base = RD.tex.BUILDING_COLORS[i];
        const roof = std(RD.tex.shade(base, -30), { r: 0.9 });
        const trim = std(RD.tex.shade(base, 25), { r: 0.8 });
        const metal = std('#6d737b', { m: 0.7, r: 0.45 });
        const geo = new THREE.BoxGeometry(w, h, d);
        const uv = geo.attributes.uv;
        for (let f = 0; f < 6; f++) {
          const fw = f < 2 ? d : w, fh = f === 2 || f === 3 ? d : h;
          for (let k = f * 4; k < f * 4 + 4; k++) uv.setXY(k, (uv.getX(k) * fw) / 5, (uv.getY(k) * fh) / 5);
        }
        const parts = [P(geo, [wall, wall, roof, roof, wall, wall], [0, h / 2, 0])];
        parts.push(P(G.box(w + 0.5, 0.45, d + 0.5), trim, [0, h + 0.2, 0]));
        parts.push(P(G.box(w + 0.3, 0.6, d + 0.3), std(RD.tex.shade(base, -20), { r: 0.9 }), [0, 0.3, 0]));
        const fx = -side * (w / 2);
        for (let y = 5; y < h - 2; y += 5) {
          if ((y * 7 + w) % 3 === 0) continue;
          for (const z of [-d / 4, d / 4]) {
            parts.push(P(G.box(0.9, 0.12, 2.6), trim, [fx - side * 0.45, y - 0.1, z]));
            parts.push(P(G.box(0.05, 0.8, 2.6), metal, [fx - side * 0.88, y + 0.35, z]));
            parts.push(P(G.box(0.85, 0.05, 0.05), metal, [fx - side * 0.45, y + 0.75, z - 1.28]));
            parts.push(P(G.box(0.85, 0.05, 0.05), metal, [fx - side * 0.45, y + 0.75, z + 1.28]));
          }
        }
        for (let y = 3.5; y < h - 2; y += 5) parts.push(P(G.rbox(0.45, 0.4, 0.7, 0.04), std('#d8dce0', { r: 0.6 }), [fx - side * 0.24, y, Math.round(y) % 2 ? d / 2 - 1.5 : -d / 2 + 1.5]));
        if (h > 12) {
          const tx = w * 0.2, tz = d * 0.15;
          parts.push(P(G.cyl(1.1, 1.1, 2, 16), std('#8a5a3a', { r: 0.9 }), [tx, h + 1.9, tz]));
          parts.push(P(new THREE.ConeGeometry(1.2, 0.8, 16), std('#6a4028', { r: 0.9 }), [tx, h + 3.3, tz]));
          for (const [ox, oz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) parts.push(P(G.cyl(0.06, 0.06, 1.0, 6), metal, [tx + ox, h + 0.9, tz + oz]));
          parts.push(P(G.cyl(0.04, 0.04, 3, 6), metal, [-w * 0.3, h + 1.9, -d * 0.3]));
        } else {
          parts.push(P(G.rbox(2, 1, 2.5, 0.08), std('#b9bec5', { r: 0.6, m: 0.3 }), [-w * 0.2, h + 0.9, -d * 0.2]));
          parts.push(P(G.rbox(1.2, 0.7, 1.2, 0.06), std('#b9bec5', { r: 0.6, m: 0.3 }), [w * 0.25, h + 0.75, d * 0.25]));
        }
        return parts;
      },
      false
    );
  };

  M.makeTree = function (v) {
    return cached(
      'tree' + v,
      () => {
        const leafA = std(['#4caf50', '#5cbf45', '#3f9e4c'][v % 3], { r: 0.85, flat: true });
        const leafB = std(['#6cc75a', '#7ad35f', '#56b85a'][v % 3], { r: 0.85, flat: true });
        const bark = std('#6e4a2d', { r: 0.95 });
        const parts = [P(G.cyl(0.16, 0.26, 3.2, 10), bark, [0, 1.6, 0])];
        parts.push(P(G.cyl(0.06, 0.1, 1.3, 8), bark, [0.45, 2.9, 0.1], [0, 0, -0.8]));
        parts.push(P(G.cyl(0.06, 0.1, 1.2, 8), bark, [-0.4, 3.0, -0.1], [0, 0, 0.8]));
        const blobs = [[0, 4.2, 0, 1.5], [1.0, 3.6, 0.3, 1.1], [-0.9, 3.7, -0.4, 1.1], [0.2, 5.1, 0.2, 1.0], [-0.3, 3.9, 0.9, 0.9], [0.4, 3.9, -0.9, 0.9]];
        blobs.forEach(([x, y, z, r], k) => parts.push(P(G.ico(r, 1), k % 2 ? leafB : leafA, [x, y, z], [k, k * 2, 0])));
        return parts;
      },
      false
    );
  };

  M.makeBush = function () {
    return cached(
      'bush',
      () => {
        const leaf = std('#4fae4a', { r: 0.9, flat: true }), leaf2 = std('#67c05a', { r: 0.9, flat: true });
        return [P(G.ico(0.7, 1), leaf, [0, 0.4, 0]), P(G.ico(0.55, 1), leaf2, [0.6, 0.3, 0.3]), P(G.ico(0.5, 1), leaf, [-0.55, 0.3, -0.2])];
      },
      false
    );
  };

  M.makeGantry = function () {
    return cached(
      'gantry',
      () => {
        const steel = std('#7d8793', { m: 0.8, r: 0.4 }), dark = std('#4a515b', { m: 0.7, r: 0.45 }), ins = std('#6b4a3a', { r: 0.4 });
        const parts = [];
        for (const x of [-5.6, 5.6]) {
          for (const dz of [-0.18, 0.18]) parts.push(P(G.box(0.1, 7.2, 0.1), steel, [x, 3.6, dz]));
          for (let y = 0.6; y < 7; y += 0.9) parts.push(P(G.box(0.05, 0.5, 0.05), dark, [x, y, 0], [0.9, 0, 0]));
          parts.push(P(G.rbox(0.7, 0.3, 0.7, 0.05), std('#8b8f96', { r: 0.9 }), [x, 0.15, 0]));
        }
        for (const y of [6.85, 7.25]) parts.push(P(G.box(11.6, 0.1, 0.1), steel, [0, y, 0]));
        for (let x = -5.2; x < 5.4; x += 0.8) parts.push(P(G.box(0.05, 0.45, 0.05), dark, [x, 7.05, 0], [0, 0, 0.8]));
        for (const x of C.LANES) {
          parts.push(P(G.cyl(0.03, 0.03, 0.6, 6), dark, [x, 6.55, 0]));
          for (let k = 0; k < 3; k++) parts.push(P(G.cyl(0.07, 0.07, 0.03, 10), ins, [x, 6.4 + k * 0.1, 0]));
        }
        return parts;
      },
      true
    );
  };

  M.makeSignal = function () {
    const g = new THREE.Group();
    const housing = std('#1d1f24', { r: 0.6 });
    g.add(
      cached('signal', () => [
        P(G.cyl(0.07, 0.09, 3.2, 10), std('#3a3f47', { m: 0.6, r: 0.5 }), [0, 1.6, 0]),
        P(G.rbox(0.4, 0.95, 0.3, 0.05), housing, [0, 3.2, 0]),
        P(G.cyl(0.14, 0.14, 0.2, 14, true, 0, Math.PI), housing, [0, 3.42, 0.2], [Math.PI / 2, 0, 0]),
        P(G.cyl(0.14, 0.14, 0.2, 14, true, 0, Math.PI), housing, [0, 3.0, 0.2], [Math.PI / 2, 0, 0]),
        P(G.rbox(0.8, 0.12, 0.6, 0.03), std('#8b8f96', { r: 0.9 }), [0, 0.06, 0]),
      ])
    );
    const green = Math.random() < 0.5;
    const lamp = new THREE.Mesh(G.cyl(0.1, 0.1, 0.03, 16), std(green ? '#33ff66' : '#ff3322', { e: green ? '#22ff55' : '#ff2200', ei: 3 }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, green ? 3.0 : 3.42, 0.16);
    g.add(lamp);
    const s = glowSprite(green ? 0x33ff66 : 0xff3322, 0.8, 0.9);
    s.position.set(0, lamp.position.y, 0.2);
    g.add(s);
    return g;
  };

  M.makeLamp = function (side) {
    const g = new THREE.Group();
    g.add(
      cached('lamp' + side, () => {
        const pole = std('#4a5260', { m: 0.7, r: 0.4 });
        return [
          P(G.cyl(0.07, 0.1, 5.2, 10), pole, [0, 2.6, 0]),
          P(G.cyl(0.04, 0.04, 1.3, 8), pole, [-side * 0.6, 5.1, 0], [0, 0, Math.PI / 2]),
          P(G.rbox(0.5, 0.14, 0.26, 0.05), std('#2c313a', { m: 0.5, r: 0.4 }), [-side * 1.25, 5.05, 0]),
          P(G.box(0.4, 0.02, 0.18), std('#fff4d6', { e: '#ffe7b0', ei: 2.5 }), [-side * 1.25, 4.97, 0]),
          P(G.rbox(0.4, 0.2, 0.4, 0.05), std('#8b8f96', { r: 0.9 }), [0, 0.1, 0]),
        ];
      })
    );
    const s = glowSprite(0xffe2a0, 1.3, 0.55);
    s.position.set(-side * 1.25, 4.9, 0);
    g.add(s);
    return g;
  };

  M.makeBridge = function () {
    return cached(
      'bridge',
      () => {
        const conc = std('#ffffff', { map: RD.tex.concrete(), normalMap: RD.tex.concreteNormal(), r: 0.9 });
        const rail = std('#e0a030', { r: 0.45, m: 0.4 }), dark = std('#5d5a55', { r: 0.8 }), girder = std('#6b7079', { m: 0.7, r: 0.45 });
        const parts = [];
        parts.push(P(G.box(40, 1.1, 7), conc, [0, 7.4, 0]));
        parts.push(P(G.box(40, 0.3, 7.4), dark, [0, 6.8, 0]));
        for (const z of [-2.5, 0, 2.5]) parts.push(P(G.box(40, 0.5, 0.3), girder, [0, 6.55, z]));
        for (const z of [-3.4, 3.4]) {
          parts.push(P(G.box(40, 0.12, 0.12), rail, [0, 8.9, z]));
          parts.push(P(G.box(40, 0.08, 0.08), rail, [0, 8.4, z]));
          for (let x = -19; x <= 19; x += 1.6) parts.push(P(G.box(0.08, 0.9, 0.08), rail, [x, 8.4, z]));
        }
        for (const x of [-8.5, 8.5]) parts.push(P(G.box(1.6, 7, 5), conc, [x, 3.5, 0]));
        return parts;
      },
      true
    );
  };

  /* ---------- station platform (one 20 m section per side) ---------- */
  const STATIONS = ['PARK ST', 'HARBOR', 'MIDTOWN', 'RIVERSIDE', 'OLD TOWN', 'CENTRAL'];
  M.makePlatform = function (side, withSign, nameIdx, posterIdx) {
    const g = new THREE.Group();
    g.add(
      cached('platform' + side, () => {
        const tiles = RD.tex.tiles().clone();
        tiles.needsUpdate = true;
        tiles.repeat.set(1.5, 10);
        const tn = RD.tex.tilesNormal().clone();
        tn.needsUpdate = true;
        tn.repeat.set(1.5, 10);
        const floor = std('#ffffff', { map: tiles, normalMap: tn, ns: 0.6, r: 0.7 });
        const edge = std('#f2f2f2', { r: 0.8 }), yel = std('#ffd21f', { r: 0.6 });
        const conc = std('#ffffff', { map: RD.tex.concrete(), normalMap: RD.tex.concreteNormal(), r: 0.9 });
        const pillar = std('#2f6fb3', { r: 0.4, m: 0.4 }), roof = std('#e9edf2', { r: 0.5, m: 0.2 }), light = std('#ffffff', { e: '#fff6e0', ei: 1.8 });
        const wood = std('#b86b3a', { r: 0.7 }), iron = std('#3c4048', { m: 0.6, r: 0.4 });
        const cx = side * 5.45;
        const inner = side * 4.0;
        const parts = [];
        parts.push(P(G.box(2.9, 1.0, 20), [conc, conc, floor, conc, conc, conc], [cx, 0.5, -10]));
        parts.push(P(G.box(0.35, 0.03, 20), yel, [inner + side * 0.3, 1.01, -10]));
        parts.push(P(G.box(0.12, 0.06, 20), edge, [inner + side * 0.05, 1.0, -10]));
        parts.push(P(G.box(0.4, 4.4, 20), conc, [side * 7.0, 2.2, -10]));
        for (let z = -3; z > -20; z -= 7) {
          parts.push(P(G.cyl(0.12, 0.12, 3.6, 12), pillar, [side * 6.2, 2.8, z]));
          parts.push(P(G.box(0.12, 0.12, 2.2), pillar, [side * 5.2, 4.45, z], [0, 0, side * 0.12]));
        }
        parts.push(P(G.rbox(3.4, 0.16, 20, 0.05), roof, [side * 5.35, 4.65, -10], [0, 0, side * 0.08]));
        for (let z = -2; z > -20; z -= 4) parts.push(P(G.box(0.4, 0.03, 1.4), light, [side * 5.2, 4.53, z]));
        for (const z of [-6, -13]) {
          parts.push(P(G.rbox(0.5, 0.08, 1.8, 0.02), wood, [side * 6.3, 1.45, z]));
          parts.push(P(G.rbox(0.08, 0.5, 1.8, 0.02), wood, [side * 6.55, 1.75, z]));
          for (const dz of [-0.7, 0.7]) parts.push(P(G.box(0.4, 0.45, 0.06), iron, [side * 6.3, 1.2, z + dz]));
        }
        parts.push(P(G.rbox(0.7, 1.9, 1.0, 0.05), std('#d6302b', { r: 0.4, m: 0.2 }), [side * 6.45, 1.95, -17.5]));
        parts.push(P(G.box(0.02, 1.2, 0.7), std('#dff6ff', { e: '#bfe8ff', ei: 1.2 }), [side * 6.09, 2.15, -17.5]));
        return parts;
      })
    );
    for (let k = 0; k < 2; k++) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.95), std('#ffffff', { map: RD.tex.poster((posterIdx + k) % 5), r: 0.5 }));
      pm.position.set(side * 6.79, 2.4, -4 - k * 10);
      pm.rotation.y = (-side * Math.PI) / 2;
      g.add(pm);
    }
    if (withSign) {
      const name = STATIONS[nameIdx % STATIONS.length];
      const st = RD.tex.stationSign(name);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), std('#ffffff', { map: st, emissiveMap: st, e: '#ffffff', ei: 0.4, r: 0.4 }));
      sm.position.set(side * 5.3, 4.1, -10);
      sm.rotation.y = (-side * Math.PI) / 2;
      g.add(sm);
    }
    return g;
  };
})();
