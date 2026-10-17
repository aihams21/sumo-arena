/* ============================================================
 * GAME 13 — SECURITY MINESWEEPER
 * Sweep the compromised nodes. The first click is always clean.
 * ============================================================ */
import {
  clamp, pointerPos, circle, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g13';
export const accent = '#10B981';

const W = 640, H = 480;
const HUD_H = 54, FOOT_H = 26;
const CELL_MAX = 28;
const ESC_MAX_W = 26, ESC_MAX_H = 20;
const SPEED_REF = 45000;

const NUM_COLORS = ['#64748B', '#6366F1', '#10B981', '#F59E0B', '#F43F5E', '#38BDF8', '#E2E8F0', '#F472B6'];

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0x51E3);
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const state = {
    t: 0, lastTick: 0, score: 0, cleared: 0, time: 0, level: 0, clears: 0,
    flags: 0, mineTotal: 0, speedBonus: 0, shake: 0, over: false, won: false,
    sent: false, playing: false, picks: null, cells: [], cols: 9, rows: 9, mines: 10,
    cell: CELL_MAX, ox: 0, oy: HUD_H, expl: null, holdCell: null, armReveal: false,
    armBtn: null, flagArm: null, btns: [], hoverBtn: null,
  };

  // ---- level geometry ----
  const levelDims = (lv) => {
    if (lv <= 0) return { cols: 9, rows: 9, mines: 10 };
    if (lv === 1) return { cols: 16, rows: 14, mines: 40 };
    return {
      cols: Math.min(ESC_MAX_W, 16 + (lv - 1) * 3),
      rows: Math.min(ESC_MAX_H, 14 + (lv - 1) * 2),
      mines: Math.round((40 + (lv - 1) * 12) * (1 + (lv - 1) * 0.06)),
    };
  };

  const idx = (x, y) => y * state.cols + x;

  const neighbours = (x, y) => {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < state.cols && ny < state.rows) out.push(idx(nx, ny));
      }
    }
    return out;
  };

  // ---- board build ----
  const build = (lv) => {
    const d = levelDims(lv);
    state.level = lv;
    state.cols = d.cols;
    state.rows = d.rows;
    state.mines = d.mines;
    state.mineTotal = d.mines;
    state.cell = Math.min(CELL_MAX, Math.floor(Math.min((W - 24) / d.cols, (H - HUD_H - FOOT_H - 14) / d.rows)));
    state.cells = [];
    for (let y = 0; y < d.rows; y++) {
      for (let x = 0; x < d.cols; x++) state.cells.push({ x, y, mine: false, open: false, flag: false, n: 0, pop: 0 });
    }
    state.ox = Math.round((W - d.cols * state.cell) / 2);
    state.oy = HUD_H + Math.round(((H - HUD_H - FOOT_H) - d.rows * state.cell) / 2);
    state.flags = 0;
    state.picks = null;
    state.time = 0;
    state.over = false;
    state.won = false;
    state.playing = true;
    state.shake = 0;
    state.expl = null;
    state.holdCell = null;
    state.armReveal = false;
    state.armBtn = null;
    state.flagArm = null;
    state.btns = [];
    state.hoverBtn = null;
  };

  // ---- mine placement always spares the first click and its ring ----
  const seedMines = (sx, sy) => {
    const free = new Set();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = sx + dx, ny = sy + dy;
        if (nx >= 0 && ny >= 0 && nx < state.cols && ny < state.rows) free.add(idx(nx, ny));
      }
    }
    const spots = [];
    for (let i = 0; i < state.cells.length; i++) if (!free.has(i)) spots.push(i);
    for (let i = spots.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = spots[i]; spots[i] = spots[j]; spots[j] = t;
    }
    const n = Math.min(state.mines, spots.length);
    for (let i = 0; i < n; i++) state.cells[spots[i]].mine = true;
    for (const cl of state.cells) {
      if (cl.mine) { cl.n = 0; continue; }
      let count = 0;
      for (const j of neighbours(cl.x, cl.y)) if (state.cells[j].mine) count++;
      cl.n = count;
    }
    state.mines = n;
  };

  const openCell = (i) => {
    const cl = state.cells[i];
    if (!cl || cl.open) return;
    cl.open = true;
    state.cleared++;
    state.picks++;
    state.score += 10 + cl.n * 2;
    if (cl.n === 0) for (const j of neighbours(cl.x, cl.y)) openCell(j);
  };

  // ---- run end ----
  const endRun = () => {
    if (state.sent) return;
    state.sent = true;
    ctx.loop && ctx.loop.stop();
    ctx.finish(state.score);
  };

  const explode = (cx, cy) => {
    state.over = true;
    state.won = false;
    state.playing = false;
    state.shake = 14;
    state.expl = state.cells[idx(cx, cy)];
    for (const cl of state.cells) if (cl.mine) cl.open = true;
    if (ctx.audio) ctx.audio.explode();
    ctx.after(850, () => {
      if (state.sent) return;
      if (ctx.audio) ctx.audio.gameOver();
      endRun();
    });
  };

  const checkWin = () => {
    if (state.over || state.picks === null) return;
    if (state.cells.length - state.mineTotal - state.cleared > 0) return;
    state.over = true;
    state.won = true;
    state.playing = false;
    state.clears++;
    state.speedBonus = Math.round(3000 * Math.max(0, 1 - state.time / SPEED_REF));
    state.score += 1500 + state.speedBonus;
    for (const cl of state.cells) if (cl.mine) cl.flag = true;
    state.flags = state.mineTotal;
    if (ctx.audio) { ctx.audio.win(); ctx.audio.levelUp(); }
    ctx.onScore(state.score);
    ctx.after(1100, () => { if (state.won && !state.sent) endRun(); });
  };

  // ---- input actions ----
  const reveal = (cx, cy) => {
    if (!state.picks) seedMines(cx, cy);
    const i = idx(cx, cy);
    if (state.cells[i].flag) return;
    if (state.cells[i].mine) { explode(cx, cy); return; }
    openCell(i);
    state.cells[i].pop = 1;
    if (ctx.audio) ctx.audio.tap();
    ctx.onScore(state.score);
  };

  const toggleFlag = (cx, cy) => {
    const cl = state.cells[idx(cx, cy)];
    if (cl.open) return;
    cl.flag = !cl.flag;
    state.flags += cl.flag ? 1 : -1;
    if (ctx.audio) { if (cl.flag) ctx.audio.select(); else ctx.audio.tap(); }
  };

  const chord = (cx, cy) => {
    const cl = state.cells[idx(cx, cy)];
    if (!cl.open || !cl.n) return;
    const nb = neighbours(cx, cy);
    let flagged = 0;
    for (const j of nb) if (state.cells[j].flag) flagged++;
    if (flagged !== cl.n) { if (ctx.audio) ctx.audio.tick(); return; }
    let popped = 0;
    for (const j of nb) {
      const t = state.cells[j];
      if (t.flag || t.open) continue;
      if (t.mine) { explode(t.x, t.y); return; }
      openCell(j);
      t.pop = 1;
      popped++;
    }
    if (popped && ctx.audio) ctx.audio.coin();
    ctx.onScore(state.score);
    checkWin();
  };

  const cellAt = (gx, gy) => {
    if (state.over || state.picks) return null;
    const cx = Math.floor((gx - state.ox) / state.cell);
    const cy = Math.floor((gy - state.oy) / state.cell);
    if (cx < 0 || cy < 0 || cx >= state.cols || cy >= state.rows) return null;
    return { x: cx, y: cy };
  };

  const gridPos = (ev) => {
    const p = pointerPos(ctx.canvas, ev);
    return [(p.x * W) / ctx.canvas.width, (p.y * H) / ctx.canvas.height];
  };

  const hitBtn = (gx, gy) => {
    for (const b of state.btns) {
      if (gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h) return b;
    }
    return null;
  };

  const startLevel = (lv) => {
    if (ctx.audio) ctx.audio.click();
    build(lv);
  };

  const longPress = () => {
    state.armReveal = false;
    const hc = state.holdCell;
    state.holdCell = null;
    if (hc && !state.over) toggleFlag(hc.x, hc.y);
  };

  // ---- listeners ----
  ctx.listeners.on(ctx.canvas, 'contextmenu', (ev) => ev.preventDefault());

  ctx.listeners.on(ctx.canvas, 'pointerdown', (ev) => {
    if (state.sent) return;
    const [gx, gy] = gridPos(ev);
    const btn = hitBtn(gx, gy);
    state.armBtn = btn;
    if (btn || state.over) return;
    const cell = cellAt(gx, gy);
    state.holdCell = cell;
    if (!cell) return;
    if (!touch && ev.buttons === 3) { chord(cell.x, cell.y); state.holdCell = null; return; }
    state.armReveal = true;
    if (touch) ctx.after(420, longPress);
  });

  ctx.listeners.on(ctx.canvas, 'pointerup', (ev) => {
    if (state.sent) return;
    const [gx, gy] = gridPos(ev);
    const btn = state.armBtn;
    state.armBtn = null;
    if (btn) {
      if (hitBtn(gx, gy) !== btn) return;
      if (btn.id === 'inter') startLevel(1);
      else if (btn.id === 'esc') startLevel(2 + state.clears);
      else startLevel(state.level);
      return;
    }
    if (state.over) return;
    const cell = cellAt(gx, gy);
    const hc = state.holdCell;
    const armed = state.armReveal;
    state.armReveal = false;
    state.holdCell = null;
    if (!armed || !cell || !hc || cell.x !== hc.x || cell.y !== hc.y) return;
    if (state.cells[idx(cell.x, cell.y)].flag) return;
    reveal(cell.x, cell.y);
    checkWin();
  });

  ctx.listeners.on(ctx.canvas, 'pointermove', (ev) => {
    if (state.sent) return;
    const [gx, gy] = gridPos(ev);
    const btn = hitBtn(gx, gy);
    const id = btn ? btn.id : null;
    if (id !== (state.hoverBtn ? state.hoverBtn.id : null)) {
      state.hoverBtn = btn;
      if (btn && ctx.audio) ctx.audio.select();
    }
  });

  const dropPress = () => {
    state.armReveal = false;
    state.holdCell = null;
    state.armBtn = null;
    state.flagArm = null;
  };
  ctx.listeners.on(ctx.canvas, 'pointercancel', dropPress);
  ctx.listeners.on(ctx.canvas, 'pointerleave', dropPress);

  ctx.listeners.on(ctx.canvas, 'mousedown', (ev) => {
    if (state.over || touch) return;
    const [gx, gy] = gridPos(ev);
    const cell = cellAt(gx, gy);
    if (!cell) return;
    if (ev.button === 2) state.flagArm = { x: cell.x, y: cell.y, chord: false };
    else if (ev.button === 0 && state.flagArm) state.flagArm.chord = true;
  });

  ctx.listeners.on(ctx.canvas, 'mouseup', (ev) => {
    if (state.over || touch) return;
    const [gx, gy] = gridPos(ev);
    const cell = cellAt(gx, gy);
    const fa = state.flagArm;
    state.flagArm = null;
    if (!fa || !cell || cell.x !== fa.x || cell.y !== fa.y) return;
    if (fa.chord || ev.button === 1) chord(cell.x, cell.y);
    else if (ev.button === 2) toggleFlag(cell.x, cell.y);
  });

  ctx.every(1000, () => {
    if (state.playing && state.t - state.lastTick > 0.5) {
      state.lastTick = state.t;
      if (ctx.audio) ctx.audio.tick();
    }
  });

  // ---- update ----
  const update = (dt) => {
    state.t += dt;
    if (state.playing) state.time += dt * 1000;
    state.shake *= Math.max(0, 1 - dt * 6);
    for (const cl of state.cells) if (cl.pop > 0) cl.pop = Math.max(0, cl.pop - dt * 3.2);
  };

  // ---- draw ----
  const drawBackdrop = () => {
    ctx.clear('#090D16');
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  };

  const drawCell = (cl) => {
    const s = state.cell;
    const x = state.ox + cl.x * s;
    const y = state.oy + cl.y * s;
    const hot = state.holdCell && state.holdCell.x === cl.x && state.holdCell.y === cl.y;

    if (!cl.open) {
      c.fillStyle = hot ? 'rgba(99,102,241,0.26)' : 'rgba(30,41,59,0.78)';
      roundRect(c, x + 1, y + 1, s - 2, s - 2, 3);
      c.fill();
      c.strokeStyle = 'rgba(99,102,241,0.38)';
      c.lineWidth = 1;
      c.stroke();
      if (cl.flag) {
        glow(c, '#F43F5E', 12);
        c.strokeStyle = '#F43F5E';
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(x + s * 0.34, y + s * 0.72);
        c.lineTo(x + s * 0.34, y + s * 0.32);
        c.lineTo(x + s * 0.68, y + s * 0.44);
        c.stroke();
        noGlow(c);
        c.fillStyle = '#F43F5E';
        circle(c, x + s * 0.34, y + s * 0.76, Math.max(1.8, s * 0.07));
        c.fill();
      } else {
        c.fillStyle = 'rgba(148,163,184,0.26)';
        for (let i = 0; i < 4; i++) {
          circle(c, x + s * (i < 2 ? 0.3 : 0.7), y + s * (i % 2 === 0 ? 0.3 : 0.7), Math.max(1.4, s * 0.05));
          c.fill();
        }
      }
      return;
    }

    c.fillStyle = '#0B1220';
    c.fillRect(x, y, s, s);
    if (cl.mine) {
      glow(c, '#F43F5E', cl === state.expl ? 22 : 12);
      c.fillStyle = '#F43F5E';
      circle(c, x + s / 2, y + s / 2, s * 0.22);
      c.fill();
      c.strokeStyle = '#F43F5E';
      c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = i * 0.785 + 0.4;
        c.beginPath();
        c.moveTo(x + s / 2 - Math.cos(a) * s * 0.34, y + s / 2 - Math.sin(a) * s * 0.34);
        c.lineTo(x + s / 2 + Math.cos(a) * s * 0.34, y + s / 2 + Math.sin(a) * s * 0.34);
        c.stroke();
      }
      noGlow(c);
      if (cl === state.expl) {
        c.strokeStyle = '#F59E0B';
        c.lineWidth = 2;
        circle(c, x + s / 2, y + s / 2, s * 0.44);
        c.stroke();
      }
      return;
    }
    if (cl.n > 0) labelCenter(c, `${cl.n}`, x + s / 2, y + s / 2 + s * 0.22, Math.round(s * 0.5), NUM_COLORS[cl.n]);
    if (cl.pop > 0) {
      c.globalAlpha = cl.pop * 0.6;
      c.strokeStyle = '#10B981';
      c.lineWidth = 2;
      circle(c, x + s / 2, y + s / 2, (1 - cl.pop) * s * 0.8);
      c.stroke();
      c.globalAlpha = 1;
    }
  };

  const drawHud = () => {
    c.fillStyle = 'rgba(9,13,22,0.82)';
    c.fillRect(0, 0, W, HUD_H);
    label(c, `FLAGS ${state.flags}/${state.mineTotal}`, 14, 33, 17, state.flags > state.mineTotal ? '#F43F5E' : '#10B981');
    label(c, `${Math.floor(state.time / 1000)}s`, W - 14, 33, 17, '#E2E8F0', 'right');
    labelCenter(c, `SCORE ${state.score} · CLEARED ${state.cleared}`, W / 2, 24, 14, '#6366F1');
    const mode = state.level === 0 ? 'BEGINNER 9x9 / 10' : state.level === 1 ? 'INTERMEDIATE 16x14 / 40' : `ESCALATION LV${state.level - 1}`;
    labelCenter(c, mode, W / 2, 42, 12, '#64748B');
    c.fillStyle = 'rgba(99,102,241,0.20)';
    c.fillRect(0, HUD_H - 3, W, 3);
    c.fillStyle = '#6366F1';
    const safe = Math.max(1, state.cells.length - state.mineTotal);
    c.fillRect(0, HUD_H - 3, W * clamp(state.cleared / safe, 0, 1), 3);
  };

  const drawFoot = () => {
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, H - FOOT_H, W, FOOT_H);
    const hint = touch
      ? 'TAP REVEAL · HOLD FLAG · BOTH CHORD UNLOCKS NEIGHBOURS'
      : 'L-CLICK REVEAL · R-CLICK FLAG · BOTH BUTTONS CHORD · ESC RESETS';
    labelCenter(c, hint, W / 2, H - 8, 11, '#64748B');
  };

  const drawBtn = (b, text, color) => {
    const on = state.hoverBtn && state.hoverBtn.id === b.id;
    c.fillStyle = on ? 'rgba(16,185,129,0.24)' : 'rgba(30,41,59,0.82)';
    roundRect(c, b.x, b.y, b.w, b.h, 6);
    c.fill();
    c.strokeStyle = on ? '#10B981' : 'rgba(99,102,241,0.55)';
    c.lineWidth = 1;
    c.stroke();
    labelCenter(c, text, b.x + b.w / 2, b.y + b.h / 2 + 5, 12, on ? '#E2E8F0' : color);
  };

  const drawEnd = () => {
    c.fillStyle = 'rgba(9,13,22,0.74)';
    c.fillRect(0, 0, W, H);
    const bw = 168, bh = 34, gap = 12;
    state.btns = [];
    if (state.won) {
      labelCenter(c, 'SECTOR CLEARED', W / 2, 176, 26, '#10B981');
      labelCenter(c, `SPEED BONUS ${state.speedBonus}`, W / 2, 206, 15, '#F59E0B');
      labelCenter(c, `SCORE ${state.score} · CLEARED ${state.cleared} · ${(state.time / 1000).toFixed(1)}s`, W / 2, 230, 14, '#E2E8F0');
      state.btns.push({ id: 'inter', x: W / 2 - bw - gap / 2, y: 254, w: bw, h: bh });
      state.btns.push({ id: 'esc', x: W / 2 + gap / 2, y: 254, w: bw, h: bh });
      state.btns.push({ id: 'restart', x: W / 2 - bw / 2, y: 254 + bh + gap, w: bw, h: bh });
      drawBtn(state.btns[0], 'INTERMEDIATE 16x14', '#10B981');
      drawBtn(state.btns[1], `ESCALATION LV${state.clears}`, '#F59E0B');
      drawBtn(state.btns[2], 'REPLAY THIS BOARD', '#6366F1');
    } else {
      labelCenter(c, 'NODE COMPROMISED', W / 2, 196, 26, '#F43F5E');
      labelCenter(c, `SCORE ${state.score} · CLEARED ${state.cleared}`, W / 2, 224, 14, '#64748B');
      state.btns.push({ id: 'restart', x: W / 2 - bw / 2, y: 250, w: bw, h: bh });
      drawBtn(state.btns[0], 'RESET BOARD', '#10B981');
    }
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    drawBackdrop();
    for (const cl of state.cells) drawCell(cl);
    drawHud();
    drawFoot();
    if (state.over && !state.sent) drawEnd();
    else state.btns = [];
    c.restore();
  };

  build(0);
  ctx.attachLoop(update, draw);

  return null;
}