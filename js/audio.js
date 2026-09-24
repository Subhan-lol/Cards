/* Rail Dash - synthesized sound effects and an original background loop.
 * Everything is generated with the Web Audio API, no audio files needed. */
(function () {
  'use strict';
  const RD = window.RD;
  const A = (RD.audio = { muted: false });

  let ctx = null, master, sfx, music, noiseBuf, timer = null, nextTime = 0, step = 0, jetNode = null;
  const BPM = 104;

  A.init = function () {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = A.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.connect(master);
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.75;
    sfx.connect(comp);
    music = ctx.createGain();
    music.gain.value = 0.3;
    music.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.03);
  };
  A.suspend = () => ctx && ctx.state === 'running' && ctx.suspend();
  A.resume = () => ctx && ctx.state === 'suspended' && ctx.resume();

  function ok() {
    return ctx && ctx.state === 'running';
  }

  function tone(freq, t0, dur, type, vol, dest, freqEnd, attack) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const a = attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest || sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, vol, type, freq, dest, q, freqEnd) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || sfx);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  /* ---------- effects ---------- */
  const COIN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16];
  let coinIdx = 0, lastCoin = 0;
  A.coin = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    coinIdx = t - lastCoin < 0.35 ? (coinIdx + 1) % COIN_STEPS.length : 0;
    lastCoin = t;
    const f = 1046 * Math.pow(2, COIN_STEPS[coinIdx] / 12);
    tone(f, t, 0.07, 'square', 0.05);
    tone(f * 1.5, t + 0.045, 0.16, 'sine', 0.13);
  };
  A.jump = function (big) {
    if (!ok()) return;
    const t = ctx.currentTime;
    if (big) {
      tone(220, t, 0.35, 'triangle', 0.22, sfx, 1100);
      tone(330, t + 0.02, 0.3, 'sine', 0.1, sfx, 1500);
    } else {
      tone(320, t, 0.17, 'square', 0.06, sfx, 720);
    }
    noise(t, 0.18, 0.12, 'bandpass', 1200, sfx, 1, 3000);
  };
  A.roll = function () {
    if (!ok()) return;
    noise(ctx.currentTime, 0.32, 0.25, 'bandpass', 900, sfx, 1.2, 250);
  };
  A.swipe = function () {
    if (!ok()) return;
    noise(ctx.currentTime, 0.12, 0.14, 'highpass', 2500, sfx, 0.7, 5000);
  };
  A.land = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    noise(t, 0.1, 0.18, 'lowpass', 500);
    tone(110, t, 0.08, 'sine', 0.15, sfx, 60);
  };
  A.bump = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    tone(140, t, 0.12, 'sine', 0.25, sfx, 70);
    noise(t, 0.08, 0.15, 'lowpass', 800);
  };
  A.stumble = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    tone(180, t, 0.25, 'sawtooth', 0.12, sfx, 70);
    noise(t, 0.2, 0.35, 'lowpass', 900);
  };
  A.crash = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    noise(t, 0.7, 0.9, 'lowpass', 1600, sfx, 1, 80);
    tone(130, t, 0.5, 'sine', 0.6, sfx, 35);
    tone(900, t, 0.25, 'square', 0.05, sfx, 200);
  };
  A.caught = function () {
    if (!ok()) return;
    const t = ctx.currentTime + 0.3;
    [392, 370, 349, 262].forEach((f, i) => tone(f, t + i * 0.22, i === 3 ? 0.6 : 0.2, 'square', 0.07, sfx, i === 3 ? 200 : null));
  };
  A.powerup = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.055, 0.18, 'triangle', 0.16));
  };
  A.boardOn = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    tone(200, t, 0.4, 'sawtooth', 0.08, sfx, 900);
    tone(400, t + 0.1, 0.35, 'sine', 0.15, sfx, 1600);
  };
  A.boardBreak = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    noise(t, 0.45, 0.6, 'bandpass', 2000, sfx, 0.8, 300);
    tone(700, t, 0.4, 'square', 0.08, sfx, 120);
  };
  A.horn = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    f.connect(sfx);
    for (const fr of [311, 392]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
      g.gain.setValueAtTime(0.06, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      o.connect(g);
      g.connect(f);
      o.start(t);
      o.stop(t + 1);
    }
  };
  // police whistle: a short blast then a long trilled one
  A.whistle = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    for (const [start, dur] of [[0, 0.2], [0.28, 0.6]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 2650;
      lfo.frequency.value = 27;
      lg.gain.value = 150;
      lfo.connect(lg);
      lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(0.08, t + start + 0.02);
      g.gain.setValueAtTime(0.08, t + start + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g);
      g.connect(sfx);
      o.start(t + start);
      o.stop(t + start + dur + 0.05);
      lfo.start(t + start);
      lfo.stop(t + start + dur + 0.05);
      noise(t + start, dur, 0.04, 'bandpass', 2600, sfx, 2);
    }
  };
  A.click = function () {
    if (!ok()) return;
    tone(880, ctx.currentTime, 0.06, 'triangle', 0.15);
  };
  A.buy = function () {
    if (!ok()) return;
    const t = ctx.currentTime;
    tone(1318, t, 0.08, 'square', 0.06);
    tone(1760, t + 0.08, 0.2, 'sine', 0.15);
  };
  A.jetStart = function () {
    if (!ok() || jetNode) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.3);
    src.connect(f);
    f.connect(g);
    g.connect(sfx);
    src.start();
    jetNode = { src, g };
  };
  A.jetStop = function () {
    if (!jetNode) return;
    const { src, g } = jetNode;
    jetNode = null;
    if (!ctx) return;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
    src.stop(ctx.currentTime + 0.5);
  };

  /* ---------- music: an original 8-bar loop ---------- */
  // A minor: Am - F - C - G, twice; bar 5-8 add a lead line.
  const BASS = [110, 87.31, 130.81, 98];
  const CHORDS = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 261.63, 329.63],
    [196, 246.94, 293.66],
  ];
  const LEAD = [
    [659.25, 0, 0, 783.99, 0, 0, 659.25, 0, 587.33, 0, 523.25, 0, 587.33, 0, 0, 0],
    [523.25, 0, 0, 440, 0, 0, 523.25, 0, 587.33, 0, 0, 0, 659.25, 0, 0, 0],
    [783.99, 0, 0, 659.25, 0, 0, 783.99, 0, 880, 0, 783.99, 0, 659.25, 0, 587.33, 0],
    [587.33, 0, 0, 0, 493.88, 0, 0, 0, 587.33, 0, 0, 0, 0, 0, 0, 0],
  ];
  const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0];
  const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
  const BASSLINE = [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 3, 0, 0, 0, 1, 0];

  function playStep(s, t) {
    const bar = Math.floor(s / 16) % 8, i = s % 16, chord = bar % 4;
    const sixteenth = 60 / BPM / 4;
    if (KICK[i]) tone(150, t, 0.28, 'sine', 0.9, music, 42);
    if (SNARE[i]) {
      noise(t, 0.16, 0.45, 'bandpass', 1900, music, 0.8);
      tone(190, t, 0.1, 'triangle', 0.25, music, 120);
    }
    if (i % 2 === 0) noise(t, 0.035, i % 4 === 2 ? 0.16 : 0.09, 'highpass', 7500, music);
    if (i === 14) noise(t, 0.14, 0.1, 'highpass', 6000, music);
    const b = BASSLINE[i];
    if (b) {
      const f = BASS[chord] * (b === 2 ? 2 : b === 3 ? 1.5 : 1);
      tone(f, t, sixteenth * 1.8, 'sawtooth', 0.16, music, null, 0.01);
      tone(f / 2, t, sixteenth * 1.8, 'sine', 0.3, music, null, 0.01);
    }
    if (i === 2 || i === 10) for (const f of CHORDS[chord]) tone(f, t, 0.22, 'triangle', 0.045, music);
    if (bar >= 4) {
      const f = LEAD[chord][i];
      if (f) {
        tone(f, t, 0.3, 'square', 0.035, music, null, 0.01);
        tone(f * 2, t, 0.18, 'sine', 0.03, music);
      }
    } else if (i % 4 === 0) {
      tone(CHORDS[chord][(i / 4) % 3] * 2, t, 0.25, 'sine', 0.05, music);
    }
  }

  function schedule() {
    if (!ctx) return;
    const sixteenth = 60 / BPM / 4;
    if (nextTime < ctx.currentTime - 0.5) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.15) {
      playStep(step, nextTime);
      nextTime += sixteenth;
      step = (step + 1) % 128;
    }
  }

  A.startMusic = function () {
    if (!ctx || timer) return;
    step = 0;
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 30);
  };
  A.stopMusic = function () {
    clearInterval(timer);
    timer = null;
  };
})();
