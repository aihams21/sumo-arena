/* ============================================================
 * GAME 02 — FLAPPY PACKET
 * Dive the data packet through the gaps of a scrolling firewall.
 * ============================================================ */
import {
  integrate, clampCircleToBounds, needsSubStepping, intersectCircleAABB,
  clamp, circle, glow, noGlow, roundRect, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g02';
export const accent = '#10B981';

const W = 640, H = 480;
const HUD_H = 46;
const FLOOR_H = 46;
const TOP = HUD_H;             // ceiling line — touching it is fatal
const BOT = H - FLOOR_H;       // floor line  — touching it is fatal

const PACKET_X = 168;
const R = 11;
const GRAVITY = 1250;
const FLAP_VY = -430;
const MAX_FALL = 620;          // > FAST_SPEED, so integrate() sub-steps

const PYLON_W = 54;
const PYLON_LEAD = 26;         // spawn offset past the right edge
const SPAWN_DIST = 250;
const START_GAP = 178;
const MIN_GAP = 118;
const GAP_SHRINK_T = 55;
const START_SPEED = 132;
const MAX_SPEED = 320;
const SPEED_RAMP_T = 70;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xF1A9);
  const state = {
    t: 0, travelled: 0, score: 0, speed: START_SPEED, gapH: START_GAP,
    launched: false, over: false, flapFlash: 0, shake: 0, idle: 0,
  };

  const bird = { x: PACKET_X, y: (TOP + BOT) / 2, r: R, vx: 0, vy: 0, wing: 0 };
  const gates = [];
  const rings = [];
  let nextSpawn = SPAWN_DIST;
  let swept = false;            // set each frame: does this frame need sub-steps?
  let prevY = bird.y;           // previous sub-step ordinate, for the swept test

  const gapFor = (t) => START_GAP + (MIN_GAP - START_GAP) * clamp(t / GAP_SHRINK_T, 0, 1);
  const speedFor = (t) => START_SPEED + (MAX_SPEED - START_SPEED) * clamp(t / SPEED_RAMP_T, 0, 1);

  /* ---- pylon geometry ------------------------------------------- */

  const spawnGate = () => {
    const gapH = gapFor(state.t);
    const margin = gapH / 2 + 14;
    const gapY = clamp(TOP + margin + rng() * (BOT - TOP - margin * 2), TOP + margin, BOT - margin);
    gates.push({ x: W + PYLON_LEAD, gapY, gapH, sx: state.travelled, scored: false, seed: rng() });
  };

  /** Solid boxes of one firewall pylon, over-hanging the play band. */
  const pylonBoxes = (g) => {
    const over = 30;
    const capY = g.gapY - g.gapH / 2;
    const sillY = g.gapY + g.gapH / 2;
    return {
      top: { x: g.x, y: TOP - over, w: PYLON_W, h: capY - (TOP - over) },
      bot: { x: g.x, y: sillY, w: PYLON_W, h: BOT + over - sillY },
    };
  };

  /**
   * Swept vertical test. The packet only moves on Y, so when a frame is long
   * enough to sub-step (needsSubStepping) a point test can tunnel through a
   * thin pylon face — this checks the whole travelled span instead.
   */
  const spanHit = (box, y0, y1) => {
    const lo = Math.min(y0, y1) - bird.r;
    const hi = Math.max(y0, y1) + bird.r;
    if (bird.x + bird.r < box.x || bird.x - bird.r > box.x + box.w) return false;
    return box.y <= hi && box.y + box.h >= lo;
  };

  const hitsPylon = (x, y) => {
    for (const g of gates) {
      if (x + bird.r < g.x || x - bird.r > g.x + PYLON_W) continue;
      const b = pylonBoxes(g);
      if (intersectCircleAABB(x, y, bird.r, b.top) || intersectCircleAABB(x, y, bird.r, b.bot)) return true;
      if (swept && (spanHit(b.top, prevY, y) || spanHit(b.bot, prevY, y))) return true;
    }
    return false;
  };

  /* ---- lifecycle ------------------------------------------------ */

  const kill = () => {
    if (state.over) return;
    state.over = true;
    state.shake = 12;
    if (ctx.audio) ctx.audio.hit();
    if (ctx.loop) ctx.loop.stop();
    ctx.finish(state.score);
  };

  const launch = () => {
    if (state.over) return;
    if (!state.launched) {
      state.launched = true;
      state.t = 0;              // difficulty ramp starts on the first flap
      bird.y = (TOP + BOT) / 2;
    }
    bird.vy = FLAP_VY;
    state.flapFlash = 1;
    rings.push({ x: bird.x, y: bird.y, r: R, life: 1 });
    if (ctx.audio) ctx.audio.jump();
  };

  const onKey = (ev) => {
    if (ev.code !== 'Space' && ev.code !== 'ArrowUp' && ev.key !== ' ' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    if (ev.repeat) return;
    launch();
  };

  const onPointer = (ev) => {
    ev.preventDefault();
    launch();
  };

  ctx.listeners.on(window, 'keydown', onKey);
  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointer);

  spawnGate();                   // one pylon waiting off the right edge

  /* ---- per-sub-step collision callback -------------------------- */

  const onStep = (x, y) => {
    if (state.over) return;
    if (y - bird.r <= TOP || y + bird.r >= BOT) { kill(); return; }
    if (hitsPylon(x, y)) kill();
  };

  /* ---- update --------------------------------------------------- */

  const update = (dt) => {
    state.flapFlash *= Math.max(0, 1 - dt * 6);
    state.shake *= Math.max(0, 1 - dt * 7);
    state.idle += dt;

    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.r += dt * 78;
      g.life -= dt * 2.6;
      if (g.life <= 0) rings.splice(i, 1);
    }

    if (!state.launched) {
      bird.y = (TOP + BOT) / 2 + Math.sin(state.idle * 3) * 12;
      bird.vy = 0;
      bird.wing += dt * 6;
    } else if (!state.over) {
      state.t += dt;
      state.speed = speedFor(state.t);
      state.gapH = gapFor(state.t);
      state.travelled += state.speed * dt;

      while (state.travelled >= nextSpawn) { spawnGate(); nextSpawn += SPAWN_DIST; }
      for (const g of gates) g.x = W + PYLON_LEAD - (state.travelled - g.sx);

      bird.wing += dt * 22;
      bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);

      swept = needsSubStepping(bird);
      prevY = bird.y;
      integrate(bird, dt, W, H, onStep);
      clampCircleToBounds(bird, W, H);

      for (const g of gates) {
        if (!g.scored && bird.x + bird.r > g.x + PYLON_W) {
          g.scored = true;
          state.score++;
          ctx.onScore(state.score);
          if (ctx.audio) ctx.audio.coin();
        }
      }
    }

    for (let i = gates.length - 1; i >= 0; i--) {
      if (gates[i].x + PYLON_W < -40) gates.splice(i, 1);
    }
  };

  /* ---- draw ----------------------------------------------------- */

  const drawBackdrop = () => {
    c.fillStyle = '#090D16';
    c.fillRect(0, 0, W, H);
    const off = (state.launched ? state.travelled : state.idle * 26) % 40;
    c.strokeStyle = 'rgba(16,185,129,0.10)';
    c.lineWidth = 1;
    for (let x = -off; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  };

  const fillPylon = (box, dir) => {
    c.fillStyle = '#0C1F19';
    roundRect(c, box.x, box.y, box.w, box.h, 6);
    c.fill();

    c.strokeStyle = 'rgba(16,185,129,0.35)';
    c.lineWidth = 2;
    for (let k = 1; k <= 2; k++) {
      const y = dir < 0 ? box.y + box.h - k * 12 : box.y + k * 12;
      c.beginPath();
      c.moveTo(box.x + 4, y);
      c.lineTo(box.x + box.w - 4, y);
      c.stroke();
    }

    glow(c, accent, 10);
    c.strokeStyle = accent;
    c.lineWidth = 2;
    roundRect(c, box.x, box.y, box.w, box.h, 6);
    c.stroke();
    noGlow(c);
  };

  const drawGates = () => {
    for (const g of gates) {
      const b = pylonBoxes(g);
      fillPylon(b.top, -1);
      fillPylon(b.bot, 1);
      c.fillStyle = 'rgba(16,185,129,0.12)';
      c.fillRect(g.x + 2, b.top.y + b.top.h, PYLON_W - 4, b.bot.y - (b.top.y + b.top.h));
    }
  };

  const drawPacket = () => {
    for (const g of rings) {
      c.globalAlpha = Math.max(0, g.life) * 0.6;
      c.strokeStyle = accent;
      c.lineWidth = 2;
      circle(c, g.x, g.y, g.r);
      c.stroke();
      c.globalAlpha = 1;
    }

    c.save();
    c.translate(bird.x, bird.y);
    c.rotate(clamp(bird.vy / 900, -0.5, 0.9));
    const flap = Math.sin(bird.wing) * 0.5 + 0.5;

    glow(c, accent, 14 + state.flapFlash * 12);
    c.fillStyle = state.flapFlash > 0.35 ? '#ECFDF5' : accent;
    roundRect(c, -13, -9, 26, 18, 5);
    c.fill();
    noGlow(c);

    c.fillStyle = '#05261C';
    roundRect(c, -8, -6, 11, 12, 3);
    c.fill();
    c.fillStyle = 'rgba(236,253,245,0.85)';
    c.fillRect(-6, -4, 7, 2);
    c.fillRect(-6, 2, 5, 2);

    c.fillStyle = '#065F46';
    c.beginPath();
    c.moveTo(-3, 1);
    c.lineTo(2 + flap * 6, 3);
    c.lineTo(-3, 8);
    c.closePath();
    c.fill();
    c.restore();
  };

  const drawBands = () => {
    c.fillStyle = '#0C1F19';
    c.fillRect(0, BOT, W, FLOOR_H);
    c.fillStyle = 'rgba(16,185,129,0.18)';
    c.fillRect(0, BOT + 4, W, 3);
    c.fillStyle = 'rgba(244,63,94,0.55)';
    c.fillRect(0, TOP - 2, W, 2);
    c.fillRect(0, BOT, W, 2);
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    drawBackdrop();
    drawGates();
    drawPacket();
    drawBands();

    // HUD
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, 0, W, HUD_H);
    label(c, `SCORE ${state.score}`, 14, 31, 20, accent);
    label(c, `${Math.round(state.speed)}PX/S`, 216, 31, 16, '#64748B');
    label(c, `GAP ${Math.round(state.gapH)}`, W - 14, 31, 16, state.gapH < 140 ? '#F59E0B' : '#64748B', 'right');

    if (!state.launched) {
      labelCenter(c, 'SPACE / TAP TO FLAP', W / 2, (TOP + BOT) / 2 + 58, 16, '#64748B');
    }

    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}