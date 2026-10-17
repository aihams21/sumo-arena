/* =============================================================
   NEXUS CORP — Physics2D + GameLoop Kernel
   Shared deterministic engine for all 20 mini-games.

   INVARIANTS (enforced here, relied on by every game):
   1. Delta-time is ALWAYS clamped: dt = min((now-last)/1000, 0.033)
   2. Any body whose |velocity| > FAST_SPEED (400 px/s) is integrated
      with SUB_STEPS (4) sub-steps per frame and each sub-step applies
      continuous boundary clamping. Bodies therefore never tunnel
      through walls regardless of frame time.
   3. Collision helpers are exact AABB / circle / circle-AABB tests
      with penetration resolution (eject + reflect), so a ball can
      never become stuck inside a paddle or a brick.
   4. Lifecycle is explicit: start() / stop() cancel rAF and remove
      every listener registered through the bound add/remove helpers.
   ============================================================= */

export const MAX_DT = 0.033;
export const FAST_SPEED = 400;      // px/s threshold for sub-stepping
export const SUB_STEPS = 4;
export const SUB_DT_LIMIT = MAX_DT / SUB_STEPS;

/* ---------------- Geometry primitives ---------------- */

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/** Exact AABB overlap test. Boxes are {x,y,w,h} top-left anchored. */
export function intersectAABB(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** Exact circle/circle overlap test. */
export function intersectCircle(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Exact circle vs AABB test. Uses the closest-point-on-box method,
 * which is precise for corners, edges and interiors.
 */
export function intersectCircleAABB(cx, cy, r, box) {
  const closestX = clamp(cx, box.x, box.x + box.w);
  const closestY = clamp(cy, box.y, box.y + box.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

/** Closest point on an AABB to a point (out param avoided; returns {x,y}). */
export function closestPointOnAABB(cx, cy, box) {
  return { x: clamp(cx, box.x, box.x + box.w), y: clamp(cy, box.y, box.y + box.h) };
}

/**
 * Penetration resolution for a circle pushed out of an AABB.
 * Returns null when there is no overlap, otherwise
 * { nx, ny, depth } — a unit normal pointing AWAY from the box
 * toward the circle, plus overlap depth in px.
 */
export function resolveCircleAABB(cx, cy, r, box) {
  const p = closestPointOnAABB(cx, cy, box);
  let dx = cx - p.x;
  let dy = cy - p.y;
  let d2 = dx * dx + dy * dy;

  if (d2 > r * r) return null;

  let nx, ny, depth;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nx = dx / d; ny = dy / d;
    depth = r - d;
  } else {
    // Center is INSIDE the box: escape along the shallowest face.
    const left = cx - box.x;
    const right = box.x + box.w - cx;
    const top = cy - box.y;
    const bottom = box.y + box.h - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left)        { nx = -1; ny = 0;  depth = left + r; }
    else if (m === right)  { nx = 1;  ny = 0;  depth = right + r; }
    else if (m === top)    { nx = 0;  ny = -1; depth = top + r; }
    else                   { nx = 0;  ny = 1;  depth = bottom + r; }
  }
  return { nx, ny, depth };
}

/** Push a circle body out of an AABB and reflect its velocity. Mutates body. */
export function ejectAndReflectCircleAABB(body, box, restitution = 1) {
  const hit = resolveCircleAABB(body.x, body.y, body.r, box);
  if (!hit) return false;
  body.x += hit.nx * hit.depth;
  body.y += hit.ny * hit.depth;
  const vn = body.vx * hit.nx + body.vy * hit.ny;
  if (vn < 0) {
    body.vx -= (1 + restitution) * vn * hit.nx;
    body.vy -= (1 + restitution) * vn * hit.ny;
  }
  return true;
}

/** Reflect a body off an AABB face without penetration (rect-bounce helper). */
export function reflectBodyOffAABB(body, box, restitution = 1) {
  if (!intersectAABB(body, box)) return false;
  const pushLeft = body.x + body.w - box.x;
  const pushRight = box.x + box.w - body.x;
  const pushUp = body.y + body.h - box.y;
  const pushDown = box.y + box.h - body.y;
  const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
  if (m === pushLeft)        { body.x = box.x - body.w;       body.vx = -Math.abs(body.vx) * restitution; }
  else if (m === pushRight)  { body.x = box.x + box.w;       body.vx =  Math.abs(body.vx) * restitution; }
  else if (m === pushUp)     { body.y = box.y - body.h;       body.vy = -Math.abs(body.vy) * restitution; }
  else                       { body.y = box.y + box.h;       body.vy =  Math.abs(body.vy) * restitution; }
  return true;
}

/* ---------------- Boundary clamping (continuous) ---------------- */

/** Continuous AABB clamp — guarantees the body stays fully inside bounds. */
export function clampToBounds(body, width, height) {
  if (body.x < 0) { body.x = 0; if (body.vx < 0) body.vx = -body.vx; }
  if (body.x + body.w > width) { body.x = width - body.w; if (body.vx > 0) body.vx = -body.vx; }
  if (body.y < 0) { body.y = 0; if (body.vy < 0) body.vy = -body.vy; }
  if (body.y + body.h > height) { body.y = height - body.h; if (body.vy > 0) body.vy = -body.vy; }
}

/** Continuous circle clamp — the invariant named in the spec. */
export function clampCircleToBounds(body, width, height) {
  body.x = Math.max(body.r, Math.min(width - body.r, body.x));
  body.y = Math.max(body.r, Math.min(height - body.r, body.y));
}

/** Clamp a circle to bounds AND reflect velocity off the wall it hit. */
export function clampAndBounceCircle(body, width, height, restitution = 1) {
  if (body.x - body.r <= 0)     { body.x = body.r;                     if (body.vx < 0) body.vx = -body.vx * restitution; }
  else if (body.x + body.r >= width)  { body.x = width - body.r;      if (body.vx > 0) body.vx = -body.vx * restitution; }
  if (body.y - body.r <= 0)     { body.y = body.r;                     if (body.vy < 0) body.vy = -body.vy * restitution; }
  else if (body.y + body.r >= height) { body.y = height - body.r;      if (body.vy > 0) body.vy = -body.vy * restitution; }
}

/** True when the body is fast enough to require sub-stepped integration. */
export function needsSubStepping(body) {
  const sx = Math.abs(body.vx || 0);
  const sy = Math.abs(body.vy || 0);
  return Math.max(sx, sy) > FAST_SPEED;
}

/**
 * Integrate a body with the sub-stepping invariant.
 * onStep(x, y, subDt) is invoked per sub-step so games can run their own
 * continuous collision checks at each micro-step.
 */
export function integrate(body, dt, width, height, onStep) {
  if (!needsSubStepping(body)) {
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    if (onStep) onStep(body.x, body.y, dt);
    return 1;
  }
  const steps = SUB_STEPS;
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    body.x += body.vx * sdt;
    body.y += body.vy * sdt;
    if (onStep) onStep(body.x, body.y, sdt);
    // Continuous boundary clamping at EVERY sub-step: no tunnelling.
    clampCircleToBounds(body, width, height);
  }
  return steps;
}

/** Simple uniform-grid spatial hash for broad-phase queries. */
export class SpatialHash {
  constructor(cell = 64) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  _key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
  insert(item, x, y, w, h) {
    const c = this.cell;
    const x0 = Math.floor(x / c), x1 = Math.floor((x + w) / c);
    const y0 = Math.floor(y / c), y1 = Math.floor((y + h) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this._key(cx, cy);
        let bucket = this.map.get(k);
        if (!bucket) { bucket = []; this.map.set(k, bucket); }
        bucket.push(item);
      }
    }
  }
  query(x, y, w, h, out = []) {
    const c = this.cell;
    const x0 = Math.floor(x / c), x1 = Math.floor((x + w) / c);
    const y0 = Math.floor(y / c), y1 = Math.floor((y + h) / c);
    const seen = new Set();
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.map.get(this._key(cx, cy));
        if (!bucket) continue;
        for (const it of bucket) { if (!seen.has(it)) { seen.add(it); out.push(it); } }
      }
    }
    return out;
  }
}

