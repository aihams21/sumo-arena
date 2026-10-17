/* ============================================================
 * GAME 03 — BRICK BREAKER FIREWALL
 * Bounce the packet through the firewall rows; armour takes hits.
 * ============================================================ */
import {
  integrate, clampCircleToBounds, clamp, needsSubStepping,
  resolveCircleAABB, pointerPos,
  circle, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g03';
export const accent = '#6366F1';

const W = 640, H = 480;
const TOP = 48;
const DRAIN = H + 400;         // free-fall corridor so a lost packet drains
const PADDLE_H = 11;
const PADDLE_SPEED = 620;
const BRICK_H = 19;
const ROW_H = 26;
const BASE_SPEED = 268;
const MAX_BALL_SPEED = 470;
const LASER_SPEED = 560;
const MAX_BALLS = 9;
const ROW_MS = 9000;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xF13E);
  const state = {
    t: 0, score: 0, lives: 3, row: 0, shake: 0, combo: 0,
    wide: 0, multi: 0, laser: 0, over: false, flash: 0,
  };

  // ---- entities ----
  const ROWS = [
    { hp: 1, cols: 9, hue: '#10B981', score: 20, drop: 0.12 },
    { hp: 1, cols: 11, hue: '#6366F1', score: 30, drop: 0.2 },
    { hp: 2, cols: 8, hue: '#F59E0B', score: 60, drop: 0.24 },
    { hp: 3, cols: 6, hue: '#F43F5E', score: 110, drop: 0.3 },
  ];

  const bricks = [];
  const ball = { x: W / 2, y: H - 74, vx: 0, vy: 0, r: 7, stuck: true, trail: [] };
  const balls = [ball];
  const drops = [];
  const shots = [];
  const sparks = [];

  const buildRow = (index) => {
    const spec = ROWS[Math.min(index, ROWS.length - 1)];
    const gap = 7;
    const bw = Math.min(52, (W - 44) / spec.cols - gap);
    const ox = (W - (spec.cols * bw + (spec.cols - 1) * gap)) / 2;
    bricks.length = 0;
    for (let row = 0; row < 3; row++) {
      const y = TOP + 12 + row * ROW_H;
      const hp = Math.max(1, spec.hp - (row === 2 && spec.hp > 1 ? 1 : 0));
      for (let i = 0; i < spec.cols; i++) {
        bricks.push({
          x: ox + i * (bw + gap), y, w: bw, h: BRICK_H,
          hp, max: hp, hue: spec.hue, score: spec.score, drop: spec.drop, flash: 0,
        });
      }
    }
  };
  buildRow(0);

  // ---- paddle ----
  const paddle = { x: W / 2 - 42, y: H - 30, vx: 0, w: 84, base: 84, h: PADDLE_H };
  const keys = { l: false, r: false };
  let usePointer = false;
  let targetX = W / 2;
  let rowAcc = 0;
  let multiAcc = 0;

  const speedFor = () => clamp(BASE_SPEED + state.row * 34, BASE_SPEED, MAX_BALL_SPEED);

  const launch = (angle) => {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
    ball.speed = speedFor();
    ball.stuck = false;
    const a = angle === undefined ? -Math.PI / 2 + (rng() - 0.5) * 0.5 : angle;
    ball.vx = Math.cos(a) * ball.speed;
    ball.vy = Math.sin(a) * ball.speed;
    if (ctx.audio) ctx.audio.shoot();
  };

  const split = (b, spread) => {
    if (balls.length >= MAX_BALLS) return null;
    const a = Math.atan2(b.vy, b.vx) + spread;
    const nb = {
      x: b.x, y: b.y, vx: Math.cos(a) * b.speed, vy: Math.sin(a) * b.speed,
      r: b.r, speed: b.speed, stuck: false, trail: [],
    };
    balls.push(nb);
    return nb;
  };

  // ---- power-ups ----
  const grant = (kind) => {
    if (kind === 'wide') {
      state.wide = 12;
      paddle.w = paddle.base * 1.85;
    } else if (kind === 'multi') {
      state.multi = 9;
      multiAcc = 0;
      for (const b of balls.slice()) if (balls.length < MAX_BALLS) split(b, rng() < 0.5 ? 0.75 : -0.75);
    } else {
      state.laser = 9;
      if (ctx.audio) ctx.audio.tick();
    }
    if (ctx.audio) ctx.audio.powerup();
    state.flash = 1;
  };

  const spawnDrop = (br) => {
    if (rng() > br.drop) return;
    const roll = rng();
    const kind = roll < 0.45 ? 'wide' : roll < 0.78 ? 'multi' : 'laser';
    drops.push({ x: br.x + br.w / 2 - 8, y: br.y + br.h / 2 - 8, w: 16, h: 16, vy: 118, kind });
  };

  // ---- lives & finish ----
  const gameOver = () => {
    if (state.over) return;
    state.over = true;
    state.shake = 12;
    if (ctx.loop) ctx.loop.stop();
    ctx.finish(state.score);
  };

  const loseLife = () => {
    state.lives--;
    state.combo = 0;
    state.shake = 7;
    if (ctx.audio) ctx.audio.explode();
    if (state.lives <= 0) { if (ctx.audio) ctx.audio.gameOver(); gameOver(); return; }
    while (balls.length > 1) balls.pop();
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
    ball.vx = 0;
    ball.vy = 0;
    ball.speed = speedFor();
    ball.trail.length = 0;
    ball.stuck = true;
  };

  // ---- input ----
  const onPointerMove = (ev) => {
    const p = pointerPos(ctx.canvas, ev);
    targetX = (p.x * W) / ctx.canvas.width - paddle.w / 2;
    usePointer = true;
  };

  const onPointerDown = (ev) => {
    ev.preventDefault();
    if (state.over) return;
    onPointerMove(ev);
    if (ball.stuck) launch();
  };

  const onKeyDown = (ev) => {
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') { keys.l = true; usePointer = false; ev.preventDefault(); }
    else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') { keys.r = true; usePointer = false; ev.preventDefault(); }
    else if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); if (ball.stuck) launch(); }
  };

  const onKeyUp = (ev) => {
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') keys.l = false;
    else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') keys.r = false;
  };

  const onBlur = () => { keys.l = false; keys.r = false; };

  ctx.listeners.on(window, 'keydown', onKeyDown);
  ctx.listeners.on(window, 'keyup', onKeyUp);
  ctx.listeners.on(window, 'blur', onBlur);
  ctx.listeners.on(ctx.canvas, 'pointermove', onPointerMove);
  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointerDown);

  // ---- brick damage ----
  const bumpScore = (gain) => {
    state.score += gain;
    ctx.onScore(state.score);
  };

  const destroy = (br) => {
    const i = bricks.indexOf(br);
    if (i < 0) return;
    bricks.splice(i, 1);
    state.combo++;
    bumpScore(Math.round(br.score * (1 + Math.min(state.combo, 12) * 0.08)));
    state.shake = Math.min(9, state.shake + 3);
    spawnDrop(br);
    for (let k = 0; k < 7; k++) {
      const a = rng() * Math.PI * 2;
      const sp = 70 + rng() * 190;
      sparks.push({
        x: br.x + br.w / 2, y: br.y + br.h / 2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, hue: br.hue,
      });
    }
    if (ctx.audio) ctx.audio.explode();
    if (bricks.length !== 0) return;

    state.combo = 0;
    state.shake = 8;
    state.flash = 1;
    rowAcc = 0;
    if (state.row >= ROWS.length - 1) { if (ctx.audio) ctx.audio.win(); gameOver(); return; }
    state.row++;
    buildRow(state.row);
    if (ctx.audio) ctx.audio.win();
  };

  const damage = (br) => {
    br.hp--;
    br.flash = 1;
    if (br.hp <= 0) { destroy(br); return; }
    bumpScore(br.score);
    if (ctx.audio) ctx.audio.hit();
  };

  // ---- per-sub-step packet collision ----
  const stepBalls = (x, y) => {
    if (state.over) return;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.stuck) continue;

      if (x - b.r <= 0) { b.x = b.r; b.vx = Math.abs(b.vx); if (ctx.audio) ctx.audio.bounce(); }
      else if (x + b.r >= W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); if (ctx.audio) ctx.audio.bounce(); }
      if (y - b.r <= TOP) { b.y = TOP + b.r; b.vy = Math.abs(b.vy); if (ctx.audio) ctx.audio.bounce(); }

      for (const br of bricks) {
        if (x + b.r < br.x || x - b.r > br.x + br.w) continue;
        if (y + b.r < br.y || y - b.r > br.y + br.h) continue;
        const hit = resolveCircleAABB(x, y, b.r, br);
        if (!hit) break;
        b.x += hit.nx * hit.depth;
        b.y += hit.ny * hit.depth;
        const dot = b.vx * hit.nx + b.vy * hit.ny;
        if (dot < 0) { b.vx -= 2 * dot * hit.nx; b.vy -= 2 * dot * hit.ny; }
        damage(br);
        break;
      }

      // paddle: outgoing angle comes from the contact offset
      if (b.vy > 0 && x + b.r > paddle.x && x - b.r < paddle.x + paddle.w
          && y + b.r > paddle.y && y - b.r < paddle.y + paddle.h) {
        const off = clamp((x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
        const ang = -Math.PI / 2 + off * 1.05;
        b.speed = speedFor();
        b.vx = Math.cos(ang) * b.speed;
        b.vy = -Math.abs(Math.sin(ang) * b.speed);
        b.y = paddle.y - b.r - 1;
        state.combo = 0;
        if (ctx.audio) ctx.audio.bounce();
      }

      if (y - b.r > H) {
        if (b === ball) loseLife();
        else { balls.splice(i, 1); if (ctx.audio) ctx.audio.tick(); }
        if (state.over) return;
        continue;
      }

      b.trail.push(b.x, b.y);
      if (b.trail.length > 12) b.trail.splice(0, b.trail.length - 12);
    }
  };

  /* ---- update --------------------------------------------------- */

  const update = (dt) => {
    state.t += dt;
    state.shake *= Math.max(0, 1 - dt * 7);
    state.flash *= Math.max(0, 1 - dt * 3.4);

    rowAcc += dt * 1000;
    if (rowAcc >= ROW_MS && bricks.length) {
      rowAcc = 0;
      state.row++;
      buildRow(state.row);
      if (ctx.audio) ctx.audio.alarm();
    }

    if (state.wide > 0 && (state.wide -= dt) <= 0) paddle.w = paddle.base;
    if (state.multi > 0) {
      state.multi -= dt;
      multiAcc += dt;
      if (multiAcc >= 1.5) {
        multiAcc = 0;
        for (const b of balls.slice()) if (balls.length < MAX_BALLS) split(b, rng() < 0.5 ? 0.6 : -0.6);
      }
    }
    if (state.laser > 0 && (state.laser -= dt) <= 0) shots.length = 0;

    // paddle: keys while held, pointer otherwise
    if (keys.l || keys.r) {
      paddle.vx = ((keys.r ? 1 : 0) - (keys.l ? 1 : 0)) * PADDLE_SPEED;
    } else {
      paddle.vx = usePointer ? (clamp(targetX, 0, W - paddle.w) - paddle.x) * 12 : 0;
    }
    paddle.x = clamp(paddle.x + paddle.vx * dt, 0, W - paddle.w);
    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 2;
    }

    // laser
    if (state.laser > 0 && !state.over) {
      shots.push({ x: paddle.x + 5, y: paddle.y - 9, vx: 0, vy: -LASER_SPEED, r: 2 });
      shots.push({ x: paddle.x + paddle.w - 5, y: paddle.y - 9, vx: 0, vy: -LASER_SPEED, r: 2 });
      if (ctx.audio) ctx.audio.shoot();
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      integrate(s, dt, W, TOP + 4, null);
      clampCircleToBounds(s, W, TOP + 4);
      let gone = s.y + s.r < TOP;
      if (!gone) {
        for (const br of bricks) {
          if (s.x < br.x || s.x > br.x + br.w || s.y < br.y || s.y > br.y + br.h) continue;
          damage(br);
          gone = true;
          break;
        }
      }
      if (gone) shots.splice(i, 1);
    }

    // power-up drops
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy = Math.min(d.vy + dt * 26, 150);
      d.y += d.vy * dt;
      const mid = d.x + d.w / 2;
      if (mid > paddle.x && mid < paddle.x + paddle.w && d.y + d.h > paddle.y && d.y < paddle.y + paddle.h) {
        drops.splice(i, 1);
        grant(d.kind);
        continue;
      }
      if (d.y - d.h > H) drops.splice(i, 1);
    }

    // packets — every ball crosses FAST_SPEED, so all of them integrate()
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (b.stuck || state.over) continue;
      if (needsSubStepping(b)) {
        integrate(b, dt, W, DRAIN, stepBalls);
        clampCircleToBounds(b, W, DRAIN);
      } else {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        clampCircleToBounds(b, W, DRAIN);
        stepBalls(b.x, b.y);
      }
    }

    for (const br of bricks) br.flash *= Math.max(0, 1 - dt * 5);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 240 * dt;
      s.life -= dt * 2.2;
      if (s.life <= 0) sparks.splice(i, 1);
    }
  };

  /* ---- draw ----------------------------------------------------- */

  const drawBackdrop = () => {
    ctx.clear('#090D16');
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = TOP; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    c.fillStyle = 'rgba(244,63,94,0.16)';
    c.fillRect(0, H - 3, W, 3);
  };

  const drawBrick = (br) => {
    glow(c, br.hue, br.flash > 0.05 ? 18 : 8);
    c.fillStyle = br.flash > 0.4 ? '#E2E8F0' : br.hue;
    roundRect(c, br.x, br.y, br.w, br.h, 3);
    c.fill();
    noGlow(c);
    c.strokeStyle = 'rgba(9,13,22,0.75)';
    c.lineWidth = 1;
    roundRect(c, br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1, 3);
    c.stroke();
    if (br.max > 1) {
      for (let i = 0; i < br.max; i++) {
        c.fillStyle = i < br.hp ? '#090D16' : 'rgba(9,13,22,0.28)';
        c.fillRect(br.x + 5 + i * 6, br.y + br.h / 2 - 1.5, 4, 3);
      }
    }
    if (br.hp < br.max) {
      c.fillStyle = 'rgba(9,13,22,0.5)';
      c.fillRect(br.x + br.w - 9, br.y + 2, 5, 3);
    }
  };

  const drawPaddle = () => {
    const armed = state.laser > 0;
    glow(c, armed ? '#F43F5E' : '#6366F1', 16);
    c.fillStyle = armed ? '#F43F5E' : '#6366F1';
    roundRect(c, paddle.x, paddle.y, paddle.w, paddle.h, 5);
    c.fill();
    noGlow(c);
    c.fillStyle = 'rgba(226,232,240,0.72)';
    for (let x = paddle.x + 8; x < paddle.x + paddle.w - 5; x += 14) c.fillRect(x, paddle.y + 3, 8, 2);
    if (armed) {
      c.fillStyle = '#F43F5E';
      c.fillRect(paddle.x + 2, paddle.y - 6, 5, 4);
      c.fillRect(paddle.x + paddle.w - 7, paddle.y - 6, 5, 4);
      c.strokeStyle = 'rgba(244,63,94,0.30)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(paddle.x + 5, paddle.y);
      c.lineTo(paddle.x + 5, TOP);
      c.moveTo(paddle.x + paddle.w - 5, paddle.y);
      c.lineTo(paddle.x + paddle.w - 5, TOP);
      c.stroke();
    }
  };

  const drawBall = (b) => {
    if (b.trail.length > 4) {
      c.strokeStyle = 'rgba(16,185,129,0.30)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(b.trail[0], b.trail[1]);
      for (let i = 2; i < b.trail.length; i += 2) c.lineTo(b.trail[i], b.trail[i + 1]);
      c.stroke();
    }
    glow(c, '#10B981', 16);
    c.fillStyle = '#10B981';
    circle(c, b.x, b.y, b.r);
    c.fill();
    noGlow(c);
    c.fillStyle = '#090D16';
    circle(c, b.x - b.r * 0.28, b.y - b.r * 0.26, b.r * 0.32);
    c.fill();
  };

  const hueOf = (kind) => (kind === 'wide' ? '#10B981' : kind === 'multi' ? '#6366F1' : '#F43F5E');

  const drawDrops = () => {
    for (const d of drops) {
      glow(c, hueOf(d.kind), 14);
      c.fillStyle = hueOf(d.kind);
      roundRect(c, d.x, d.y, d.w, d.h, 4);
      c.fill();
      noGlow(c);
      c.fillStyle = '#090D16';
      c.fillRect(d.x + 4, d.y + 6, d.w - 8, 2);
      c.fillRect(d.x + 4, d.y + 10, d.w - 8, 2);
      if (d.kind === 'laser') c.fillRect(d.x + 7, d.y + 3, 2, 3);
    }
  };

  const drawHud = () => {
    c.fillStyle = 'rgba(9,13,22,0.78)';
    c.fillRect(0, 0, W, TOP);
    c.fillStyle = 'rgba(99,102,241,0.35)';
    c.fillRect(0, TOP - 2, W, 2);
    label(c, `SCORE ${state.score}`, 14, 30, 19, '#10B981');
    label(c, `WAVE ${state.row + 1}`, 200, 30, 15, '#6366F1');
    if (state.combo > 2) label(c, `x${state.combo}`, 300, 30, 16, '#F59E0B');

    for (let i = 0; i < 3; i++) {
      c.fillStyle = i < state.lives ? '#F43F5E' : 'rgba(100,116,139,0.32)';
      roundRect(c, W - 16 - i * 15, 16, 10, 10, 2);
      c.fill();
    }

    if (ball.stuck && !state.over) {
      labelCenter(c, 'CLICK OR SPACE TO LAUNCH', W / 2, H - 54, 13, '#F59E0B');
    }

    const chips = [];
    if (state.wide > 0) chips.push(['WIDE', state.wide, 12]);
    if (state.multi > 0) chips.push(['MULTI', state.multi, 9]);
    if (state.laser > 0) chips.push(['LASER', state.laser, 9]);
    for (let i = 0; i < chips.length; i++) {
      const txt = chips[i][0], left = chips[i][1], max = chips[i][2];
      const x = 14 + i * 100;
      label(c, `${txt} ${left.toFixed(0)}`, x, H - 16, 12, hueOf(txt.toLowerCase()));
      c.fillStyle = 'rgba(100,116,139,0.30)';
      c.fillRect(x, H - 22, 86, 2);
      c.fillStyle = hueOf(txt.toLowerCase());
      c.fillRect(x, H - 22, 86 * clamp(left / max, 0, 1), 2);
    }

    // time bar
    c.fillStyle = 'rgba(100,116,139,0.25)';
    c.fillRect(0, H - 6, W, 6);
    const frac = 1 - clamp(rowAcc / ROW_MS, 0, 1);
    c.fillStyle = frac < 0.22 ? '#F43F5E' : '#6366F1';
    c.fillRect(0, H - 6, W * frac, 6);

    if (state.flash > 0.02) {
      c.fillStyle = `rgba(16,185,129,${(state.flash * 0.14).toFixed(3)})`;
      c.fillRect(0, 0, W, H);
    }
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();
    for (const br of bricks) drawBrick(br);
    drawDrops();

    c.fillStyle = '#F59E0B';
    for (const s of shots) { circle(c, s.x, s.y, s.r); c.fill(); }

    for (const b of balls) drawBall(b);
    drawPaddle();

    for (const s of sparks) {
      c.globalAlpha = Math.max(0, s.life);
      c.fillStyle = s.hue;
      c.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    c.globalAlpha = 1;

    drawHud();

    if (state.over) {
      c.fillStyle = 'rgba(9,13,22,0.74)';
      c.fillRect(0, 0, W, H);
      labelCenter(c, 'FIREWALL BREACHED', W / 2, H / 2 - 10, 26, '#F43F5E');
      labelCenter(c, `SCORE ${state.score}`, W / 2, H / 2 + 22, 18, '#E2E8F0');
    }
    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}