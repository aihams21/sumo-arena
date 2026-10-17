/* ============================================================
 * GAME 16 — ORBITAL DODGE
 * Newtonian satellite, zero friction. Thrust, drift, survive the
 * debris belt, the hunter drones and the black-hole gravity wells.
 * ============================================================ */
import {
  integrate, clampCircleToBounds, clampAndBounceCircle, needsSubStepping,
  intersectCircle, pointerPos, circle, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g16';
export const accent = '#6366F1';

const W = 640, H = 480;
const SHIP_R = 8;
const THRUST = 245;
const MAX_SPEED = 430;
const HARD_SPEED = 545;
const EMP_CD = 3.4;
const EMP_R = 152;
const EMP_PUSH = 540;
const WELL_G = 2600;
const WELL_SOFT = 900;
const WELL_MAX_A = 780;
const MAX_DEBRIS = 24;
const MAX_DRONES = 7;
const SCORE_ANN = 0.12;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xD16);
  const state = {
    t: 0, score: 0, mult: 1, empCd: 0, shake: 0, scoreAcc: 0,
    thrusted: false, aimX: 0, aimY: 0, touching: false, over: false,
  };
  const keys = new Set();
  const ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: SHIP_R, ang: -Math.PI / 2 };
  const debris = [];
  const drones = [];
  const wells = [];
  const rings = [];
  const bits = [];
  const stars = Array.from({ length: 78 }, () => ({
    x: rng() * W, y: rng() * H, z: 0.25 + rng() * 0.75, r: 0.6 + rng() * 1.1,
  }));

  // ---- helpers ----
  const mult = () => 1 + Math.min(24, Math.floor(state.t / 10));

  const capSpeed = (b, max) => {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > max) { b.vx = (b.vx / sp) * max; b.vy = (b.vy / sp) * max; }
  };

  // integrate() only clamps position, so restore the wall bounce ourselves
  const wallKick = (b) => {
    if (b.x <= b.r && b.vx < 0) b.vx = -b.vx;
    else if (b.x >= W - b.r && b.vx > 0) b.vx = -b.vx;
    if (b.y <= b.r && b.vy < 0) b.vy = -b.vy;
    else if (b.y >= H - b.r && b.vy > 0) b.vy = -b.vy;
  };

  const spawnClear = (r, margin) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = margin + rng() * (W - margin * 2);
      const y = margin + rng() * (H - margin * 2);
      if ((x - ship.x) ** 2 + (y - ship.y) ** 2 > 130 * 130) return { x, y };
    }
    return { x: rng() * W, y: rng() * H };
  };

  // ---- gravity wells ----
  const spawnWell = () => {
    const p = spawnClear(120, 56);
    const a = rng() * Math.PI * 2;
    wells.push({
      x: p.x, y: p.y, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18,
      r: 22 + rng() * 8, pulse: rng() * Math.PI * 2, life: 9 + rng() * 5,
    });
  };

  const pullFromWells = (b, dt, strength) => {
    for (const w of wells) {
      const dx = w.x - b.x, dy = w.y - b.y;
      const d2 = dx * dx + dy * dy;
      const reach = w.r * 7;
      if (d2 > reach * reach) continue;
      const d = Math.max(8, Math.sqrt(d2));
      const a = Math.min(WELL_MAX_A, (WELL_G * w.r * w.r) / (d2 + WELL_SOFT)) * strength;
      b.vx += (dx / d) * a * dt;
      b.vy += (dy / d) * a * dt;
    }
  };

  // ---- hazards ----
  const spawnDebris = (tier) => {
    const p = spawnClear(26, 30);
    const a = rng() * Math.PI * 2;
    const sp = 40 + rng() * 90 + tier * 16;
    const r = 7 + rng() * 13;
    debris.push({
      x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r,
      rot: rng() * Math.PI * 2, spin: (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 1.8),
      pts: Array.from({ length: 8 }, () => 0.72 + rng() * 0.36),
    });
  };

  const spawnDrone = (tier) => {
    const p = spawnClear(26, 30);
    const a = rng() * Math.PI * 2;
    drones.push({
      x: p.x, y: p.y, vx: 0, vy: 0, r: 10,
      sp: 82 + tier * 13 + rng() * 22, phase: rng() * Math.PI * 2, blink: 0,
    });
  };

  const seed = () => {
    debris.length = 0;
    drones.length = 0;
    wells.length = 0;
    for (let i = 0; i < 9; i++) spawnDebris(0);
    for (let i = 0; i < 2; i++) spawnDrone(0);
    spawnWell();
  };
  seed();

  // ---- effects + end ----
  const boom = (x, y, color, n) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const sp = 40 + rng() * 210;
      bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + rng() * 0.5, color });
    }
  };

  const die = () => {
    if (state.over) return;
    state.over = true;
    state.shake = 16;
    boom(ship.x, ship.y, '#F43F5E', 22);
    rings.push({ x: ship.x, y: ship.y, r: 10, life: 1, color: '#F43F5E' });
    ctx.fx && ctx.fx.burst && ctx.fx.burst(ship.x, ship.y, '#F43F5E');
    if (ctx.audio) ctx.audio.explode();
    if (ctx.audio) ctx.audio.gameOver();
    ctx.loop && ctx.loop.stop();
    ctx.finish(state.score);
  };

  // ---- EMP ----
  const emp = () => {
    if (state.over || state.empCd > 0) return;
    state.empCd = EMP_CD;
    rings.push({ x: ship.x, y: ship.y, r: 14, life: 1, color: '#6366F1' });
    const shove = (b) => {
      const dx = b.x - ship.x, dy = b.y - ship.y;
      const d = Math.hypot(dx, dy);
      if (d > EMP_R || d < 0.5) return;
      const f = EMP_PUSH * (1 - d / EMP_R) + 90;
      b.vx += (dx / d) * f;
      b.vy += (dy / d) * f;
      capSpeed(b, HARD_SPEED);
    };
    for (const b of debris) shove(b);
    for (const dr of drones) shove(dr);
    if (ctx.audio) ctx.audio.powerup();
  };

  // ---- input ----
  const onKeyDown = (ev) => {
    if (state.over) return;
    const k = ev.code;
    if (k === 'Space') { ev.preventDefault(); emp(); return; }
    if (k.startsWith('Arrow') || k === 'KeyW' || k === 'KeyA' || k === 'KeyS' || k === 'KeyD') {
      ev.preventDefault();
      keys.add(k);
    }
  };
  const onKeyUp = (ev) => { keys.delete(ev.code); };
  ctx.listeners.on(window, 'keydown', onKeyDown);
  ctx.listeners.on(window, 'keyup', onKeyUp);

  // touch / pointer fallback: hold to thrust toward the finger, tap for EMP
  const onPointerDown = (ev) => {
    if (state.over) return;
    const p = pointerPos(ctx.canvas, ev);
    state.aimX = (p.x * W) / ctx.canvas.width;
    state.aimY = (p.y * H) / ctx.canvas.height;
    state.touching = true;
    ev.preventDefault && ev.preventDefault();
  };
  const onPointerMove = (ev) => {
    if (!state.touching || state.over) return;
    const p = pointerPos(ctx.canvas, ev);
    state.aimX = (p.x * W) / ctx.canvas.width;
    state.aimY = (p.y * H) / ctx.canvas.height;
  };
  const onPointerUp = () => { state.touching = false; };
  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointerDown);
  ctx.listeners.on(ctx.canvas, 'pointermove', onPointerMove);
  ctx.listeners.on(ctx.canvas, 'pointerup', onPointerUp);
  ctx.listeners.on(ctx.canvas, 'pointercancel', onPointerUp);

  // ---- update ----
  const update = (dt) => {
    state.t += dt;
    state.mult = mult();
    state.scoreAcc += dt;
    state.score += dt * 6 * state.mult;
    if (state.empCd > 0) state.empCd = Math.max(0, state.empCd - dt);
    if (state.scoreAcc >= SCORE_ANN) { state.scoreAcc = 0; ctx.onScore(state.score | 0); }
    state.shake *= Math.max(0, 1 - dt * 7);

    // ---- ship thrust ----
    let ix = 0, iy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) ix -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) ix += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) iy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) iy += 1;
    state.touching = state.touching && (state.aimX !== 0 || state.aimY !== 0);
    if (!ix && !iy && state.touching) {
      const dx = state.aimX - ship.x, dy = state.aimY - ship.y;
      const d = Math.hypot(dx, dy);
      if (d > 14) { ix = dx / d; iy = dy / d; }
    }
    const mag = Math.hypot(ix, iy);
    state.thrusted = mag > 0;
    if (mag > 0) {
      ship.vx += (ix / mag) * THRUST * dt;
      ship.vy += (iy / mag) * THRUST * dt;
    }
    pullFromWells(ship, dt, 1);
    capSpeed(ship, MAX_SPEED);
    if (needsSubStepping(ship)) integrate(ship, dt, W, H, null);
    else {
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      clampCircleToBounds(ship, W, H);
    }
    if (Math.hypot(ship.vx, ship.vy) > 8) ship.ang = Math.atan2(ship.vy, ship.vx) + Math.PI / 2;

    // ---- spawning ----
    const tier = Math.min(8, Math.floor(state.t / 12));
    if (debris.length < MAX_DEBRIS && Math.random() < dt * (0.55 + tier * 0.12)) spawnDebris(tier);
    if (drones.length < Math.min(MAX_DRONES, 2 + tier) && Math.random() < dt * (0.09 + tier * 0.03)) spawnDrone(tier);
    if (wells.length < 2 + Math.min(2, Math.floor(tier / 3)) && Math.random() < dt * 0.075) spawnWell();

    // ---- debris ----
    for (const b of debris) {
      pullFromWells(b, dt, 0.55);
      capSpeed(b, HARD_SPEED);
      if (needsSubStepping(b)) integrate(b, dt, W, H, null);
      else { b.x += b.vx * dt; b.y += b.vy * dt; clampAndBounceCircle(b, W, H, 1); }
      wallKick(b);
      b.rot += b.spin * dt;
    }

    // ---- drones ----
    for (const dr of drones) {
      dr.blink += dt;
      const dx = ship.x - dr.x, dy = ship.y - dr.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      // slight lateral weave so they do not just ram head-on
      const weave = Math.sin(state.t * 2.4 + dr.phase) * 0.5;
      const cs = Math.cos(weave), sn = Math.sin(weave);
      const tx = (dx / d) * cs - (dy / d) * sn;
      const ty = (dx / d) * sn + (dy / d) * cs;
      dr.vx += (tx * dr.sp - dr.vx) * Math.min(1, dt * 2.4);
      dr.vy += (ty * dr.sp - dr.vy) * Math.min(1, dt * 2.4);
      pullFromWells(dr, dt, 0.8);
      capSpeed(dr, HARD_SPEED);
      if (needsSubStepping(dr)) integrate(dr, dt, W, H, null);
      else { dr.x += dr.vx * dt; dr.y += dr.vy * dt; clampAndBounceCircle(dr, W, H, 0.9); }
      wallKick(dr);
    }

    // ---- wells ----
    for (let i = wells.length - 1; i >= 0; i--) {
      const w = wells[i];
      w.life -= dt;
      w.pulse += dt * 1.6;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      clampCircleToBounds(w, W, H);
      wallKick(w);
      if (w.life <= 0) { rings.push({ x: w.x, y: w.y, r: w.r, life: 1, color: '#6366F1' }); wells.splice(i, 1); }
    }

    // ---- collision ----
    for (const b of debris) {
      if (intersectCircle(ship.x, ship.y, ship.r, b.x, b.y, b.r)) { die(); return; }
    }
    for (const dr of drones) {
      if (intersectCircle(ship.x, ship.y, ship.r, dr.x, dr.y, dr.r)) {
        boom(dr.x, dr.y, '#F43F5E', 10);
        die();
        return;
      }
    }
    for (const w of wells) {
      const rr = w.r * 0.58 + ship.r;
      if ((w.x - ship.x) ** 2 + (w.y - ship.y) ** 2 < rr * rr) { die(); return; }
    }

    // ---- fx ----
    for (let i = bits.length - 1; i >= 0; i--) {
      const p = bits[i];
      p.life -= dt * 1.6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 1.6);
      p.vy *= Math.max(0, 1 - dt * 1.6);
      if (p.life <= 0) bits.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt * 1.5;
      r.r += dt * 320;
      if (r.life <= 0) rings.splice(i, 1);
    }
  };

  // ---- draw ----
  const drawStars = () => {
    c.fillStyle = '#E2E8F0';
    for (const s of stars) {
      const sx = ((s.x - ship.x * s.z * 0.28) % W + W) % W;
      const sy = ((s.y - ship.y * s.z * 0.28) % H + H) % H;
      c.globalAlpha = 0.25 + s.z * 0.5;
      circle(c, sx, sy, s.r * s.z);
      c.fill();
    }
    c.globalAlpha = 1;
  };

  const drawWell = (w) => {
    const pulse = 1 + Math.sin(w.pulse) * 0.06;
    const r = w.r * pulse;
    const fade = Math.min(1, w.life);
    c.globalAlpha = fade * 0.5;
    glow(c, '#6366F1', 26);
    for (let i = 3; i >= 1; i--) {
      c.strokeStyle = `rgba(99,102,241,${0.16 * i * fade})`;
      c.lineWidth = 1.5;
      circle(c, w.x, w.y, r * (1 + i * 0.9));
      c.stroke();
    }
    noGlow(c);
    c.fillStyle = '#05070D';
    circle(c, w.x, w.y, r);
    c.fill();
    c.strokeStyle = `rgba(226,232,240,${0.75 * fade})`;
    c.lineWidth = 1.5;
    circle(c, w.x, w.y, r * 0.58);
    c.stroke();
    c.globalAlpha = 1;
  };

  const drawDebris = (b) => {
    const hue = b.r > 15 ? '#F59E0B' : '#64748B';
    glow(c, hue, 10);
    c.fillStyle = hue;
    c.beginPath();
    for (let i = 0; i < b.pts.length; i++) {
      const a = b.rot + (i / b.pts.length) * Math.PI * 2;
      const rr = b.r * b.pts[i];
      const px = b.x + Math.cos(a) * rr, py = b.y + Math.sin(a) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    noGlow(c);
  };

  const drawDrone = (dr) => {
    const hot = dr.blink % 1.4 < 0.5;
    glow(c, hot ? '#F43F5E' : '#7F1D1D', 12);
    c.fillStyle = hot ? '#F43F5E' : '#7F1D1D';
    c.beginPath();
    c.moveTo(dr.x, dr.y - dr.r);
    c.lineTo(dr.x + dr.r, dr.y);
    c.lineTo(dr.x, dr.y + dr.r);
    c.lineTo(dr.x - dr.r, dr.y);
    c.closePath();
    c.fill();
    noGlow(c);
    c.strokeStyle = 'rgba(244,63,94,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(dr.x, dr.y);
    c.lineTo(ship.x, ship.y);
    c.stroke();
  };

  const drawShip = () => {
    const a = ship.ang;
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = -sa, ny = ca;
    if (state.thrusted) {
      glow(c, '#F59E0B', 18);
      c.fillStyle = '#F59E0B';
      c.beginPath();
      c.moveTo(ship.x - nx * 7 - ca * 10, ship.y - ny * 7 - sa * 10);
      c.lineTo(ship.x + nx * 7 - ca * 10, ship.y + ny * 7 - sa * 10);
      c.lineTo(ship.x - ca * 26, ship.y - sa * 26);
      c.closePath();
      c.fill();
      noGlow(c);
    }
    glow(c, '#6366F1', 16);
    c.fillStyle = '#6366F1';
    c.beginPath();
    c.moveTo(ship.x + ca * 12, ship.y + sa * 12);
    c.lineTo(ship.x - nx * 9 - ca * 8, ship.y - ny * 9 - sa * 8);
    c.lineTo(ship.x - ca * 6, ship.y - sa * 6);
    c.lineTo(ship.x + nx * 9 - ca * 8, ship.y + ny * 9 - sa * 8);
    c.closePath();
    c.fill();
    noGlow(c);
    c.fillStyle = '#E2E8F0';
    circle(c, ship.x - ca * 2, ship.y - sa * 2, 2.6);
    c.fill();
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    ctx.clear('#090D16');
    drawStars();

    for (const w of wells) drawWell(w);
    for (const b of debris) drawDebris(b);
    for (const dr of drones) drawDrone(dr);

    for (const r of rings) {
      c.globalAlpha = Math.max(0, r.life) * 0.8;
      c.strokeStyle = r.color;
      c.lineWidth = 3;
      circle(c, r.x, r.y, r.r);
      c.stroke();
    }
    c.globalAlpha = 1;

    if (!state.over) drawShip();

    for (const p of bits) {
      c.globalAlpha = Math.max(0, p.life);
      c.fillStyle = p.color;
      circle(c, p.x, p.y, 2.2);
      c.fill();
    }
    c.globalAlpha = 1;

    // ---- HUD ----
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, 0, W, 46);
    label(c, `SCORE ${state.score | 0}`, 14, 30, 20, '#6366F1');
    label(c, `x${state.mult}`, 200, 30, 20, state.mult > 6 ? '#F59E0B' : '#64748B');
    label(c, `${state.t.toFixed(1)}s`, W - 14, 30, 20, '#E2E8F0', 'right');
    labelCenter(c, 'ARROWS THRUST   SPACE EMP', W / 2, 62, 11, '#64748B');

    // EMP cooldown pip row
    const pips = 9;
    const ready = state.empCd <= 0;
    for (let i = 0; i < pips; i++) {
      const filled = ready || i < Math.round((1 - state.empCd / EMP_CD) * pips);
      c.fillStyle = filled ? (ready ? '#6366F1' : '#312E81') : 'rgba(99,102,241,0.18)';
      c.fillRect(14 + i * 13, H - 26, 9, 8);
    }
    label(c, ready ? 'EMP READY' : 'EMP CHARGING', 14 + pips * 13 + 8, H - 17, 11, ready ? '#6366F1' : '#64748B');

    c.fillStyle = 'rgba(99,102,241,0.20)';
    c.fillRect(0, H - 6, W, 6);
    c.fillStyle = '#6366F1';
    c.fillRect(0, H - 6, W * Math.max(0, 1 - state.empCd / EMP_CD), 6);

    if (state.over) {
      labelCenter(c, 'ORBIT LOST', W / 2, H / 2 - 10, 30, '#F43F5E');
      labelCenter(c, `FINAL SCORE ${state.score | 0}   x${state.mult}`, W / 2, H / 2 + 20, 15, '#E2E8F0');
    }

    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}