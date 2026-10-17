/* ============================================================
 * GAME 14 — VAULT LOCKPICKER
 * Read the bearings, set four dials, crack the safe.
 * ============================================================ */
import {
  clamp, circle, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g14';
export const accent = '#10B981';

const W = 640, H = 480;
const DIALS = 4;
const MAX_STRIKES = 3;
const ROUND_MS = 120000;
const DIAL_MIN = 0, DIAL_MAX = 39;
const STEP_MIN = 1, STEP_MAX = 4;
const TICK_MS = 220;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0x7A17);
  const state = {
    t: 0, left: ROUND_MS, score: 0, best: 0,
    strikes: 0, sel: 0, shake: 0, over: false,
    phase: 'read', flash: 0, alarm: 0, opened: 0,
    stage: 0, payout: 0,
  };
  const dials = [];
  const sparks = [];
  let sinceTick = 0;

  // ---- difficulty ------------------------------------------------
  const param = (stage) => ({
    span: Math.max(6, 22 - stage * 5),
    step: Math.min(STEP_MAX, STEP_MIN + Math.floor(stage / 2)),
    payout: 1400 + stage * 900,
  });

  const rollDial = () => {
    const p = param(state.stage);
    const base = DIAL_MIN + Math.floor(rng() * (DIAL_MAX - p.span));
    const target = base + Math.floor(rng() * (p.span + 1));
    const dir = target >= base ? 1 : -1;
    const mag = Math.abs(target - base);
    const rough = Math.min(4, Math.max(1, Math.round(mag / 3) + (rng() < 0.5 ? 0 : 1)));
    return {
      pos: DIAL_MIN, target, dir, rough,
      spread: p.span,
      word: dir > 0 ? 'CW' : 'CCW',
      show: mag,
    };
  };

  const dialPos = (i) => ({ cx: 190 + i * 88, cy: 232, r: 33 });

  const seedDial = (i) => {
    const d = rollDial();
    const p = dialPos(i);
    d.cx = p.cx; d.cy = p.cy; d.r = p.r;
    return d;
  };

  const newVault = () => {
    state.stage = 0;
    state.strikes = 0;
    state.payout = param(0).payout;
    state.left = ROUND_MS;
    state.score = 0;
    state.sel = 0;
    dials.length = 0;
    for (let i = 0; i < DIALS; i++) dials.push(seedDial(i));
    ctx.onScore(0);
  };

  // ---- dial mechanics --------------------------------------------
  const turn = (delta) => {
    const d = dials[state.sel];
    if (!d || state.over || state.phase === 'open') return;
    d.pos = clamp(d.pos + delta, DIAL_MIN, DIAL_MAX);
    state.flash = 0.35;
    sinceTick = 0;
    if (ctx.audio) ctx.audio.tick();
  };

  const select = (delta) => {
    if (state.over) return;
    state.sel = (state.sel + delta + DIALS) % DIALS;
    state.flash = 0.25;
    if (ctx.audio) ctx.audio.select();
  };

  const burst = (x, y, hue, n) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const sp = 60 + rng() * 200;
      sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, hue,
      });
    }
  };

  // ---- testing the combination -----------------------------------
  const wrongAttempt = () => {
    state.strikes++;
    state.alarm = 1;
    state.shake = 11;
    if (ctx.audio) ctx.audio.alarm();
    for (let i = 0; i < DIALS; i++) {
      const d = dials[i];
      burst(d.cx, d.cy, '#F43F5E', 12);
      d.pos = DIAL_MIN;
    }
    if (state.strikes >= MAX_STRIKES) {
      lockdown();
      return;
    }
    // safe rewinds to easier parameters
    state.stage = Math.max(0, state.stage - 1);
    state.payout = param(state.stage).payout;
    state.sel = 0;
    for (let i = 0; i < DIALS; i++) dials[i] = seedDial(i);
    ctx.after(360, () => {
      if (!state.over && state.phase !== 'open') state.phase = 'read';
    });
  };

  const scoreVault = () => {
    state.phase = 'open';
    state.opened = 1;
    const timeBonus = Math.round(state.left * 0.9);
    const mult = state.strikes + 1;
    const payout = state.payout + timeBonus;
    state.score = payout * mult;
    if (state.score > state.best) state.best = state.score;
    if (ctx.audio) ctx.audio.bigCash();
    for (const d of dials) burst(d.cx, d.cy, '#10B981', 18);
    ctx.onScore(state.score);
    ctx.after(900, () => {
      if (state.over) return;
      if (ctx.audio) ctx.audio.win();
      if (ctx.loop) ctx.loop.stop();
      ctx.finish(state.score);
    });
  };

  const test = () => {
    if (state.over || state.phase === 'open' || state.alarm > 0.4) return;
    const d = dials[state.sel];
    if (d) burst(d.cx, d.cy, '#6366F1', 6);
    const ok = dials.every((x) => x.pos === x.target);
    if (ok) {
      state.flash = 0.6;
      if (ctx.audio) ctx.audio.cash();
      ctx.after(220, scoreVault);
    } else {
      if (ctx.audio) ctx.audio.error();
      wrongAttempt();
    }
  };

  const lockdown = () => {
    state.over = true;
    state.phase = 'lock';
    state.shake = 14;
    const timeBonus = Math.round(state.left * 0.25);
    state.score = Math.round(state.payout * 0.35 + timeBonus);
    if (state.score > state.best) state.best = state.score;
    if (ctx.audio) ctx.audio.gameOver();
    ctx.onScore(state.score);
    ctx.after(700, () => {
      if (ctx.loop) ctx.loop.stop();
      ctx.finish(state.score);
    });
  };

  newVault();

  // ---- input ------------------------------------------------------
  const onKey = (ev) => {
    const k = ev.code, key = ev.key;
    if (k === 'ArrowLeft' || key === 'a' || key === 'A') { ev.preventDefault(); select(-1); return; }
    if (k === 'ArrowRight' || key === 'd' || key === 'D') { ev.preventDefault(); select(1); return; }
    if (k === 'ArrowUp' || k === 'KeyW' || key === 'w' || key === 'W') { ev.preventDefault(); turn(1); return; }
    if (k === 'ArrowDown' || k === 'KeyS' || key === 's' || key === 'S') { ev.preventDefault(); turn(-1); return; }
    if (k === 'Enter' || k === 'Space' || key === ' ' || key === 'Enter') { ev.preventDefault(); test(); }
  };

  ctx.listeners.on(window, 'keydown', onKey);

  // ---- update -----------------------------------------------------
  const update = (dt) => {
    state.t += dt;
    if (state.left > 0 && !state.over) state.left = Math.max(0, state.left - dt * 1000);
    state.flash *= Math.max(0, 1 - dt * 5);
    state.alarm = Math.max(0, state.alarm - dt * 1.4);
    state.shake *= Math.max(0, 1 - dt * 7);

    sinceTick += dt * 1000;
    if (sinceTick >= TICK_MS) {
      sinceTick = 0;
      if (!state.over && state.phase !== 'open') {
        const p = param(state.stage);
        state.payout = p.payout;
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.93;
      s.vy *= 0.93;
      s.life -= dt * 2.2;
      if (s.life <= 0) sparks.splice(i, 1);
    }

    if (!state.over && state.left <= 0) lockdown();
  };

  // ---- draw -------------------------------------------------------
  const drawBackdrop = () => {
    c.fillStyle = '#090D16';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = state.alarm > 0 ? 'rgba(244,63,94,0.20)' : 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  };

  const drawDial = (d, i) => {
    const on = i === state.sel && state.phase !== 'open';
    const ring = state.phase === 'open' ? '#10B981' : on ? '#6366F1' : '#1E293B';
    const locked = d.pos === d.target;

    glow(c, ring, on || state.phase === 'open' ? 16 : 7);
    c.fillStyle = '#0B1220';
    circle(c, d.cx, d.cy, d.r);
    c.fill();
    c.strokeStyle = ring;
    c.lineWidth = on ? 2.5 : 1.5;
    circle(c, d.cx, d.cy, d.r);
    c.stroke();
    noGlow(c);

    // tick marks around the dial
    const marks = 10;
    for (let k = 0; k < marks; k++) {
      const a = (k / marks) * Math.PI * 2 - Math.PI / 2;
      const hit = k === d.pos % marks;
      c.strokeStyle = hit ? '#F59E0B' : 'rgba(100,116,139,0.7)';
      c.lineWidth = hit ? 2.5 : 1;
      c.beginPath();
      c.moveTo(d.cx + Math.cos(a) * (d.r - 8), d.cy + Math.sin(a) * (d.r - 8));
      c.lineTo(d.cx + Math.cos(a) * (d.r - 2), d.cy + Math.sin(a) * (d.r - 2));
      c.stroke();
    }

    // pointer notch
    const na = (d.pos / 40) * Math.PI * 2 - Math.PI / 2;
    c.strokeStyle = on ? '#E2E8F0' : '#64748B';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(d.cx + Math.cos(na) * 8, d.cy + Math.sin(na) * 8);
    c.lineTo(d.cx + Math.cos(na) * (d.r - 6), d.cy + Math.sin(na) * (d.r - 6));
    c.stroke();

    const face = locked ? '#10B981' : on ? '#E2E8F0' : '#64748B';
    labelCenter(c, String(d.pos).padStart(2, '0'), d.cx, d.cy + 5, 17, face);
    labelCenter(c, `D${i + 1}`, d.cx, d.cy + d.r + 16, 11, on ? '#6366F1' : '#64748B');
  };

  const drawHintCard = () => {
    const p = param(state.stage);
    c.fillStyle = 'rgba(11,18,32,0.9)';
    roundRect(c, 30, 322, 320, 108, 8);
    c.fill();
    c.strokeStyle = state.alarm > 0 ? '#F43F5E' : '#1E293B';
    c.lineWidth = 1.5;
    roundRect(c, 30, 322, 320, 108, 8);
    c.stroke();

    label(c, 'BEARING CARD', 44, 344, 12, '#6366F1');
    label(c, `SPREAD ±${p.span}   STEP ${p.step}`, 336, 344, 11, '#64748B', 'right');

    for (let i = 0; i < DIALS; i++) {
      const d = dials[i];
      const x = 46 + i * 78;
      const y = 366;
      label(c, `D${i + 1}`, x, y, 11, '#64748B');
      label(c, `${d.word} ~${d.rough}`, x, y + 20, 15, '#F59E0B');
      label(c, d.dir > 0 ? '>>' : '<<', x, y + 38, 13, '#64748B');
    }
  };

  const drawVault = () => {
    const x = 380, y = 322, w = 230, h = 108;
    const open = state.phase === 'open';
    c.fillStyle = '#0B1220';
    roundRect(c, x, y, w, h, 8);
    c.fill();
    c.strokeStyle = open ? '#10B981' : '#1E293B';
    c.lineWidth = 2;
    roundRect(c, x, y, w, h, 8);
    c.stroke();

    // spokes
    c.strokeStyle = 'rgba(99,102,241,0.35)';
    c.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + state.t * (open ? 0.9 : 0.12);
      c.beginPath();
      c.moveTo(x + w / 2 + Math.cos(a) * 14, y + h / 2 + Math.sin(a) * 14);
      c.lineTo(x + w / 2 + Math.cos(a) * 34, y + h / 2 + Math.sin(a) * 34);
      c.stroke();
    }
    c.fillStyle = open ? '#10B981' : '#6366F1';
    circle(c, x + w / 2, y + h / 2, 12);
    c.fill();

    label(c, open ? 'VAULT OPEN' : 'VAULT VALUE', x + 12, y + 22, 11, open ? '#10B981' : '#64748B');
    labelCenter(c, `$${state.payout}`, x + w / 2, y + 66, 24, open ? '#10B981' : '#E2E8F0');
    label(c, `x${state.strikes + 1} STRIKE BONUS`, x + w - 12, y + 22, 11, '#F59E0B', 'right');
    labelCenter(c, state.phase === 'open' ? 'PAYOUT SCALED BY TIME' : 'CLOSED', x + w / 2, y + 90, 10, '#64748B');
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();

    dials.forEach((d, i) => drawDial(d, i));
    drawHintCard();
    drawVault();

    for (const s of sparks) {
      c.globalAlpha = Math.max(0, s.life);
      c.fillStyle = s.hue;
      circle(c, s.x, s.y, 2.2 * s.life + 0.6);
      c.fill();
    }
    c.globalAlpha = 1;

    if (state.alarm > 0.05) {
      c.fillStyle = `rgba(244,63,94,${(state.alarm * 0.12).toFixed(3)})`;
      c.fillRect(0, 46, W, H - 46);
    }

    // HUD
    c.fillStyle = 'rgba(9,13,22,0.78)';
    c.fillRect(0, 0, W, 46);
    label(c, `SCORE ${state.score}`, 14, 30, 20, '#10B981');
    label(c, `${(state.left / 1000).toFixed(1)}s`, W - 14, 30, 20, state.left < 15000 ? '#F43F5E' : '#E2E8F0', 'right');

    for (let i = 0; i < MAX_STRIKES; i++) {
      const x = 236 + i * 26;
      const lit = i < state.strikes;
      glow(c, lit ? '#F43F5E' : '#1E293B', lit ? 12 : 0);
      c.fillStyle = lit ? '#F43F5E' : 'rgba(30,41,59,0.9)';
      circle(c, x, 24, 8);
      c.fill();
      if (lit) noGlow(c);
    }
    label(c, 'ALARM', 236 + MAX_STRIKES * 26 + 8, 30, 12, state.strikes > 0 ? '#F43F5E' : '#64748B');

    label(c, 'ARROWS SELECT   UP/DOWN TURN   ENTER TEST', W / 2, 462, 11, '#64748B', 'center');

    c.fillStyle = 'rgba(99,102,241,0.25)';
    c.fillRect(0, H - 8, W, 8);
    c.fillStyle = state.left < 15000 ? '#F43F5E' : '#6366F1';
    c.fillRect(0, H - 8, W * (state.left / ROUND_MS), 8);

    if (state.phase === 'open') {
      const a = 0.35 + Math.abs(Math.sin(state.t * 3)) * 0.4;
      labelCenter(c, 'CRACKED', W / 2, 300, 34, `rgba(16,185,129,${a.toFixed(2)})`);
    } else if (state.phase === 'lock') {
      labelCenter(c, 'LOCKDOWN', W / 2, 300, 34, 'rgba(244,63,94,0.85)');
    }

    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}
