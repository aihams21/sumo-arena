/* ============================================================
 * GAME 17 — STOCK MARKET SCALPER
 * Ride the tape: scalp the trend, dodge the crash, keep equity.
 * ============================================================ */
import {
  clamp, pointerPos, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g17';
export const accent = '#10B981';

const W = 640, H = 480;
const ROUND_MS = 78000;
const QUARTER_MS = 15600;
const MAX_Q = 5;
const START_CASH = 1000;
const SPREAD = 0.001;
const CANDLE_S = 0.5;
const BASE_VOL = 0.15;
const TICK_BASE = 0.11;
const HINT_S = 5.5;
const HINT_WATCH = 0.008;

const EM = '#10B981', IN = '#6366F1', CR = '#F43F5E';
const AM = '#F59E0B', TX = '#E2E8F0', MU = '#64748B';

const X0 = 28, Y0 = 54, X1 = W - 28, Y1 = H - 100;
const CW = X1 - X0, CH = Y1 - Y0;
const STEP = 10, CANDLE_W = 7;
const VISIBLE = Math.floor(CW / STEP);
const BTN_Y = H - 88, BTN_H = 56;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0x917);
  const gauss = () => (rng() + rng() + rng() - 1.5) * 2;

  const state = {
    t: 0, left: ROUND_MS, quarter: 1, score: 0,
    price: 100, cash: START_CASH, banked: 0, trades: 0, wins: 0, crashes: 0,
    pos: null, shake: 0, flash: 0, banner: 0, hintT: 0, hintTick: 0,
    tickAcc: 0, candleT: 0, regime: 'RANGE', regimeT: 0, drift: 0, vol: BASE_VOL,
    crashIn: 999, crashT: 0, crashRate: 0, crashed: false, over: false, won: false,
  };
  const candles = [];
  const pops = [];

  const seedCandle = () => ({ o: state.price, h: state.price, l: state.price, c: state.price, crash: false });
  candles.push(seedCandle());

  // ---- account maths ----
  const unrealised = () => (state.pos
    ? state.pos.dir * (state.price - state.pos.entry) * state.pos.qty - state.pos.fee
    : 0);
  const equity = () => state.cash + unrealised();
  const qtyFor = (eq) => clamp(Math.round((eq * 0.4) / state.price / 10) * 10, 20, 600);

  // ---- market engine ----
  const rollRegime = () => {
    const r = rng();
    state.regime = r < 0.34 ? 'BULL' : r < 0.68 ? 'BEAR' : 'RANGE';
    const mag = BASE_VOL * 0.55 * (1 + (state.quarter - 1) * 0.4);
    state.drift = state.regime === 'BULL' ? mag : state.regime === 'BEAR' ? -mag : 0;
    state.regimeT = 3.4 + rng() * 3.6;
  };

  const startCrash = () => {
    state.crashT = 1.15;
    state.crashRate = 0.5 + state.quarter * 0.2;
    state.flash = 1;
    state.shake = 15;
    state.crashes++;
    state.crashed = true;
    if (ctx.audio) ctx.audio.alarm();
  };

  const tick = (tickEvery) => {
    if (state.regimeT <= 0) rollRegime();
    state.regimeT -= tickEvery;
    const vol = state.vol * (state.regime === 'RANGE' ? 1.25 : 1);
    let delta = state.drift + gauss() * vol;
    let crashing = false;
    if (state.crashT > 0) {
      delta -= state.crashRate;
      state.crashT -= tickEvery;
      crashing = true;
    }
    state.price = Math.max(2, state.price + delta);
    const cd = candles[candles.length - 1];
    cd.c = state.price;
    if (state.price > cd.h) cd.h = state.price;
    if (state.price < cd.l) cd.l = state.price;
    if (crashing) cd.crash = true;
  };

  const onQuarter = () => {
    state.hintT = HINT_S;
    state.hintTick = 0;
    state.banner = 1.7;
    state.crashed = false;
    rollRegime();
    state.crashIn = state.quarter >= 2 && rng() < 0.6 ? 3.2 + rng() * 3.4 : 999;
    if (ctx.audio) ctx.audio.select();
  };

  // ---- orders ----
  const openPos = (dir) => {
    if (state.over || state.pos) return;
    const qty = qtyFor(equity());
    const fee = qty * state.price * SPREAD;
    state.cash -= fee;
    state.pos = { dir, entry: state.price, qty, fee };
    state.flash = 0.35;
    if (ctx.audio) { if (dir > 0) ctx.audio.coin(); else ctx.audio.select(); }
  };

  const closePos = () => {
    if (state.over || !state.pos) return;
    const p = state.pos;
    const gross = p.dir * (state.price - p.entry) * p.qty;
    const fee = p.qty * state.price * SPREAD;
    const net = gross - p.fee - fee;
    state.cash += gross - fee;
    state.banked += net * 12;
    state.trades++;
    if (net > 0) state.wins++;
    state.score = Math.max(0, Math.round(state.banked));
    ctx.onScore(state.score);
    pops.push({
      x: X1 - 84, y: Y0 + 24 + pops.length * 22, life: 1,
      txt: `${net >= 0 ? '+' : ''}${Math.round(net)}`, col: net >= 0 ? EM : CR,
    });
    state.pos = null;
    if (ctx.audio) {
      if (net > p.qty * 3) ctx.audio.bigCash();
      else if (net > 0) ctx.audio.cash();
      else ctx.audio.error();
    }
  };

  const endRun = (won) => {
    if (state.over) return;
    state.over = true;
    state.won = won;
    ctx.loop && ctx.loop.stop();
    if (ctx.audio) { if (won) ctx.audio.win(); else ctx.audio.gameOver(); }
    ctx.finish(state.score);
  };

  ctx.after(ROUND_MS, () => endRun(true));

  // ---- input ----
  const hit = (gx, gy, x, y, w, h) => gx >= x && gx <= x + w && gy >= y && gy <= y + h;

  const onPointer = (ev) => {
    if (state.over) return;
    const p = pointerPos(ctx.canvas, ev);
    const gx = (p.x * W) / ctx.canvas.width;
    const gy = (p.y * H) / ctx.canvas.height;
    if (hit(gx, gy, X0, BTN_Y, 178, BTN_H)) openPos(1);
    else if (hit(gx, gy, X0 + 384, BTN_Y, 178, BTN_H)) openPos(-1);
    else if (hit(gx, gy, X0 + 192, BTN_Y, 176, BTN_H)) closePos();
  };

  const onKey = (ev) => {
    if (state.over) return;
    const k = (ev.key || '').toLowerCase();
    if (k === 'a') openPos(1);
    else if (k === 'd') openPos(-1);
    else if (k === 'w' || k === 's' || k === ' ') { ev.preventDefault(); closePos(); }
  };

  ctx.listeners.on(ctx.canvas, 'pointerdown', onPointer);
  ctx.listeners.on(window, 'keydown', onKey);

  // ---- auto-signal hint ----
  const signal = () => {
    const n = candles.length;
    if (n < 8) return { txt: 'SCANNING TAPE...', col: MU };
    const ref = candles[n - 1].c;
    const chg = (ref - candles[n - 8].c) / ref;
    if (chg < -HINT_WATCH) return { txt: 'BUY THE DIP   [A]', col: EM };
    if (chg > HINT_WATCH) return { txt: 'SELL THE PEAK [D]', col: CR };
    return { txt: 'RANGE - HOLD', col: MU };
  };

  const update = (dt) => {
    state.t += dt;
    if (state.left > 0) state.left = Math.max(0, state.left - dt * 1000);
    state.shake *= Math.max(0, 1 - dt * 6);
    state.flash = Math.max(0, state.flash - dt * 2);
    state.banner = Math.max(0, state.banner - dt);
    state.vol = BASE_VOL * (1 + (state.quarter - 1) * 0.5);

    const elapsed = ROUND_MS - state.left;
    const q = Math.min(MAX_Q, Math.floor(elapsed / QUARTER_MS) + 1);
    if (q !== state.quarter) { state.quarter = q; onQuarter(); }

    if (state.hintT > 0) {
      state.hintT -= dt;
      state.hintTick -= dt;
      if (state.hintTick <= 0) { state.hintTick = 1; if (ctx.audio) ctx.audio.tick(); }
    }

    if (!state.crashed && state.crashIn < 900) {
      state.crashIn -= dt;
      if (state.crashIn <= 0) startCrash();
    }

    const tickEvery = TICK_BASE / (1 + (state.quarter - 1) * 0.32);
    state.tickAcc += dt;
    while (state.tickAcc >= tickEvery) {
      state.tickAcc -= tickEvery;
      tick(tickEvery);
      state.candleT += tickEvery;
      if (state.candleT >= CANDLE_S) {
        state.candleT = 0;
        candles.push(seedCandle());
        if (candles.length > 260) candles.shift();
      }
    }

    for (let i = pops.length - 1; i >= 0; i--) {
      const pop = pops[i];
      pop.life -= dt * 0.8;
      pop.y -= dt * 22;
      if (pop.life <= 0) pops.splice(i, 1);
    }

    if (equity() <= 0) endRun(false);
  };

  // ---- drawing ----
  const drawBackdrop = () => {
    c.fillStyle = '#090D16';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  };

  const chartRange = () => {
    const first = Math.max(0, candles.length - VISIBLE);
    let lo = Infinity, hi = -Infinity;
    for (let i = first; i < candles.length; i++) {
      if (candles[i].l < lo) lo = candles[i].l;
      if (candles[i].h > hi) hi = candles[i].h;
    }
    const span = Math.max(hi - lo, state.price * 0.012);
    return { lo: lo - span * 0.14, hi: hi + span * 0.14, first };
  };

  const drawChart = () => {
    const { lo, hi, first } = chartRange();
    const yOf = (p) => Y1 - ((p - lo) / (hi - lo)) * CH;
    const n = candles.length;

    c.fillStyle = 'rgba(11,18,32,0.66)';
    roundRect(c, X0 - 6, Y0 - 6, CW + 12, CH + 12, 8);
    c.fill();

    for (let i = 0; i <= 4; i++) {
      const y = Y0 + (CH / 4) * i;
      c.strokeStyle = 'rgba(99,102,241,0.13)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X0, y + 0.5);
      c.lineTo(X1, y + 0.5);
      c.stroke();
      label(c, (hi - ((hi - lo) / 4) * i).toFixed(2), X1 - 4, y - 3, 10, 'rgba(100,116,139,0.9)', 'right');
    }

    const rising = candles[n - 1].c >= candles[first].c;
    c.strokeStyle = rising ? EM : CR;
    c.lineWidth = 1.6;
    c.globalAlpha = 0.45;
    c.beginPath();
    for (let i = first; i < n; i++) {
      const x = X0 + (i - first) * STEP + CANDLE_W / 2;
      const y = yOf(candles[i].c);
      if (i === first) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.globalAlpha = 1;

    for (let i = first; i < n; i++) {
      const cd = candles[i];
      const x = X0 + (i - first) * STEP;
      const up = cd.c >= cd.o;
      const col = up ? EM : CR;
      const yo = yOf(cd.o), yc = yOf(cd.c);
      c.strokeStyle = col;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + CANDLE_W / 2 + 0.5, yOf(cd.h));
      c.lineTo(x + CANDLE_W / 2 + 0.5, yOf(cd.l));
      c.stroke();
      c.fillStyle = col;
      c.fillRect(x, Math.min(yo, yc), CANDLE_W, Math.max(1.5, Math.abs(yc - yo)));
      if (cd.crash) {
        c.strokeStyle = CR;
        c.globalAlpha = 0.55;
        c.setLineDash([3, 3]);
        c.beginPath();
        c.moveTo(x + CANDLE_W / 2 + 0.5, yOf(cd.h));
        c.lineTo(x + CANDLE_W / 2 + 0.5, yOf(cd.l));
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
    }

    if (state.pos) {
      const ye = yOf(state.pos.entry);
      const col = state.pos.dir > 0 ? EM : CR;
      c.strokeStyle = col;
      c.setLineDash([5, 4]);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X0, ye);
      c.lineTo(X1, ye);
      c.stroke();
      c.setLineDash([]);
      label(c, `${state.pos.dir > 0 ? 'LONG' : 'SHORT'} ${state.pos.qty} @ ${state.pos.entry.toFixed(2)}`, X0 + 4, ye - 4, 10, col);
    }

    const yp = yOf(state.price);
    const pcol = state.pos ? (unrealised() >= 0 ? EM : CR) : IN;
    glow(c, pcol, 10);
    c.fillStyle = pcol;
    c.fillRect(X1 - 46, yp - 8, 46, 16);
    noGlow(c);
    label(c, state.price.toFixed(2), X1 - 3, yp + 4, 11, '#090D16', 'right');

    label(c, 'NVX-100', X0 + 4, Y0 - 10, 12, IN);
    const rcol = state.regime === 'BULL' ? EM : state.regime === 'BEAR' ? CR : MU;
    label(c, state.crashT > 0 ? 'CRASH!!' : state.regime, X1 - 4, Y0 - 10, 12,
      state.crashT > 0 ? AM : rcol, 'right');
  };

  const drawHint = () => {
    if (state.hintT <= 0) return;
    const s = signal();
    const a = clamp(state.hintT / 1.2, 0, 1);
    c.globalAlpha = a;
    c.fillStyle = 'rgba(9,13,22,0.85)';
    roundRect(c, X0 + 6, Y1 - 40, 232, 28, 6);
    c.fill();
    c.strokeStyle = s.col;
    c.lineWidth = 1;
    c.stroke();
    label(c, s.txt, X0 + 16, Y1 - 21, 12, s.col);
    c.globalAlpha = 1;
  };

  const drawButton = (x, w, text, sub, col, on) => {
    c.fillStyle = on ? col : 'rgba(11,18,32,0.8)';
    roundRect(c, x, BTN_Y, w, BTN_H, 8);
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = on ? 2 : 1;
    c.stroke();
    labelCenter(c, text, x + w / 2, BTN_Y + 26, 16, on ? '#090D16' : col);
    labelCenter(c, sub, x + w / 2, BTN_Y + 42, 10, on ? 'rgba(9,13,22,0.7)' : MU);
  };

  const drawButtons = () => {
    drawButton(X0, 178, 'LONG', 'A', EM, !!state.pos && state.pos.dir > 0);
    drawButton(X0 + 384, 178, 'SHORT', 'D', CR, !!state.pos && state.pos.dir < 0);
    drawButton(X0 + 192, 176, 'CLOSE', 'SPACE / W / S', IN, !!state.pos);
  };

  const drawHud = () => {
    c.fillStyle = 'rgba(9,13,22,0.78)';
    c.fillRect(0, 0, W, 46);
    label(c, `SCORE ${state.score}`, 14, 30, 19, EM);

    const eq = equity();
    const up = unrealised();
    const pcol = state.pos ? (up >= 0 ? EM : CR) : MU;
    label(c, `EQ $${Math.round(eq)}`, 190, 30, 19, eq <= START_CASH * 0.35 ? CR : TX);
    label(c, state.pos
      ? `${state.pos.dir > 0 ? 'LONG' : 'SHORT'} PnL ${up >= 0 ? '+' : ''}${Math.round(up)}`
      : 'FLAT', 330, 30, 17, pcol);
    label(c, `${state.wins}/${state.trades} WIN`, W - 150, 30, 13, MU, 'right');
    label(c, `Q${state.quarter}/${MAX_Q} ${(state.left / 1000).toFixed(1)}s`, W - 14, 30, 19,
      state.left < 12000 ? CR : TX, 'right');

    c.fillStyle = 'rgba(99,102,241,0.25)';
    c.fillRect(0, H - 6, W, 6);
    c.fillStyle = IN;
    c.fillRect(0, H - 6, W * (state.left / ROUND_MS), 6);
  };

  const drawBanner = () => {
    if (state.banner <= 0) return;
    const a = clamp(state.banner / 0.6, 0, 1);
    c.globalAlpha = a;
    labelCenter(c, `QUARTER ${state.quarter}`, W / 2, H / 2 - 6, 34, IN);
    labelCenter(c, 'VOLATILITY UP', W / 2, H / 2 + 22, 15, MU);
    c.globalAlpha = 1;
  };

  const drawOverlay = () => {
    if (!state.over) return;
    c.fillStyle = 'rgba(9,13,22,0.82)';
    c.fillRect(0, 0, W, H);
    labelCenter(c, state.won ? 'MARKET CLOSE' : 'BANKRUPT', W / 2, 190, 40, state.won ? EM : CR);
    labelCenter(c, `SCORE ${state.score}`, W / 2, 236, 22, TX);
    labelCenter(c, `${state.trades} trades / ${state.wins} wins / ${state.crashes} crashes`, W / 2, 268, 14, MU);
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();
    drawChart();

    for (const pop of pops) {
      c.globalAlpha = Math.max(0, pop.life);
      label(c, pop.txt, pop.x, pop.y, 15, pop.col, 'right');
      c.globalAlpha = 1;
    }

    drawHint();
    drawButtons();
    drawHud();

    if (state.flash > 0.01) {
      c.globalAlpha = state.flash * 0.5;
      c.fillStyle = state.crashT > 0 ? CR : TX;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }

    drawBanner();
    drawOverlay();
    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}