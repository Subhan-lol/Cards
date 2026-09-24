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


  class Player {
    constructor(scene, style) {
      this.scene = scene;
      this.setStyle(style);
      this.reset();
    }

    // swap the character model; state and animation carry over
    setStyle(style) {
      if (this.rig) {
        this.scene.remove(this.rig.root);
        this.scene.remove(this.rig.blob);
      }
      this.style = style;
      this.rig = RD.models.makeRunner(style);
      this.anim = new RD.Humanoid(this.rig);
      this.scene.add(this.rig.root);
      this.scene.add(this.rig.blob);
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
      this.justLanded = false;
      this.prevX = 0;
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
          this.justLanded = true;
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
      const r = this.rig;
      r.board.visible = this.board && !this.jet && mode !== 'menu';
      r.jet.visible = this.jet;
      r.root.position.set(this.x, this.y + C.FOOT_Y + (r.board.visible ? 0.28 : 0), 0);

      let state = 'run', spin = -1;
      if (mode === 'menu') state = 'idle';
      else if (!this.alive) state = 'dead';
      else if (this.jet) state = 'jet';
      else if (this.rollT > 0) {
        state = 'roll';
        spin = 1 - this.rollT / ROLL_TIME;
      } else if (this.board && this.grounded) state = 'board';
      else if (!this.grounded) {
        state = this.fastFall ? 'dive' : 'air';
        if (this.flipping) spin = Math.min(1, Math.max(0, (SUPER_JUMP_V - this.vy) / (2 * SUPER_JUMP_V)));
      }

      if (!this.alive) r.root.rotation.x += (Math.min(1, this.deadT / 0.35) * 1.35 - r.root.rotation.x) * Math.min(1, dt * 20);
      else r.root.rotation.x = 0;

      const laneVel = dt > 0 ? (this.x - this.prevX) / dt : 0;
      this.prevX = this.x;
      this.anim.update(dt, {
        state, speed, time, spin, laneVel,
        vy: this.vy, v0: this.superJump ? SUPER_JUMP_V : JUMP_V,
        stumble: this.stumbleT, bump: this.bumpT / 0.25, bumpDir: this.bumpDir,
        landed: this.justLanded, wave: true,
      });
      this.justLanded = false;

      if (r.jet.visible) for (const f of r.flames) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      if (r.board.visible) {
        r.board.position.y = -0.16 + Math.sin(time * 6) * 0.03;
        r.board.rotation.z = -r.body.rotation.z * 0.6;
        r.boardGlow.material.opacity = 0.6 + Math.sin(time * 10) * 0.2;
      }

      // blob shadow
      const bl = r.blob;
      const hgt = Math.max(0, this.y - this.groundY);
      bl.position.set(this.x, this.groundY + C.FOOT_Y + 0.03, 0);
      bl.scale.setScalar(Math.max(0.35, 1 - hgt * 0.07));
      bl.material.opacity = 0.3 * Math.max(0.3, 1 - hgt * 0.06);
    }
  }

  RD.Player = Player;
  RD.PLAYER_CONST = { ROLL_TIME, HD };
})();
