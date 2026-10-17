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
/* ------------------------------------------------------------------
 * STRICT RING-OUT (the rule the player asked for: touch the line, out).
 *
 * The old rule was "centre + body radius past the boundary", which forgave a
 * whole body-width of overlap — a fighter could lean on the rim and live.
 * These tests pin the strict, edge-based rule so it cannot silently regress
 * back to the lenient form.
 * ------------------------------------------------------------------ */
test('R1: a body fully inside the dohyo is safe', () => {
    // Centre at 400-100 with radius 25 => nearest edge sits at 225 from centre.
    assert.equal(P.isBodyOutsideRing(300, 300, 25, 240), false);
});

test('R2: edge exactly ON the line is out (half a pixel over counts)', () => {
    // radius 25, arena 240 => the edge reaches the line when the centre is 215 away.
    assert.equal(P.isBodyOutsideRing(400 - 215, 300, 25, 240), true);
});

test('R3: a single pixel past the edge is already out', () => {
    assert.equal(P.isBodyOutsideRing(400 - 216, 300, 25, 240), true);
});

test('R4: the strict rule is edge-based, not centre-based', () => {
    // The regression this guards: a body whose CENTRE is inside the ring but
    // whose EDGE is outside must die. The old lenient rule said "inside".
    const arenaRadius = 240, bodyRadius = 25;
    const centreDistance = arenaRadius - 1;         // centre still inside
    const edgeDistance = centreDistance + bodyRadius; // edge well outside
    assert.ok(edgeDistance > arenaRadius, 'fixture must have the edge past the line');
    assert.equal(
        P.isBodyOutsideRing(400 + centreDistance, 300, bodyRadius, arenaRadius),
        true,
        'edge-based rule must eliminate a body whose centre is still inside'
    );
});

test('R5: a body a tenth of a pixel inside the line is still alive', () => {
    // No epsilon slack: 0.1 px short of the line means safe. An earlier draft
    // subtracted a tolerance, which killed bodies BEFORE their edge got there.
    assert.equal(P.isBodyOutsideRing(400 - 214.9, 300, 25, 240), false);
});

test('R6: the rule is radial, not axis-aligned', () => {
    const R = 240, r = 25;
    const edge = R - r;                     // centre distance where the edge touches
    // Off the exact tangent on purpose: at a perfect 45 degrees the float
    // rounding of hypot() decides the outcome, which would make this flaky.
    // The claim under test is that the distance is RADIAL, so a diagonal point
    // must behave exactly like the same distance on the x axis.
    const diag = (d) => {
        const dx = d * Math.SQRT1_2;
        return P.isBodyOutsideRing(400 + dx, 300 + dx, r, R);
    };
    const axis = (d) => P.isBodyOutsideRing(400 + d, 300, r, R);

    assert.equal(diag(edge + 5), axis(edge + 5), 'diagonal must match x axis when outside');
    assert.equal(diag(edge - 5), axis(edge - 5), 'diagonal must match x axis when inside');
    assert.equal(diag(edge + 5), true, 'edge 5px past the line is out');
    assert.equal(diag(edge - 5), false, 'edge 5px short of the line is safe');
    // And an axis-aligned check that a bounding-box rule would get wrong:
    // at 45 degrees, |dx| alone is only d*0.707, so a naive square rule would
    // call this "inside" even though the edge is outside.
    assert.ok((edge + 5) * Math.SQRT1_2 < R, 'fixture: single axis offset is still inside R');
    assert.equal(diag(edge + 5), true);
});

/* ================================================================== *
 *  STAGE UPGRADE GATE
 *
 *  The gate is derived from the reward table rather than invented. These
 *  tests pin the two properties that matter: it must never demand more
 *  than the coins actually earned can buy (no deadlock), and it must
 *  still nags often enough to force coin grinding.
 * ================================================================== */

