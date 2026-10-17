/* ============================================================
 * GAME 11 — TOWER STACKER
 * Drop the sweeping slab, shear off the overhang, chase perfect drops.
 * ============================================================ */
import {
  integrate, needsSubStepping, clampToBounds, clamp,
  roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g11';
export const accent = '#10B981';

const W = 640, H = 480;
const BH = 22;            // slab height
const BASE_Y = H - 84;    // ground line when cam = 0
const MOVE_GAP = 96;      // hover distance of the incoming slab
const MOVER_MIN_Y = 62;
const PERFECT_TOL = 6;    // px of slack that still counts as perfect
const GROW = 9;           // width regained on a perfect drop
const GRAVITY = 2600;
const DROP_MS = 240;      // beat before the next slab arrives
const TARGET_H = 40;      // HUD goal, in placed slabs
const CAM_ANCHOR = 210;   // screen y the tower top settles at

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0x7A11);
  const state = {
    t: 0, score: 0, combo: 0, perfects: 0,
    cam: 0, shake: 0, flash: 0, over: false,
  };
  const stack = [{ x: 0, w: W, hue: '#10B981', gold: false, base: true }];
  const parts = [];
  const floats = [];
  let mover = null;
  let falling = null;

  // ---- geometry -------------------------------------------------

  const towerTopY = () => BASE_Y - stack.length * BH + state.cam;
  const segY = (i) => BASE_Y - (i + 1) * BH + state.cam;
  const camTarget = () => Math.max(0, BASE_Y - CAM_ANCHOR - stack.length * BH);
  const lvl = () => stack.length - 1;

  // ---- particles -----------------------------------------------

  const shear = (x, y, w, hue, dir) => {
    const n = clamp(Math.round(w / 9), 1, 14);
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      parts.push({
        x: x + t * w, y, w: pw + 0.6, h: BH,
        vx: dir * (46 + t * 80) + (rng() - 0.5) * 54,
        vy: -150 - rng() * 230,
        life: 1, hue,
      });
    }
  };

  const burst = (x, y, w, hue, count) => {
    const pw = w / count;
    for (let i = 0; i < count; i++) {
      parts.push({
        x: x + i * pw, y, w: pw + 0.6, h: BH,
        vx: (rng() - 0.5) * 460, vy: -110 - rng() * 320,
        life: 1.4, hue,
      });
    }
  };

  const goldBurst = (x, y, w) => {
    const n = clamp(Math.round(w / 12), 4, 16);
    for (let i = 0; i < n; i++) {
      parts.push({
        x: x + rng() * w, y: y + (rng() - 0.5) * BH,
        w: 5 + rng() * 5, h: 3 + rng() * 4,
        vx: (rng() - 0.5) * 300, vy: -200 - rng() * 260,
        life: 1.1, hue: rng() < 0.5 ? '#F59E0B' : '#FDE68A',
      });
    }
  };

  // ---- spawn / drop ---------------------------------------------

  const spawnMover = () => {
    if (state.over || falling) return;
    const n = lvl();
    const w = clamp(150 - n * 4 + rng() * 44, 64, 190);
    mover = {
      x: rng() < 0.5 ? 0 : W - w,
      y: Math.max(MOVER_MIN_Y, towerTopY() - MOVE_GAP),
      w, h: BH, r: 0,
      vx: (rng() < 0.5 ? -1 : 1) * Math.min(680, 230 + n * 26),
      vy: 0,
      hue: rng() < 0.5 ? '#10B981' : '#6366F1',
      pulse: 0,
    };
  };

  const dropBlock = () => {
    if (state.over || !mover || falling) return;
    falling = {
      x: mover.x, y: mover.y, w: mover.w, h: BH, r: 0,
      vx: 0, vy: 70, hue: mover.hue, locked: false,
    };
    if (ctx.audio) ctx.audio.tap();
    mover = null;
  };

  // ---- landing / scoring ----------------------------------------

  const bust = (body) => {
    state.over = true;
    state.combo = 0;
    state.shake = 15;
    burst(body.x, body.y, body.w, body.hue, clamp(Math.round(body.w / 7), 6, 24));
    if (ctx.audio) ctx.audio.explode();
    ctx.after(560, () => {
      if (ctx.audio) ctx.audio.gameOver();
      ctx.finish(state.score);
    });
  };

  const land = (body) => {
    const base = stack[stack.length - 1];
    const oL = Math.max(base.x, body.x);
    const oR = Math.min(base.x + base.w, body.x + body.w);
    const ov = oR - oL;
    if (ov <= 0) return bust(body);

    const perfect = Math.abs(oL - base.x) <= PERFECT_TOL
      && Math.abs(oR - (base.x + base.w)) <= PERFECT_TOL;
    if (body.x < oL - 0.5) shear(body.x, body.y, oL - body.x, body.hue, -1);
    if (body.x + body.w > oR + 0.5) shear(oR, body.y, body.x + body.w - oR, body.hue, 1);

    const n = lvl();
    let sx = oL, sw = ov, hue = body.hue, gold = false;
    let gain = 10 + n * 2;

    if (perfect) {
      state.combo++;
      state.perfects++;
      sw = Math.min(W, ov + GROW);
      sx = clamp(oL - (sw - ov) / 2, 0, W - sw);
      hue = '#10B981';
      gain += 25 + state.combo * 15;
      state.shake = Math.min(9, 3 + state.combo);
      if (state.combo >= 3) {
        gold = true;
        state.combo = 0;
        gain += 120;
        state.flash = 1;
        state.shake = 12;
      }
      if (ctx.audio) ctx.audio.perfect();
    } else {
      state.combo = 0;
      state.shake = Math.min(7, 2 + (body.w - ov) / 26);
      if (ctx.audio) ctx.audio.land();
    }

    stack.push({ x: sx, w: sw, hue, gold, base: false });
    state.score += gain;
    ctx.onScore(state.score);
    floats.push({
      idx: stack.length - 1, life: 1, gain,
      hue: gold ? '#F59E0B' : perfect ? '#10B981' : '#E2E8F0',
    });
    if (gold) goldBurst(sx, towerTopY() - BH / 2, sw);
    ctx.after(DROP_MS, spawnMover);
  };

  // ---- input ----------------------------------------------------

  const onKey = (ev) => {
    if (ev.code !== 'Space' && ev.key !== ' ') return;
    ev.preventDefault();
    if (ev.repeat) return;
    dropBlock();
  };

  const onPointer = (ev) => {
    ev.preventDefault();
    dropBlock();
  };

  ctx.listeners.on(window, 'keydown', onKey);
  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointer);

  // ---- update ---------------------------------------------------

  const update = (dt) => {
    state.t += dt;
    state.shake *= Math.max(0, 1 - dt * 7);
    state.flash = Math.max(0, state.flash - dt * 2.2);

    if (!state.over) state.cam += (camTarget() - state.cam) * Math.min(1, dt * 5.5);

    if (mover) {
      mover.y = Math.max(MOVER_MIN_Y, towerTopY() - MOVE_GAP);
      mover.pulse += dt * 5;
      if (needsSubStepping(mover)) {
        integrate(mover, dt, W, H, null);
        clampToBounds(mover, W, H);
      } else {
        mover.x += mover.vx * dt;
        clampToBounds(mover, W, H);
      }
    }

    if (falling) {
      const body = falling;
      const restY = towerTopY();
      body.vy = Math.min(1500, body.vy + GRAVITY * dt);
      const onStep = (x, y) => {
        if (body.locked) return;
        if (y >= restY) {
          body.locked = true;
          body.y = restY;
          falling = null;
          land(body);
        }
      };
      integrate(falling, dt, W, H, onStep);
      clampToBounds(falling, W, H);
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 1500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 1.2);
      p.life -= dt * 1.5;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].life -= dt * 1.6;
      if (floats[i].life <= 0) floats.splice(i, 1);
    }
  };

  // ---- draw -----------------------------------------------------

  const drawBackdrop = () => {
    ctx.clear('#090D16');
    const off = (state.cam * 0.32) % 40;
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = -off; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    const gy = BASE_Y + state.cam;
    c.fillStyle = 'rgba(16,185,129,0.07)';
    c.fillRect(0, gy, W, H - gy + 60);
    c.strokeStyle = 'rgba(16,185,129,0.45)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();
  };

  const drawSeg = (s, i) => {
    const y = segY(i);
    if (y > H + 4 || y + BH < 36) return;
    const hue = s.gold ? '#F59E0B' : s.hue;
    glow(c, hue, s.gold ? 18 : 8);
    c.fillStyle = s.base ? '#0E2A20' : hue;
    roundRect(c, s.x, y, s.w, BH - 2, 4);
    c.fill();
    noGlow(c);
    c.strokeStyle = s.gold ? '#FDE68A' : 'rgba(9,13,22,0.55)';
    c.lineWidth = s.gold ? 2 : 1.5;
    roundRect(c, s.x + 0.5, y + 0.5, s.w - 1, BH - 3, 4);
    c.stroke();
    c.strokeStyle = s.base ? 'rgba(16,185,129,0.55)' : 'rgba(9,13,22,0.32)';
    c.lineWidth = 1;
    for (let x = s.x + 11; x < s.x + s.w - 5; x += 15) {
      c.beginPath(); c.moveTo(x + 0.5, y + 4); c.lineTo(x + 0.5, y + BH - 6); c.stroke();
    }
  };

  const drawSlab = (b, ghost) => {
    glow(c, b.hue, ghost ? 14 : 10);
    c.globalAlpha = ghost ? 0.92 : 1;
    c.fillStyle = b.hue;
    roundRect(c, b.x, b.y, b.w, BH - 2, 4);
    c.fill();
    noGlow(c);
    c.globalAlpha = 1;
    c.strokeStyle = '#090D16';
    c.lineWidth = 1.5;
    roundRect(c, b.x + 0.5, b.y + 0.5, b.w - 1, BH - 3, 4);
    c.stroke();
  };

  const drawMover = () => {
    if (!mover) return;
    const top = towerTopY();
    c.strokeStyle = 'rgba(226,232,240,0.22)';
    c.lineWidth = 1;
    c.setLineDash([4, 5]);
    for (let x = mover.x + 6; x < mover.x + mover.w; x += 16) {
      c.beginPath(); c.moveTo(x, mover.y + BH); c.lineTo(x, Math.max(top, mover.y + BH + 8)); c.stroke();
    }
    c.setLineDash([]);
    c.strokeStyle = 'rgba(100,116,139,0.55)';
    c.beginPath(); c.moveTo(0, top + 0.5); c.lineTo(W, top + 0.5); c.stroke();
    drawSlab(mover, true);
    const cx = mover.x + mover.w / 2;
    const k = 3 + Math.sin(mover.pulse) * 2;
    glow(c, '#E2E8F0', 8);
    c.fillStyle = '#E2E8F0';
    c.beginPath();
    c.moveTo(cx, mover.y - 8 - k); c.lineTo(cx + 6, mover.y - k); c.lineTo(cx - 6, mover.y - k);
    c.closePath(); c.fill();
    noGlow(c);
    labelCenter(c, 'DROP', cx, mover.y - 16, 11, '#64748B');
  };

  const drawHud = () => {
    const placed = stack.length - 1;
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, 0, W, 46);
    label(c, `SCORE ${state.score}`, 14, 30, 20, '#10B981');
    label(c, `x${state.combo}`, 186, 30, 20, state.combo > 0 ? '#F59E0B' : '#64748B');
    label(c, `${placed}/${TARGET_H}`, W - 14, 30, 20, placed >= TARGET_H ? '#F59E0B' : '#E2E8F0', 'right');

    // perfect pips: three in a row forge a gold slab
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i < state.combo ? '#F59E0B' : '#334155';
      roundRect(c, W / 2 - 22 + i * 22, 18, 16, 6, 3);
      c.fill();
    }
    labelCenter(c, state.combo > 0 ? 'PERFECT CHAIN' : 'PERFECT', W / 2, 13, 9, state.combo > 0 ? '#F59E0B' : '#64748B');

    c.fillStyle = 'rgba(99,102,241,0.25)';
    c.fillRect(0, H - 6, W, 6);
    c.fillStyle = placed >= TARGET_H ? '#F59E0B' : '#6366F1';
    c.fillRect(0, H - 6, W * Math.min(1, placed / TARGET_H), 6);
    label(c, `TOWER ${placed}`, 14, H - 12, 11, '#64748B');
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();

    for (let i = 0; i < stack.length; i++) drawSeg(stack[i], i);
    drawMover();
    if (falling) drawSlab(falling, false);

    for (const p of parts) {
      c.globalAlpha = Math.max(0, Math.min(1, p.life));
      c.fillStyle = p.hue;
      c.fillRect(p.x, p.y, p.w, p.h);
    }
    c.globalAlpha = 1;

    for (const f of floats) {
      c.globalAlpha = Math.max(0, f.life);
      const seg = stack[f.idx];
      labelCenter(c, `+${f.gain}`, seg.x + seg.w / 2, segY(f.idx) - 12, 15, f.hue);
    }
    c.globalAlpha = 1;

    if (state.flash > 0.01) {
      c.fillStyle = `rgba(245,158,11,${state.flash * 0.16})`;
      c.fillRect(0, 0, W, H);
    }

    drawHud();

    if (state.over) {
      c.fillStyle = 'rgba(9,13,22,0.68)';
      c.fillRect(0, 0, W, H);
      labelCenter(c, 'TOWER COLLAPSED', W / 2, H / 2 - 46, 30, '#F43F5E');
      labelCenter(c, `FINAL SCORE ${state.score}`, W / 2, H / 2 - 8, 22, '#E2E8F0');
      labelCenter(c, `${stack.length - 1} BLOCKS · ${state.perfects} PERFECT DROPS`, W / 2, H / 2 + 22, 14, '#64748B');
    }

    c.restore();
  };

  spawnMover();
  ctx.attachLoop(update, draw);

  return null;
}