/* ============================================================
 * GAME 01 — BUG SQUASHER
 * Click/tap the rogue processes before they multiply.
 * ============================================================ */
import {
  integrate, clampCircleToBounds, needsSubStepping,
  pointerPos, circle, glow, noGlow, labelCenter, label, makeRng,
} from '../physics.js';

export const id = 'g01';
export const accent = '#10B981';

const W = 640, H = 480;
const ROUND_MS = 45000;
const MAX_BUGS = 46;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xB06);
  const state = {
    t: 0, left: ROUND_MS, score: 0, combo: 0, bestCombo: 0,
    misses: 0, spawnAcc: 0, shake: 0, over: false,
  };
  const bugs = [];
  const pops = [];
  let nextId = 1;

  const spawn = (tier = 0) => {
    const fast = tier > 0 && rng() < 0.18 + tier * 0.07;
    const speed = fast ? 250 + rng() * 240 : 55 + rng() * 110 + tier * 9;
    const ang = rng() * Math.PI * 2;
    const r = fast ? 8 + rng() * 3 : 12 + rng() * 9;
    bugs.push({
      id: nextId++,
      x: 34 + rng() * (W - 68),
      y: 40 + rng() * (H - 80),
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r,
      speed,
      phase: rng() * Math.PI * 2,
      wob: 18 + rng() * 46,
      tier,
      value: Math.max(1, Math.round((fast ? 2 : 1) * (1 + tier * 0.6))),
    });
  };

  const clearField = () => {
    bugs.length = 0;
    for (let i = 0; i < 5; i++) spawn(0);
  };
  clearField();

  const pointerHit = (ev) => {
    if (state.over) return;
    const p = pointerPos(ctx.canvas, ev);
    const gx = (p.x * W) / ctx.canvas.width;
    const gy = (p.y * H) / ctx.canvas.height;
    let best = null, bestD = Infinity;
    for (const b of bugs) {
      const d = (b.x - gx) ** 2 + (b.y - gy) ** 2;
      const rad = b.r + 10;
      if (d < rad * rad && d < bestD) { bestD = d; best = b; }
    }
    if (best) {
      const idx = bugs.indexOf(best);
      if (idx >= 0) bugs.splice(idx, 1);
      state.combo++;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      const gain = best.value * (1 + Math.min(state.combo, 20) * 0.1) | 0;
      state.score += gain;
      state.shake = Math.min(10, 3 + best.tier);
      pops.push({ x: best.x, y: best.y, r: best.r, life: 1, gain });
      ctx.onScore(state.score);
      if (ctx.audio) { if (best.tier > 1) ctx.audio.explode(); else ctx.audio.hit(); }
    } else {
      state.combo = 0;
      state.misses++;
      if (ctx.audio) ctx.audio.error();
    }
  };

  ctx.listeners.on(ctx.canvas, 'pointerdown', pointerHit);

  ctx.after(ROUND_MS, () => {
    if (state.over) return;
    state.over = true;
    ctx.loop && ctx.loop.stop();
    ctx.finish(state.score);
  });

  const update = (dt) => {
    state.t += dt;
    if (state.left > 0) state.left = Math.max(0, state.left - dt * 1000);
    state.shake *= Math.max(0, 1 - dt * 8);

    const elapsed = ROUND_MS - state.left;
    const tier = Math.min(6, Math.floor(elapsed / 7000));
    state.spawnAcc += dt;
    const interval = Math.max(0.16, 0.62 - tier * 0.07);
    while (state.spawnAcc >= interval) {
      state.spawnAcc -= interval;
      if (bugs.length < MAX_BUGS) spawn(tier);
    }

    for (const b of bugs) {
      // slow wander for chasers, straight-line drift for the fast ones
      if (needsSubStepping(b)) {
        integrate(b, dt, W, H, null);
      } else {
        b.phase += dt * 1.7;
        b.x += (b.vx + Math.cos(b.phase) * b.wob) * dt;
        b.y += (b.vy + Math.sin(b.phase * 1.3) * b.wob) * dt;
        clampCircleToBounds(b, W, H);
      }
    }

    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.life -= dt * 2.4;
      p.r += dt * 46;
      if (p.life <= 0) pops.splice(i, 1);
    }
  };

  const drawBackdrop = () => {
    c.fillStyle = '#090D16';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  };

  const drawBug = (b) => {
    const hue = b.tier > 1 ? '#F43F5E' : b.tier > 0 ? '#F59E0B' : '#6366F1';
    glow(c, hue, 14);
    c.fillStyle = hue;
    circle(c, b.x, b.y, b.r);
    c.fill();
    noGlow(c);
    c.strokeStyle = '#090D16';
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = b.phase + i * 2.1;
      c.beginPath();
      c.moveTo(b.x + Math.cos(a) * b.r * 0.7, b.y + Math.sin(a) * b.r * 0.7);
      c.lineTo(b.x + Math.cos(a) * b.r * 1.7, b.y + Math.sin(a) * b.r * 1.7);
      c.stroke();
    }
    c.fillStyle = '#0B1220';
    circle(c, b.x - b.r * 0.28, b.y - b.r * 0.24, b.r * 0.3);
    c.fill();
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();

    for (const b of bugs) drawBug(b);

    for (const p of pops) {
      c.globalAlpha = Math.max(0, p.life);
      c.strokeStyle = '#10B981';
      c.lineWidth = 2;
      circle(c, p.x, p.y, p.r);
      c.stroke();
      labelCenter(c, `+${p.gain}`, p.x, p.y - p.r - 8, 13, '#10B981');
      c.globalAlpha = 1;
    }

    // HUD
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, 0, W, 46);
    label(c, `SCORE ${state.score}`, 14, 30, 20, '#10B981');
    label(c, `x${state.combo}`, 190, 30, 20, state.combo > 4 ? '#F59E0B' : '#64748B');
    label(c, `${(state.left / 1000).toFixed(1)}s`, W - 14, 30, 20, state.left < 10000 ? '#F43F5E' : '#E2E8F0', 'right');

    c.fillStyle = 'rgba(99,102,241,0.25)';
    c.fillRect(0, H - 6, W, 6);
    c.fillStyle = '#6366F1';
    c.fillRect(0, H - 6, W * (state.left / ROUND_MS), 6);

    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}