function stageCoinReward(clearedStage) {
    if (clearedStage % 10 === 0) return 50;
    if (clearedStage % 5 === 0) return 20;
    if (clearedStage > 500) return 15;
    if (clearedStage > 100) return 10;
    return 5;
}
function totalCoinsEarnedBeforeStage(level) {
    let earned = 0;
    for (let stage = 1; stage < level; stage++) earned += stageCoinReward(stage);
    return earned;
}
function cheapestCostForPoints(points) {
    let cost = 0, bought = 0, weightLevel = 1, powerLevel = 1;
    while (bought < points) {
        const weightCost = weightLevel * 20;
        const powerCost = powerLevel * 20;
        if (weightCost <= powerCost) { cost += weightCost; weightLevel++; }
        else { cost += powerCost; powerLevel++; }
        bought++;
    }
    return cost;
}
const marginalCost = n => cheapestCostForPoints(n) - cheapestCostForPoints(n - 1);
function requiredUpgradeForStage(level) {
    const income = totalCoinsEarnedBeforeStage(level);
    let affordable = 0;
    while (affordable < 400 && cheapestCostForPoints(affordable + 1) <= income) affordable++;
    return Math.max(0, affordable - 1);
}

/** Play the whole ladder the way a player would: buy the cheapest upgrade you can afford. */
function playThrough(lastStage = 1000) {
    let coins = 0, points = 0;
    const failures = [];
    for (let stage = 1; stage <= lastStage; stage++) {
        const required = requiredUpgradeForStage(stage);
        if (points < required) failures.push({ stage, required, points, coins });
        coins += stageCoinReward(stage);
        while (points < 400 && marginalCost(points + 1) <= coins) {
            coins -= marginalCost(points + 1);
            points++;
        }
    }
    return { failures, points, coins };
}

test('G1: the gate never deadlocks a full 1000-stage run', () => {
    const { failures } = playThrough(1000);
    assert.deepStrictEqual(failures.slice(0, 3), [],
        `gate deadlocked at ${failures.length} stages, first: ${JSON.stringify(failures[0])}`);
});

test('G2: the first stages are free so a new player is never stuck at stage 1', () => {
    assert.strictEqual(requiredUpgradeForStage(1), 0);
    assert.strictEqual(requiredUpgradeForStage(2), 0);
});

test('G3: the gate nags often enough to force coin grinding', () => {
    // At least one new upgrade point must be demanded every 25 stages across
    // the whole ladder — otherwise there is no reason to return to the shop.
    let demanded = 0;
    for (let stage = 1; stage <= 1000; stage++) {
        if (requiredUpgradeForStage(stage) > requiredUpgradeForStage(stage - 1) || stage === 1) demanded++;
    }
    assert.ok(demanded >= 40, `only ${demanded} upgrade steps across 1000 stages — too little grinding`);
});

test('G4: the gate requirement is monotonically non-decreasing', () => {
    let previous = -1;
    for (let stage = 1; stage <= 1000; stage++) {
        const required = requiredUpgradeForStage(stage);
        assert.ok(required >= previous, `stage ${stage} dropped the requirement to ${required} from ${previous}`);
        previous = required;
    }
});

test('G5: the gate keeps exactly one point of slack at the final stage', () => {
    const { points } = playThrough(1000);
    assert.strictEqual(points - requiredUpgradeForStage(1000), 1,
        'slack should be 1 so the gate never nags on the stage it was earned for');
});

/* ================================================================== *
 *  LANGUAGE TOGGLE (modules/i18n.js)
 *
 * The UI used to be one hardcoded Arabic/English mix, so neither language
 * was really available. These tests run the real module against a minimal
 * fake DOM and pin the behaviour that matters: both languages resolve,
 * switching flips the document direction, the choice survives a reload,
 * and a missing key is visible rather than blank.
 * ================================================================== */

function loadI18n({ stored = null, browserLanguage = 'en-US' } = {}) {
    const store = new Map();
    if (stored) store.set('sumo_lang', stored);
    const localStorage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key)
    };
    const makeElement = (attrs = {}) => ({
        nodeType: 1,
        attrs: { ...attrs },
        textContent: '',
        listeners: {},
        getAttribute(name) { return this.attrs[name] ?? null; },
        setAttribute(name, value) { this.attrs[name] = value; },
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    });
    const documentElement = makeElement();
    const elements = [];
    const document = {
        documentElement,
        createElement: makeElement,
        querySelectorAll(selector) {
            if (selector.includes('data-lang-toggle')) {
                return elements.filter(el => 'data-lang-toggle' in el.attrs);
            }
            return elements.filter(el => Object.keys(el.attrs).some(name =>
                name === 'data-i18n' || name.startsWith('data-i18n-')));
        }
    };
    const source = readFileSync(new URL('../modules/i18n.js', import.meta.url), 'utf8');
    const window = { document, localStorage, navigator: { language: browserLanguage } };
    new Function('window', 'localStorage', 'document', 'navigator', source)
        (window, localStorage, document, { language: browserLanguage });
    return { i18n: window.NeonSystems.i18n, document, localStorage, elements, makeElement };
}

