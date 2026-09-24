/* Rail Dash - humanoid animation.
 * Each state (run, jump, roll, board, ...) produces a full pose; poses are
 * blended with smoothed weights so every transition is fluid. The run cycle
 * is keyframed (contact, down, passing, push-off, ...) and interpolated with
 * Catmull-Rom splines. Springs add secondary motion: leaning into lane
 * changes, landing squash, and hair that bounces. */
(function () {
  'use strict';
  const RD = window.RD, C = RD.C;
  const TAU = Math.PI * 2;

  const JOINTS = [
    'bodyY', 'bodyRX', 'bodyRY', 'bodyRZ', 'torsoRX', 'torsoRY', 'torsoRZ', 'neckRX', 'neckRY', 'neckRZ',
    'hipLX', 'hipRX', 'hipLZ', 'hipRZ', 'kneeL', 'kneeR', 'ankL', 'ankR',
    'shLX', 'shRX', 'shLY', 'shRY', 'shLZ', 'shRZ', 'elL', 'elR', 'wrL', 'wrR',
  ];
  const STATES = ['idle', 'run', 'air', 'dive', 'roll', 'board', 'jet', 'dead', 'catch', 'grab', 'cross'];

  function blank(p) {
    for (const j of JOINTS) p[j] = 0;
    p.bodyY = C.HIP_Y;
    return p;
  }

  // cyclic Catmull-Rom through evenly spaced keys
  function cyc(keys, t) {
    const n = keys.length;
    t = ((t % 1) + 1) % 1;
    const f = t * n, i = Math.floor(f), u = f - i;
    const k0 = keys[(i - 1 + n) % n], k1 = keys[i % n], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
    return 0.5 * (2 * k1 + (-k0 + k2) * u + (2 * k0 - 5 * k1 + 4 * k2 - k3) * u * u + (-k0 + 3 * k1 - 3 * k2 + k3) * u * u * u);
  }

  // right leg keys; phase 0 = right foot touching down in front
  const HIP = [0.55, 0.22, -0.18, -0.58, -0.5, -0.05, 0.68, 0.85];
  const KNEE = [-0.15, -0.62, -0.32, -0.45, -1.55, -2.05, -1.5, -0.55];
  const ANK = [0.28, -0.08, -0.32, -0.62, -0.3, 0.05, 0.25, 0.3];

  const POSES = {
    idle(p, s) {
      const t = s.time;
      p.bodyY = C.HIP_Y + Math.sin(t * 2) * 0.012;
      p.torsoRX = Math.sin(t * 2) * 0.015;
      p.shLZ = -0.14;
      p.shRZ = 0.14;
      p.elL = p.elR = 0.28;
      p.wrL = p.wrR = -0.1;
      p.neckRY = Math.sin(t * 0.7) * 0.35;
      p.neckRX = Math.sin(t * 0.45) * 0.06;
      p.hipLZ = -0.06;
      p.hipRZ = 0.06;
      p.bodyRZ = Math.sin(t * 0.9) * 0.02;
      const w = t % 7;
      if (s.wave && w < 1.8) {
        const k = Math.min(1, w * 4, (1.8 - w) * 4);
        p.shRZ = 0.14 + 2.35 * k;
        p.shRX = 0.3 * k;
        p.elR = 0.28 + (0.4 + Math.sin(t * 14) * 0.35) * k;
        p.neckRX -= 0.1 * k;
        p.neckRY *= 1 - k;
      }
    },
    run(p, s) {
      const ph = s.phase;
      const hR = cyc(HIP, ph), hL = cyc(HIP, ph + 0.5);
      const amp = 0.9 + Math.min(0.2, (s.speed - 14) * 0.012);
      p.hipRX = hR * amp;
      p.hipLX = hL * amp;
      p.kneeR = cyc(KNEE, ph);
      p.kneeL = cyc(KNEE, ph + 0.5);
      p.ankR = cyc(ANK, ph);
      p.ankL = cyc(ANK, ph + 0.5);
      p.hipRZ = 0.03;
      p.hipLZ = -0.03;
      p.shRX = -hR * 0.95 * amp;
      p.shLX = -hL * 0.95 * amp;
      p.elR = 1.25 + Math.max(0, p.shRX) * 0.55;
      p.elL = 1.25 + Math.max(0, p.shLX) * 0.55;
      p.shRZ = 0.13;
      p.shLZ = -0.13;
      p.wrR = p.wrL = -0.25;
      const bounce = Math.cos(TAU * 2 * (ph - 0.125));
      p.bodyY = C.HIP_Y - 0.035 - 0.045 * bounce;
      p.torsoRX = -0.2 - Math.min(0.12, Math.max(0, s.speed - 14) * 0.006) + bounce * 0.02;
      p.torsoRY = -0.17 * Math.cos(TAU * ph);
      p.bodyRY = 0.08 * Math.cos(TAU * ph);
      p.bodyRZ = 0.035 * Math.sin(TAU * ph);
      p.neckRX = 0.15 - bounce * 0.02;
      p.neckRY = 0.12 * Math.cos(TAU * ph);
    },
    air(p, s) {
      const v0 = s.v0 || 15;
      const t = Math.min(1, Math.max(0, (v0 - s.vy) / (2 * v0)));
      p.hipRX = 1.05 - t * 0.55;
      p.kneeR = -1.55 + t * 0.9;
      p.ankR = 0.15;
      p.hipLX = -0.4 + t * 0.45;
      p.kneeL = -0.75 - t * 0.35;
      p.ankL = -0.45 + t * 0.3;
      p.shRX = 0.55 - t * 0.3;
      p.shLX = -0.6 + t * 0.4;
      p.shRZ = 0.8 + t * 0.4;
      p.shLZ = -0.95 - t * 0.3;
      p.elR = 0.7;
      p.elL = 0.5;
      p.wrR = p.wrL = -0.2;
      p.torsoRX = -0.12 + t * 0.08;
      p.neckRX = 0.1;
    },
    dive(p) {
      p.hipLX = p.hipRX = 1.45;
      p.kneeL = p.kneeR = -2.05;
      p.shLX = p.shRX = 1.0;
      p.elL = p.elR = 1.45;
      p.torsoRX = -0.45;
      p.neckRX = -0.2;
    },
    roll(p) {
      p.bodyY = 0.52;
      p.hipLX = p.hipRX = 1.95;
      p.kneeL = p.kneeR = -2.45;
      p.ankL = p.ankR = -0.3;
      p.shLX = p.shRX = 1.2;
      p.shLZ = -0.3;
      p.shRZ = 0.3;
      p.elL = p.elR = 1.65;
      p.torsoRX = -0.65;
      p.neckRX = -0.45;
    },
    board(p, s) {
      const t = s.time;
      p.bodyY = C.HIP_Y - 0.12;
      p.bodyRY = 0.75;
      p.hipLX = 0.45;
      p.hipRX = -0.45;
      p.kneeL = p.kneeR = -0.6;
      p.ankL = p.ankR = 0.15;
      p.shLZ = -1.1 + Math.sin(t * 3) * 0.1;
      p.shRZ = 1.1 - Math.sin(t * 3) * 0.1;
      p.shLX = 0.15;
      p.shRX = -0.15;
      p.elL = p.elR = 0.35;
      p.torsoRX = -0.1;
      p.neckRY = -0.7;
      p.bodyRZ = Math.sin(t * 2.5) * 0.05;
    },
    jet(p, s) {
      const t = s.time;
      p.bodyRX = -0.45;
      p.hipLX = -0.25 + Math.sin(t * 4) * 0.08;
      p.hipRX = -0.15 - Math.sin(t * 4) * 0.08;
      p.kneeL = -0.7;
      p.kneeR = -0.5;
      p.ankL = p.ankR = -0.5;
      p.shLX = p.shRX = -0.5;
      p.shLZ = -0.4;
      p.shRZ = 0.4;
      p.elL = p.elR = 0.4;
      p.neckRX = 0.35;
      p.bodyRZ = Math.sin(t * 3) * 0.08;
    },
    dead(p) {
      p.shLZ = -1.8;
      p.shRZ = 1.8;
      p.elL = p.elR = 0.8;
      p.hipLX = 0.9;
      p.hipRX = 0.4;
      p.kneeL = -0.6;
      p.kneeR = -0.3;
      p.neckRX = 0.4;
    },
    catch(p, s) {
      POSES.run(p, s);
      p.shLX = p.shRX = 1.5;
      p.shLZ = -0.15;
      p.shRZ = 0.15;
      p.elL = p.elR = 0.2;
      p.torsoRX = -0.35;
    },
    grab(p, s) {
      const t = s.time;
      p.shRX = 1.2;
      p.shRZ = 0.5;
      p.elR = 0.5;
      p.shLZ = -0.2;
      p.shLX = 0.3;
      p.elL = 1.9;
      p.torsoRX = -0.1;
      p.neckRY = Math.sin(t * 1.5) * 0.15;
      p.neckRX = -0.05;
      p.hipLZ = -0.08;
      p.hipRZ = 0.08;
    },
    cross(p, s) {
      const t = s.time;
      p.bodyY = C.HIP_Y + Math.sin(t * 1.7) * 0.01;
      p.shLX = 0.42;
      p.shRX = 0.36;
      p.shLZ = -0.12;
      p.shRZ = 0.12;
      p.shLY = -1.15;
      p.shRY = 1.15;
      p.elL = 1.72;
      p.elR = 1.62;
      p.hipLZ = -0.1;
      p.hipRZ = 0.1;
      p.neckRY = Math.sin(t * 0.5) * 0.25;
      p.neckRX = 0.05;
      p.torsoRX = 0.04;
    },
  };

  // critically damped spring toward a target
  function spring(sp, target, omega, dt) {
    const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo;
    const det = 1 / (f + hhoo);
    const x = (f * sp.x + dt * sp.v + hhoo * target) * det;
    sp.v = (sp.v + hoo * (target - sp.x)) * det;
    sp.x = x;
    return x;
  }

  class Humanoid {
    constructor(rig) {
      this.rig = rig;
      this.cur = blank({});
      this.tmp = blank({});
      this.w = {};
      for (const s of STATES) this.w[s] = 0;
      this.w.idle = 1;
      this.phase = 0;
      this.spin = 0;
      this.lean = { x: 0, v: 0 };
      this.squash = { x: 0, v: 0 };
      this.hairS = { x: 0, v: 0 };
      this.lastVy = 0;
    }

    // s: { state, speed, vy, v0, time, laneVel, spin (0..1 roll/flip progress or -1),
    //      stumble, bump, bumpDir, landed, whistle }
    update(dt, s) {
      const r = this.rig;
      if (s.state === 'run' || s.state === 'catch') this.phase = (this.phase + dt * (1.35 + s.speed * 0.032)) % 1;
      s.phase = this.phase;

      // blend weights
      const rate = s.state === 'roll' || s.state === 'dive' ? 22 : s.state === 'dead' ? 10 : 13;
      const k = 1 - Math.exp(-dt * rate);
      let total = 0;
      for (const st of STATES) {
        this.w[st] += ((st === s.state ? 1 : 0) - this.w[st]) * k;
        if (this.w[st] < 0.002) this.w[st] = 0;
        total += this.w[st];
      }
      const out = blank(this.tmp);
      for (const j of JOINTS) out[j] = 0;
      out.bodyY = 0;
      const p = {};
      for (const st of STATES) {
        const w = this.w[st];
        if (!w) continue;
        blank(p);
        POSES[st](p, s);
        for (const j of JOINTS) out[j] += p[j] * (w / total);
      }

      // additive layers
      if (s.whistle > 0) {
        const wk = Math.min(1, s.whistle * 3);
        out.shRX += (1.35 - out.shRX) * wk;
        out.shRZ += (0.35 - out.shRZ) * wk;
        out.elR += (2.35 - out.elR) * wk;
        out.wrR += (0.3 - out.wrR) * wk;
      }
      if (s.stumble > 0) {
        const t = s.time, sk = Math.min(1, s.stumble * 1.6);
        out.shLX += Math.sin(t * 31) * 1.2 * sk;
        out.shRX += Math.cos(t * 29) * 1.2 * sk;
        out.shLZ -= 0.8 * sk;
        out.shRZ += 0.8 * sk;
        out.torsoRZ += Math.sin(t * 24) * 0.35 * sk;
        out.neckRX -= 0.3 * sk;
      }
      if (s.bump > 0) out.bodyRZ += s.bumpDir * -0.5 * s.bump;
      for (const j of JOINTS) this.cur[j] = out[j];
      const c = this.cur;

      // body spin for rolls and flips (never blended through 2*PI)
      if (s.spin >= 0) this.spin = -s.spin * TAU;
      else this.spin *= Math.max(0, 1 - dt * 12);

      // secondary motion
      const lean = spring(this.lean, Math.max(-0.4, Math.min(0.4, -(s.laneVel || 0) * 0.05)), 14, dt);
      if (s.landed) this.squash.v -= 2.6;
      const sq = spring(this.squash, 0, 16, dt);
      const accel = (s.vy - this.lastVy) / Math.max(dt, 1e-3);
      this.lastVy = s.vy;
      const hairT = s.state === 'run' ? Math.cos(TAU * 2 * (this.phase - 0.125)) * 0.05 : 0;
      const hair = spring(this.hairS, Math.max(-0.35, Math.min(0.35, hairT - accel * 0.002)), 11, dt);

      r.body.position.y = c.bodyY + Math.min(0, sq) * 0.25;
      r.body.rotation.set(this.spin + c.bodyRX, c.bodyRY, c.bodyRZ + lean);
      r.body.scale.set(1 - sq * 0.35, 1 + sq, 1 - sq * 0.35);
      r.torso.rotation.set(c.torsoRX, c.torsoRY, c.torsoRZ);
      r.neck.rotation.set(c.neckRX, c.neckRY, c.neckRZ);
      r.legL.hip.rotation.set(c.hipLX, 0, c.hipLZ);
      r.legR.hip.rotation.set(c.hipRX, 0, c.hipRZ);
      r.legL.knee.rotation.x = c.kneeL;
      r.legR.knee.rotation.x = c.kneeR;
      r.legL.ankle.rotation.x = c.ankL;
      r.legR.ankle.rotation.x = c.ankR;
      r.armL.shoulder.rotation.set(c.shLX, c.shLY, c.shLZ);
      r.armR.shoulder.rotation.set(c.shRX, c.shRY, c.shRZ);
      r.armL.elbow.rotation.x = c.elL;
      r.armR.elbow.rotation.x = c.elR;
      r.armL.wrist.rotation.x = c.wrL;
      r.armR.wrist.rotation.x = c.wrR;
      if (r.hair) r.hair.rotation.x = hair;
      if (r.pack) r.pack.rotation.x = -hair * 0.6;
      if (r.whistle) r.whistle.visible = s.whistle > 0.2;
    }
  }

  RD.Humanoid = Humanoid;
  RD.spring = spring;
})();
