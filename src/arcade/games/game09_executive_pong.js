/* ============================================================
 * GAME 09 — EXECUTIVE PONG
 * Boardroom duel: out-pace a CEO paddle with capped reflexes.
 * ============================================================ */
import {
  integrate, clampCircleToBounds, clamp, intersectCircleAABB,
  pointerPos, circle, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g09';
export const accent = '#10B981';

const W = 640, H = 480;
const L = 26, R = W - 26, T = 52, B = H - 26;
const PW = 13, PH = 78, P_SPEED = 440;
const WIN = 11;
const BASE_SPEED = 300, MAX_SPEED = 565, ACCEL = 7;
const MAX_ANGLE = 0.95;
const SERVE_S = 0.85;
const MAX_LEVEL = 8;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0x909);
  const state = {
    t: 0, you: 0, ceo: 0, rally: 0, best: 0, level: 1,
    score: 0, shake: 0, serve: 0, over: false, mp: null, msg: 0,
  };
  const you = { x: L + 10, y: H / 2 - PH / 2, w: PW, h: PH, vy: 0, flash: 0 };
  const ceo = { x: R - 10 - PW, y: H / 2 - PH / 2, w: PW, h: PH, vy: 0, flash: 0 };
  const ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 7, speed: BASE_SPEED, trail: [] };
  const sparks = [];
  const keys = { up: false, down: false };
  let pointerY = H / 2;
  let usePointer = false;
  let aiTarget = H / 2;
  let aiClock = 0;
  let lastRally = 0;

  // ---- serve ----
  const serve = (toRight) => {
    const dir = toRight ? 1 : -1;
    ball.x = W / 2;
    ball.y = H / 2;
    ball.speed = BASE_SPEED;
    const ang = (rng() - 0.5) * 0.46;
    ball.vx = Math.cos(ang) * BASE_SPEED * dir;
    ball.vy = Math.sin(ang) * BASE_SPEED;
    ball.trail.length = 0;
    state.serve = SERVE_S;
    if (ctx.audio) ctx.audio.select();
  };

  const launch = () => {
    if (state.over || state.serve <= 0) return;
    state.serve = 0;
    if (ctx.audio) ctx.audio.tick();
  };

  const burst = (x, y, dir, hue) => {
    for (let i = 0; i < 8; i++) {
      const a = (rng() - 0.5) * 1.5;
      const sp = 40 + rng() * 150;
      sparks.push({ x, y, vx: Math.cos(a) * sp + dir * 60, vy: Math.sin(a) * sp, life: 1, hue });
    }
  };

  // ---- paddle impact: angle from the contact point, speed ramps ----
  const strike = (p, dir, hue) => {
    const off = clamp((ball.y - (p.y + p.h / 2)) / (p.h / 2), -1, 1);
    const ang = clamp(off + (p.vy / 900) * 0.35, -1, 1) * MAX_ANGLE;
    ball.speed = Math.min(MAX_SPEED, ball.speed + ACCEL + ball.speed * 0.014);
    ball.vx = Math.cos(ang) * ball.speed * dir;
    ball.vy = Math.sin(ang) * ball.speed;
    ball.x = dir > 0 ? p.x + p.w + ball.r : p.x - ball.r;
    p.flash = 1;
    state.rally++;
    if (state.rally > state.best) state.best = state.rally;
    state.score += 3 + Math.min(state.rally, 20);
    state.shake = Math.min(7, 2 + state.rally * 0.4);
    burst(ball.x, ball.y, dir, hue);
    if (ctx.audio) ctx.audio.bounce();
    ctx.onScore(state.score);
  };

  const onStep = (x, y) => {
    if (y - ball.r <= T && ball.vy < 0) { ball.y = T + ball.r; ball.vy = -ball.vy; wallFx(); }
    else if (y + ball.r >= B && ball.vy > 0) { ball.y = B - ball.r; ball.vy = -ball.vy; wallFx(); }
    if (ball.vx < 0 && intersectCircleAABB(x, y, ball.r, you)) strike(you, 1, '#10B981');
    else if (ball.vx > 0 && intersectCircleAABB(x, y, ball.r, ceo)) strike(ceo, -1, '#6366F1');
  };

  const wallFx = () => {
    if (ctx.audio) ctx.audio.tick();
    state.shake = Math.min(5, state.shake + 1.2);
  };

  // ---- scoring ----
  const matchPointFor = () => (state.you === WIN - 1 ? 'you' : state.ceo === WIN - 1 ? 'ceo' : null);

  const finishMatch = (won) => {
    state.over = true;
    state.msg = 1;
    const raw = state.score + (won ? 200 : 30);
    const final = Math.round(raw * (won ? 1.45 : 0.75));
    ctx.onScore(final);
    if (ctx.audio) { if (won) ctx.audio.win(); else ctx.audio.gameOver(); }
    ctx.after(760, () => {
      if (ctx.loop) ctx.loop.stop();
      ctx.finish(final);
    });
  };

  const point = (forYou) => {
    if (state.over) return;
    lastRally = state.rally;
    state.rally = 0;
    state.level = Math.min(MAX_LEVEL, state.level + 1);
    if (forYou) { state.you++; state.score += 40 + Math.min(lastRally, 18) * 6; }
    else { state.ceo++; state.score += 8; }
    state.shake = 8;
    ctx.onScore(state.score);
    if (ctx.audio) { if (forYou) ctx.audio.hit(); else ctx.audio.error(); }
    if (state.you >= WIN || state.ceo >= WIN) { finishMatch(state.you >= WIN); return; }
    serve(!forYou);
  };

  serve(true);

  // ---- input ----
  const onPointerMove = (ev) => {
    const p = pointerPos(ctx.canvas, ev);
    pointerY = (p.y * H) / ctx.canvas.height;
    usePointer = true;
  };

  const onPointerDown = (ev) => {
    ev.preventDefault();
    onPointerMove(ev);
    launch();
  };

  const onKeyDown = (ev) => {
    if (ev.code === 'ArrowUp' || ev.code === 'KeyW') { keys.up = true; usePointer = false; ev.preventDefault(); }
    else if (ev.code === 'ArrowDown' || ev.code === 'KeyS') { keys.down = true; usePointer = false; ev.preventDefault(); }
    else if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); launch(); }
  };

  const onKeyUp = (ev) => {
    if (ev.code === 'ArrowUp' || ev.code === 'KeyW') keys.up = false;
    else if (ev.code === 'ArrowDown' || ev.code === 'KeyS') keys.down = false;
  };

  const onBlur = () => { keys.up = false; keys.down = false; };

  ctx.listeners.on(ctx.canvas, 'pointermove', onPointerMove);
  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointerDown);
  ctx.listeners.on(window, 'keydown', onKeyDown);
  ctx.listeners.on(window, 'keyup', onKeyUp);
  ctx.listeners.on(window, 'blur', onBlur);

  // ---- paddles ----
  const movePaddle = (p, want, speed, dt) => {
    const prev = p.y;
    p.y = clamp(p.y + clamp(want, -speed * dt, speed * dt), T, B - p.h);
    p.vy = dt > 0 ? (p.y - prev) / dt : 0;
    p.flash = Math.max(0, p.flash - dt * 3.2);
  };

  const playerUpdate = (dt) => {
    const dir = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (dir !== 0) movePaddle(you, dir * P_SPEED, P_SPEED, dt);
    else if (usePointer) {
      const gap = pointerY - you.h / 2 - you.y;
      movePaddle(you, gap, P_SPEED * 1.4, dt);
    } else movePaddle(you, 0, P_SPEED, dt);
  };

  const aiUpdate = (dt) => {
    const lv = state.level;
    aiClock -= dt;
    if (aiClock <= 0) {
      aiClock = Math.max(0.11, 0.4 - lv * 0.032);
      const err = Math.max(3, 24 - lv * 3);
      const lead = ball.vx > 0 ? ball.vy * 0.12 : 0;
      aiTarget = (ball.vx > 0 ? ball.y + lead : H / 2) + (rng() * 2 - 1) * err;
    }
    const want = aiTarget - (ceo.y + ceo.h / 2);
    movePaddle(ceo, want, Math.min(560, 210 + lv * 42), dt);
  };

  // ---- loop ----
  const update = (dt) => {
    state.t += dt;
    state.shake *= Math.max(0, 1 - dt * 7);
    if (state.msg > 0) state.msg -= dt * 0.7;
    if (state.serve > 0) state.serve = Math.max(0, state.serve - dt);

    playerUpdate(dt);
    aiUpdate(dt);

    if (state.serve <= 0 && !state.over) {
      integrate(ball, dt, W, H, onStep);
      clampCircleToBounds(ball, W, H);
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 12) ball.trail.shift();
      if (ball.x - ball.r < L) point(false);
      else if (ball.x + ball.r > R) point(true);
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 220 * dt;
      s.life -= dt * 2.6;
      if (s.life <= 0) sparks.splice(i, 1);
    }

    const mp = matchPointFor();
    if (mp && !state.mp) { state.mp = mp; if (ctx.audio) ctx.audio.alarm(); }
    if (!mp) state.mp = null;
  };

  // ---- draw ----
  const drawBackdrop = () => {
    ctx.clear('#090D16');
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    // circuit centre line
    c.strokeStyle = 'rgba(16,185,129,0.22)';
    c.lineWidth = 2;
    c.setLineDash([12, 12]);
    c.beginPath();
    c.moveTo(W / 2 + 0.5, T);
    c.lineTo(W / 2 + 0.5, B);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = 'rgba(99,102,241,0.30)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const y = T + ((B - T) / 4) * (i + 0.5);
      c.beginPath();
      c.moveTo(W / 2 - 22, y);
      c.lineTo(W / 2 - 22, y + (i % 2 ? 12 : -12));
      c.lineTo(W / 2 + 22, y + (i % 2 ? 12 : -12));
      c.lineTo(W / 2 + 22, y);
      c.stroke();
    }
    c.fillStyle = 'rgba(16,185,129,0.35)';
    circle(c, W / 2, H / 2, 5);
    c.fill();
    // side rails
    c.fillStyle = 'rgba(99,102,241,0.18)';
    c.fillRect(L - 3, T, 2, B - T);
    c.fillRect(R + 1, T, 2, B - T);
  };

  const drawPaddle = (p, hue, tag, right) => {
    glow(c, hue, p.flash > 0.05 ? 20 : 10);
    c.fillStyle = hue;
    roundRect(c, p.x, p.y, p.w, p.h, 6);
    c.fill();
    noGlow(c);
    c.fillStyle = 'rgba(9,13,22,0.55)';
    for (let i = 0; i < 3; i++) c.fillRect(p.x + 3, p.y + 12 + i * 20, p.w - 6, 4);
    labelCenter(c, tag, p.x + p.w / 2, p.y - 10, 11, right ? '#6366F1' : '#10B981');
  };

  const drawBall = () => {
    for (let i = 0; i < ball.trail.length; i++) {
      const t = ball.trail[i];
      c.globalAlpha = (i / ball.trail.length) * 0.28;
      c.fillStyle = '#E2E8F0';
      circle(c, t.x, t.y, ball.r * (0.35 + 0.5 * (i / ball.trail.length)));
      c.fill();
    }
    c.globalAlpha = 1;
    glow(c, '#E2E8F0', 14);
    c.fillStyle = '#E2E8F0';
    circle(c, ball.x, ball.y, ball.r);
    c.fill();
    noGlow(c);
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    drawBackdrop();

    for (const s of sparks) {
      c.globalAlpha = Math.max(0, s.life);
      c.fillStyle = s.hue;
      circle(c, s.x, s.y, 2);
      c.fill();
    }
    c.globalAlpha = 1;

    drawPaddle(you, '#10B981', 'YOU', false);
    drawPaddle(ceo, state.mp === 'ceo' ? '#F43F5E' : '#6366F1', 'CEO', true);
    drawBall();

    // wall flashes
    c.fillStyle = 'rgba(245,158,11,0.5)';
    c.fillRect(L - 3, T, 2, 3);
    c.fillRect(R + 1, T, 2, 3);

    // big scores
    labelCenter(c, `${state.you}`, 96, 132, 52, state.mp === 'you' ? '#F59E0B' : 'rgba(16,185,129,0.35)');
    labelCenter(c, `${state.ceo}`, W - 96, 132, 52, state.mp === 'ceo' ? '#F59E0B' : 'rgba(99,102,241,0.35)');

    // HUD
    c.fillStyle = 'rgba(9,13,22,0.78)';
    c.fillRect(0, 0, W, 46);
    label(c, 'EXECUTIVE PONG', 14, 29, 18, '#10B981');
    labelCenter(c, `RALLY ${state.rally}`, W / 2, 29, 18, state.rally > 6 ? '#F59E0B' : '#E2E8F0');
    label(c, `BEST ${state.best}`, W - 14, 29, 18, '#64748B', 'right');

    if (state.serve > 0) {
      labelCenter(c, state.serve > SERVE_S - 0.02 ? 'SPACE / TAP TO SERVE' : 'SERVE', W / 2, H - 52, 14, '#E2E8F0');
    }
    if (state.mp) {
      const hue = state.mp === 'you' ? '#10B981' : '#F43F5E';
      if (Math.sin(state.t * 9) > -0.35) {
        labelCenter(c, 'MATCH POINT', W / 2, 68, 18, hue);
        labelCenter(c, state.mp === 'you' ? 'YOU SERVE IT' : 'CEO SERVE IT', W / 2, 88, 12, hue);
      }
    }

    // level pips
    for (let i = 0; i < MAX_LEVEL; i++) {
      c.fillStyle = i < state.level ? '#10B981' : 'rgba(100,116,139,0.28)';
      roundRect(c, L + i * 16, H - 16, 12, 5, 2);
      c.fill();
    }
    label(c, `LVL ${state.level}`, W - 14, H - 9, 11, '#64748B', 'right');

    if (state.over) {
      c.fillStyle = 'rgba(9,13,22,0.72)';
      c.fillRect(0, 0, W, H);
      const won = state.you >= WIN;
      labelCenter(c, won ? 'BOARD WON' : 'TERMINATED', W / 2, H / 2 - 26, 34, won ? '#10B981' : '#F43F5E');
      labelCenter(c, `${state.you} — ${state.ceo}  ·  BEST RALLY ${state.best}`, W / 2, H / 2 + 12, 15, '#E2E8F0');
    }

    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}
