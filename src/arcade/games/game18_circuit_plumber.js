/* ============================================================
 * GAME 18 — CIRCUIT PLUMBER
 * Route a wire from the emerald power source to every indigo
 * data node. The wire may never cross itself: re-entering a
 * wired cell shorts the circuit.
 * ============================================================ */
import {
  integrate, intersectAABB, pointerPos,
  circle, roundRect, glow, noGlow, label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g18';
export const accent = '#6366F1';

const W = 640, H = 480;
const BOARD_X = 42, BOARD_Y = 66;
const BOARD_MAXW = 556, BOARD_MAXH = 330;
const START_LIVES = 3;
const LOCKOUT_MS = 850;

const EMPTY = 0, BLOCK = 1, SOURCE = 2, NODE = 3;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xC18C);
  const state = {
    t: 0, score: 0, level: 1, lives: START_LIVES,
    over: false, lock: 0, shake: 0, flash: 0, rebuilding: false,
    dragging: false, hover: -1, lastCell: -1,
  };

  let cols = 0, rows = 0, cell = 24, ox = 0, oy = 0;
  let grid = [], nodes = [], source = -1, wire = [], wiredSet = new Set();
  let connected = new Set(), timeLeft = 0, timeMax = 1, need = 0;

  const sparks = [];
  const pops = [];
  const pulses = [];

  // ---- grid helpers ----
  const inb = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows;
  const idx = (x, y) => y * cols + x;
  const cxOf = (i) => i % cols;
  const cyOf = (i) => (i / cols) | 0;
  const cellCenter = (i) => ({
    x: ox + cxOf(i) * cell + cell / 2,
    y: oy + cyOf(i) * cell + cell / 2,
  });
  const cellBox = (i) => ({
    x: ox + cxOf(i) * cell, y: oy + cyOf(i) * cell, w: cell, h: cell,
  });
  const isOpen = (i) => grid[i] !== BLOCK;

  /** Pointer -> cell index via an AABB test against the cell rect. */
  const hitCell = (px, py) => {
    const pt = { x: px, y: py, w: 1, h: 1 };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (intersectAABB(cellBox(idx(x, y)), pt)) return idx(x, y);
      }
    }
    return -1;
  };

  const adjacent = (a, b) => {
    if (a < 0 || b < 0) return false;
    return Math.abs(cxOf(a) - cxOf(b)) + Math.abs(cyOf(a) - cyOf(b)) === 1;
  };

  // ---- level construction ----
  const floodOk = (start, blocked, target) => {
    const seen = new Uint8Array(cols * rows);
    const stack = [start];
    seen[start] = 1;
    const reached = [];
    while (stack.length) {
      const cur = stack.pop();
      reached.push(cur);
      const x = cxOf(cur), y = cyOf(cur);
      const n = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of n) {
        if (!inb(nx, ny)) continue;
        const k = idx(nx, ny);
        if (seen[k] || blocked[k]) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    const reach = new Set(reached);
    let ok = true;
    for (const n of target) if (!reach.has(n)) ok = false;
    return ok;
  };

  const buildLevel = (lv) => {
    cols = Math.min(6 + lv, 11);
    rows = Math.min(5 + lv, 9);
    cell = Math.max(18, Math.floor(Math.min(BOARD_MAXW / cols, BOARD_MAXH / rows)));
    ox = BOARD_X + Math.round((BOARD_MAXW - cols * cell) / 2);
    oy = BOARD_Y + Math.round((BOARD_MAXH - rows * cell) / 2);

    grid = new Array(cols * rows).fill(EMPTY);
    wire = [];
    wiredSet = new Set();
    connected = new Set();
    nodes = [];
    pulses.length = 0;

    need = Math.min(2 + Math.floor(lv / 2), 5);
    const total = cols * rows;

    // power source sits in the left third, away from the border
    const sx = 1 + Math.floor(rng() * Math.max(1, Math.floor(cols / 3)));
    const sy = 1 + Math.floor(rng() * Math.max(1, rows - 2));
    source = idx(sx, sy);
    grid[source] = SOURCE;
    const keep = new Set([source]);

    // data nodes, spread apart and never adjacent to the source
    const spots = [];
    for (let i = 0; i < total; i++) if (!keep.has(i)) spots.push(i);
    for (let tries = 0; tries < 900 && nodes.length < need; tries++) {
      const pick = spots[Math.floor(rng() * spots.length)];
      if (keep.has(pick)) continue;
      const px = cxOf(pick), py = cyOf(pick);
      if (px <= sx + 1 && Math.abs(py - sy) <= 1) continue;
      if (nodes.some((n) => Math.abs(cxOf(n) - px) + Math.abs(cyOf(n) - py) < 3)) continue;
      keep.add(pick);
      nodes.push(pick);
    }

    // obstacle field — light enough that the open component keeps every node
    const ratio = Math.min(0.06 + lv * 0.045, 0.28);
    const blocked = new Set();
    for (let i = 0; i < total; i++) {
      if (keep.has(i)) continue;
      if (rng() < ratio) blocked.add(i);
    }
    if (!floodOk(source, blocked, nodes)) {
      blocked.clear();
      for (let i = 0; i < total; i++) {
        if (keep.has(i)) continue;
        if (rng() < ratio * 0.45) blocked.add(i);
      }
    }

    for (const b of blocked) grid[b] = BLOCK;
    for (const n of nodes) grid[n] = NODE;

    wire.push(source);
    wiredSet.add(source);
    timeMax = 26 + need * 7 + Math.min(lv, 6) * 2;
    timeLeft = timeMax;
  };

  buildLevel(state.level);

  // ---- fx helpers ----
  const burst = (i, color, count, speed) => {
    const p = cellCenter(i);
    for (let k = 0; k < count; k++) {
      const a = rng() * Math.PI * 2;
      const sp = speed * (0.45 + rng() * 0.9);
      sparks.push({
        x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1.2 + rng() * 2.6, life: 1, decay: 1.6 + rng() * 1.6, color,
      });
    }
  };

  const headCell = () => wire[wire.length - 1];

  // ---- circuit actions ----
  const connectNode = (cell) => {
    if (grid[cell] !== NODE || connected.has(cell)) return;
    connected.add(cell);
    grid[cell] = EMPTY;
    const gain = 200 * state.level;
    state.score += gain;
    ctx.onScore(state.score);
    pops.push({ x: cellCenter(cell).x, y: cellCenter(cell).y, life: 1, gain });
    burst(cell, '#6366F1', 12, 240);
    if (ctx.audio) ctx.audio.coin();
    if (connected.size === nodes.length) clearLevel();
  };

  const shortOut = (cell) => {
    state.dragging = false;
    state.lives--;
    state.shake = Math.min(14, 6 + wire.length * 0.5);
    state.flash = 1;
    burst(headCell(), '#F43F5E', 26, 520);
    for (let i = 1; i < wire.length; i++) burst(wire[i], '#F43F5E', 3, 380);
    if (ctx.audio) ctx.audio.explode();
    wire = [];
    wiredSet = new Set();
    connected = new Set();
    for (const n of nodes) grid[n] = NODE;
    grid[source] = SOURCE;
    wire.push(source);
    wiredSet.add(source);
    state.lock = LOCKOUT_MS / 1000;
    if (state.lives <= 0) endRun();
  };

  const clearLevel = () => {
    const bonus = Math.floor(timeLeft) * 20 + 250 * state.level;
    state.score += bonus;
    ctx.onScore(state.score);
    for (const n of nodes) burst(n, '#10B981', 10, 300);
    if (ctx.audio) { ctx.audio.levelUp(); ctx.audio.bigCash(); }
    pops.push({ x: ox + (cols * cell) / 2, y: oy + (rows * cell) / 2, life: 1.4, gain: bonus, big: true });
    state.level++;
    state.rebuilding = true;
    state.dragging = false;
    ctx.after(900, () => {
      state.rebuilding = false;
      if (state.over) return;
      buildLevel(state.level);
    });
  };

  const endRun = () => {
    if (state.over) return;
    state.over = true;
    state.dragging = false;
    if (ctx.loop) ctx.loop.stop();
    if (ctx.audio) ctx.audio.gameOver();
    ctx.finish(state.score);
  };

  const failLevel = () => {
    state.lives--;
    state.shake = 10;
    burst(source, '#F43F5E', 22, 460);
    if (ctx.audio) ctx.audio.error();
    if (state.lives <= 0) { endRun(); return; }
    state.rebuilding = true;
    state.dragging = false;
    ctx.after(700, () => {
      state.rebuilding = false;
      if (state.over) return;
      buildLevel(state.level);
    });
  };

  // ---- pointer input ----
  const toGame = (ev) => {
    const p = pointerPos(ctx.canvas, ev);
    return { x: (p.x * W) / ctx.canvas.width, y: (p.y * H) / ctx.canvas.height };
  };

  ctx.listeners.on(ctx.canvas, 'pointerdown', (ev) => {
    if (state.over || state.lock > 0 || state.rebuilding) return;
    const g = toGame(ev);
    const cell = hitCell(g.x, g.y);
    const head = headCell();
    if (cell >= 0 && (cell === source || cell === head) && isOpen(cell)) {
      state.dragging = true;
      state.lastCell = head;
      ctx.canvas.setPointerCapture && ctx.canvas.setPointerCapture(ev.pointerId);
      if (ctx.audio) ctx.audio.select();
    } else if (cell >= 0) {
      if (ctx.audio) ctx.audio.tap();
    }
  });

  ctx.listeners.on(ctx.canvas, 'pointermove', (ev) => {
    if (state.over) return;
    const g = toGame(ev);
    const cell = hitCell(g.x, g.y);
    state.hover = cell;
    if (!state.dragging || state.lock > 0 || state.rebuilding) return;
    if (cell < 0 || cell === state.lastCell) return;

    const head = headCell();
    if (!adjacent(head, cell)) return;
    state.lastCell = cell;

    if (!isOpen(cell)) {
      state.lastCell = head;
      if (ctx.audio) ctx.audio.error();
      return;
    }
    if (wiredSet.has(cell)) { shortOut(cell); return; }

    wiredSet.add(cell);
    wire.push(cell);
    const cc = cellCenter(cell);
    pulses.push({ x: cc.x, y: cc.y, t: 0 });
    if (ctx.audio) ctx.audio.hit();
    connectNode(cell);
  });

  const endDrag = () => {
    if (!state.dragging) return;
    state.dragging = false;
    state.lastCell = headCell();
    if (wire.length > 1 && ctx.audio) ctx.audio.bounce();
  };
  ctx.listeners.on(ctx.canvas, 'pointerup', endDrag);
  ctx.listeners.on(ctx.canvas, 'pointercancel', endDrag);
  ctx.listeners.on(ctx.canvas, 'pointerleave', () => { if (!state.dragging) state.hover = -1; });

  // countdown ticks in the final seconds
  ctx.every(1000, () => {
    if (state.over || state.lock > 0 || state.rebuilding) return;
    if (timeLeft <= 5 && timeLeft > 0 && ctx.audio) ctx.audio.tick();
  });

  // ---- update ----
  const update = (dt) => {
    state.t += dt;
    state.shake *= Math.max(0, 1 - dt * 7);
    state.flash *= Math.max(0, 1 - dt * 3.4);
    if (state.lock > 0) state.lock = Math.max(0, state.lock - dt);

    if (!state.over && state.lock <= 0 && !state.rebuilding) {
      timeLeft = Math.max(0, timeLeft - dt);
      if (timeLeft <= 0 && connected.size < nodes.length) failLevel();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      integrate(s, dt, W, H, null);
      s.life -= dt * s.decay;
      if (s.life <= 0) sparks.splice(i, 1);
    }

    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].life -= dt * 0.9;
      pops[i].y -= dt * 16;
      if (pops[i].life <= 0) pops.splice(i, 1);
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      pulses[i].t += dt * 3.4;
      if (pulses[i].t > 1) pulses.splice(i, 1);
    }
  };

  // ---- draw ----
  const drawBackdrop = () => {
    ctx.clear('#090D16');
    c.strokeStyle = 'rgba(99,102,241,0.09)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  };

  const drawCellBase = (i, fill, stroke) => {
    const b = cellBox(i);
    c.fillStyle = fill;
    roundRect(c, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, Math.max(2, cell * 0.16));
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1.5;
      c.stroke();
    }
  };

  const drawBoard = () => {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === BLOCK) {
        drawCellBase(i, 'rgba(100,116,139,0.16)', 'rgba(100,116,139,0.40)');
        c.strokeStyle = 'rgba(100,116,139,0.30)';
        c.lineWidth = 1;
        const b = cellBox(i);
        c.beginPath();
        c.moveTo(b.x + 4, b.y + 4);
        c.lineTo(b.x + b.w - 4, b.y + b.h - 4);
        c.moveTo(b.x + b.w - 4, b.y + 4);
        c.lineTo(b.x + 4, b.y + b.h - 4);
        c.stroke();
      } else {
        drawCellBase(i, 'rgba(15,23,42,0.55)', null);
      }
    }

    // unconnected data nodes
    for (const n of nodes) {
      if (connected.has(n)) continue;
      const p = cellCenter(n);
      const pulse = 1 + Math.sin(state.t * 3.4 + n) * 0.08;
      glow(c, '#6366F1', 14);
      c.strokeStyle = '#6366F1';
      c.lineWidth = 2.5;
      circle(c, p.x, p.y, cell * 0.29 * pulse);
      c.stroke();
      noGlow(c);
      c.fillStyle = '#6366F1';
      circle(c, p.x, p.y, cell * 0.12);
      c.fill();
    }
  };

  const drawWire = () => {
    if (wire.length < 2) return;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    glow(c, '#10B981', 12);
    c.strokeStyle = 'rgba(16,185,129,0.85)';
    c.lineWidth = Math.max(4, cell * 0.20);
    c.beginPath();
    for (let i = 0; i < wire.length; i++) {
      const p = cellCenter(wire[i]);
      if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
    }
    c.stroke();
    noGlow(c);

    // flow pulses travelling along the routed trace
    c.fillStyle = '#E2E8F0';
    for (let i = 1; i < wire.length; i++) {
      const a = cellCenter(wire[i - 1]), b = cellCenter(wire[i]);
      for (const pu of pulses) {
        const k = (pu.t + i * 0.17) % 1;
        circle(c, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, Math.max(1.4, cell * 0.06));
        c.fill();
      }
    }
  };

  const drawSource = () => {
    const p = cellCenter(source);
    const beat = 1 + Math.sin(state.t * 4) * 0.12;
    glow(c, '#10B981', 20);
    c.fillStyle = '#10B981';
    circle(c, p.x, p.y, cell * 0.30 * beat);
    c.fill();
    noGlow(c);
    c.strokeStyle = 'rgba(16,185,129,0.55)';
    c.lineWidth = 1.5;
    circle(c, p.x, p.y, cell * 0.44 * beat);
    c.stroke();
  };

  const drawHead = () => {
    const p = cellCenter(headCell());
    glow(c, '#10B981', 16);
    c.strokeStyle = '#E2E8F0';
    c.lineWidth = 2;
    circle(c, p.x, p.y, cell * 0.13);
    c.stroke();
    noGlow(c);
  };

  const drawCursorHint = () => {
    if (state.hover < 0 || state.hover === source || state.hover === headCell()) return;
    if (state.dragging || wiredSet.has(state.hover) || !isOpen(state.hover)) return;
    const p = cellCenter(state.hover);
    c.strokeStyle = 'rgba(99,102,241,0.45)';
    c.lineWidth = 1.5;
    roundRect(c, p.x - cell * 0.34, p.y - cell * 0.34, cell * 0.68, cell * 0.68, cell * 0.16);
    c.stroke();
  };

  const drawSparks = () => {
    for (const s of sparks) {
      c.globalAlpha = Math.max(0, Math.min(1, s.life));
      glow(c, s.color, 10);
      c.fillStyle = s.color;
      circle(c, s.x, s.y, s.r * (0.4 + s.life * 0.6));
      c.fill();
    }
    noGlow(c);
    c.globalAlpha = 1;
  };

  const drawHud = () => {
    c.fillStyle = 'rgba(9,13,22,0.78)';
    c.fillRect(0, 0, W, 48);
    label(c, `SCORE ${state.score}`, 14, 30, 19, '#6366F1');
    label(c, `LV${state.level}`, 176, 30, 19, '#E2E8F0');
    const low = timeLeft <= 8;
    label(c, `${timeLeft.toFixed(1)}s`, W - 14, 30, 19, low ? '#F43F5E' : '#E2E8F0', 'right');

    // life pips
    for (let i = 0; i < START_LIVES; i++) {
      const px = W - 18 - i * 18;
      c.fillStyle = i < state.lives ? '#F43F5E' : 'rgba(100,116,139,0.35)';
      circle(c, px, 30, 5);
      c.fill();
    }

    // level progress
    const done = connected.size, tot = nodes.length || 1;
    c.fillStyle = 'rgba(100,116,139,0.30)';
    c.fillRect(14, H - 26, W - 28, 8);
    c.fillStyle = '#6366F1';
    c.fillRect(14, H - 26, (W - 28) * (done / tot), 8);
    label(c, `NODES ${done}/${nodes.length}`, 14, H - 34, 13, '#64748B');
    label(c, `TRACE ${wire.length}`, W - 14, H - 34, 13, '#64748B', 'right');
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();
    drawBoard();
    drawWire();
    drawSource();
    drawHead();
    drawCursorHint();
    drawSparks();

    for (const p of pops) {
      c.globalAlpha = Math.max(0, Math.min(1, p.life));
      labelCenter(c, `+${p.gain}`, p.x, p.y, p.big ? 22 : 14, p.big ? '#10B981' : '#6366F1');
      c.globalAlpha = 1;
    }

    if (state.flash > 0.02) {
      c.fillStyle = `rgba(244,63,94,${state.flash * 0.22})`;
      c.fillRect(0, 0, W, H);
    }
    if (state.over) {
      c.fillStyle = 'rgba(9,13,22,0.72)';
      c.fillRect(0, 0, W, H);
      labelCenter(c, 'CIRCUIT BLOWN', W / 2, H / 2 - 10, 30, '#F43F5E');
      labelCenter(c, `FINAL ${state.score}`, W / 2, H / 2 + 22, 20, '#6366F1');
    }

    drawHud();
    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}