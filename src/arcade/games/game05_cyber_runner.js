/* ============================================================
 * GAME 05 — CYBER RUNNER
 * Endless side-scroller: the world slides right-to-left past you.
 * Jump over firewall spikes and low blocks, clear the pits,
 * grab data orbs. One hit ends the run.
 * ============================================================ */
import {
  intersectAABB, integrate, clamp, pointerPos,
  circle, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g05';
export const accent = '#F59E0B';

const W = 640, H = 480;
const GROUND = 396;
const RUN_X = 132, RUN_W = 24, RUN_H = 40;
const GRAV = 2150;
const JUMP_V = -650, AIR_V = -575;
const DOUBLE_HOLD = 0.11;
const SPEED_MIN = 235, SPEED_MAX = 525, SPEED_RAMP = 6.4;
const ORB_VALUE = 25;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xC0FFEE);

  const state = {
    t: 0, speed: SPEED_MIN, scroll: 0, dist: 0,
    score: 0, orbs: 0, orbScore: 0, best: 0,
    shake: 0, spawnGap: 260, nextId: 1, over: false,
    sector: 0, banner: 0, flash: 0,
  };

  const runner = { x: RUN_X, y: GROUND - RUN_H, w: RUN_W, h: RUN_H, vx: 0, vy: 0, grounded: true };
  const obstacles = [];
  const pits = [];
  const orbs = [];
  const parts = [];
  const rings = [];
  const pops = [];
  let doubleLeft = true;
  let holding = false, holdT = 0;

  // deterministic skyline for the far parallax layer
  const city = [];
  for (let x = -40; x < W + 120; x += 46) {
    city.push({ x, w: 30 + rng() * 34, h: 40 + rng() * 120, lit: rng() < 0.55 });
  }

  /* ---- helpers ---------------------------------------------------- */

  const box = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.h });

  const footBox = () => ({ x: runner.x + 3, y: runner.y + runner.h - 4, w: runner.w - 6, h: 8 });

  const supported = () => {
    const f = footBox();
    for (const p of pits) if (f.x < p.x + p.w && f.x + f.w > p.x) return false;
    return true;
  };

  const burst = (x, y, color, count, spread) => {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const s = 60 + rng() * spread;
      parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spread * 0.35,
        life: 1, size: 1.5 + rng() * 2.5, color,
      });
    }
  };

  const popText = (x, y, text, color) => pops.push({ x, y, text, color, life: 1 });

  const groundSpeed = () => SPEED_MIN + Math.min(SPEED_MAX - SPEED_MIN, state.t * SPEED_RAMP);

  /* ---- spawning --------------------------------------------------- */

  const spawnOrbLine = (x, y) => {
    for (let i = 0; i < 3; i++) orbs.push({ x: x - i * 26, y, r: 9, phase: rng() * 6.28, taken: 0 });
  };

  const spawnChunk = () => {
    const roll = rng();
    const tight = state.speed > 380;
    if (roll < 0.09 && state.t > 6) {
      // pit — the floor drops out
      const pw = 78 + rng() * 54;
      pits.push({ x: W + 20, w: pw });
      obstacles.push({ id: state.nextId++, kind: 'pitEdge', x: W + 20, y: GROUND - 4, w: 6, h: 4, lip: pw });
      if (rng() < 0.6) spawnOrbLine(W + 30 + pw * 0.5, GROUND - 96);
    } else if (roll < 0.46) {
      // firewall spikes
      const n = tight ? 1 + (rng() < 0.3 ? 1 : 0) : 2 + (rng() < 0.4 ? 1 : 0);
      const bw = 20, gap = 4;
      for (let i = 0; i < n; i++) {
        const h = 26 + rng() * 18;
        obstacles.push({ id: state.nextId++, kind: 'spike', x: W + 20 + i * (bw + gap), y: GROUND - h, w: bw, h });
      }
      const x = W + 20 + n * (bw + gap) * 0.5;
      if (rng() < 0.55) spawnOrbLine(x, GROUND - 74);
    } else {
      // low ICE block
      const bw = 34 + rng() * 46, bh = 24 + rng() * 16;
      obstacles.push({ id: state.nextId++, kind: 'block', x: W + 20, y: GROUND - bh, w: bw, h: bh });
      if (rng() < 0.5) spawnOrbLine(W + 24 + bw * 0.5, GROUND - 108);
    }
  };

  spawnChunk();
  spawnChunk();

  /* ---- input ------------------------------------------------------ */

  const doJump = (v, power) => {
    runner.vy = v;
    runner.grounded = false;
    state.shake = Math.min(9, 2.4 + power);
    burst(runner.x + runner.w / 2, runner.y + runner.h, power > 1 ? '#F59E0B' : '#6366F1', 10, 150);
    rings.push({ x: runner.x + runner.w / 2, y: runner.y + runner.h, r: 6, life: 1, color: power > 1 ? '#F59E0B' : '#6366F1' });
    if (ctx.audio) ctx.audio.jump();
  };

  const onPress = () => {
    if (state.over) return;
    holding = true;
    holdT = 0;
    if (runner.grounded) { doubleLeft = true; doJump(JUMP_V, 1); }
  };

  const onRelease = () => { holding = false; holdT = 0; };

  const onKeyDown = (ev) => {
    if (ev.code !== 'Space' && ev.code !== 'ArrowUp' && ev.code !== 'KeyW' && ev.key !== ' ' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    if (ev.repeat) return;
    onPress();
  };

  const onPointerDown = (ev) => {
    ev.preventDefault();
    const p = pointerPos(ctx.canvas, ev);
    const gy = (p.y * H) / ctx.canvas.height;
    if (gy > H + 40) return;
    onPress();
  };

  ctx.listeners.on(window, 'keydown', onKeyDown);
  ctx.listeners.on(window, 'keyup', onRelease);
  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointerDown);
  ctx.listeners.on(window, 'pointerup', onRelease);
  ctx.listeners.on(window, 'pointercancel', onRelease);
  ctx.listeners.on(window, 'blur', onRelease);

  /* ---- death ------------------------------------------------------ */

  const kill = (why) => {
    if (state.over) return;
    state.over = true;
    holding = false;
    state.shake = 18;
    state.flash = 1;
    if (state.score > state.best) state.best = state.score;
    burst(runner.x + runner.w / 2, runner.y + runner.h / 2, '#F43F5E', 26, 260);
    rings.push({ x: runner.x + runner.w / 2, y: runner.y + runner.h / 2, r: 10, life: 1, color: '#F43F5E' });
    popText(runner.x + runner.w / 2, runner.y - 6, why, '#F43F5E');
    if (ctx.audio) ctx.audio.hit();
    ctx.raf(() => rings.push({ x: runner.x + runner.w / 2, y: runner.y + runner.h / 2, r: 26, life: 1, color: '#F59E0B' }));
    ctx.after(620, () => {
      if (ctx.loop) ctx.loop.stop();
      if (ctx.audio) ctx.audio.gameOver();
      ctx.finish(state.score);
    });
  };

  // sector banner every time a 500m milestone falls
  ctx.every(900, () => {
    if (state.over) return;
    const s = Math.floor(state.score / 500);
    if (s > state.sector) {
      state.sector = s;
      state.banner = 1;
      if (ctx.audio) ctx.audio.win();
    }
  });

  /* ---- update ----------------------------------------------------- */

  const update = (dt) => {
    state.t += dt;
    state.shake *= Math.max(0, 1 - dt * 7);
    state.banner *= Math.max(0, 1 - dt * 0.9);
    state.flash *= Math.max(0, 1 - dt * 3.4);

    const speed = groundSpeed();
    state.speed = speed;
    state.scroll += speed * dt;
    state.dist += speed * dt * 0.06;

    // hold while airborne for the single double-jump
    if (holding) {
      holdT += dt;
      if (!runner.grounded && doubleLeft && holdT > DOUBLE_HOLD) {
        doubleLeft = false;
        doJump(AIR_V, 2);
      }
    }

    // world spawn cadence
    state.spawnGap -= speed * dt;
    while (state.spawnGap <= 0) {
      spawnChunk();
      state.spawnGap += clamp(430 - state.t * 2.2, 205, 430) + rng() * 190;
    }

    // scroll the world left past the pinned runner
    for (const o of obstacles) o.x -= speed * dt;
    for (const p of pits) p.x -= speed * dt;
    for (const o of orbs) {
      o.x -= speed * dt;
      o.phase += dt * 4;
      o.taken = Math.max(0, o.taken - dt * 3);
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      if (obstacles[i].x + obstacles[i].w < -30) obstacles.splice(i, 1);
    }
    for (let i = pits.length - 1; i >= 0; i--) {
      if (pits[i].x + pits[i].w < -30) pits.splice(i, 1);
    }
    for (let i = orbs.length - 1; i >= 0; i--) {
      if (orbs[i].x + orbs[i].r < -20) orbs.splice(i, 1);
    }

    // runner: gravity + floor contact (pits have no floor)
    runner.vy += GRAV * dt;
    runner.vy = Math.min(runner.vy, 980);
    integrate(runner, dt, ctx.width, ctx.height, null);
    if (runner.y + runner.h >= GROUND && supported()) {
      if (!runner.grounded) {
        state.shake = Math.min(11, 3 + Math.abs(runner.vy) * 0.004);
        burst(runner.x + runner.w / 2, GROUND, '#10B981', 9, 110);
        rings.push({ x: runner.x + runner.w / 2, y: GROUND, r: 5, life: 1, color: '#10B981' });
        if (ctx.audio) ctx.audio.land();
      }
      runner.y = GROUND - runner.h;
      runner.vy = 0;
      runner.grounded = true;
      doubleLeft = true;
    } else {
      runner.grounded = false;
    }

    if (!state.over) {
      const rb = box(runner);
      for (const o of obstacles) {
        if (o.kind === 'pitEdge') continue;
        if (intersectAABB(rb, o)) { kill('TERMINATED'); break; }
      }
      if (!state.over && runner.y > GROUND + 22) kill('VOID FALL');

      for (const o of orbs) {
        if (o.taken > 0) continue;
        if (intersectAABB(rb, { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 })) {
          o.taken = 1;
          state.orbs++;
          state.orbScore += ORB_VALUE;
          burst(o.x, o.y, '#F59E0B', 7, 130);
          popText(o.x, o.y - 12, `+${ORB_VALUE}`, '#F59E0B');
          if (ctx.audio) ctx.audio.coin();
        }
      }
    }

    state.score = Math.floor(state.dist) + state.orbScore;
    ctx.onScore(state.score);

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 900 * dt;
      p.life -= dt * 1.9;
      integrate(p, dt, W, H, null);
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt * 2.2;
      r.r += dt * 130;
      if (r.life <= 0) rings.splice(i, 1);
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.life -= dt * 1.3;
      p.y -= dt * 22;
      if (p.life <= 0) pops.splice(i, 1);
    }
  };

  /* ---- draw ------------------------------------------------------- */

  const layer = (step, off, alpha, color, drift) => {
    const sx = -(((state.scroll * off) % step) + step) % step;
    const sy = -(((state.t * 16 * drift) % step) + step) % step;
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.globalAlpha = alpha;
    c.beginPath();
    for (let x = sx; x <= W + step; x += step) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); }
    for (let y = sy; y <= H + step; y += step) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); }
    c.stroke();
    c.globalAlpha = 1;
  };

  const drawBackdrop = () => {
    ctx.clear('#090D16');
    // far skyline
    const so = -(((state.scroll * 0.08) % 700) + 700) % 700;
    for (let k = 0; k < 3; k++) {
      const shift = so + k * 700;
      c.fillStyle = 'rgba(30,41,59,0.55)';
      for (const b of city) {
        const x = b.x + shift;
        if (x > W + 40 || x + b.w < -40) continue;
        c.fillRect(x, GROUND - b.h, b.w, b.h);
        c.fillStyle = b.lit ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.12)';
        for (let wy = GROUND - b.h + 8; wy < GROUND - 8; wy += 14) c.fillRect(x + 5, wy, b.w - 10, 5);
        c.fillStyle = 'rgba(30,41,59,0.55)';
      }
    }
    layer(160, 0.12, 0.07, '#6366F1', 0.15);
    layer(80, 0.34, 0.09, '#6366F1', 0.4);
    layer(40, 0.7, 0.11, '#10B981', 0.8);
    // horizon glow
    const g = c.createLinearGradient(0, GROUND - 130, 0, GROUND);
    g.addColorStop(0, 'rgba(9,13,22,0)');
    g.addColorStop(1, 'rgba(99,102,241,0.20)');
    c.fillStyle = g;
    c.fillRect(0, GROUND - 130, W, 130);
  };

  const drawGround = () => {
    c.fillStyle = '#0B1220';
    c.fillRect(0, GROUND, W, H - GROUND);
    // pit cutouts
    c.save();
    c.beginPath();
    c.rect(0, GROUND, W, H - GROUND);
    for (const p of pits) {
      const x = Math.max(0, p.x);
      const w = Math.min(W, p.x + p.w) - x;
      if (w > 0) c.rect(x, GROUND, w, H - GROUND);
    }
    c.fill('evenodd');
    c.restore();
    // deck line
    c.strokeStyle = '#10B981';
    c.lineWidth = 2;
    c.beginPath();
    let sx = 0;
    c.moveTo(0, GROUND + 1);
    for (const p of [...pits].sort((a, b) => a.x - b.x)) {
      if (p.x > sx) c.lineTo(Math.min(p.x, W), GROUND + 1);
      c.lineTo(Math.max(p.x + p.w, sx), GROUND + 1);
      sx = Math.max(sx, p.x + p.w);
    }
    if (sx < W) c.lineTo(W, GROUND + 1);
    c.stroke();
    // deck ticks
    const step = 40, off = state.scroll % step;
    c.strokeStyle = 'rgba(16,185,129,0.28)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = -off; x < W + step; x += step) {
      if (pits.some((p) => x > p.x - 2 && x < p.x + p.w + 2)) continue;
      c.moveTo(x + 0.5, GROUND + 6);
      c.lineTo(x + 0.5, H);
    }
    c.stroke();
  };

  const drawObstacle = (o) => {
    if (o.kind === 'spike') {
      glow(c, '#F43F5E', 16);
      c.fillStyle = '#F43F5E';
      c.beginPath();
      c.moveTo(o.x, o.y + o.h);
      c.lineTo(o.x + o.w / 2, o.y);
      c.lineTo(o.x + o.w, o.y + o.h);
      c.closePath();
      c.fill();
      noGlow(c);
      c.fillStyle = 'rgba(9,13,22,0.5)';
      c.fillRect(o.x + o.w / 2 - 1, o.y + o.h * 0.4, 2, o.h * 0.6);
    } else if (o.kind === 'block') {
      glow(c, '#6366F1', 14);
      c.fillStyle = '#1E293B';
      roundRect(c, o.x, o.y, o.w, o.h, 4);
      c.fill();
      noGlow(c);
      c.strokeStyle = '#6366F1';
      c.lineWidth = 2;
      roundRect(c, o.x + 1, o.y + 1, o.w - 2, o.h - 2, 4);
      c.stroke();
      c.fillStyle = 'rgba(99,102,241,0.35)';
      for (let i = 6; i < o.w - 6; i += 10) c.fillRect(o.x + i, o.y + o.h - 7, 5, 3);
    } else {
      c.strokeStyle = 'rgba(244,63,94,0.7)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(o.x + 1, GROUND - 8);
      c.lineTo(o.x + 1, GROUND);
      c.stroke();
    }
  };

  const drawOrb = (o) => {
    const y = o.y + Math.sin(o.phase) * 5;
    const r = o.r * (1 + o.taken * 1.4);
    c.globalAlpha = 1 - o.taken;
    glow(c, '#F59E0B', 14);
    c.fillStyle = '#F59E0B';
    circle(c, o.x, y, r);
    c.fill();
    noGlow(c);
    c.fillStyle = '#090D16';
    circle(c, o.x, y, r * 0.38);
    c.fill();
    c.globalAlpha = 1;
  };

  const drawRunner = () => {
    const run = state.t * (state.speed / 26);
    const leg = Math.sin(run) * (runner.grounded ? 7 : 2);
    const lean = clamp(runner.vy * 0.012, -6, 8);
    const x = runner.x, y = runner.y;
    // trail
    if (!runner.grounded) {
      c.globalAlpha = 0.18;
      c.fillStyle = doubleLeft ? '#6366F1' : '#F59E0B';
      roundRect(c, x - 16, y + 4, runner.w + 14, runner.h - 8, 5);
      c.fill();
      c.globalAlpha = 1;
    }
    // legs
    c.strokeStyle = '#F59E0B';
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x + 7, y + runner.h - 9);
    c.lineTo(x + 7 - leg, y + runner.h + 1);
    c.moveTo(x + runner.w - 7, y + runner.h - 9);
    c.lineTo(x + runner.w - 7 + leg, y + runner.h + 1);
    c.stroke();
    c.lineCap = 'butt';
    // torso
    glow(c, '#10B981', 16);
    c.fillStyle = '#10B981';
    roundRect(c, x, y + 4, runner.w, runner.h - 12, 6);
    c.fill();
    noGlow(c);
    c.fillStyle = 'rgba(9,13,22,0.35)';
    roundRect(c, x + 4, y + 10, runner.w - 8, 8, 3);
    c.fill();
    // visor head
    c.fillStyle = doubleLeft ? '#6366F1' : '#F59E0B';
    roundRect(c, x + 2, y - 6 + lean * 0.2, runner.w - 4, 13, 4);
    c.fill();
    c.fillStyle = '#090D16';
    roundRect(c, x + 8, y - 2 + lean * 0.2, runner.w - 12, 5, 2);
    c.fill();
    // double-jump ready pip on the back
    if (!runner.grounded && doubleLeft) {
      c.fillStyle = '#F59E0B';
      circle(c, x - 7, y + 12, 3);
      c.fill();
    }
  };

  const drawPits = () => {
    for (const p of pits) {
      const x = Math.max(0, p.x), w = Math.min(W, p.x + p.w) - x;
      if (w <= 0) continue;
      c.fillStyle = 'rgba(244,63,94,0.07)';
      c.fillRect(x, GROUND, w, H - GROUND);
      c.strokeStyle = 'rgba(244,63,94,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      for (let y = GROUND + 10; y < H; y += 14) { c.moveTo(x, y); c.lineTo(x + w, y); }
      c.stroke();
    }
  };

  const drawHud = () => {
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, 0, W, 46);
    label(c, `${state.score}`, 14, 31, 22, '#F59E0B');
    label(c, `${Math.floor(state.dist)}m`, 150, 30, 16, '#E2E8F0');
    label(c, `ORBS ${state.orbs}`, 236, 30, 14, '#10B981');
    label(c, `${Math.round(state.speed)}`, W - 14, 30, 18, state.speed > 400 ? '#F43F5E' : '#64748B', 'right');

    // speed ramp bar
    const sp = (state.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
    c.fillStyle = 'rgba(100,116,139,0.25)';
    c.fillRect(0, H - 12, W, 6);
    c.fillStyle = sp > 0.7 ? '#F43F5E' : '#6366F1';
    c.fillRect(0, H - 12, W * sp, 6);
    // milestone progress
    const mark = (state.score % 500) / 500;
    c.fillStyle = 'rgba(245,158,11,0.9)';
    c.fillRect(W - 150, 16, 150 * mark, 3);

    if (state.banner > 0.01) {
      c.globalAlpha = Math.min(1, state.banner * 1.4);
      labelCenter(c, `SECTOR ${Math.floor(state.score / 500)} BREACHED`, W / 2, 110, 22, '#F59E0B');
      c.globalAlpha = 1;
    }
  };

  const drawOverlay = () => {
    if (!state.over) return;
    c.fillStyle = `rgba(9,13,22,${0.62 * state.flash + 0.22})`;
    c.fillRect(0, 0, W, H);
    labelCenter(c, 'SIGNAL LOST', W / 2, 190, 32, '#F43F5E');
    labelCenter(c, `SCORE ${state.score}`, W / 2, 232, 20, '#F59E0B');
    labelCenter(c, `DISTANCE ${Math.floor(state.dist)}m   ORBS ${state.orbs}`, W / 2, 260, 14, '#64748B');
    labelCenter(c, `BEST ${state.best}`, W / 2, 284, 14, '#E2E8F0');
    labelCenter(c, 'TAP / SPACE TO RESTART', W / 2, 330, 13, '#64748B');
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();
    drawPits();
    drawGround();
    for (const o of obstacles) drawObstacle(o);
    for (const o of orbs) drawOrb(o);
    drawRunner();

    for (const r of rings) {
      c.globalAlpha = Math.max(0, r.life) * 0.8;
      c.strokeStyle = r.color;
      c.lineWidth = 2;
      circle(c, r.x, r.y, r.r);
      c.stroke();
      c.globalAlpha = 1;
    }
    for (const p of parts) {
      c.globalAlpha = Math.max(0, p.life);
      c.fillStyle = p.color;
      c.fillRect(p.x, p.y, p.size, p.size);
      c.globalAlpha = 1;
    }
    for (const p of pops) {
      c.globalAlpha = Math.max(0, p.life);
      labelCenter(c, p.text, p.x, p.y, 14, p.color);
      c.globalAlpha = 1;
    }

    drawHud();
    drawOverlay();
    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}