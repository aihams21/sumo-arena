/* ============================================================
 * GAME 19 — SPEED CODER
 * Code scrolls in from the right; type it before the cores burn out.
 * Hold CTRL to skip a corrupted syntax token.
 * ============================================================ */
import {
  clamp, circle, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g19';
export const accent = '#10B981';

const W = 640, H = 480;
const EM = '#10B981', IN = '#6366F1', CR = '#F43F5E', AM = '#F59E0B', TX = '#E2E8F0', MU = '#64748B';
const CH = 11, FONT = 18, ROWH = 30, HEAD = 104;
const AREA_TOP = 78, AREA_H = 250;
const WRAP_COL = 46;
const WPM_DIV = 5;
const LINES_PER_LEVEL = 3;
const MAX_LEVEL = 9;
const ERR_LOCK = 0.32;

const CODE_POOL = [
  'const nexus = require("core/ai-runtime");',
  'let total = 0; for (const n of nodes) total += n.cost;',
  'export default async function boot(stack = []) {',
  'const res = await fetch(url, { method: "POST" });',
  'if (!res.ok) throw new Error(`HTTP ${res.status}`);',
  'return stack.filter(node => node.depth < MAX_DEPTH);',
  'module.exports = { create, destroy, onFlush };',
  'while (queue.length > 0) { shift(); emit(evt); }',
  'const [head, ...rest] = pipeline.filter(Boolean);',
  'ctx.clearRect(0, 0, canvas.width, canvas.height);',
  'process.on("uncaughtException", (err) => log(err));',
  'new Promise((res, rej) => socket.once("open", res));',
  'const hash = crypto.createHash("sha256").update(buf);',
  'await db.tx(async (t) => { await t.insert("nodes"); });',
  'if (typeof window !== "undefined") boot();',
  'const n = list.map(x => x ** 2).reduce((a, b) => a + b);',
  'worker.onmessage = (e) => self.postMessage(e.data);',
  'return [...seen].sort((a, b) => b.ts - a.ts).slice(0, 32);',
  'socket.on("data", (buf) => parser.push(buf.toString("utf8")));',
  'const cfg = { retries: 3, backoff: 250, jitter: true };',
  'export const boot = () => queueMicrotask(() => start());',
  'if (!key.startsWith("0x")) return decodeURIComponent(key);',
  'stream.on("finish", () => fs.renameSync(tmp, dest));',
];

const LOG_POOL = [
  '[ok]   core/ledger synced - 41 shards green',
  '[warn] thermal throttle on node-07 (92C)',
  '[ok]   firewall ruleset v2.14 applied',
  '[info] miner pool handshake accepted (lat 12ms)',
  '[ok]   vault key rotated - epoch 88213',
  '[warn] packet loss 3.1% on uplink-b',
  '[ok]   neon-sector cache flushed in 88ms',
  '[info] 3 unauthorised probes dropped at edge',
  '[ok]   quantum link stable @ 41.2 Gbps',
  '[warn] backup job 4 skipped (mount busy)',
  '[ok]   trace sampler online (4096 slots)',
  '[info] shard 19 rebalanced to rack c3',
];

const TOKEN_POOL = ['<TEMP_ERR_0x4F>', '[SYNTAX_ERR]', '@@BROKEN@@', '<CORRUPT:0x9A>', '[?????]', '<!#!>'];

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0x519);
  const state = {
    t: 0, elapsed: 0, clockBase: -1, score: 0, speedBonus: 0,
    chars: 0, hits: 0, misses: 0, combo: 0, flawless: 0, skips: 0,
    level: 1, lines: 0, cores: 3, cpm: 0,
    pos: 0, lock: 0, flash: 0, okFlash: 0, winFlash: 0, shake: 0,
    over: false, line: null,
  };
  const bits = [];

  // ---- line factory --------------------------------------------------
  const rowsOf = (text) => {
    const rows = [];
    let start = 0;
    const parts = text.split('\n');
    for (const part of parts) {
      rows.push({ s: start, e: start + part.length });
      start += part.length + 1;
    }
    return rows;
  };

  const wrapAt = (text) => {
    if (text.length <= WRAP_COL) return text;
    let cut = text.lastIndexOf(' ', WRAP_COL);
    if (cut < 12) cut = WRAP_COL;
    return `${text.slice(0, cut)}\n${text.slice(cut + 1)}`;
  };

  const scanTokens = (text) => {
    const toks = [];
    for (const mark of TOKEN_POOL) {
      const at = text.indexOf(mark);
      if (at >= 0) toks.push({ s: at, e: at + mark.length, len: mark.length });
    }
    toks.sort((a, b) => a.s - b.s);
    return toks;
  };

  const tokenAt = (i) => {
    const toks = state.line.toks;
    for (const t of toks) if (i >= t.s && i < t.e) return t;
    return null;
  };

  const newLine = () => {
    const maxLen = Math.min(74, 28 + state.level * 5);
    const pool = CODE_POOL.concat(LOG_POOL).filter((l) => l.length <= maxLen);
    const src = pool.length ? pool[Math.floor(rng() * pool.length)] : CODE_POOL[0];
    let body = src;
    if (rng() < 0.34) {
      const mark = TOKEN_POOL[Math.floor(rng() * TOKEN_POOL.length)];
      const gap = Math.max(10, Math.floor(body.length * 0.5));
      body = `${body.slice(0, gap)} ${mark} ${body.slice(gap)}`;
    }
    const text = wrapAt(body);
    state.line = { text, rows: rowsOf(text), toks: scanTokens(text), slide: 1, dirty: false, backed: 0 };
    state.pos = 0;
    state.lock = Math.max(state.lock, 0.18);
    if (ctx.audio) ctx.audio.select();
  };
  newLine();

  // ---- scoring / feedback -------------------------------------------
  const spark = (x, y, color, n = 3) => {
    for (let i = 0; i < n; i++) {
      bits.push({ x, y, vx: (rng() - 0.5) * 120, vy: -30 - rng() * 70, life: 1, color });
    }
  };

  const charX = (i) => HEAD + state.line.slide * W + (i - state.pos) * CH;

  const completeLine = () => {
    const len = state.line.text.length;
    state.lines++;
    state.score += len * 6 + state.level * 40;
    if (!state.line.dirty && state.line.backed === 0) {
      state.flawless++;
      if (ctx.audio) ctx.audio.perfect();
    } else {
      state.flawless = 0;
    }
    if (state.flawless >= 5) {
      state.flawless = 0;
      state.winFlash = 1;
      if (ctx.audio) ctx.audio.win();
    }
    if (state.lines % LINES_PER_LEVEL === 0 && state.level < MAX_LEVEL) {
      state.level++;
      state.okFlash = 1;
      if (ctx.audio) ctx.audio.levelUp();
    }
    ctx.onScore(state.score);
    newLine();
  };

  const mistake = () => {
    state.cores--;
    state.misses++;
    state.combo = 0;
    state.pos = 0;
    state.lock = ERR_LOCK;
    state.flash = 1;
    state.shake = 10;
    if (ctx.audio) ctx.audio.error();
    if (state.cores <= 0) gameOver();
  };

  const typed = (ch) => {
    state.pos++;
    state.chars++;
    state.hits++;
    state.combo++;
    state.score += 10 + Math.min(state.combo, 30);
    state.okFlash = Math.min(1, state.okFlash + 0.25);
    if (ctx.audio) ctx.audio.tap();
    spark(charX(state.pos - 1), AREA_TOP + AREA_H / 2, EM, 2);
    if (state.clockBase < 0) state.clockBase = state.t;
    ctx.onScore(state.score);
    if (state.pos >= state.line.text.length) completeLine();
  };

  const backspace = () => {
    if (state.pos === 0) {
      state.misses++;
      state.lock = ERR_LOCK * 0.5;
      if (ctx.audio) ctx.audio.tick();
      return;
    }
    state.pos--;
    state.misses++;
    state.combo = 0;
    state.line.dirty = true;
    state.line.backed++;
    state.score = Math.max(0, state.score - 8);
    state.shake = 3;
    if (ctx.audio) ctx.audio.error();
  };

  const skipToken = () => {
    const tok = tokenAt(state.pos);
    if (!tok) return;
    const gain = 200 + state.level * 25;
    state.score += gain;
    state.chars += tok.len;
    state.hits++;
    state.skips++;
    state.pos = tok.e;
    state.okFlash = 1;
    state.line.dirty = false;
    if (ctx.audio) ctx.audio.perfect();
    spark(charX(state.pos), AREA_TOP + AREA_H / 2, IN, 8);
    if (state.clockBase < 0) state.clockBase = state.t;
    ctx.onScore(state.score);
    if (state.pos >= state.line.text.length) completeLine();
  };

  const gameOver = () => {
    if (state.over) return;
    state.over = true;
    state.speedBonus = Math.round(state.cpm * 6);
    state.score += state.speedBonus;
    ctx.onScore(state.score);
    if (ctx.audio) ctx.audio.gameOver();
    ctx.after(700, () => {
      ctx.loop && ctx.loop.stop();
      ctx.finish(state.score);
    });
  };

  // ---- input ---------------------------------------------------------
  const onKeyDown = (ev) => {
    if (state.over || !state.line) return;
    const key = ev.key;

    // CTRL is the skip verb: hold it while the cursor sits on a corrupt token
    if (ev.ctrlKey || key === 'Control') {
      if (tokenAt(state.pos)) skipToken();
      return;
    }
    if (state.lock > 0 || state.line.slide > 0.45) return;

    if (key === 'Backspace') { ev.preventDefault(); backspace(); return; }
    if (key.length > 1) return;                 // arrows, Tab, F-keys: ignore

    const exp = state.line.text[state.pos];
    if (exp === undefined) return;

    if (key === 'Enter') {
      if (exp === '\n') typed('\n');
      return;                                   // Enter off a wrap is harmless
    }
    if (exp === '\n') return;                   // wrap waiting on Enter
    if (key === exp) typed(exp); else mistake();
  };

  ctx.listeners.on(window, 'keydown', onKeyDown);

  // ---- update --------------------------------------------------------
  const update = (dt) => {
    state.t += dt;
    if (!state.over) state.elapsed += dt;
    state.lock = Math.max(0, state.lock - dt);
    state.flash *= Math.max(0, 1 - dt * 4.5);
    state.okFlash *= Math.max(0, 1 - dt * 2.2);
    state.winFlash *= Math.max(0, 1 - dt * 1.6);
    state.shake *= Math.max(0, 1 - dt * 7);

    const l = state.line;
    if (l && l.slide > 0) l.slide = Math.max(0, l.slide - dt * 2.8);

    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt * 3.2;
      b.vy += 320 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0) bits.splice(i, 1);
    }

    if (state.clockBase >= 0) {
      const play = Math.max(0.75, state.t - state.clockBase);
      state.cpm = (state.chars / play) * 60;
    }
  };

  // ---- draw ----------------------------------------------------------
  const drawBackdrop = () => {
    ctx.clear('#090D16');
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  };

  const drawChar = (ch, x, y, color) => {
    if (x < -CH || x > W) return;
    label(c, ch, x, y, FONT, color);
  };

  const drawLine = () => {
    const l = state.line;
    const rows = l.rows;
    const top = AREA_TOP + AREA_H / 2 - ((rows.length - 1) * ROWH) / 2 + 6;

    c.save();
    c.beginPath();
    c.rect(0, AREA_TOP, W, AREA_H);
    c.clip();

    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      const y = top + ri * ROWH;

      for (let i = r.s; i < r.e; i++) {
        const x = charX(i);
        if (x < -CH || x > W) continue;
        const ch = l.text[i];
        const tok = tokenAt(i);
        if (tok) {
          c.fillStyle = 'rgba(244,63,94,0.16)';
          c.fillRect(x, y - 13, CH - 1, 17);
          c.fillStyle = 'rgba(244,63,94,0.75)';
          c.fillRect(x, y + 2, CH - 1, 1.5);
          drawChar('?', x, y, i < state.pos ? CR : 'rgba(244,63,94,0.7)');
          continue;
        }
        const col = i < state.pos ? 'rgba(16,185,129,0.55)' : i === state.pos ? AM : TX;
        drawChar(ch, x, y, col);
      }

      // wrap slot: Enter advances to the next row
      const wx = charX(r.e);
      if (wx > -CH && wx < W) {
        if (r.e < state.pos) drawChar('>', wx, y, 'rgba(16,185,129,0.5)');
        else if (r.e === state.pos) {
          glow(c, AM, 12);
          drawChar('\u21b5', wx, y, AM);
          noGlow(c);
        } else drawChar('\u21b5', wx, y, 'rgba(100,116,139,0.6)');
      }
    }

    // caret
    const cx = charX(state.pos);
    if (cx > -6 && cx < W + 6 && Math.sin(state.t * 9) > -0.35) {
      glow(c, state.lock > 0 ? CR : AM, 14);
      c.fillStyle = state.lock > 0 ? CR : AM;
      c.fillRect(cx - 1.5, top - 14, 3, rows.length * ROWH - 8);
      noGlow(c);
    }
    c.restore();
  };

  const drawTokenHint = () => {
    const tok = tokenAt(state.pos);
    if (!tok || state.over) return;
    const y = AREA_TOP + AREA_H + 8;
    const armed = true;
    c.fillStyle = 'rgba(244,63,94,0.14)';
    roundRect(c, W / 2 - 132, y - 15, 264, 22, 6);
    c.fill();
    labelCenter(c, armed ? 'CORRUPT TOKEN - HOLD CTRL TO SKIP  +BONUS' : '', W / 2, y + 1, 12, CR);
  };

  const drawHud = () => {
    const wpm = Math.round(state.cpm / WPM_DIV);
    const acc = state.hits + state.misses > 0
      ? Math.round((state.hits / (state.hits + state.misses)) * 100)
      : 100;
    const mins = Math.floor(state.elapsed / 60);
    const secs = Math.floor(state.elapsed % 60);
    const clock = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    c.fillStyle = 'rgba(9,13,22,0.82)';
    c.fillRect(0, 0, W, 46);
    label(c, `${state.score}`, 14, 31, 22, EM);
    label(c, `WPM ${wpm}`, 118, 30, 14, IN);
    label(c, `ACC ${acc}%`, 196, 30, 14, acc >= 90 ? EM : AM);
    label(c, `LVL ${state.level}`, 282, 30, 14, TX);
    label(c, `LINES ${state.lines}`, 356, 30, 14, MU);

    for (let i = 0; i < 3; i++) {
      const x = W - 160 + i * 20;
      const alive = i < state.cores;
      if (alive) glow(c, EM, 10);
      c.fillStyle = alive ? EM : 'rgba(100,116,139,0.25)';
      circle(c, x, 28, 7);
      c.fill();
      noGlow(c);
      c.strokeStyle = alive ? EM : 'rgba(100,116,139,0.45)';
      c.lineWidth = 1;
      circle(c, x, 28, 7);
      c.stroke();
    }

    label(c, clock, W - 14, 30, 18, TX, 'right');
    label(c, 'SEC', W - 58, 30, 11, MU, 'right');

    // line progress
    const l = state.line;
    const p = clamp(state.pos / Math.max(1, l.text.length), 0, 1);
    c.fillStyle = 'rgba(99,102,241,0.22)';
    c.fillRect(14, 40, W - 28, 3);
    c.fillStyle = EM;
    c.fillRect(14, 40, (W - 28) * p, 3);
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();
    drawLine();

    for (const b of bits) {
      c.globalAlpha = Math.max(0, b.life);
      c.fillStyle = b.color;
      c.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
    }
    c.globalAlpha = 1;

    drawHud();
    drawTokenHint();

    if (state.flash > 0.01) {
      c.fillStyle = `rgba(244,63,94,${state.flash * 0.26})`;
      c.fillRect(0, 0, W, H);
    }
    if (state.okFlash > 0.01) {
      c.fillStyle = `rgba(16,185,129,${state.okFlash * 0.09})`;
      c.fillRect(0, 0, W, H);
    }
    if (state.winFlash > 0.01) {
      labelCenter(c, 'CLEAN STREAK x5', W / 2, 108, 22, EM);
    }
    if (state.lock > 0) {
      labelCenter(c, 'CORE LOST - REWINDING', W / 2, H - 84, 15, CR);
    }

    label(c, 'CTRL = skip corrupt token   BACKSPACE = undo (penalised)', 14, H - 16, 12, MU);
    if (state.over) {
      c.fillStyle = 'rgba(9,13,22,0.72)';
      c.fillRect(0, H - 74, W, 34);
      label(c, `SPEED BONUS +${state.speedBonus}`, 14, H - 52, 16, IN);
      label(c, `${Math.round(state.cpm / WPM_DIV)} WPM`, W - 14, H - 52, 16, EM, 'right');
    }
    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}