test('I1: English is the default and resolves its own strings', () => {
    const { i18n } = loadI18n();
    assert.strictEqual(i18n.current(), 'en');
    assert.strictEqual(i18n.t('menu.title'), 'NEON SUMO ARENA');
});

test('I2: selecting Arabic returns Arabic text for every key', () => {
    const { i18n } = loadI18n();
    i18n.setLanguage('ar');
    assert.strictEqual(i18n.t('menu.title'), 'سومو الدائرة النيونية');
    assert.strictEqual(i18n.t('menu.coins'), 'العملات');
    assert.strictEqual(i18n.t('mode.chaos.sub'), '6 بوتات • نصف قطر 185');
});

test('I3: switching language flips the document direction', () => {
    const { i18n, document } = loadI18n();
    i18n.apply();
    assert.strictEqual(document.documentElement.getAttribute('dir'), 'ltr');
    i18n.setLanguage('ar');
    assert.strictEqual(document.documentElement.getAttribute('lang'), 'ar');
    assert.strictEqual(document.documentElement.getAttribute('dir'), 'rtl');
});

test('I4: the chosen language survives a reload', () => {
    const first = loadI18n();
    first.i18n.setLanguage('ar');
    const second = loadI18n({ stored: first.localStorage.getItem('sumo_lang') });
    assert.strictEqual(second.i18n.current(), 'ar');
    assert.strictEqual(second.i18n.t('menu.title'), 'سومو الدائرة النيونية');
});

test('I5: an Arabic browser picks Arabic on a first visit', () => {
    const { i18n } = loadI18n({ browserLanguage: 'ar-JO' });
    assert.strictEqual(i18n.current(), 'ar');
});

test('I6: clicking the toggle button flips both the text and the label', () => {
    const { i18n, elements, makeElement } = loadI18n();
    const heading = makeElement({ 'data-i18n': 'menu.title' });
    const toggle = makeElement({ 'data-lang-toggle': '', 'data-i18n': 'lang.toggle' });
    elements.push(heading, toggle);
    i18n.apply();
    i18n.bindToggleButtons();

    assert.strictEqual(heading.textContent, 'NEON SUMO ARENA');
    assert.strictEqual(toggle.textContent, '🌐 العربية');

    toggle.listeners.click.forEach(fn => fn({ preventDefault() {} }));
    assert.strictEqual(i18n.current(), 'ar');
    assert.strictEqual(heading.textContent, 'سومو الدائرة النيونية');
    // The toggle must name the language you would switch TO, not the current one.
    assert.strictEqual(toggle.textContent, '🌐 English');
});

test('I7: every English key has a non-empty Arabic translation', () => {
    const { i18n } = loadI18n();
    // Presence, not difference: a few strings are intentionally identical in
    // both languages (the coin emoji) or deliberately bilingual (the toggle
    // tooltip). Those are still translated — they just read the same.
    const missing = Object.keys(i18n.STRINGS.en)
        .filter(key => typeof i18n.STRINGS.ar[key] !== 'string' || !i18n.STRINGS.ar[key].trim());
    assert.deepStrictEqual(missing, [], `untranslated: ${missing.join(', ')}`);
});

test('I8: an unknown key renders visibly instead of blanking the element', () => {
    const { i18n } = loadI18n();
    assert.strictEqual(i18n.t('does.not.exist'), 'does.not.exist');
});

test('I9: an unsupported language falls back to English rather than breaking', () => {
    const { i18n } = loadI18n();
    assert.strictEqual(i18n.setLanguage('fr'), 'en');
});