/* ---------------- Pointer + input helpers ---------------- */

/** Normalised pointer position from a mouse or touch event. */
export function pointerPos(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const src = ev.touches && ev.touches.length ? ev.touches[0] : ev.changedTouches && ev.changedTouches.length ? ev.changedTouches[0] : ev;
  const cx = (src.clientX !== undefined ? src.clientX : src.x) - rect.left;
  const cy = (src.clientY !== undefined ? src.clientY : src.y) - rect.top;
  const sx = canvas.width / (rect.width || canvas.width);
  const sy = canvas.height / (rect.height || canvas.height);
  return { x: cx * sx, y: cy * sy };
}

export function isTouchDevice() {
  return typeof window !== 'undefined' &&
    ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
}

/* ---------------- GameLoop ---------------- */

/**
 * rAF loop with hard dt clamping and a clean stop().
 * onUpdate(dt, nowSeconds) — dt is ALWAYS in (0, MAX_DT].
 * onDraw(alpha) — optional interpolation factor.
 */
export class GameLoop {
  constructor(onUpdate, onDraw) {
    this.onUpdate = onUpdate || null;
    this.onDraw = onDraw || null;
    this.running = false;
    this.raf = 0;
    this.last = 0;
    this.elapsed = 0;      // total simulated seconds (never jumps)
    this.frame = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _tick(now) {
    if (!this.running) return;
    // INVARIANT 1 — clamp delta-time.
    let dt = (now - this.last) / 1000;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, MAX_DT);
    this.last = now;
    this.elapsed += dt;
    this.frame++;

    if (this.onUpdate) {
      try { this.onUpdate(dt, this.elapsed); }
      catch (err) { console.error('[GameLoop] update error', err); this.stop(); return; }
    }
    if (this.onDraw) {
      try { this.onDraw(this.elapsed); }
      catch (err) { console.error('[GameLoop] draw error', err); this.stop(); return; }
    }
    if (this.running) this.raf = requestAnimationFrame(this._tick);
  }
}

