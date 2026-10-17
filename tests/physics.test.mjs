/**
 * RED-phase physics tests for Neon Sumo Arena.
 *
 * Every test names the defect in modules/game.js that it proves is real.
 * Run:  node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/* physics.js is a browser IIFE that assigns onto `window`. Load it into a
   throwaway global so we can exercise the REAL shipped file, not a copy. */
function loadPhysics() {
    const src = readFileSync(path.join(root, 'modules', 'physics.js'), 'utf8');
    const sandbox = { window: {} };
    new Function('window', src)(sandbox.window);
    return sandbox.window.NeonSystems.physics;
}

const P = loadPhysics();

/* ------------------------------------------------------------------ *
 * DEFECT 3 — separation split is a hardcoded 0.45/0.55 regardless of mass.
 * game.js:820-823.  A heavy body must move less than a light one.
 * ------------------------------------------------------------------ */
test('D3: heavier body is displaced less on contact (inverse-mass split)', () => {
    const heavy = { x: 0, y: 0, vx: 0, vy: 0, radius: 30, mass: 10 };
    const light = { x: 35, y: 0, vx: 0, vy: 0, radius: 10, mass: 1 };   // sum 40 > dist 35 => contact

    P.resolveCirclePair(heavy, light, { restitution: 0.4 });

    assert.ok(
        Math.abs(light.x - 50) > Math.abs(heavy.x - 0),
        `light body must be displaced more than the heavy one (got heavy=${heavy.x}, light=${light.x})`
    );
});

/* ------------------------------------------------------------------ *
 * DEFECT 4 — there is no restitution anywhere. Contact must bounce.
 * ------------------------------------------------------------------ */
test('D4: contacting bodies separate with a bounce (restitution > 0)', () => {
    const a = { x: 0, y: 0, vx: 10, vy: 0, radius: 20, mass: 1 };
    const b = { x: 35, y: 0, vx: -2, vy: 0, radius: 20, mass: 1 };

    P.resolveCirclePair(a, b, { restitution: 0.6 });

    assert.notEqual(a.vx, b.vx, 'bodies must exchange velocity, not just separate');
    assert.ok(a.vx < 10, `a should have slowed/reversed, got vx=${a.vx}`);
});

/* ------------------------------------------------------------------ *
 * DEFECT 4b — overlapping bodies must end the step NOT interpenetrating.
 * ------------------------------------------------------------------ */
test('D4b: after resolution the circles no longer overlap', () => {
    const a = { x: 0, y: 0, vx: 0, vy: 0, radius: 25, mass: 28 };
    const b = { x: 10, y: 0, vx: 0, vy: 0, radius: 18, mass: 1 };

    P.resolveCirclePair(a, b, { restitution: 0.3 });

    const d = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(d >= 42.9, `circles still overlap: dist=${d.toFixed(2)} needs >= 43`);
});

/* ------------------------------------------------------------------ *
 * DEFECT 7 — a mine pushed into the wall sticks (no velocity reflection).
 * game.js reflects orbs but not mines.
 * ------------------------------------------------------------------ */
test('D7: a body driven into the wall reflects velocity, not just clamps position', () => {
    // Body sits OUTSIDE the wall (dist 100 > limit 90) moving further OUT (+x).
    const body = { x: 500, y: 300, vx: 60, vy: 0, radius: 10, mass: 1 };

    P.reflectCircleFromWall(body, { x: 400, y: 300 }, 100, 0.7);

    assert.ok(body.vx < 0, `velocity must point back inward after hitting the wall, got vx=${body.vx}`);
    assert.ok(Math.hypot(body.x - 400, body.y - 300) <= 90, 'body must be left inside the wall');
});

/* ------------------------------------------------------------------ *
 * DEFECT 9 — bots have no velocity cap at all (only the player does).
 * ------------------------------------------------------------------ */
test('D9: capSpeed clamps magnitude regardless of direction', () => {
    const bot = { x: 0, y: 0, vx: 300, vy: -400, radius: 18, mass: 1 }; // speed 500

    P.capSpeed(bot, 30);

    assert.ok(Math.abs(Math.hypot(bot.vx, bot.vy) - 30) < 1e-9, `speed should be 30, got ${Math.hypot(bot.vx, bot.vy)}`);
});

