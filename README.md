# 🥊 Neon Sumo Arena

A browser sumo ring-out arcade game. You are a glowing disc in a shrinking
arena. Every rival is a little heavier than the last one. The only way to win
a stage is to **physically push somebody out of the ring** — you can never win
by draining a health bar.

Runs from a single static folder. No build step, no bundler, no npm
dependencies.

---

## Play it

Open `index.html` in any modern browser. That is the whole install.

Or serve it locally:

```bash
node server.js          # http://localhost:8080
```

### Controls

| Input | Action |
|---|---|
| `W` `A` `S` `D` / arrow keys | Push in that direction |
| Touch joystick | Same, on a phone |
| Swipe | Dash in the swipe direction |

---

## The rules

1. **Only a ring-out counts.** A body is eliminated when its centre passes the
   arena boundary. Nothing else kills you.
2. **Mass is real.** Your mass and your rivals' mass are separate values. A
   heavy boss barely moves when you shove it; a light minion flies. Collision
   separation is inverse-mass weighted.
3. **Bosses have armour.** You cannot throw an armoured boss out. Damage breaks
   the armour first; *then* it becomes throwable. The HUD says so explicitly
   (`ARMOR BROKEN` / `PUSH OUT TO WIN`) so the win condition is never hidden.
4. **Hazards shove, they do not kill.** Plasma orbs and mines are heavy
   furniture. They push you around the arena. They have mass 40 against your
   1, so they move you, not the other way round.
5. **Restitution is real.** Bodies bounce. A body driven into the ring edge
   reflects instead of sticking to it.

## Modes

| Mode | Goal |
|---|---|
| **Stage** | Clear the stage. Boss stages end with a ring-out, not a damage race. |
| **Chaos Arena** | Outlast the swarm. |
| **Time Attack** | Score eliminations before the clock runs out. Rivals keep spawning. |
| **Shrinking Arena** | The ring closes. Last disc standing. |

## Physics

All simulation lives in [`modules/physics.js`](modules/physics.js) and is unit
tested with the Node built-in test runner — no test framework dependency:

```bash
node --test tests/physics.test.mjs
```

Velocity is stored in **world units per reference frame (60 fps)**, matching the
`n = dt * 60` timestep the game loop uses. That convention is documented in the
physics module header so damping, impulses and caps all stay consistent.

Public API: `clamp`, `resolveImpulse`, `resolveCirclePair`,
`reflectCircleFromWall`, `capSpeed`, `damp`, `dampSeconds`, `keepInside`,
`worldToScreen`.

## Leaderboard — no fake players

The board shows **real scores or nothing**. There is no hardcoded roster of
impressive-looking names. `server.js` ships with an empty store; a score only
appears after a player actually earns it. If the server is unreachable the UI
says *OFFLINE* and shows your own local profile. It never invents a rival to
fill the space.

## Layout

```
index.html            markup + three inline scripts (menus, install, matrix rain)
neon-style.css        the single source of truth for design
server.js             optional zero-dependency static server + score API
leaderboard.js        honest leaderboard: fetch real, merge local, never fabricate
account-manager.js    local name / flag / avatar
modules/
  game.js             the game: modes, bosses, ring-out, win conditions
  physics.js          collision, restitution, damping, screen anchoring
  ai.js  bosses.js  progression.js  abilities.js  achievements.js
  audio.js  particles.js  performance.js  storage.js
sw.js                 service worker (PWA install)
manifest.json
tests/physics.test.mjs
```

## Design

One accent colour. Hierarchy comes from surface elevation, not from glow.
Motion happens on state change only — the single infinite animation left is the
loading bar, which carries real information, and `prefers-reduced-motion`
disables it.

Design tokens live at the top of [`neon-style.css`](neon-style.css).

> Note: `index.html` used to carry two inline `<style>` blocks that loaded after
> the stylesheet and, via `!important`, overrode every rule in it. They are
> gone, along with 57 inline `style=""` attributes that hardcoded the old neon
> palette. Those values now exist as token-driven classes.

## License

MIT — see [LICENSE](LICENSE).