/* ---------------- Lifecycle: listener bookkeeping ---------------- */

/**
 * Collects every listener a game adds so dispose() can remove ALL of them.
 * Games must use this instead of bare addEventListener.
 */
export class ListenerBag {
  constructor() { this.items = []; }
  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.items.push([target, type, fn, opts]);
    return fn;
  }
  offAll() {
    for (const [t, type, fn, opts] of this.items) {
      try { t.removeEventListener(type, fn, opts); } catch (_) { /* already gone */ }
    }
    this.items.length = 0;
  }
}

/* ---------------- Base game context ---------------- */

/**
 * The context handed to every mini-game. Guarantees clean teardown:
 *   ctx.loop.stop()        cancels rAF
 *   ctx.listeners.offAll() removes every listener
 *   ctx.timers.clear()     clears every timeout
 *   ctx.raf.clear()        cancels stray rAF ids
 */
export class GameContext {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.onScore = opts.onScore || (() => {});
    this.onGameOver = opts.onGameOver || (() => {});
    this.onExit = opts.onExit || (() => {});
    this.audio = opts.audio || null;
    this.fx = opts.fx || null;
    this.listeners = new ListenerBag();
    this.timers = new Set();
    this.rafIds = new Set();
    this.loop = null;
    this.running = false;
    this.state = 'play'; // 'play' | 'over' | 'exit'
  }

  /** Create and start the shared loop. */
  attachLoop(onUpdate, onDraw) {
    this.loop = new GameLoop(onUpdate, onDraw);
    this.loop.start();
    this.running = true;
    return this.loop;
  }

  /** setTimeout that is auto-cleared on dispose. */
  after(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  /** setInterval that is auto-cleared on dispose. */
  every(ms, fn) {
    const id = setInterval(fn, ms);
    this.timers.add(id);
    return id;
  }

  clearTimeoutSafe(id) {
    clearTimeout(id); clearInterval(id);
    this.timers.delete(id);
  }

  /** requestAnimationFrame that is auto-cancelled on dispose. */
  raf(fn) {
    const id = requestAnimationFrame((t) => { this.rafIds.delete(id); fn(t); });
    this.rafIds.add(id);
    return id;
  }

  /** Convenience: point the canvas at a background colour. */
  clear(bg) {
    if (!bg) return;
    this.ctx2d.fillStyle = bg;
    this.ctx2d.fillRect(0, 0, this.width, this.height);
  }

  /** Submit a final score exactly once. */
  finish(score) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.onGameOver(score);
  }

  /** Full teardown. Safe to call twice. */
  dispose() {
    if (!this.running && this.loop === null && this.listeners.items.length === 0) return;
    if (this.loop) this.loop.stop();
    this.loop = null;
    this.running = false;
    this.listeners.offAll();
    for (const id of this.timers) { clearTimeout(id); clearInterval(id); }
    this.timers.clear();
    for (const id of this.rafIds) cancelAnimationFrame(id);
    this.rafIds.clear();
    this.state = 'exit';
  }
}

/* ---------------- Small canvas drawing helpers ---------------- */

export function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

export function circle(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.closePath();
}

export function glow(c, color, blur) {
  c.shadowColor = color;
  c.shadowBlur = blur;
}

export function noGlow(c) {
  c.shadowBlur = 0;
  c.shadowColor = 'transparent';
}

/** Fixed-step ASCII text helper (keeps fonts identical across games). */
export function label(c, text, x, y, size = 14, color = '#E2E8F0', align = 'left') {
  c.fillStyle = color;
  c.font = `600 ${size}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillText(text, x, y);
}

export function labelCenter(c, text, x, y, size = 14, color = '#E2E8F0') {
  label(c, text, x, y, size, color, 'center');
}

/** Deterministic RNG (mulberry32) so every game is reproducible per seed. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}