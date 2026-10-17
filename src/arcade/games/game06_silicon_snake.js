/* ============================================================
 * GAME 06 — SILICON SNAKE
 * Grid snake on a circuit wafer: eat bits, wrap the side edges,
 * never bite a firewall.
 * ============================================================ */
import {
  clamp, circle, roundRect, glow, noGlow, label, labelCenter,
  pointerPos, makeRng,
} from '../physics.js';

export const id = 'g06';
export const accent = '#6366F1';

const W = 640, H = 480;
const COLS = 20, ROWS = 15;
const CELL = 29;
const BX = 30, BY = 42;
const HUD_H = 40;
const START_LEN = 4;
const BASE_STEP = 0.155;
const MIN_STEP = 0.058;
const STEP_GAIN = 0.0042;
const FIREWALLS = 16;
const BONUS_EVERY = 5;

const UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 }, LEFT = { x: -1, y: 0 }, RIGHT = { x: 1, y: 0 };

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

const cellKey = (x, y) => `${x},${y}`;

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0x516C0);
  const state = { t: 0, score: 0, bits: 0, over: false, flash: 0, shake: 0, hint: 1 };
  const snake = [];
  const walls = new Set();
  const decor = [];
  const sparks = [];
  const queue = [];
  let dir = RIGHT;
  let grow = 0;
  let stepAcc = 0;
  let bit = null;

  const cx = (gx) => BX + gx * CELL + CELL / 2;
  const cy = (gy) => BY + gy * CELL + CELL / 2;

  // ---- board layout ----
  for (let i = 0; i < START_LEN; i++) snake.push({ x: 3 + i, y: 7 });

  for (let tries = 0; tries < 400 && walls.size < FIREWALLS; tries++) {
    const fx = Math.floor(rng() * COLS);
    const fy = Math.floor(rng() * ROWS);
    if (fx >= 2 && fx <= 8 && fy >= 5 && fy <= 9) continue; // keep the launch lane clean
    walls.add(cellKey(fx, fy));
  }

  for (let i = 0; i < 26; i++) {
    decor.push({
      x: Math.floor(rng() * COLS),
      y: Math.floor(rng() * ROWS),
      w: rng() < 0.4 ? 2 : 1,
      dot: rng() < 0.45,
    });
  }

  const freeCell = (fx, fy) => {
    if (fx < 0 || fy < 0 || fx >= COLS || fy >= ROWS) return false;
    if (walls.has(cellKey(fx, fy))) return false;
    for (const s of snake) if (s.x === fx && s.y === fy) return false;
    return true;
  };

  const spawnBit = () => {
    bit = null;
    const h = snake[0];
    for (let tries = 0; tries < 300; tries++) {
      const fx = Math.floor(rng() * COLS);
      const fy = Math.floor(rng() * ROWS);
      if (!freeCell(fx, fy)) continue;
      if (fx === h.x + dir.x && fy === h.y + dir.y) continue; // never drop a bit under the jaws
      bit = { x: fx, y: fy, phase: rng() * 6.28 };
      return;
    }
  };
  spawnBit();

  // ---- input buffer ----
  const steer = (d) => {
    if (state.over) return;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (d === last) return;
    if (queue.length < 4) queue.push(d);
  };

  const onKey = (ev) => {
    let name = KEYMAP[ev.code || ''];
    if (!name && ev.key) name = KEYMAP[`Key${ev.key.toUpperCase()}`];
    if (!name) return;
    if (ev.preventDefault) ev.preventDefault();
    const map = { up: UP, down: DOWN, left: LEFT, right: RIGHT };
    steer(map[name]);
  };
  ctx.listeners.on(window, 'keydown', onKey);

  let drag = null;
  const dragScale = ctx.canvas.width / W;
  const onDown = (ev) => {
    if (state.over) return;
    if (ev.preventDefault) ev.preventDefault();
    const p = pointerPos(ctx.canvas, ev);
    drag = { x: p.x, y: p.y };
  };
  const onMove = (ev) => {
    if (!drag || state.over) return;
    const p = pointerPos(ctx.canvas, ev);
    const dx = p.x - drag.x, dy = p.y - drag.y;
    if (Math.abs(dx) < 20 * dragScale && Math.abs(dy) < 20 * dragScale) return;
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? RIGHT : LEFT);
    else steer(dy > 0 ? DOWN : UP);
    drag = { x: p.x, y: p.y };
  };
  ctx.listeners.on(ctx.canvas, 'pointerdown', onDown, { passive: false });
  ctx.listeners.on(ctx.canvas, 'pointermove', onMove);
  ctx.listeners.on(window, 'pointerup', () => { drag = null; });

  // ---- rules ----
  const bump = (x, y, n) => {
    for (let i = 0; i < n; i++) {
      sparks.push({
        x: cx(x), y: cy(y),
        vx: (rng() - 0.5) * 190, vy: (rng() - 0.5) * 190,
        life: 1, hue: '#10B981',
      });
    }
  };

  const eat = (b) => {
    state.bits++;
    state.score += 1;
    grow += 1;
    let bonus = false;
    if (state.bits % BONUS_EVERY === 0) { state.score += 10; grow += 1; bonus = true; }
    ctx.onScore(state.score);
    if (ctx.audio) { if (bonus) ctx.audio.powerup(); else ctx.audio.coin(); }
    state.shake = bonus ? 8 : 4;
    bump(b.x, b.y, bonus ? 12 : 6);
    spawnBit();
  };

  const die = (kind) => {
    if (state.over) return;
    state.over = true;
    state.flash = 1;
    state.shake = 13;
    bump(snake[0].x, snake[0].y, 14);
    if (ctx.audio) { if (kind === 'firewall') ctx.audio.hit(); else ctx.audio.explode(); }
    ctx.after(260, () => {
      if (ctx.audio) ctx.audio.gameOver();
      ctx.loop && ctx.loop.stop();
      ctx.finish(state.score);
    });
  };

  const move = () => {
    // one buffered turn per step, so two quick turns in a single frame both land
    const want = queue.shift();
    if (want && !(want.x === -dir.x && want.y === -dir.y)) dir = want;

    const h = snake[0];
    let nx = h.x + dir.x;
    const ny = h.y + dir.y;

    if (nx < 0) nx = COLS - 1; else if (nx >= COLS) nx = 0; // wafer wrap
    if (ny < 0 || ny >= ROWS) { die('wall'); return; }
    if (walls.has(cellKey(nx, ny))) { die('firewall'); return; }

    const last = snake.length - (grow > 0 ? 0 : 1);
    for (let i = 1; i <= last; i++) {
      if (snake[i].x === nx && snake[i].y === ny) { die('self'); return; }
    }

    snake.unshift({ x: nx, y: ny });
    if (grow > 0) grow--; else snake.pop();
    if (ctx.audio) ctx.audio.tick();
    if (bit && bit.x === nx && bit.y === ny) eat(bit);
  };

  const stepInterval = () => Math.max(MIN_STEP, BASE_STEP - (snake.length - START_LEN) * STEP_GAIN);

  const update = (dt) => {
    state.t += dt;
    state.flash = Math.max(0, state.flash - dt * 2.2);
    state.shake *= Math.max(0, 1 - dt * 7);
    state.hint = Math.max(0, state.hint - dt * 0.16);

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt * 2.4;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 220 * dt;
      if (s.life <= 0) sparks.splice(i, 1);
    }
    if (state.over) return;

    stepAcc += dt;
    const interval = stepInterval();
    let guard = 0;
    while (stepAcc >= interval && !state.over && guard++ < 6) {
      stepAcc -= interval;
      move();
    }
  };

  // ---- drawing ----
  const drawBackdrop = () => {
    ctx.clear('#090D16');
    c.fillStyle = 'rgba(15,23,42,0.55)';
    roundRect(c, BX - 6, BY - 6, COLS * CELL + 12, ROWS * CELL + 12, 8);
    c.fill();

    c.strokeStyle = 'rgba(99,102,241,0.13)';
    c.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      const x = BX + i * CELL + 0.5;
      c.beginPath(); c.moveTo(x, BY); c.lineTo(x, BY + ROWS * CELL); c.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
      const y = BY + j * CELL + 0.5;
      c.beginPath(); c.moveTo(BX, y); c.lineTo(BX + COLS * CELL, y); c.stroke();
    }

    for (const d of decor) {
      c.fillStyle = 'rgba(99,102,241,0.20)';
      c.fillRect(cx(d.x) - 3, cy(d.y) - 3, 6, 6);
      c.fillStyle = d.dot ? '#6366F1' : 'rgba(148,163,184,0.35)';
      c.fillRect(cx(d.x) - 1.5, cy(d.y) - 1.5, d.dot ? 3 : 3, 3);
    }

    // side edges are the wrap ports, top and bottom are live rails
    c.strokeStyle = 'rgba(99,102,241,0.7)';
    c.lineWidth = 2;
    for (const side of [-1, 1]) {
      const ex = side < 0 ? BX - 3 : BX + COLS * CELL + 3;
      c.beginPath();
      c.moveTo(ex, cy(ROWS / 2 - 1));
      c.lineTo(ex + side * 7, cy(ROWS / 2));
      c.lineTo(ex, cy(ROWS / 2 + 1));
      c.stroke();
    }
    c.strokeStyle = 'rgba(244,63,94,0.55)';
    c.setLineDash([7, 7]);
    c.beginPath(); c.moveTo(BX, BY - 5); c.lineTo(BX + COLS * CELL, BY - 5); c.stroke();
    c.beginPath(); c.moveTo(BX, BY + ROWS * CELL + 5); c.lineTo(BX + COLS * CELL, BY + ROWS * CELL + 5); c.stroke();
    c.setLineDash([]);
  };

  const drawWall = (k) => {
    const [gx, gy] = k.split(',').map(Number);
    const x = BX + gx * CELL, y = BY + gy * CELL;
    glow(c, '#F43F5E', 9);
    c.fillStyle = '#F43F5E';
    roundRect(c, x + 3, y + 3, CELL - 6, CELL - 6, 4);
    c.fill();
    noGlow(c);
    c.strokeStyle = 'rgba(9,13,22,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + 8, y + CELL / 2); c.lineTo(x + CELL - 8, y + CELL / 2);
    c.moveTo(x + CELL / 2, y + 8); c.lineTo(x + CELL / 2, y + CELL - 8);
    c.stroke();
  };

  const drawBit = () => {
    if (!bit) return;
    const pulse = 0.5 + 0.5 * Math.sin(state.t * 6 + bit.phase);
    const r = 5 + pulse * 2;
    glow(c, '#F59E0B', 14);
    c.fillStyle = '#F59E0B';
    circle(c, cx(bit.x), cy(bit.y), r);
    c.fill();
    noGlow(c);
    c.strokeStyle = 'rgba(245,158,11,0.45)';
    c.lineWidth = 1;
    roundRect(c, cx(bit.x) - 9, cy(bit.y) - 9, 18, 18, 3);
    c.stroke();
  };

  const drawSnake = () => {
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const x = BX + s.x * CELL, y = BY + s.y * CELL;
      const head = i === 0;
      c.fillStyle = head ? '#34D399' : i % 3 === 0 ? '#6366F1' : '#10B981';
      if (head) glow(c, '#10B981', 12);
      roundRect(c, x + (head ? 2 : 4), y + (head ? 2 : 4), CELL - (head ? 4 : 8), CELL - (head ? 4 : 8), 5);
      c.fill();
      if (head) {
        noGlow(c);
        c.fillStyle = '#090D16';
        const ox = dir.x, oy = dir.y;
        const px = -oy, py = ox;
        circle(c, cx(s.x) + ox * 5 + px * 5, cy(s.y) + oy * 5 + py * 5, 2.6); c.fill();
        circle(c, cx(s.x) + ox * 5 - px * 5, cy(s.y) + oy * 5 - py * 5, 2.6); c.fill();
      }
    }
  };

  const drawHud = () => {
    c.fillStyle = 'rgba(9,13,22,0.82)';
    c.fillRect(0, 0, W, HUD_H);
    c.fillStyle = 'rgba(99,102,241,0.30)';
    c.fillRect(0, HUD_H - 2, W, 2);

    label(c, 'SCORE', 16, 15, 10, '#64748B');
    label(c, `${state.score}`, 16, 34, 18, '#10B981');
    label(c, 'LENGTH', 140, 15, 10, '#64748B');
    label(c, `${snake.length}`, 140, 34, 18, '#E2E8F0');
    label(c, 'BITS', 236, 15, 10, '#64748B');
    label(c, `${state.bits}`, 236, 34, 18, '#F59E0B');

    const bonus = state.bits % BONUS_EVERY;
    label(c, `NEXT BONUS +10`, 330, 24, 11, '#64748B');
    c.fillStyle = 'rgba(100,116,139,0.30)';
    c.fillRect(330, 29, 120, 5);
    c.fillStyle = '#F59E0B';
    c.fillRect(330, 29, 120 * (bonus / BONUS_EVERY), 5);

    const speed = clamp(1 - (stepInterval() - MIN_STEP) / (BASE_STEP - MIN_STEP), 0, 1);
    label(c, 'CLOCK', W - 132, 24, 11, '#64748B');
    c.fillStyle = 'rgba(100,116,139,0.30)';
    c.fillRect(W - 132, 29, 116, 5);
    c.fillStyle = '#6366F1';
    c.fillRect(W - 132, 29, 116 * speed, 5);
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();
    for (const k of walls) drawWall(k);
    drawBit();
    drawSnake();

    for (const s of sparks) {
      c.globalAlpha = Math.max(0, s.life);
      c.fillStyle = s.hue;
      circle(c, s.x, s.y, 2.5 * s.life);
      c.fill();
    }
    c.globalAlpha = 1;

    if (state.hint > 0) {
      c.globalAlpha = Math.min(1, state.hint);
      labelCenter(c, 'ARROWS / WASD / SWIPE STEER  —  SIDES WRAP', W / 2, H - 14, 12, '#64748B');
      c.globalAlpha = 1;
    }

    if (state.over) {
      c.fillStyle = `rgba(244,63,94,${0.20 * state.flash})`;
      c.fillRect(0, 0, W, H);
      labelCenter(c, 'SIGNAL LOST', W / 2, H / 2 - 12, 28, '#F43F5E');
      labelCenter(c, `FINAL SCORE ${state.score}`, W / 2, H / 2 + 18, 15, '#E2E8F0');
    }

    drawHud();
    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}