/* ------------------------------------------------------------------ *
 * CORRECTION to an earlier audit claim — resolveImpulse is NOT buggy.
 * `direction.x * (force / |direction|)` is exactly `force * unit(direction)`,
 * so the normalisation cancels correctly. This test now PINS that correct
 * behaviour so a future edit cannot silently reintroduce the bug.
 * (It failed the first run only because I called it with a 2-body signature
 *  it never had — my test was wrong, not the shipped code.)
 * ------------------------------------------------------------------ */
test('D12: resolveImpulse applies force along the unit direction only', () => {
    const axis = { x: 0, y: 0, vx: 0, vy: 0, radius: 10, mass: 1 };
    P.resolveImpulse(axis, 10, { x: 1, y: 0 });
    assert.ok(Math.abs(axis.vx - 10) < 1e-9, `axis-aligned impulse should be 10, got ${axis.vx}`);

    const diag = { x: 0, y: 0, vx: 0, vy: 0, radius: 10, mass: 1 };
    P.resolveImpulse(diag, 10, { x: 3, y: 4 });   // |direction| = 5
    assert.ok(Math.abs(Math.hypot(diag.vx, diag.vy) - 10) < 1e-9,
        `impulse magnitude must stay 10 for a (3,4) direction, got ${Math.hypot(diag.vx, diag.vy)}`);

    const long = { x: 0, y: 0, vx: 0, vy: 0, radius: 10, mass: 1 };
    P.resolveImpulse(long, 10, { x: 300, y: 400 }); // |direction| = 500
    assert.ok(Math.abs(long.vx - 6) < 1e-9 && Math.abs(long.vy - 8) < 1e-9,
        `must scale with magnitude only, got (${long.vx}, ${long.vy})`);
});

/* ------------------------------------------------------------------ *
 * DEFECT 12b — damp() must be framerate-correct when given SECONDS.
 * 0.5 per-second over 1s must halve, whether applied as one 1s step
 * or many small steps.
 * ------------------------------------------------------------------ */
test('D12b: damp is framerate-correct in seconds (one big step == many small steps)', () => {
    const oneBig = { x: 0, y: 0, vx: 100, vy: 0, radius: 5, mass: 1 };
    P.damp(oneBig, 0.5, 1.0);

    const many = { x: 0, y: 0, vx: 100, vy: 0, radius: 5, mass: 1 };
    for (let i = 0; i < 100; i++) P.damp(many, 0.5, 0.01);

    assert.ok(
        Math.abs(oneBig.vx - many.vx) < 0.05,
        `damping must be timestep-independent: one 1s step=${oneBig.vx.toFixed(4)} vs 100x0.01s=${many.vx.toFixed(4)}`
    );
});

/* ------------------------------------------------------------------ *
 * DEFECT 6 — hazard push has no positional separation and no mass term,
 * so a light body is shoved exactly as hard as a heavy one.
 * ------------------------------------------------------------------ */
test('D6: hazard contact displaces a light body more than a heavy one', () => {
    const light = { x: 100, y: 0, vx: 0, vy: 0, radius: 10, mass: 1 };
    const heavy = { x: 100, y: 0, vx: 0, vy: 0, radius: 10, mass: 20 };
    const hazard = { x: 80, y: 0, vx: 0, vy: 0, radius: 12 };

    P.resolveCirclePair(light, hazard, { restitution: 0.5, push: 2.2 });
    P.resolveCirclePair(heavy, hazard, { restitution: 0.5, push: 2.2 });

    const dl = Math.abs(light.x - 100);
    const dh = Math.abs(heavy.x - 100);
    assert.ok(dl > dh, `light must move more (light=${dl.toFixed(2)}, heavy=${dh.toFixed(2)})`);
});

/* ------------------------------------------------------------------ *
 * DEFECT 2 — arenaFitScale returns < 1 for a big boss arena, but the
 * renderer draws bodies as raw x*scale (scaled about the top-left
 * origin) while drawing the ring about the canvas centre. That
 * detaches bodies from the ring. This test pins the correct mapping.
 * ------------------------------------------------------------------ */
test('D2: worldToScreen keeps the arena centre pinned under any scale', () => {
    const P2 = P;
    for (const scale of [1, 0.75, 0.5]) {
        const cx = 400, cy = 300;
        const [sx, sy] = P2.worldToScreen(400, 300, cx, cy, scale);
        assert.ok(
            Math.abs(sx - cx) < 1e-9 && Math.abs(sy - cy) < 1e-9,
            `centre must map to (${cx},${cy}) at scale=${scale}, got (${sx},${sy})`
        );
    }
});