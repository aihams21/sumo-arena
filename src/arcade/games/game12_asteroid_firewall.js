/* ============================================================
 * GAME 12 — ASTEROID FIREWALL
 * Newtonian drift, three lives, waves of splitting rocks.
 * ============================================================ */
import {
  integrate, clampCircleToBounds, clampAndBounceCircle, needsSubStepping,
  intersectCircle, circle, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g12';
export const accent = '#10B981';

const W = 640, H = 480;
const LIVES = 3;
const SHIP_R = 9;
const THRUST = 210;
const TURN = 3.6;
const DRAG = 0.42;
const MAX_SPEED = 330;
const BULLET_SPEED = 620;
const BULLET_LIFE = 0.95;
const FIRE_CD = 0.17;
const JUMP_CD = 2.4;
const RESPAWN_MS = 1100;
const SIZES = [
  { r: 30, speed: 46, score: 20 },
  { r: 19, speed: 74, score: 50 },
  { r: 11, speed: 108, score: 120 },
];

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xA57);
  const state = {
    t: 0, score: 0, lives: LIVES, wave: 0, waveTotal: 0, waveLeft: 0,
    shot: 0, jump: 0, respawn: 0, shake: 0, over: false, waveBanner: 0,
  };
  const keys = new Set();
  const rocks = [];
  const shots = [];
  const bits = [];
  const rings = [];
  let ship = null;

  // ---- ship ----
  const newShip = (safe) => {
    let x = W / 2, y = H / 2;
    if (safe) {
      for (let tries = 0; tries < 40; tries++) {
        const tx = 70 + rng() * (W - 140);
        const ty = 70 + rng() * (H - 140);
        let ok = true;
        for (const r of rocks) {
          if ((r.x - tx) ** 2 + (r.y - ty) ** 2 < 110 * 110) { ok = false; break; }
        }
        if (ok) { x = tx; y = ty; break; }
      }
    }
    return { x, y, vx: 0, vy: 0, ang: -Math.PI / 2, r: SHIP_R, blink: 1.4 };
  };

  const killShip = () => {
    if (!ship || state.over) return;
    ship = null;
    state.shake = 12;
    state.lives--;
    ctx.fx && ctx.fx.burst && ctx.fx.burst(W / 2, H / 2, '#F43F5E');
    if (ctx.audio) ctx.audio.explode();
    if (state.lives <= 0) {
      state.over = true;
      if (ctx.audio) ctx.audio.gameOver();
      ctx.loop && ctx.loop.stop();
      ctx.finish(state.score);
      return;
    }
    state.respawn = RESPAWN_MS / 1000;
  };

  // ---- rocks ----
  const spawnRock = (tier, x, y, vx, vy) => {
    const s = SIZES[tier];
    const ang = rng() * Math.PI * 2;
    const sp = s.speed * (0.72 + rng() * 0.62) * (1 + state.wave * 0.045);
    let px = x, py = y;
    if (px === undefined) {
      const side = rng() < 0.5 ? 0 : 1;
      const vertical = rng() < 0.5;
      px = side ? W - 24 : 24;
      py = 24 + rng() * (H - 48);
      if (vertical) { px = 24 + rng() * (W - 48); py = side ? H - 24 : 24; }
    }
    rocks.push({
      x: px, y: py, r: s.r,
      vx: vx === undefined ? Math.cos(ang) * sp : vx,
      vy: vy === undefined ? Math.sin(ang) * sp : vy,
      tier, spin: (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 1.1),
      rot: rng() * Math.PI * 2,
      pts: Array.from({ length: 11 }, () => 0.68 + rng() * 0.42),
    });
  };

  const shatter = (r) => {
    rings.push({ x: r.x, y: r.y, r: r.r, life: 1 });
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const sp = 40 + rng() * 150;
      bits.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + rng() * 0.4 });
    }
    state.shake = Math.min(11, state.shake + 3 + (2 - r.tier) * 2.5);
    if (ctx.audio) ctx.audio.explode();
    if (r.tier < 2) {
      const sp = SIZES[r.tier].speed;
      for (let k = 0; k < 2; k++) {
        const a = Math.atan2(r.vy, r.vx) + (k ? 0.9 : -0.9) + (rng() - 0.5) * 0.6;
        spawnRock(r.tier + 1, r.x, r.y, Math.cos(a) * sp * 0.95, Math.sin(a) * sp * 0.95);
      }
    }
  };

  const nextWave = () => {
    state.wave++;
    const n = 3 + state.wave;
    state.waveTotal = n;
    state.waveBanner = 2;
    for (let i = 0; i < n; i++) spawnRock(0);
    if (ctx.audio) ctx.audio.tick();
  };

  const shoot = () => {
    if (!ship || state.over || state.shot > 0) return;
    state.shot = FIRE_CD;
    const tipX = ship.x + Math.cos(ship.ang) * 14;
    const tipY = ship.y + Math.sin(ship.ang) * 14;
    shots.push({
      x: tipX, y: tipY, r: 2,
      vx: ship.vx + Math.cos(ship.ang) * BULLET_SPEED,
      vy: ship.vy + Math.sin(ship.ang) * BULLET_SPEED,
      life: BULLET_LIFE,
    });
    ship.vx -= Math.cos(ship.ang) * 26;
    ship.vy -= Math.sin(ship.ang) * 26;
    if (ctx.audio) ctx.audio.shoot();
  };

  // ---- hyperspace ----
  const jump = () => {
    if (!ship || state.over || state.jump > 0) return;
    state.jump = JUMP_CD;
    rings.push({ x: ship.x, y: ship.y, r: 40, life: 1 });
    if (ctx.audio) ctx.audio.tick();
    ship = newShip(false);
    ship.vx = (rng() - 0.5) * 90;
    ship.vy = (rng() - 0.5) * 90;
    if (ctx.audio) ctx.audio.powerup();
    for (const r of rocks) {
      if (intersectCircle(ship.x, ship.y, ship.r + 4, r.x, r.y, r.r)) { killShip(); return; }
    }
  };

  // ---- input ----
  const down = (ev) => {
    const k = ev.key;
    if (k === ' ' || k === 'Shift') ev.preventDefault();
    keys.add(k.length === 1 ? k.toLowerCase() : k);
    if (k === ' ') shoot();
    if (k === 'Shift') jump();
  };
  const up = (ev) => {
    const k = ev.key;
    keys.delete(k.length === 1 ? k.toLowerCase() : k);
  };
  const blur = () => keys.clear();
  ctx.listeners.on(window, 'keydown', down);
  ctx.listeners.on(window, 'keyup', up);
  ctx.listeners.on(window, 'blur', blur);
  ctx.listeners.on(ctx.canvas, 'pointerdown', () => shoot());

  // ---- update ----
  const stepRocks = (dt) => {
    for (const r of rocks) {
      r.rot += r.spin * dt;
      if (needsSubStepping(r)) integrate(r, dt, W, H, null);
      else {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        clampAndBounceCircle(r, W, H, 1);
      }
    }
  };

  const stepShip = (dt) => {
    if (!ship) return;
    const left = keys.has('ArrowLeft') || keys.has('a');
    const right = keys.has('ArrowRight') || keys.has('d');
    const up = keys.has('ArrowUp') || keys.has('w');
    const downK = keys.has('ArrowDown') || keys.has('s');
    if (left) ship.ang -= TURN * dt;
    if (right) ship.ang += TURN * dt;
    if (up) {
      ship.vx += Math.cos(ship.ang) * THRUST * dt;
      ship.vy += Math.sin(ship.ang) * THRUST * dt;
      if (Math.random() < 0.6) {
        bits.push({
          x: ship.x - Math.cos(ship.ang) * 10, y: ship.y - Math.sin(ship.ang) * 10,
          vx: (rng() - 0.5) * 60, vy: (rng() - 0.5) * 60, life: 0.3,
        });
      }
    }
    if (downK) {
      ship.vx -= Math.cos(ship.ang) * THRUST * 0.6 * dt;
      ship.vy -= Math.sin(ship.ang) * THRUST * 0.6 * dt;
    }
    const damp = Math.max(0, 1 - DRAG * dt);
    ship.vx *= damp;
    ship.vy *= damp;
    const sp = Math.hypot(ship.vx, ship.vy);
    if (sp > MAX_SPEED) {
      ship.vx = (ship.vx / sp) * MAX_SPEED;
      ship.vy = (ship.vy / sp) * MAX_SPEED;
    }
    ship.blink = Math.max(0, ship.blink - dt);
    const before = { x: ship.x, y: ship.y };
    if (needsSubStepping(ship)) {
      integrate(ship, dt, W, H, null);
    } else {
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      clampAndBounceCircle(ship, W, H, 0.4);
    }
    if ((ship.x !== before.x || ship.y !== before.y) && sp > 90) {
      if (ctx.audio) ctx.audio.bounce();
    }
  };

  const stepShots = (dt) => {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      let dead = s.life <= 0;
      // sub-stepped so fast rounds cannot tunnel through a rock
      integrate(s, dt, W, H, (body, sub) => {
        if (dead) return;
        for (let k = rocks.length - 1; k >= 0; k--) {
          const r = rocks[k];
          if (intersectCircle(body.x, body.y, body.r + 2, r.x, r.y, r.r)) {
            const gain = SIZES[r.tier].score;
            state.score += gain;
            ctx.onScore(state.score);
            if (ctx.audio) ctx.audio.hit();
            rocks.splice(k, 1);
            shatter(r);
            state.waveLeft--;
            dead = true;
            break;
          }
        }
      });
      if (dead || s.x < -10 || s.x > W + 10 || s.y < -10 || s.y > H + 10) shots.splice(i, 1);
    }
  };

  const collideShip = () => {
    if (!ship || ship.blink > 0) return;
    for (const r of rocks) {
      if (intersectCircle(ship.x, ship.y, ship.r - 2, r.x, r.y, r.r)) { killShip(); return; }
    }
  };

  const update = (dt) => {
    state.t += dt;
    if (state.over) return;
    state.shot = Math.max(0, state.shot - dt);
    state.jump = Math.max(0, state.jump - dt);
    state.waveBanner = Math.max(0, state.waveBanner - dt);
    state.shake *= Math.max(0, 1 - dt * 7);

    if (state.respawn > 0) {
      state.respawn -= dt;
      if (state.respawn <= 0 && !state.over) ship = newShip(true);
    }

    stepShip(dt);
    stepRocks(dt);
    stepShots(dt);
    collideShip();

    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt * 1.6;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0) bits.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.life -= dt * 1.8;
      g.r += dt * 130;
      if (g.life <= 0) rings.splice(i, 1);
    }

    if (rocks.length === 0 && state.waveBanner <= 0) {
      state.waveLeft = 0;
      nextWave();
    } else if (state.waveBanner <= 0 && state.waveLeft === 0 && rocks.length > 0) {
      state.waveLeft = rocks.length;
    }
  };

  // ---- draw ----
  const drawBackdrop = () => {
    ctx.clear && ctx.clear('#090D16');
    c.fillStyle = '#090D16';
    c.fillRect(-24, -24, W + 48, H + 48);
    c.strokeStyle = 'rgba(16,185,129,0.07)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    // firewall perimeter
    c.strokeStyle = 'rgba(99,102,241,0.45)';
    c.lineWidth = 2;
    c.strokeRect(6, 46, W - 12, H - 52);
  };

  const drawRock = (r) => {
    const hue = r.tier === 0 ? '#6366F1' : r.tier === 1 ? '#10B981' : '#F59E0B';
    glow(c, hue, 12);
    c.strokeStyle = hue;
    c.lineWidth = 1.6;
    c.beginPath();
    for (let i = 0; i < r.pts.length; i++) {
      const a = r.rot + (i / r.pts.length) * Math.PI * 2;
      const rr = r.r * r.pts[i];
      const px = r.x + Math.cos(a) * rr;
      const py = r.y + Math.sin(a) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fillStyle = 'rgba(15,23,42,0.55)';
    c.fill();
    c.stroke();
    noGlow(c);
    c.fillStyle = hue;
    circle(c, r.x, r.y, r.r * 0.16);
    c.fill();
  };

  const drawShip = (s) => {
    if (s.blink > 0 && Math.floor(state.t * 14) % 2 === 0) return;
    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.ang);
    glow(c, '#10B981', 14);
    c.fillStyle = '#10B981';
    c.strokeStyle = '#E2E8F0';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(13, 0);
    c.lineTo(-9, 8);
    c.lineTo(-5, 0);
    c.lineTo(-9, -8);
    c.closePath();
    c.fill();
    c.stroke();
    noGlow(c);
    c.restore();
    labelCenter(c, `${Math.hypot(s.vx, s.vy).toFixed(0)}`, s.x, s.y + 22, 10, '#64748B');
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();

    for (const r of rocks) drawRock(r);

    for (const b of bits) {
      c.globalAlpha = Math.max(0, Math.min(1, b.life));
      c.fillStyle = '#F59E0B';
      c.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
    }
    c.globalAlpha = 1;

    for (const g of rings) {
      c.globalAlpha = Math.max(0, g.life) * 0.8;
      c.strokeStyle = '#6366F1';
      c.lineWidth = 2;
      circle(c, g.x, g.y, g.r);
      c.stroke();
    }
    c.globalAlpha = 1;

    for (const s of shots) {
      glow(c, '#E2E8F0', 10);
      c.fillStyle = '#E2E8F0';
      circle(c, s.x, s.y, s.r);
      c.fill();
      noGlow(c);
    }

    if (ship) drawShip(ship);

    if (state.respawn > 0 && !ship) {
      labelCenter(c, 'REBOOTING FIREWALL...', W / 2, H / 2, 15, '#F43F5E');
    }
    if (state.waveBanner > 0) {
      labelCenter(c, `WAVE ${state.wave}`, W / 2, H / 2 - 10, 34, '#10B981');
      labelCenter(c, `${state.waveTotal} HOSTILE SIGNATURES`, W / 2, H / 2 + 22, 13, '#64748B');
    }

    // HUD
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, 0, W, 46);
    label(c, `SCORE ${state.score}`, 14, 30, 20, '#10B981');
    label(c, `WAVE ${state.wave}`, 200, 30, 16, '#6366F1');
    label(c, `JUMP ${state.jump > 0 ? state.jump.toFixed(1) : 'RDY'}`, 300, 30, 14, state.jump > 0 ? '#64748B' : '#10B981');
    for (let i = 0; i < LIVES; i++) {
      c.fillStyle = i < state.lives ? '#F43F5E' : '#1E293B';
      c.fillRect(W - 24 - i * 16, 20, 10, 10);
    }

    const done = state.waveTotal ? 1 - Math.min(1, state.waveLeft / state.waveTotal) : 0;
    c.fillStyle = 'rgba(99,102,241,0.25)';
    c.fillRect(0, H - 6, W, 6);
    c.fillStyle = '#6366F1';
    c.fillRect(0, H - 6, W * done, 6);

    c.restore();
  };

  ship = newShip(true);
  nextWave();
  ctx.attachLoop(update, draw);

  return null;
}