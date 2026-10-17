/* ============================================================
 * GAME 04 — DATA CATCHER
 * Slide the rack along the floor and catch falling data packets.
 * ============================================================ */
import {
  integrate, clampCircleToBounds, clamp, intersectCircleAABB,
  pointerPos, circle, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g04';
export const accent = '#6366F1';

const W = 640, H = 480;
const ROUND_MS = 45000;
const ROUND_S = ROUND_MS / 1000;
const HUD_H = 46;
const FLOOR_Y = 436;          // rack centre line
const START_LIVES = 3;

const START_FALL = 150;       // px/s at t=0
const MAX_FALL = 540;         // > FAST_SPEED, so integrate() sub-steps
const RACK_SPEED = 520;       // > FAST_SPEED, so integrate() sub-steps
const RACK_FOLLOW = 13;       // pointer follow gain
const RACK_R = 30;
const TRAY_W = 60;
const TRAY_H = 20;
const MISS_Y = FLOOR_Y + 18;  // packet centre past this = slipped through

const GOLD_CHANCE = 0.05;
const SLOW_TIME = 1.7;        // gold freeze window on the bad packets
const SLOW_FACTOR = 0.06;
const MAX_PACKETS = 48;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xDA7A);
  const state = {
    t: 0, left: ROUND_MS, score: 0, combo: 0, bestCombo: 0,
    lives: START_LIVES, spawnAcc: 0, shake: 0, slow: 0, over: false, won: false,
  };
  const packets = [];
  const pops = [];

  /* ---- rack ---------------------------------------------------- */

  const rack = { x: W / 2, y: FLOOR_Y, r: RACK_R, vx: 0, vy: 0, dir: 0, target: W / 2 };
  const tray = () => ({ x: rack.x - TRAY_W / 2, y: rack.y - TRAY_H / 2, w: TRAY_W, h: TRAY_H });

  /* ---- difficulty curves --------------------------------------- */

  const fallFor = (t) => START_FALL + (MAX_FALL - START_FALL) * clamp(t / ROUND_S, 0, 1);
  const intervalFor = (t) => Math.max(0.24, 0.68 - 0.46 * clamp(t / ROUND_S, 0, 1));
  const badFor = (t) => 0.12 + 0.30 * clamp(t / ROUND_S, 0, 1);
  const mult = () => 1 + Math.min(state.combo, 20) * 0.12;

  /* ---- packets -------------------------------------------------- */

  const land = (p) => {
    p.dead = true;
    const gain = p.kind === 'bad' ? 0 : Math.round((p.kind === 'gold' ? 75 : 10) * mult());
    pops.push({ x: p.x, y: Math.min(p.y, FLOOR_Y), r: p.r, life: 1, kind: p.kind, gain });

    if (p.kind === 'good') {
      state.combo++;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      state.score += gain;
      ctx.onScore(state.score);
      if (ctx.audio) ctx.audio.cash();
    } else if (p.kind === 'bad') {
      state.combo = 0;
      state.lives--;
      state.shake = 12;
      if (ctx.audio) ctx.audio.error();
      if (state.lives <= 0) end(false);
    } else {
      state.score += gain;
      state.slow = SLOW_TIME;
      ctx.onScore(state.score);
      if (ctx.audio) ctx.audio.powerup();
    }
  };

  const step = (p) => (x, y) => {
    if (p.dead) return;
    if (y - p.r > MISS_Y) { p.dead = true; state.combo = 0; return; }
    if (y + p.r > rack.y - TRAY_H / 2 && intersectCircleAABB(x, y, p.r, tray())) land(p);
  };

  const spawn = () => {
    const roll = rng();
    const kind = roll < GOLD_CHANCE ? 'gold'
      : roll < GOLD_CHANCE + badFor(state.t) ? 'bad' : 'good';
    const r = kind === 'gold' ? 11 : kind === 'bad' ? 9 + rng() * 3 : 8 + rng() * 5;
    const x = clamp(rng() < 0.35 ? rack.x + (rng() - 0.5) * 120 : 24 + rng() * (W - 48), r + 8, W - r - 8);
    const p = {
      x, y: -r - 4, r, vx: 0, vy: 0, speed: fallFor(state.t),
      kind, dead: false, phase: rng() * Math.PI * 2, seed: rng(),
    };
    p.step = step(p);
    packets.push(p);
  };

  /* ---- lifecycle ------------------------------------------------ */

  const end = (won) => {
    if (state.over) return;
    state.over = true;
    state.won = won;
    if (ctx.audio) { if (won) ctx.audio.win(); else ctx.audio.gameOver(); }
    if (ctx.loop) ctx.loop.stop();
    ctx.finish(state.score);
  };

  ctx.after(ROUND_MS, () => end(true));
  ctx.every(1000, () => {
    if (!state.over && state.left <= 5500) { if (ctx.audio) ctx.audio.tick(); }
  });

  /* ---- input ---------------------------------------------------- */

  const onKeyDown = (ev) => {
    const k = ev.code || ev.key;
    if (k === 'ArrowLeft' || k === 'KeyA') { rack.dir = -1; rack.target = rack.x; ev.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'KeyD') { rack.dir = 1; rack.target = rack.x; ev.preventDefault(); }
  };
  const onKeyUp = (ev) => {
    const k = ev.code || ev.key;
    if (rack.dir < 0 && (k === 'ArrowLeft' || k === 'KeyA')) rack.dir = 0;
    else if (rack.dir > 0 && (k === 'ArrowRight' || k === 'KeyD')) rack.dir = 0;
  };
  const onPointer = (ev) => {
    if (state.over) return;
    const p = pointerPos(ctx.canvas, ev);
    rack.target = clamp((p.x * W) / ctx.canvas.width, RACK_R, W - RACK_R);
    if (!rack.dir) rack.vx = clamp((rack.target - rack.x) * RACK_FOLLOW, -RACK_SPEED, RACK_SPEED);
  };

  ctx.listeners.on(window, 'keydown', onKeyDown);
  ctx.listeners.on(window, 'keyup', onKeyUp);
  ctx.listeners.on(ctx.canvas, 'pointermove', onPointer);
  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointer);

  /* ---- update --------------------------------------------------- */

  const update = (dt) => {
    state.shake *= Math.max(0, 1 - dt * 7);
    state.slow = Math.max(0, state.slow - dt);
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.life -= dt * 2.2;
      p.r += dt * 40;
      if (p.life <= 0) pops.splice(i, 1);
    }
    if (state.over) return;

    state.t += dt;
    state.left = Math.max(0, ROUND_MS - state.t * 1000);

    // rack: keys drive directly, the pointer is chased with a capped velocity
    rack.vx = rack.dir
      ? rack.dir * RACK_SPEED
      : clamp((rack.target - rack.x) * RACK_FOLLOW, -RACK_SPEED, RACK_SPEED);
    integrate(rack, dt, W, H, null);
    clampCircleToBounds(rack, W, H);

    state.spawnAcc += dt;
    const interval = intervalFor(state.t);
    while (state.spawnAcc >= interval) {
      state.spawnAcc -= interval;
      if (packets.length < MAX_PACKETS) spawn();
    }

    for (const p of packets) {
      p.speed = fallFor(state.t);
      p.vy = p.speed * (p.kind === 'bad' && state.slow > 0 ? SLOW_FACTOR : 1);
      p.phase += dt * 5;
      integrate(p, dt, W, H, p.step);
      clampCircleToBounds(p, W, H);
    }
    for (let i = packets.length - 1; i >= 0; i--) {
      if (packets[i].dead) packets.splice(i, 1);
    }
  };

  /* ---- draw ----------------------------------------------------- */

  const drawBackdrop = () => {
    ctx.clear('#090D16');
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = HUD_H; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    c.fillStyle = '#0C1222';
    c.fillRect(0, FLOOR_Y + 16, W, H - FLOOR_Y - 16);
    c.fillStyle = 'rgba(16,185,129,0.18)';
    c.fillRect(0, FLOOR_Y + 16, W, 2);
  };

  const hueOf = (k) => (k === 'good' ? '#6366F1' : k === 'bad' ? '#F43F5E' : '#F59E0B');

  const drawPacket = (p) => {
    const hue = hueOf(p.kind);
    glow(c, hue, 12);
    c.fillStyle = hue;
    roundRect(c, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, 4);
    c.fill();
    noGlow(c);

    c.fillStyle = 'rgba(9,13,22,0.55)';
    const bars = p.kind === 'bad' ? 3 : 2;
    for (let i = 0; i < bars; i++) {
      const w = (2 + p.seed * 6) | 0;
      c.fillRect(p.x - p.r + 3, p.y - p.r + 4 + i * 4, w, 2);
    }
    if (p.kind === 'bad') {
      c.strokeStyle = 'rgba(9,13,22,0.75)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(p.x - p.r + 3, p.y - 2);
      c.lineTo(p.x + p.r - 3, p.y - 2);
      c.moveTo(p.x - p.r + 3, p.y + 3);
      c.lineTo(p.x + p.r - 3, p.y + 3);
      c.stroke();
    } else if (p.kind === 'gold') {
      const s = (Math.sin(p.phase) + 1) * 0.5;
      c.globalAlpha = 0.35 + s * 0.5;
      c.strokeStyle = '#FDE68A';
      c.lineWidth = 2;
      circle(c, p.x, p.y, p.r + 3 + s * 3);
      c.stroke();
      c.globalAlpha = 1;
    }
  };

  const drawRack = () => {
    glow(c, '#10B981', 16);
    c.fillStyle = 'rgba(9,13,22,0.85)';
    roundRect(c, rack.x - TRAY_W / 2 - 2, rack.y - TRAY_H / 2 - 2, TRAY_W + 4, TRAY_H + 4, 8);
    c.fill();
    c.strokeStyle = '#10B981';
    c.lineWidth = 2;
    roundRect(c, rack.x - TRAY_W / 2 - 2, rack.y - TRAY_H / 2 - 2, TRAY_W + 4, TRAY_H + 4, 8);
    c.stroke();
    noGlow(c);

    c.fillStyle = '#10B981';
    for (let i = -1; i <= 1; i++) c.fillRect(rack.x + i * 14 - 2, rack.y - 6, 4, 12);

    c.fillStyle = 'rgba(16,185,129,0.10)';
    c.fillRect(rack.x - TRAY_W / 2, rack.y - 1, TRAY_W, 2);
  };

  const drawPops = () => {
    for (const p of pops) {
      c.globalAlpha = Math.max(0, p.life);
      const hue = hueOf(p.kind);
      c.strokeStyle = hue;
      c.lineWidth = 2;
      circle(c, p.x, p.y, p.r);
      c.stroke();
      if (p.gain > 0) labelCenter(c, `+${p.gain}`, p.x, p.y - p.r - 8, 13, hue);
      c.globalAlpha = 1;
    }
  };

  const drawFreeze = () => {
    if (state.slow <= 0) return;
    c.fillStyle = 'rgba(245,158,11,0.06)';
    c.fillRect(0, HUD_H, W, FLOOR_Y - HUD_H);
    labelCenter(c, 'GOLD FREEZE', W / 2, HUD_H + 20, 13, '#F59E0B');
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    drawBackdrop();

    for (const p of packets) drawPacket(p);
    drawRack();
    drawPops();
    drawFreeze();

    // HUD
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, 0, W, HUD_H);
    label(c, `SCORE ${state.score}`, 14, 31, 20, '#6366F1');
    label(c, `x${state.combo}`, 208, 31, 20, state.combo > 4 ? '#F59E0B' : '#64748B');
    label(c, `${(state.left / 1000).toFixed(1)}s`, W - 14, 31, 20, state.left < 10000 ? '#F43F5E' : '#E2E8F0', 'right');

    for (let i = 0; i < START_LIVES; i++) {
      c.fillStyle = i < state.lives ? '#10B981' : '#1E293B';
      roundRect(c, W - 118 + i * 16, 14, 11, 11, 3);
      c.fill();
    }

    // round progress bar
    c.fillStyle = 'rgba(99,102,241,0.25)';
    c.fillRect(0, H - 6, W, 6);
    c.fillStyle = '#6366F1';
    c.fillRect(0, H - 6, W * (state.left / ROUND_MS), 6);
    labelCenter(c, 'ARROWS / A-D / POINTER', W / 2, FLOOR_Y + 36, 12, '#64748B');

    if (state.over) {
      c.fillStyle = 'rgba(9,13,22,0.6)';
      c.fillRect(0, 0, W, H);
      labelCenter(c, state.won ? 'ROUND COMPLETE' : 'RACK BLOWN', W / 2, 226, 26, state.won ? '#10B981' : '#F43F5E');
      labelCenter(c, `FINAL ${state.score}   BEST COMBO x${state.bestCombo}`, W / 2, 258, 15, '#E2E8F0');
    }

    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}