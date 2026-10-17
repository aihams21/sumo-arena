/* ============================================================
 * ARCADE HUB  —  registry + mount/unmount lifecycle
 * ============================================================
 * GAME MODULE CONTRACT (every src/arcade/games/gameNN_*.js)
 *
 *   export const id     = 'g07';        // must match GAMES[].id
 *   export const accent = '#F43F5E';    // optional UI tint
 *   export function create(ctx) { ... } // ctx = GameContext from physics.js
 *
 * Inside `create(ctx)` the game MUST:
 *   - use ctx.attachLoop(update, draw) for its frame loop
 *   - use ctx.listeners.on(...) for every DOM event
 *   - use ctx.after()/ctx.every() for timers
 *   - use ctx.raf() for stray frames
 *   - call ctx.finish(score) when the run ends
 *
 * `create` returns an optional handle: { update?, draw?, dispose? }
 * The hub calls ctx.dispose() on exit, which cancels rAF and removes
 * every listener, then calls handle.dispose() if present.
 * ============================================================ */

import { GameContext } from './physics.js';

export const GAME_CANVAS_W = 640;
export const GAME_CANVAS_H = 480;

/** Canonical manifest — order is the arcade grid order. */
export const GAMES = [
  { id: 'g01', file: 'game01_bug_squasher.js' },
  { id: 'g02', file: 'game02_flappy_packet.js' },
  { id: 'g03', file: 'game03_brick_breaker.js' },
  { id: 'g04', file: 'game04_data_catcher.js' },
  { id: 'g05', file: 'game05_cyber_runner.js' },
  { id: 'g06', file: 'game06_silicon_snake.js' },
  { id: 'g07', file: 'game07_malware_invaders.js' },
  { id: 'g08', file: 'game08_chip_merge.js' },
  { id: 'g09', file: 'game09_executive_pong.js' },
  { id: 'g10', file: 'game10_memory_matrix.js' },
  { id: 'g11', file: 'game11_tower_stacker.js' },
  { id: 'g12', file: 'game12_asteroid_firewall.js' },
  { id: 'g13', file: 'game13_security_minesweeper.js' },
  { id: 'g14', file: 'game14_vault_lockpicker.js' },
  { id: 'g15', file: 'game15_data_frogger.js' },
  { id: 'g16', file: 'game16_orbital_dodge.js' },
  { id: 'g17', file: 'game17_stock_scalper.js' },
  { id: 'g18', file: 'game18_circuit_plumber.js' },
  { id: 'g19', file: 'game19_speed_coder.js' },
  { id: 'g20', file: 'game20_ddos_boss.js' },
];

export const GAME_IDS = GAMES.map((g) => g.id);

const modules = new Map();
const loading = new Map();

/** Import a game module once and cache it. */
export function loadGame(id) {
  if (modules.has(id)) return Promise.resolve(modules.get(id));
  if (loading.has(id)) return loading.get(id);
  const entry = GAMES.find((g) => g.id === id);
  if (!entry) return Promise.reject(new Error(`Unknown game id: ${id}`));

  const p = import(`./games/${entry.file}`)
    .then((mod) => {
      const api = mod && (mod.default && mod.default.create ? mod.default : mod);
      if (!api || typeof api.create !== 'function') {
        throw new Error(`Game ${id} (${entry.file}) does not export create(ctx)`);
      }
      modules.set(id, api);
      loading.delete(id);
      return api;
    })
    .catch((err) => {
      loading.delete(id);
      throw err;
    });

  loading.set(id, p);
  return p;
}

/** Eagerly import every game so failures surface at boot, not mid-session. */
export async function preloadAll(onProgress) {
  const out = [];
  let done = 0;
  for (const g of GAMES) {
    try {
      await loadGame(g.id);
      out.push({ id: g.id, ok: true });
    } catch (err) {
      out.push({ id: g.id, ok: false, error: String(err && err.message || err) });
    }
    done++;
    if (onProgress) onProgress(done, GAMES.length, g.id);
  }
  return out;
}

/* ---------------- Hub ---------------- */

export class ArcadeHub {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {object} o.audio        shared AudioEngine
   * @param {(score:number, gameId:string, info:object)=>void} o.onScore  live score feed
   * @param {(score:number, gameId:string)=>void}       o.onFinish final score -> tycoon
   * @param {()=>void} o.onExit
   * @param {(msg:string)=>void} o.onError
   */
  constructor(o) {
    this.canvas = o.canvas;
    this.audio = o.audio || null;
    this.fx = o.fx || null;
    this.onScore = o.onScore || (() => {});
    this.onFinish = o.onFinish || (() => {});
    this.onExit = o.onExit || (() => {});
    this.onError = o.onError || (() => {});
    this.ctx = null;
    this.handle = null;
    this.current = null;
    this.busy = false;
  }

  get activeId() { return this.current; }

  isActive() { return this.ctx !== null; }

  /** Load (if needed), size the canvas and boot the game. */
  async launch(gameId) {
    if (this.busy) return false;
    this.busy = true;
    try {
      if (this.current === gameId && this.ctx) return true;
      this.unmount();

      let api;
      try {
        api = await loadGame(gameId);
      } catch (err) {
        this.onError(String(err && err.message || err));
        return false;
      }

      this.resize();

      const ctx = new GameContext(this.canvas, {
        audio: this.audio,
        fx: this.fx,
        onScore: (score, extra) => this.onScore(score, gameId, extra),
        onGameOver: (score) => {
          if (this.ctx === ctx) {
            this.current = null;
            this.onFinish(score, gameId);
          }
        },
        onExit: () => this.exit(),
      });

      this.ctx = ctx;
      this.current = gameId;
      this.handle = api.create(ctx) || null;
      return true;
    } finally {
      this.busy = false;
    }
  }

  /** Stop the running game and release every resource it grabbed. */
  unmount() {
    const ctx = this.ctx;
    const handle = this.handle;
    this.ctx = null;
    this.handle = null;
    this.current = null;
    if (!ctx) return;
    try { ctx.dispose(); } catch (_) { /* ignore */ }
    if (handle && typeof handle.dispose === 'function') {
      try { handle.dispose(); } catch (_) { /* ignore */ }
    }
  }

  /** Game finished itself; keep the canvas but clear the hub's claim on it. */
  exit() {
    this.ctx = null;
    this.handle = null;
    this.current = null;
    this.onExit();
  }

  /** Match the canvas to its CSS box (DPR aware), keeping game space at 640x480. */
  resize() {
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.max(1, Math.round(GAME_CANVAS_W * dpr));
    c.height = Math.max(1, Math.round(GAME_CANVAS_H * dpr));
    if (rect.width) {
      const scaleX = c.width / rect.width;
      const scaleY = c.height / rect.height;
      c.__sx = scaleX;
      c.__sy = scaleY;
    }
  }

  /**
   * Scale from game space (640x480) to canvas pixels, for pointer input.
   * Games should use ctx.__px(x) / ctx.__py(y) or physics.pointerPos which
   * already accounts for the backing-store size.
   */
  px(x) { return x * (this.canvas.width / GAME_CANVAS_W); }
  py(y) { return y * (this.canvas.height / GAME_CANVAS_H); }
}