/* ============================================================
 * GAME 08 — 2048 CHIP MERGE
 * Slide silicon tiles together until you boot the 1024-bit chip.
 * ============================================================ */
import {
  roundRect, label, labelCenter, makeRng, clamp, integrate, pointerPos,
} from '../physics.js';

export const id = 'g08';
export const accent = '#6366F1';

const W = 640, H = 480;
const N = 4;
const CELL = 68, PAD = 8;
const BW = N * CELL + (N + 1) * PAD;
const BX = Math.round((W - BW) / 2), BY = 82;
const WIN_TIER = 10;                 // 1 << 10 = 1024-bit
const SLIDE = 0.085;                 // seconds to cross one cell
const SWIPE_MIN = 16;

// tier colour ramp: indigo -> emerald -> gold -> crimson
const RAMP = ['#6366F1', '#10B981', '#F59E0B', '#F43F5E'].map((h) => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
]);

const tierColor = (tier) => {
  const p = clamp(tier / WIN_TIER, 0, 1);
  const span = 1 / (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(p / span));
  const f = clamp((p - i * span) / span, 0, 1);
  const a = RAMP[i], b = RAMP[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
};

const tierInk = (tier) => (tier / WIN_TIER > 0.28 && tier / WIN_TIER < 0.88 ? '#090D16' : '#E2E8F0');

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0x2048);
  const cellCx = (gx) => BX + PAD + gx * (CELL + PAD) + CELL / 2;
  const cellCy = (gy) => BY + PAD + gy * (CELL + PAD) + CELL / 2;

  const grid = [];
  for (let y = 0; y < N; y++) grid.push([null, null, null, null]);
  const tiles = [];
  const floats = [];
  let nextId = 1;

  const state = {
    t: 0, score: 0, moves: 0, top: 0, won: false,
    over: false, finished: false, banner: 0,
  };

  // ---- tiles ----
  const spawnTile = (gx, gy, tier) => {
    const t = {
      id: nextId++, tier,
      x: cellCx(gx), y: cellCy(gy), vx: 0, vy: 0, r: 0,
      tx: cellCx(gx), ty: cellCy(gy), gx, gy,
      pop: 0, born: 0, absorb: 0,
    };
    tiles.push(t);
    grid[gy][gx] = t;
    return t;
  };

  const emptyCells = () => {
    const out = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!grid[y][x]) out.push([x, y]);
    return out;
  };

  const spawnRandom = () => {
    const open = emptyCells();
    if (!open.length) return null;
    const [x, y] = open[Math.floor(rng() * open.length) % open.length];
    return spawnTile(x, y, 0);
  };

  const floater = (x, y, text, color) => {
    floats.push({ x, y, vx: 0, vy: -34, r: 0, life: 1, text, color });
  };

  // ---- one slide ----
  const slide = (dx, dy) => {
    const next = [];
    for (let y = 0; y < N; y++) next.push([null, null, null, null]);
    const pairs = [];
    let moved = false, merged = 0;

    for (let line = 0; line < N; line++) {
      // cells ordered from the wall the tiles pile up against
      const cells = [];
      for (let i = 0; i < N; i++) {
        const a = (dx < 0 || dy < 0) ? i : N - 1 - i;
        cells.push(dx !== 0 ? [a, line] : [line, a]);
      }
      const seq = cells.map(([x, y]) => grid[y][x]).filter(Boolean);
      const out = [];
      for (let i = 0; i < seq.length; i++) {
        const cur = seq[i], nxt = seq[i + 1];
        if (nxt && nxt.tier === cur.tier) {
          cur.tier++;
          cur.pop = 1;
          pairs.push(nxt, cur);
          out.push(cur);
          i++;
        } else {
          out.push(cur);
        }
      }
      for (let i = 0; i < N; i++) {
        const [cx, cy] = cells[i];
        const t = i < out.length ? out[i] : null;
        next[cy][cx] = t;
        if (!t) continue;
        t.tx = cellCx(cx);
        t.ty = cellCy(cy);
        if (t.gx !== cx || t.gy !== cy) moved = true;
        t.gx = cx;
        t.gy = cy;
      }
    }

    if (pairs.length) merged = pairs.length / 2;
    if (!moved && !merged) return false;

    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) grid[y][x] = next[y][x];

    for (let i = 0; i < pairs.length; i += 2) {
      const src = pairs[i], dst = pairs[i + 1];
      src.tx = dst.tx;
      src.ty = dst.ty;
      src.absorb = 1;
      src.pop = 0;
    }

    let gained = 0;
    for (const t of tiles) if (t.pop > 0.99) {
      const gain = 1 << t.tier;
      gained += gain;
      floater(t.tx, t.ty - 10, `+${gain}`, tierColor(t.tier));
      if (t.tier > state.top) {
        state.top = t.tier;
        if (t.tier >= WIN_TIER && !state.won) {
          state.won = true;
          state.banner = 1;
          if (ctx.audio) ctx.audio.win();
        } else if (t.tier >= 9 && ctx.audio) ctx.audio.powerup();
      }
    }
    state.score += gained;
    state.moves++;
    ctx.onScore(state.score);
    if (ctx.audio) { if (merged) ctx.audio.coin(); else ctx.audio.select(); }

    spawnRandom();
    checkEnd();
    return true;
  };

  const anyMove = () => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = grid[y][x];
      if (!t) return true;
      if (x + 1 < N && grid[y][x + 1] && grid[y][x + 1].tier === t.tier) return true;
      if (y + 1 < N && grid[y + 1][x] && grid[y + 1][x].tier === t.tier) return true;
    }
    return false;
  };

  const checkEnd = () => {
    if (state.over || anyMove()) return;
    state.over = true;
    if (ctx.audio) ctx.audio.gameOver();
    ctx.after(1100, () => {
      if (state.finished) return;
      state.finished = true;
      ctx.loop && ctx.loop.stop();
      ctx.finish(state.score);
    });
  };

  const move = (dir) => {
    if (state.over) return;
    if (slide(dir.dx, dir.dy)) return;
    if (ctx.audio) ctx.audio.select();
  };

  // ---- input ----
  const DIRS = {
    left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
    up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
  };

  const onKey = (ev) => {
    const k = ev.key;
    let dir = null;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') dir = DIRS.left;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') dir = DIRS.right;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') dir = DIRS.up;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') dir = DIRS.down;
    else return;
    ev.preventDefault();
    move(dir);
  };
  ctx.listeners.on(window, 'keydown', onKey);

  let drag = null;
  const local = (ev) => {
    const p = pointerPos(ctx.canvas, ev);
    return { x: (p.x * W) / ctx.canvas.width, y: (p.y * H) / ctx.canvas.height };
  };

  ctx.listeners.on(ctx.canvas, 'pointerdown', (ev) => {
    const p = local(ev);
    drag = { x: p.x, y: p.y };
  });

  ctx.listeners.on(ctx.canvas, 'pointercancel', () => { drag = null; });

  ctx.listeners.on(ctx.canvas, 'pointerup', (ev) => {
    if (!drag) return;
    const p = local(ev);
    const dx = p.x - drag.x, dy = p.y - drag.y;
    drag = null;
    if (Math.hypot(dx, dy) < SWIPE_MIN) {
      // bare tap: push the whole board toward the tapped quadrant
      const qx = p.x - (BX + BW / 2), qy = p.y - (BY + BW / 2);
      if (Math.abs(qx) > Math.abs(qy)) move(qx > 0 ? DIRS.right : DIRS.left);
      else move(qy > 0 ? DIRS.down : DIRS.up);
      return;
    }
    move(Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? DIRS.right : DIRS.left)
      : (dy > 0 ? DIRS.down : DIRS.up));
  });

  // ---- update ----
  const update = (dt) => {
    state.t += dt;
    if (state.banner > 0) {
      state.banner -= dt * 0.42;
      if (state.banner <= 0) state.banner = 0;
    }

    for (const t of tiles) {
      const dx = t.tx - t.x, dy = t.ty - t.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.6) {
        const sp = d / SLIDE;
        t.vx = (dx / d) * sp;
        t.vy = (dy / d) * sp;
      } else {
        t.vx = 0;
        t.vy = 0;
        t.x = t.tx;
        t.y = t.ty;
      }
      integrate(t, dt, W, H, null);
      if (t.born < 1) t.born = Math.min(1, t.born + dt * 7);
      if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 3.6);
      if (t.absorb === 1 && Math.hypot(t.tx - t.x, t.ty - t.y) < 2.4) t.absorb = 2;
    }
    for (let i = tiles.length - 1; i >= 0; i--) if (tiles[i].absorb === 2) tiles.splice(i, 1);

    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      integrate(f, dt, W, H, null);
      f.life -= dt * 1.5;
      if (f.life <= 0) floats.splice(i, 1);
    }
  };

  // ---- draw ----
  const drawBoard = () => {
    c.fillStyle = 'rgba(15,23,42,0.85)';
    roundRect(c, BX - 6, BY - 6, BW + 12, BW + 12, 14);
    c.fill();
    c.strokeStyle = 'rgba(99,102,241,0.28)';
    c.lineWidth = 1;
    c.stroke();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        c.fillStyle = 'rgba(148,163,184,0.07)';
        roundRect(c, cellCx(x) - CELL / 2, cellCy(y) - CELL / 2, CELL, CELL, 10);
        c.fill();
      }
    }
  };

  const drawTile = (t) => {
    const col = tierColor(t.tier);
    const s = (1 + t.pop * 0.26) * (0.55 + 0.45 * t.born) * (t.absorb ? 0.9 : 1);
    const size = CELL - 8;
    c.save();
    c.translate(t.x, t.y);
    c.scale(s, s);
    c.shadowColor = col;
    c.shadowBlur = 7 + t.pop * 26;
    c.fillStyle = col;
    roundRect(c, -size / 2, -size / 2, size, size, 10);
    c.fill();
    c.shadowBlur = 0;
    c.shadowColor = 'transparent';
    if (t.tier >= 5) {
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 2;
      c.stroke();
    }
    c.strokeStyle = 'rgba(9,13,22,0.35)';
    c.lineWidth = 1;
    roundRect(c, -size / 2 + 8, -size / 2 + 8, size - 16, size - 16, 6);
    c.stroke();
    c.strokeStyle = 'rgba(9,13,22,0.30)';
    for (let i = 0; i < 3; i++) {
      const py = -18 + i * 18;
      c.beginPath();
      c.moveTo(-size / 2 - 3, py);
      c.lineTo(-size / 2 + 1, py);
      c.moveTo(size / 2 - 1, py);
      c.lineTo(size / 2 + 3, py);
      c.stroke();
    }
    const text = `${1 << t.tier}-bit`;
    const fs = t.tier >= 8 ? 13 : t.tier >= 5 ? 15 : t.tier >= 2 ? 17 : 19;
    labelCenter(c, text, 0, 6, fs, tierInk(t.tier));
    c.restore();
  };

  const drawFloats = () => {
    for (const f of floats) {
      c.globalAlpha = Math.max(0, Math.min(1, f.life));
      labelCenter(c, f.text, f.x, f.y, 17, f.color);
    }
    c.globalAlpha = 1;
  };

  const drawBanner = () => {
    if (state.banner <= 0) return;
    const a = Math.min(1, state.banner * 1.6);
    const bx = BX + 12, by = BY + BW - 74;
    c.globalAlpha = a;
    c.fillStyle = 'rgba(9,13,22,0.92)';
    roundRect(c, bx, by, BW - 24, 58, 12);
    c.fill();
    c.strokeStyle = '#F43F5E';
    c.lineWidth = 2;
    c.stroke();
    labelCenter(c, '1024-BIT ONLINE', BX + BW / 2, by + 26, 20, '#F43F5E');
    labelCenter(c, 'grid still live — keep merging', BX + BW / 2, by + 46, 12, '#64748B');
    c.globalAlpha = 1;
  };

  const drawOver = () => {
    if (!state.over) return;
    c.fillStyle = 'rgba(9,13,22,0.78)';
    roundRect(c, BX + 20, BY + BW / 2 - 54, BW - 40, 108, 14);
    c.fill();
    c.strokeStyle = '#F43F5E';
    c.lineWidth = 2;
    c.stroke();
    labelCenter(c, 'GRID LOCKED', BX + BW / 2, BY + BW / 2 - 18, 24, '#F43F5E');
    labelCenter(c, `final score ${state.score}`, BX + BW / 2, BY + BW / 2 + 10, 15, '#E2E8F0');
    labelCenter(c, `top chip ${1 << state.top}-bit`, BX + BW / 2, BY + BW / 2 + 32, 13, '#64748B');
  };

  const draw = () => {
    c.fillStyle = '#090D16';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(99,102,241,0.08)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }

    drawBoard();
    for (const t of tiles) drawTile(t);
    drawFloats();
    drawBanner();

    // HUD
    c.fillStyle = 'rgba(9,13,22,0.72)';
    c.fillRect(0, 0, W, 46);
    label(c, `SCORE ${state.score}`, 14, 30, 20, '#10B981');
    label(c, `TOP ${1 << state.top}-bit`, 214, 30, 20, tierColor(state.top));
    label(c, `MOVES ${state.moves}`, W - 14, 30, 20, '#E2E8F0', 'right');

    labelCenter(c, 'SWIPE / TAP  or  ARROWS / WASD  —  merge equal chips to double them', W / 2, H - 26, 12, '#64748B');
    c.fillStyle = 'rgba(99,102,241,0.25)';
    c.fillRect(0, H - 8, W, 8);
    c.fillStyle = state.top >= WIN_TIER ? '#F43F5E' : '#6366F1';
    c.fillRect(0, H - 8, W * clamp(state.top / WIN_TIER, 0, 1), 8);

    drawOver();
  };

  // ---- boot ----
  ctx.onScore(state.score);
  spawnRandom();
  spawnRandom();

  ctx.attachLoop(update, draw);

  return null;
}