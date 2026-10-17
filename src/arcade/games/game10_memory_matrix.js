/* ============================================================
 * GAME 10 — MEMORY MATRIX
 * Simon-style recall: watch the chip sequence, repeat it.
 * ============================================================ */
import {
  clamp, pointerPos, roundRect, circle, glow, noGlow,
  label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g10';
export const accent = '#6366F1';

const W = 640, H = 480;
const BOX = 326;
const BX = (W - BOX) / 2;
const BY = 96;
const MAX_LIVES = 3;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xA17E);
  const state = {
    t: 0, phase: 'show', level: 1, lives: MAX_LIVES, score: 0,
    streak: 0, best: 0, step: 0, clean: true, fast: false, skipUsed: false,
    banner: 0, bannerText: '', bad: 0, shake: 0, over: false,
  };
  const seq = [];
  const chips = [];
  const pending = [];

  const later = (ms, fn) => { const t = ctx.after(ms, fn); pending.push(t); return t; };
  const clearPending = () => {
    for (const t of pending) ctx.clearTimeoutSafe(t);
    pending.length = 0;
  };

  const cols = () => (state.level > 5 ? 5 : 4);

  // ---- grid ---------------------------------------------------------

  const buildGrid = () => {
    const n = cols();
    const cw = n === 4 ? 74 : 58;
    const gap = n === 4 ? 10 : 9;
    chips.length = 0;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const x = BX + col * (cw + gap);
        const y = BY + row * (cw + gap);
        chips.push({
          idx: chips.length, row, col, x, y, w: cw, h: cw,
          cx: x + cw / 2, cy: y + cw / 2,
          pulse: 0, press: 0, bad: 0, hot: 0,
        });
      }
    }
  };

  const growSeq = () => {
    const n = cols() * cols();
    seq.push(Math.floor(rng() * n) % n);
  };

  // ---- sequence playback --------------------------------------------

  const showSequence = () => {
    clearPending();
    state.phase = 'show';
    state.step = 0;
    state.banner = 1.4;
    state.bannerText = state.skipUsed && state.fast ? 'REPLAY 2x' : `LEVEL ${state.level} — WATCH`;
    if (ctx.audio) ctx.audio.select();
    const step = Math.max(150, 600 - state.level * 28) * (state.fast ? 0.5 : 1);
    seq.forEach((idx, i) => later(i * step, () => {
      if (state.over || state.phase !== 'show') return;
      const ch = chips[idx];
      if (!ch) return;
      ch.pulse = 1;
      if (ctx.audio) ctx.audio.tick();
    }));
    later(seq.length * step + step * 0.85, () => {
      if (state.over || state.phase !== 'show') return;
      state.phase = 'input';
      state.banner = 1;
      state.bannerText = 'REPEAT';
    });
  };

  const clearLevel = () => {
    state.score += state.level * 120 + state.best * 6;
    ctx.onScore(state.score);
    clearPending();
    state.phase = 'clear';
    state.banner = 1.2;
    state.bannerText = `LEVEL ${state.level} CLEAR`;
    if (ctx.audio) {
      if (state.clean) ctx.audio.perfect();
      ctx.audio.levelUp();
    }
    state.level += 1;
    state.streak = 0;
    later(1050, () => {
      if (state.over) return;
      growSeq();
      buildGrid();
      showSequence();
    });
  };

  const endRun = () => {
    if (state.over) return;
    state.over = true;
    state.phase = 'over';
    clearPending();
    if (ctx.audio) ctx.audio.gameOver();
    ctx.loop && ctx.loop.stop();
    ctx.finish(state.score);
  };

  const loseLife = () => {
    state.lives -= 1;
    clearPending();
    state.phase = 'bad';
    state.banner = 1.1;
    state.bannerText = state.lives > 0 ? 'DESYNC — RESET' : 'LINK SEVERED';
    later(1000, () => {
      if (state.over) return;
      if (state.lives <= 0) { endRun(); return; }
      state.level = 1;
      state.clean = true;
      state.fast = false;
      state.skipUsed = false;
      seq.length = 0;
      growSeq();
      buildGrid();
      showSequence();
    });
  };

  // ---- input --------------------------------------------------------

  const press = (idx) => {
    if (state.over || state.phase !== 'input') return;
    const ch = chips[idx];
    if (!ch) return;
    if (idx === seq[state.step]) {
      ch.press = 1;
      state.step += 1;
      state.streak += 1;
      if (state.streak > state.best) state.best = state.streak;
      if (ctx.audio) ctx.audio.coin();
      if (state.step >= seq.length) clearLevel();
    } else {
      ch.bad = 1;
      ch.press = 0;
      state.bad = 1;
      state.shake = 9;
      state.streak = 0;
      state.clean = false;
      if (ctx.audio) ctx.audio.error();
      loseLife();
    }
  };

  const chipAt = (gx, gy) => {
    for (const ch of chips) {
      if (gx >= ch.x && gx <= ch.x + ch.w && gy >= ch.y && gy <= ch.y + ch.h) return ch;
    }
    return null;
  };

  const onPointer = (ev) => {
    if (state.over || state.phase !== 'input') return;
    const p = pointerPos(ctx.canvas, ev);
    const gx = (p.x * W) / ctx.canvas.width;
    const gy = (p.y * H) / ctx.canvas.height;
    const ch = chipAt(gx, gy);
    if (ch) press(ch.idx);
  };

  const onKey = (ev) => {
    if (state.over) return;
    if (ev.code === 'KeyM') { state.streak = 0; return; }
    if (ev.code !== 'Space') return;
    ev.preventDefault();
    if (state.phase === 'show') {
      if (state.fast) { state.fast = false; showSequence(); }
      return;
    }
    if (state.phase !== 'input') return;
    if (state.fast) { state.fast = false; return; }
    state.fast = true;
    if (state.skipUsed) return;
    state.skipUsed = true;
    if (ctx.audio) ctx.audio.powerup();
    showSequence();
  };

  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointer);
  ctx.listeners.on(window, 'keydown', onKey);

  buildGrid();
  growSeq();
  showSequence();

  // ---- update -------------------------------------------------------

  const update = (dt) => {
    state.t += dt;
    state.shake *= Math.max(0, 1 - dt * 8);
    state.bad = Math.max(0, state.bad - dt * 1.4);
    state.banner = Math.max(0, state.banner - dt);
    for (const ch of chips) {
      ch.pulse = Math.max(0, ch.pulse - dt * 3.2);
      ch.press = Math.max(0, ch.press - dt * 4.4);
      ch.bad = Math.max(0, ch.bad - dt * 2);
    }
  };

  // ---- draw ---------------------------------------------------------

  const drawBackdrop = () => {
    c.fillStyle = '#090D16';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  };

  const drawChip = (ch) => {
    const bad = ch.bad > 0.02;
    const good = !bad && ch.press > 0.02;
    const lit = Math.max(ch.pulse, good ? ch.press : 0);
    const hue = bad ? '#F43F5E' : good ? '#10B981' : '#6366F1';
    c.fillStyle = bad ? 'rgba(244,63,94,0.20)' : good ? 'rgba(16,185,129,0.20)' : 'rgba(99,102,241,0.09)';
    roundRect(c, ch.x, ch.y, ch.w, ch.h, 12);
    c.fill();
    if (lit > 0.02) {
      glow(c, hue, 30 * lit);
      c.fillStyle = hue;
      c.globalAlpha = clamp(lit * 1.1, 0, 1);
      roundRect(c, ch.x, ch.y, ch.w, ch.h, 12);
      c.fill();
      noGlow(c);
      c.globalAlpha = 1;
    }
    c.strokeStyle = hue;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.3 + lit * 0.6;
    roundRect(c, ch.x + 1, ch.y + 1, ch.w - 2, ch.h - 2, 11);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = hue;
    c.globalAlpha = 0.35 + lit * 0.65;
    circle(c, ch.cx, ch.cy, 3.4 + lit * 3);
    c.fill();
    c.globalAlpha = 1;
  };

  const drawPips = (x, y, n, filled, on, off) => {
    for (let i = 0; i < n; i++) {
      const px = x + i * 17;
      c.fillStyle = i < filled ? on : off;
      roundRect(c, px, y, 12, 12, 3);
      c.fill();
    }
  };

  const draw = () => {
    ctx.clear('#090D16');
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();

    c.strokeStyle = 'rgba(99,102,241,0.22)';
    c.lineWidth = 1;
    roundRect(c, BX - 10, BY - 10, BOX + 20, BOX + 20, 16);
    c.stroke();

    for (const ch of chips) drawChip(ch);

    if (state.bad > 0.02) {
      c.globalAlpha = state.bad * 0.5;
      c.strokeStyle = '#F43F5E';
      c.lineWidth = 4;
      roundRect(c, BX - 10, BY - 10, BOX + 20, BOX + 20, 16);
      c.stroke();
      c.globalAlpha = 1;
    }

    // sequence progress pips
    const pipY = BY + BOX + 30;
    drawPips(W / 2 - (seq.length * 11) / 2, pipY, seq.length, state.step, '#10B981', 'rgba(99,102,241,0.28)');

    if (state.banner > 0) {
      c.globalAlpha = clamp(state.banner, 0, 1);
      labelCenter(c, state.bannerText, W / 2, BY - 24, 18, state.bad > 0.3 ? '#F43F5E' : '#E2E8F0');
      c.globalAlpha = 1;
    }

    // HUD
    c.fillStyle = 'rgba(9,13,22,0.78)';
    c.fillRect(0, 0, W, 46);
    label(c, `LEVEL ${state.level}`, 14, 30, 20, '#6366F1');
    label(c, `${cols()}x${cols()}`, 140, 30, 16, '#64748B');

    drawPips(W / 2 - 25, 17, MAX_LIVES, state.lives, '#F43F5E', 'rgba(100,116,139,0.35)');

    label(c, `STREAK ${state.streak}`, W - 152, 30, 16, state.streak > 2 ? '#F59E0B' : '#64748B');
    label(c, `BEST ${state.best}`, W - 14, 30, 16, '#E2E8F0', 'right');
    label(c, `SCORE ${state.score}`, 14, 64, 16, '#10B981');

    // speed-mode strip
    const sy = H - 40;
    label(c, 'SPACE 2x SPEED', 14, sy, 14, state.fast ? '#F59E0B' : '#64748B');
    label(c, state.skipUsed ? 'REPLAY USED' : 'REPLAY READY', 14, sy + 18, 12, state.skipUsed ? '#64748B' : '#10B981');
    if (state.over) {
      label(c, 'LINK SEVERED', W - 14, sy, 18, '#F43F5E', 'right');
    } else {
      label(c, state.phase === 'input' ? 'INPUT OPEN' : state.phase === 'show' ? 'WATCHING' : state.phase.toUpperCase(),
        W - 14, sy, 14, state.phase === 'input' ? '#10B981' : '#64748B', 'right');
    }

    const pw = W - 28;
    c.fillStyle = 'rgba(99,102,241,0.22)';
    c.fillRect(14, H - 14, pw, 6);
    c.fillStyle = '#6366F1';
    c.fillRect(14, H - 14, pw * clamp(state.step / Math.max(1, seq.length), 0, 1), 6);

    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}