/* Rail Dash - the player: movement, physics, collisions and animation. */
(function () {
  'use strict';
  const RD = window.RD, C = RD.C;

  const GRAVITY = 52;
  const JUMP_V = 15.5;
  const SUPER_JUMP_V = 21.5;
  const ROLL_TIME = 0.62;
  const LAT_SPEED = 17;
  const HW = 0.42, HD = 0.4;
  const STAND_H = 1.75, ROLL_H = 0.8;
  const TWO_PI = Math.PI * 2;

  const JOINTS = [
    'bodyY', 'bodyRY', 'bodyRZ', 'torsoRX', 'torsoRY', 'torsoRZ', 'neckRX', 'neckRY',
    'hipLX', 'hipRX', 'hipLZ', 'hipRZ', 'kneeL', 'kneeR', 'shLX', 'shRX', 'shLZ', 'shRZ', 'elL', 'elR',
  ];

  class Player {
    constructor(scene) {
      this.rig = RD.models.makeRunner();
      scene.add(this.rig.root);
      scene.add(this.rig.blob);
      this.cur = {};
      this.reset();
    }

    reset() {
      Object.assign(this, {
        lane: 1, prevLane: 1, x: 0, y: 0, vy: 0, grounded: true, groundY: 0,
        rollT: 0, fastFall: false, rollQueued: false, jumpBuffer: 0, coyote: 0,
        sideCool: 0, stumbleT: 0, alive: true, deadT: 0,
        jet: false, board: false, superJump: false,
        phase: 0, flip: 0, flipping: false, bumpT: 0, bumpDir: 0, idleT: 0,
      });
      const r = this.rig;
      r.root.position.set(0, 0, 0);
      r.root.rotation.set(0, 0, 0);
      r.body.rotation.set(0, 0, 0);
      r.board.visible = false;
      r.jet.visible = false;
      for (const j of JOINTS) this.cur[j] = 0;
      this.cur.bodyY = C.HIP_Y;
    }

    get height() {
      return this.rollT > 0 ? ROLL_H : STAND_H;
    }

    /* ---------- actions ---------- */
    move(dir) {
      if (!this.alive) return false;
      const nl = this.lane + dir;
      if (nl < 0 || nl > 2) {
        this.bumpT = 0.25;
        this.bumpDir = dir;
        return 'wall';
      }
      this.prevLane = this.lane;
      this.lane = nl;
      return true;
    }

    jump() {
      if (!this.alive || this.jet) return false;
      if (this.grounded || this.coyote > 0) return this.doJump();
      this.jumpBuffer = 0.16;
      return false;
    }

    doJump() {
      this.vy = this.superJump ? SUPER_JUMP_V : JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.rollT = 0;
      this.rollQueued = false;
      this.fastFall = false;
      this.flipping = this.superJump;
      this.flip = 0;
      return true;
    }

    roll() {
      if (!this.alive || this.jet) return false;
      if (!this.grounded) {
        this.vy = Math.min(this.vy, -26);
        this.fastFall = true;
        this.rollQueued = true;
        return 'dive';
      }
      this.rollT = ROLL_TIME;
      return true;
    }

    bounceBack() {
      this.lane = this.prevLane;
      this.sideCool = 0.4;
    }

    /* ---------- physics & collisions ---------- */
    // ctx: { dt, traveled, dz, obstacles, onFront(o), onSide(o), onLand(), invulnerable }
    update(ctx) {
      const dt = ctx.dt;
      if (!this.alive) {
        this.deadT += dt;
        if (this.y > this.groundY) {
          this.vy -= GRAVITY * dt;
          this.y = Math.max(this.groundY, this.y + this.vy * dt);
        }
        return;
      }
      this.sideCool = Math.max(0, this.sideCool - dt);
      this.stumbleT = Math.max(0, this.stumbleT - dt);
      this.bumpT = Math.max(0, this.bumpT - dt);
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      if (this.rollT > 0) this.rollT = Math.max(0, this.rollT - dt);

      // sideways
      const tx = C.LANES[this.lane];
      const dx = tx - this.x;
      const step = LAT_SPEED * dt;
      this.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;

      // vertical
      if (this.jet) {
        this.y += (RD.world.JET_Y - this.y) * Math.min(1, dt * 2.5);
        this.vy = 0;
        this.grounded = false;
        this.groundY = 0;
        return;
      }
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;

      // which obstacles overlap the runner's footprint?
      const ps = ctx.traveled;
      const xMin = this.x - HW, xMax = this.x + HW;
      const touching = [];
      for (const o of ctx.obstacles) {
        if (o.dead) continue;
        if (ps + HD < o.s || ps - HD > o.s + o.len) continue;
        if (xMax < o.x - o.hw || xMin > o.x + o.hw) continue;
        touching.push(o);
      }
      const rampHeight = (o) => Math.min(1, Math.max(0, (ps - o.s) / o.len)) * C.TRAIN_H;

      // pass 1: surfaces we can stand on (ramps, train roofs)
      let ground = 0;
      for (const o of touching) {
        if (o.type === 'ramp') {
          const rh = rampHeight(o);
          if (this.y >= rh - 1.2) ground = Math.max(ground, rh);
        } else if (o.walk && this.y >= o.top - 0.35) {
          ground = Math.max(ground, o.top);
        }
      }

      const wasGrounded = this.grounded;
      if (this.y <= ground) {
        const landing = !wasGrounded && this.vy < -2;
        this.y = ground;
        this.vy = 0;
        this.grounded = true;
        this.flipping = false;
        if (landing) {
          this.fastFall = false;
          if (ctx.onLand) ctx.onLand();
          if (this.rollQueued) {
            this.rollQueued = false;
            this.rollT = ROLL_TIME;
          }
        }
        if (this.jumpBuffer > 0) {
          this.doJump();
          if (ctx.onBufferedJump) ctx.onBufferedJump();
        }
      } else {
        if (wasGrounded && this.vy <= 0) this.coyote = 0.1;
        this.grounded = false;
      }
      this.groundY = ground;

      // pass 2: hits, using the height after landing on any surface
      if (ctx.invulnerable) return;
      const h = this.height;
      let front = null, side = null;
      for (const o of touching) {
        if (o.type === 'ramp') {
          if (this.y < rampHeight(o) - 1.2) side = side || o;
          continue;
        }
        if (this.y >= o.top - 0.35) continue;
        if (this.y + h <= o.bottom) continue;
        const frontPen = ps + HD - o.s;
        const rel = ctx.dz + (o.vel || 0) * dt;
        if (frontPen <= rel + 0.3) front = front || o;
        else side = side || o;
      }
      if (front) ctx.onFront(front);
      else if (side && this.sideCool <= 0) ctx.onSide(side);
    }

    die(obstacle) {
      this.alive = false;
      this.deadT = 0;
      this.rollT = 0;
      this.deathOnTop = obstacle && obstacle.type === 'train';
      this.vy = 4;
    }

    /* ---------- animation ---------- */
    animate(dt, speed, time, mode) {
      const r = this.rig, T = {}, cur = this.cur;
      const set = (k, v) => (T[k] = v);
      for (const j of JOINTS) T[j] = 0;
      T.bodyY = C.HIP_Y;
      let rate = 22;

      r.board.visible = this.board && !this.jet && mode !== 'menu';
      r.jet.visible = this.jet;
      r.root.position.set(this.x, this.y + (r.board.visible ? 0.28 : 0), 0);

      if (mode === 'menu') {
        this.idleT += dt;
        set('bodyY', C.HIP_Y + Math.sin(time * 2) * 0.012);
        set('shLZ', -0.15);
        set('shRZ', 0.15);
        set('elL', 0.3);
        set('elR', 0.3);
        set('neckRY', Math.sin(time * 0.7) * 0.35);
        set('hipLZ', -0.05);
        set('hipRZ', 0.05);
        const w = time % 7;
        if (w < 1.6) {
          // wave hello
          set('shRZ', 2.5);
          set('shRX', 0.3);
          set('elR', 0.6 + Math.sin(time * 14) * 0.35);
          set('neckRX', -0.1);
        }
        rate = 10;
      } else if (!this.alive) {
        // knocked over backwards
        const k = Math.min(1, this.deadT / 0.35);
        r.root.rotation.x = k * 1.35;
        r.body.rotation.x = 0;
        set('shLZ', -1.8);
        set('shRZ', 1.8);
        set('elL', 0.8);
        set('elR', 0.8);
        set('hipLX', 0.9);
        set('hipRX', 0.4);
        set('kneeL', -0.6);
        set('kneeR', -0.3);
        set('neckRX', 0.4);
        rate = 12;
      } else if (this.jet) {
        r.body.rotation.x += (-0.45 - r.body.rotation.x) * Math.min(1, dt * 6);
        set('hipLX', -0.25);
        set('hipRX', -0.15);
        set('kneeL', -0.7);
        set('kneeR', -0.5);
        set('shLX', -0.5);
        set('shRX', -0.5);
        set('shLZ', -0.4);
        set('shRZ', 0.4);
        set('elL', 0.4);
        set('elR', 0.4);
        set('neckRX', 0.35);
        set('bodyRZ', Math.sin(time * 3) * 0.08 - (C.LANES[this.lane] - this.x) * 0.12);
        for (const f of r.flames) {
          const s = 0.8 + Math.random() * 0.5;
          f.scale.set(1, s, 1);
        }
      } else if (this.rollT > 0) {
        const p = 1 - this.rollT / ROLL_TIME;
        r.body.rotation.x = -p * TWO_PI;
        set('bodyY', 0.52);
        set('hipLX', 1.9);
        set('hipRX', 1.9);
        set('kneeL', -2.4);
        set('kneeR', -2.4);
        set('shLX', 1.2);
        set('shRX', 1.2);
        set('shLZ', -0.3);
        set('shRZ', 0.3);
        set('elL', 1.6);
        set('elR', 1.6);
        set('torsoRX', -0.6);
        set('neckRX', -0.4);
        rate = 35;
      } else if (this.board && this.grounded) {
        r.body.rotation.x *= 0.8;
        set('bodyY', C.HIP_Y - 0.1);
        set('bodyRY', 0.75);
        set('hipLX', 0.4);
        set('hipRX', -0.4);
        set('kneeL', -0.55);
        set('kneeR', -0.55);
        set('shLZ', -1.1 + Math.sin(time * 3) * 0.1);
        set('shRZ', 1.1 - Math.sin(time * 3) * 0.1);
        set('elL', 0.3);
        set('elR', 0.3);
        set('neckRY', -0.7);
        set('bodyRZ', -(C.LANES[this.lane] - this.x) * 0.12 + Math.sin(time * 2.5) * 0.05);
      } else if (!this.grounded) {
        if (this.flipping) {
          const v0 = SUPER_JUMP_V;
          const p = Math.min(1, Math.max(0, (v0 - this.vy) / (2 * v0)));
          r.body.rotation.x = -p * TWO_PI;
        } else {
          r.body.rotation.x *= Math.max(0, 1 - dt * 12);
        }
        if (this.fastFall) {
          set('hipLX', 1.4);
          set('hipRX', 1.4);
          set('kneeL', -2.0);
          set('kneeR', -2.0);
          set('shLX', 1.0);
          set('shRX', 1.0);
          set('elL', 1.4);
          set('elR', 1.4);
          set('torsoRX', -0.4);
        } else {
          set('hipLX', 1.05);
          set('kneeL', -1.5);
          set('hipRX', -0.35);
          set('kneeR', -0.6);
          set('shLX', -0.3);
          set('shRX', 0.4);
          set('shLZ', -1.0);
          set('shRZ', 1.1);
          set('elL', 0.6);
          set('elR', 0.5);
          set('torsoRX', -0.1);
          set('neckRX', 0.1);
        }
        if (this.board) set('bodyRY', 0.5);
        set('bodyRZ', -(C.LANES[this.lane] - this.x) * 0.15);
      } else {
        // running
        r.body.rotation.x *= Math.max(0, 1 - dt * 14);
        this.phase += dt * (8 + speed * 0.28);
        const s = Math.sin(this.phase), c = Math.cos(this.phase);
        set('hipLX', s * 0.95);
        set('hipRX', -s * 0.95);
        set('kneeL', -(Math.max(0, c) * 1.4 + 0.15));
        set('kneeR', -(Math.max(0, -c) * 1.4 + 0.15));
        set('shLX', -s * 0.85);
        set('shRX', s * 0.85);
        set('shLZ', -0.12);
        set('shRZ', 0.12);
        set('elL', 1.35);
        set('elR', 1.35);
        set('bodyY', C.HIP_Y - 0.03 + (1 - Math.abs(s)) * 0.08);
        set('torsoRX', -0.22);
        set('torsoRY', s * 0.18);
        set('neckRX', 0.12);
        set('neckRY', -s * 0.1);
        set('bodyRZ', Math.max(-0.35, Math.min(0.35, -(C.LANES[this.lane] - this.x) * 0.15)));
        rate = 28;
      }

      if (mode !== 'menu' && this.alive) r.root.rotation.x = 0;
      if (this.stumbleT > 0 && this.alive) {
        const k = this.stumbleT;
        T.shLX += Math.sin(time * 31) * 1.2 * k;
        T.shRX += Math.cos(time * 29) * 1.2 * k;
        T.shLZ -= 0.8 * k;
        T.shRZ += 0.8 * k;
        T.torsoRZ = Math.sin(time * 24) * 0.35 * k;
        T.neckRX = -0.3 * k;
      }
      if (this.bumpT > 0) T.bodyRZ += this.bumpDir * -0.5 * (this.bumpT / 0.25);

      const a = Math.min(1, dt * rate);
      for (const j of JOINTS) cur[j] += (T[j] - cur[j]) * a;

      r.body.position.y = cur.bodyY;
      r.body.rotation.y = cur.bodyRY;
      r.body.rotation.z = cur.bodyRZ;
      r.torso.rotation.set(cur.torsoRX, cur.torsoRY, cur.torsoRZ);
      r.neck.rotation.set(cur.neckRX, cur.neckRY, 0);
      r.legL.hip.rotation.set(cur.hipLX, 0, cur.hipLZ);
      r.legR.hip.rotation.set(cur.hipRX, 0, cur.hipRZ);
      r.legL.knee.rotation.x = cur.kneeL;
      r.legR.knee.rotation.x = cur.kneeR;
      r.armL.shoulder.rotation.set(cur.shLX, 0, cur.shLZ);
      r.armR.shoulder.rotation.set(cur.shRX, 0, cur.shRZ);
      r.armL.elbow.rotation.x = cur.elL;
      r.armR.elbow.rotation.x = cur.elR;

      if (r.board.visible) {
        r.board.position.y = -0.16 + Math.sin(time * 6) * 0.03;
        r.board.rotation.z = -cur.bodyRZ * 0.6;
        r.boardGlow.material.opacity = 0.6 + Math.sin(time * 10) * 0.2;
      }

      // blob shadow
      const b = r.blob;
      const hgt = Math.max(0, this.y - this.groundY);
      b.position.set(this.x, this.groundY + 0.03, 0);
      b.scale.setScalar(Math.max(0.35, 1 - hgt * 0.07));
      b.material.opacity = 0.3 * Math.max(0.3, 1 - hgt * 0.06);
    }
  }

  RD.Player = Player;
  RD.PLAYER_CONST = { ROLL_TIME, HD };
})();
