# GAME MODULE CONTRACT (read fully before writing a game)

Project: `/home/aiham/nexus-corp` — cyberpunk idle tycoon + 20-game arcade.
Pure ES modules, no build step, no npm deps, no external assets (no images, no audio files).

## Required file shape

```js
import { /* helpers from '../physics.js' */ } from '../physics.js';

export const id = 'gNN';
export const accent = '#RRGGBB';

export function create(ctx) {
  // ... build state, spawn, bind input, then:
  ctx.attachLoop(update, draw);
  return null;   // or { dispose() {} } if you hold something ctx can't clean
}
```

## Rules (hard requirements)

1. Call `ctx.attachLoop(update, draw)` **exactly once**. `update(dt)` gets an already-clamped `dt` (max `0.033`s) — never clamp again.
2. **Every** DOM event goes through `ctx.listeners.on(target, type, fn)`. Never call `addEventListener` yourself.
3. Timers: `ctx.after(ms, fn)`, `ctx.every(ms, fn)`, `ctx.clearTimeoutSafe(id)`. Stray frames: `ctx.raf(fn)`.
4. `ctx.onScore(score)` for the live HUD feed; `ctx.finish(score)` **exactly once** when the run ends.
5. Audio is the shared singleton and uses **direct method calls**: `ctx.audio.hit()`, `.cash()`, `.bigCash()`, `.jump()`, `.land()`, `.bounce()`, `.shoot()`, `.explode()`, `.powerup()`, `.error()`, `.levelUp()`, `.win()`, `.gameOver()`, `.perfect()`, `.tick()`, `.alarm()`, `.select()`, `.click()`, `.tap()`, `.coin()`. **Never** `ctx.audio.play('name')`. Always guard: `if (ctx.audio) ctx.audio.hit();`
6. Game space is **640 x 480** logical units for everything. `ctx.canvas.width/height` are DPR-scaled backing-store pixels, so normalise pointer input:
   ```js
   const p = pointerPos(ctx.canvas, ev);
   const gx = p.x * 640 / ctx.canvas.width;
   const gy = p.y * 480 / ctx.canvas.height;
   ```
7. Palette: bg `#090D16`, emerald `#10B981`, indigo `#6366F1`, crimson `#F43F5E`, amber `#F59E0B`, text `#E2E8F0`, muted `#64748B`. Font is the monospace family already baked into `label`.
8. Every game draws its own in-canvas HUD (score + timer and/or lives) using `label` / `labelCenter`, plus a progress bar or life pips where it fits.
9. Use `makeRng(seed)` for gameplay randomness (deterministic). Plain `Math.random()` is allowed only for cosmetic screen-shake.
10. Style: 2-space indent, `const`/`let`, arrow functions for locals, short `// ---- section ----` comments. No JSDoc blocks, no comments narrating obvious code. Match `game01_bug_squasher.js` line-for-line in density.

## physics.js API (import from `'../physics.js'`)

Constants: `MAX_DT` (0.033), `FAST_SPEED` (400), `SUB_STEPS` (4), `SUB_DT_LIMIT`.

Collision / geometry:
- `intersectAABB(a, b)` → bool, where `a = {x,y,w,h}`
- `intersectCircle(ax, ay, ar, bx, by, br)` → bool
- `intersectCircleAABB(cx, cy, r, box)` → bool
- `closestPointOnAABB(cx, cy, box)` → `{x,y}`
- `resolveCircleAABB(cx, cy, r, box)` → `{nx,ny,depth}` | null (normalises a circle out of a box; also handles a circle whose centre is inside)
- `ejectAndReflectCircleAABB(body, box, restitution = 1)` → bool (penetration ejection **then** velocity reflection)
- `reflectBodyOffAABB(body, box, restitution = 1)` → bool (AABB vs AABB)
- `clamp(v, lo, hi)`

Bounds / integration:
- `clampToBounds(body, width, height)` (AABB)
- `clampCircleToBounds(body, width, height)` (uses `body.r`; does `x = Math.max(r, Math.min(width - r, x))`)
- `clampAndBounceCircle(body, width, height, restitution = 1)`
- `needsSubStepping(body)` → true when `hypot(vx, vy) > FAST_SPEED`
- `integrate(body, dt, width, height, onStep)` → sub-step count; clamps bounds on every sub-step and calls `onStep(x, y, subDt)` per step. Use it for every fast body.

Misc:
- `SpatialHash` — `new SpatialHash(cell=64)`, `.clear()`, `.insert(item,x,y,w,h)`, `.query(x,y,w,h,out=[])`
- `pointerPos(canvas, ev)` → `{x,y}` in backing-store pixels
- `isTouchDevice()` → bool

Context: `ctx.canvas`, `ctx.ctx2d`, `ctx.width`, `ctx.height`, `ctx.audio`, `ctx.fx`, `ctx.listeners`, `ctx.timers`, `ctx.rafIds`, `ctx.loop`, `ctx.state`.

Draw helpers (call `c.beginPath`-style helpers then `fill()`/`stroke()`):
- `circle(c, x, y, r)` — builds the path
- `roundRect(c, x, y, w, h, r)` — builds the path
- `glow(c, color, blur)` / `noGlow(c)` — shadow helpers, pair them
- `label(c, text, x, y, size = 14, color = '#E2E8F0', align = 'left')`
- `labelCenter(c, text, x, y, size = 14, color = '#E2E8F0')`
- `makeRng(seed = 1)` → `() => float in [0,1)`

## Verification (required before you report back)

```bash
cd /home/aiham/nexus-corp && for f in <filenames without .js>; do
  node --input-type=module -e "import('./src/arcade/games/$f.js').then(m=>console.log('$f OK id='+m.id+' create='+typeof m.create)).catch(e=>{console.error('$f FAIL',e.message);process.exit(1)})" || exit 1
done
```
Every file must print `OK`. Also confirm your files contain no `addEventListener(`, no `ctx.audio.play(`, and no bare `setInterval(`/`setTimeout(`.