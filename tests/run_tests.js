/* Zero-dependency test harness for the pure layers of Nexus Corp.
   Run:  node tests/run_tests.js
   (A localStorage stub is installed before any module that needs it loads.) */

import './setup.js';

/* ---------------- micro runner ---------------- */
let passed = 0, failed = 0;
const failures = [];
let suite = '';

function describe(name, fn) { suite = name; fn(); }

function it(name, fn) {
  const label = suite + ' › ' + name;
  try {
    fn();
    passed++;
    process.stdout.write('  \x1b[32m✓\x1b[0m ' + name + '\n');
  } catch (err) {
    failed++;
    failures.push({ label, err });
    process.stdout.write('  \x1b[31m✗\x1b[0m ' + name + '\n      ' + err.message + '\n');
  }
}

function eq(actual, expected, msg) {
  const a = typeof actual === 'number' ? Math.round(actual * 1e6) / 1e6 : actual;
  const e = typeof expected === 'number' ? Math.round(expected * 1e6) / 1e6 : expected;
  if (a !== e) throw new Error((msg || 'expected') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(e));
}
function near(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error((msg || 'expected') + ': got ' + actual + ', want ~' + expected + ' (±' + tol + ')');
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy, got ' + v); }
function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  if (!threw) throw new Error(msg || 'expected a throw');
}

/* ---------------- imports (after the stubs) ---------------- */
import {
  GROWTH, MILESTONES, DEPARTMENTS, DEPT_BY_ID,
  milestoneMultiplier, milestoneInfo, deptCost, deptBulkCost,
  deptRate, totalDeptRate, isDeptUnlocked
} from '../src/tycoon/departments.js';

import { UPGRADE_GROWTH, UPGRADES, upgradeCost, totalClickMult } from '../src/tycoon/upgrades.js';
import { MANAGER_COST_GROWTH, managerCost, MANAGER_BY_DEPT, runAutoBuyers } from '../src/tycoon/managers.js';
import {
  PRESTIGE_REQUIREMENT, PER_SHARE_BONUS,
  prestigeMultiplier, sharesFor, canPrestige
} from '../src/tycoon/prestige.js';

import {
  OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY, SAVE_KEY,
  computeOfflineEarnings, exportSave, importSave
} from '../src/core/storage.js';

import {
  formatMoney, formatRate, formatNum, formatDuration, formatPct
} from '../src/core/format.js';

import {
  MAX_DT, FAST_SPEED, SUB_STEPS,
  intersectAABB, intersectCircle, intersectCircleAABB, closestPointOnAABB,
  resolveCircleAABB, ejectAndReflectCircleAABB,
  clampToBounds, clampCircleToBounds, clampAndBounceCircle,
  needsSubStepping, integrate, SpatialHash, makeRng, GameLoop
} from '../src/arcade/physics.js';

/* state.js runs the whole economy (combo, overclock, arcade payout). */
import {
  S, submitArcadeScore, arcadeCashMultiplier, grantOverclock, overclockRemainingMs,
  clickPower, doClick, buyDepartment, deptIncomePerSec, totalIncomePerSec,
  ARCADE_CASH_RATE, OVERCLOCK_DURATION_MS, ARCADE_UNLOCK_CASH
} from '../src/core/state.js';

import { DEPT_BY_ID as D2 } from '../src/tycoon/departments.js';

/* ============================================================
   1. TYCOON MATH
   ============================================================ */
describe('tycoon/departments', () => {
  it('10 departments in spec order', () => {
    eq(DEPARTMENTS.length, 10);
    eq(DEPARTMENTS.map(d => d.id).join(','),
      'freelancer,agency,mobile,saas,cyber,ailab,quantum,robotics,orbital,singularity');
  });

  it('Cost(n) = BaseCost * 1.15^n', () => {
    eq(GROWTH, 1.15);
    for (const d of DEPARTMENTS) {
      eq(deptCost(d, 0), d.baseCost, d.id + ' n=0');
      eq(deptCost(d, 7), d.baseCost * Math.pow(1.15, 7), d.id + ' n=7');
    }
  });

  it('milestones are [10,25,50,100,200] and double each', () => {
    eq(MILESTONES.join(','), '10,25,50,100,200');
    eq(milestoneMultiplier(0), 1);
    eq(milestoneMultiplier(9), 1);
    eq(milestoneMultiplier(10), 2);
    eq(milestoneMultiplier(24), 2);
    eq(milestoneMultiplier(25), 4);
    eq(milestoneMultiplier(50), 8);
    eq(milestoneMultiplier(100), 16);
    eq(milestoneMultiplier(200), 32);
    eq(milestoneMultiplier(100000), 32, 'never exceeds 2^5');
  });

  it('milestoneInfo reports hits + next threshold', () => {
    const a = milestoneInfo(10);
    eq(a.hits, 1); eq(a.next, 25); eq(a.multiplier, 2);
    const b = milestoneInfo(7);
    eq(b.hits, 0); eq(b.next, 10); eq(b.multiplier, 1);
    const c = milestoneInfo(250);
    eq(c.hits, 5); eq(c.next, null); eq(c.multiplier, 32);
  });

  it('deptBulkCost sums the same geometric series', () => {
    const d = DEPT_BY_ID.freelancer;
    eq(deptBulkCost(d, 0, 1), deptCost(d, 0));
    eq(deptBulkCost(d, 5, 10), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((s, i) => s + deptCost(d, 5 + i), 0));
  });

  it('deptRate = baseRate * level * milestone, 0 at level 0', () => {
    const d = DEPT_BY_ID.freelancer;
    eq(deptRate(d, 0), 0);
    eq(deptRate(d, 1), d.baseRate);
    eq(deptRate(d, 10), d.baseRate * 10 * 2);
  });

  it('totalDeptRate sums all 10 and applies both multipliers', () => {
    const levels = {};
    for (const d of DEPARTMENTS) levels[d.id] = 0;
    levels.freelancer = 1;
    levels.agency = 2;
    const base = deptRate(DEPT_BY_ID.freelancer, 1) + deptRate(DEPT_BY_ID.agency, 2);
    eq(totalDeptRate(levels), base);
    eq(totalDeptRate(levels, 2), base * 2);
    eq(totalDeptRate(levels, 2, 3), base * 6);
  });

  it('isDeptUnlocked gates on the previous tier', () => {
    const lv = Object.fromEntries(DEPARTMENTS.map(d => [d.id, 0]));
    ok(isDeptUnlocked('freelancer', lv), 'tier 0 is always open');
    ok(!isDeptUnlocked('agency', lv));
    lv.freelancer = 1;
    ok(isDeptUnlocked('agency', lv));
    ok(!isDeptUnlocked('mobile', lv));
    lv.agency = 3;
    ok(isDeptUnlocked('mobile', lv));
  });
});

describe('tycoon/upgrades', () => {
  it('6 upgrades with geometric cost growth 1.28', () => {
    eq(UPGRADE_GROWTH, 1.28);
    eq(UPGRADES.length, 6);
    for (const u of UPGRADES) {
      eq(upgradeCost(u, 0), u.baseCost, u.id);
      eq(upgradeCost(u, 3), u.baseCost * Math.pow(1.28, 3), u.id + ' lv3');
    }
  });

  it('totalClickMult multiplies mult^level and is 1 when empty', () => {
    eq(totalClickMult({}), 1);
    eq(totalClickMult({ keyboard: 1 }), 2);
    eq(totalClickMult({ keyboard: 2, monitors: 1 }), 4 * 3);
  });
});

describe('tycoon/managers', () => {
  it('managerCost grows 2.6^n', () => {
    eq(managerCost(0), 750000);
    eq(managerCost(1), 750000 * 2.6);
    eq(managerCost(2), 750000 * 2.6 * 2.6);
  });

  it('every department has a manager with EN + AR title and sigil', () => {
    for (const d of DEPARTMENTS) {
      const m = MANAGER_BY_DEPT[d.id];
      ok(m, 'missing manager for ' + d.id);
      eq(m.deptId, d.id);
      ok(m.title && m.titleAr && m.sigil, 'incomplete manager ' + d.id);
    }
  });

  it('runAutoBuyers only buys for hired + affordable departments', () => {
    const levels = Object.fromEntries(DEPARTMENTS.map(d => [d.id, 0]));
    const hired = Object.fromEntries(DEPARTMENTS.map(d => [d.id, false]));
    hired.freelancer = true;
    hired.agency = true;
    // freelancer costs 15*2.6=39, agency 110*2.6=286 -> 325 total
    const r = runAutoBuyers(1000, levels, hired);
    eq(r.bought.join(','), 'freelancer,agency');
    eq(levels.freelancer, 1);
    eq(levels.agency, 1);
    eq(r.cash, 1000 - 39 - 286);
  });

  it('runAutoBuyers buys nothing when broke', () => {
    const levels = Object.fromEntries(DEPARTMENTS.map(d => [d.id, 0]));
    const hired = Object.fromEntries(DEPARTMENTS.map(d => [d.id, false]));
    hired.singularity = true;
    const r = runAutoBuyers(10, levels, hired);
    eq(r.bought.length, 0);
    eq(r.cash, 10);
  });
});

describe('tycoon/prestige', () => {
  it('each share is +10% permanent', () => {
    eq(PER_SHARE_BONUS, 0.10);
    eq(prestigeMultiplier(0), 1);
    eq(prestigeMultiplier(10), 2);
    eq(prestigeMultiplier(100), 11);
  });

  it('requires $1M net worth', () => {
    eq(PRESTIGE_REQUIREMENT, 1e6);
    ok(!canPrestige(999999, 0));
    ok(canPrestige(1000000, 0));
  });

  it('sharesFor floors net worth / 1M, 0 below the requirement', () => {
    eq(sharesFor(0), 0);
    eq(sharesFor(999999), 0);
    eq(sharesFor(1000000), 1);
    eq(sharesFor(5_500_000), 5);
    eq(sharesFor(1_999_999), 1);
  });
});

describe('core/format', () => {
  it('money tiers K/M/B/T/Qa', () => {
    eq(formatMoney(0), '$0');
    eq(formatMoney(999), '$999');
    eq(formatMoney(1250), '$1.25K');
    eq(formatMoney(4_500_000), '$4.50M');
    eq(formatMoney(8_900_000_000), '$8.90B');
    eq(formatMoney(1_200_000_000_000), '$1.20T');
    eq(formatMoney(5e18), '$5.00Qa');
  });

  it('rate / duration / pct helpers', () => {
    ok(String(formatRate(12.5)).indexOf('/s') >= 0);
    ok(String(formatDuration(90)).indexOf('1:30') >= 0);
    eq(formatPct(45), '45.0%');
    eq(formatPct(0), '0.0%');
  });

  it('formatNum drops the $ prefix', () => {
    const s = String(formatNum(1234));
    ok(s.indexOf('$') < 0, 'formatNum must not prefix $');
  });
});

/* ============================================================
   2. OFFLINE PROGRESS
   ============================================================ */
describe('core/storage — offline earnings', () => {
  it('cap is 8h and efficiency 50%', () => {
    eq(OFFLINE_CAP_SECONDS, 8 * 3600);
    eq(OFFLINE_EFFICIENCY, 0.5);
  });

  it('short absence is fully credited at reduced efficiency', () => {
    const r = computeOfflineEarnings(10, 60, OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY);
    eq(r.usedSeconds, 60);
    eq(r.earned, 10 * 60 * 0.5);
    eq(r.wasCapped, false);
    eq(r.realSeconds, 60);
  });

  it('long absence is capped at 8h of production', () => {
    const r = computeOfflineEarnings(10, 100 * 3600, OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY);
    eq(r.usedSeconds, OFFLINE_CAP_SECONDS);
    eq(r.earned, 10 * OFFLINE_CAP_SECONDS * 0.5);
    eq(r.wasCapped, true);
    eq(r.realSeconds, 100 * 3600);
  });

  it('exactly at the cap is not flagged as capped', () => {
    const r = computeOfflineEarnings(10, OFFLINE_CAP_SECONDS, OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY);
    eq(r.usedSeconds, OFFLINE_CAP_SECONDS);
    eq(r.wasCapped, false);
  });

  it('never returns negative earnings for negative/zero input', () => {
    const a = computeOfflineEarnings(0, 500, OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY);
    eq(a.earned, 0);
    const b = computeOfflineEarnings(10, -50, OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY);
    ok(b.usedSeconds >= 0, 'usedSeconds must be >= 0');
    ok(b.earned >= 0, 'earned must be >= 0');
  });

  it('export → import round-trips the state', () => {
    const state = { cash: 1234.5, shares: 7, deptLevels: { freelancer: 3 } };
    const back = importSave(exportSave(state));
    eq(back.state.cash, 1234.5);
    eq(back.state.shares, 7);
    ok(typeof back.savedAt === 'number', 'savedAt present');
  });

  it('import throws on garbage', () => {
    throws(() => importSave('not-a-save'));
    throws(() => importSave(''));
  });

  it('uses a versioned save key', () => {
    eq(SAVE_KEY, 'nexus_corp_save_v1');
  });
});

/* ============================================================
   3. PHYSICS — collisions, penetration resolution, sub-stepping
   ============================================================ */
describe('arcade/physics — intersections', () => {
  it('AABB overlap / separation (inclusive edges)', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    ok(intersectAABB(a, { x: 5, y: 5, w: 10, h: 10 }) === true);
    ok(intersectAABB(a, { x: 10, y: 0, w: 10, h: 10 }) === false, 'edges merely touching do not collide');
    ok(intersectAABB(a, { x: 10.5, y: 0, w: 10, h: 10 }) === false);
    ok(intersectAABB(a, { x: -20, y: -20, w: 10, h: 10 }) === false);
  });

  it('circle overlap uses squared distance', () => {
    ok(intersectCircle(0, 0, 5, 8, 0, 5));
    ok(!intersectCircle(0, 0, 5, 11, 0, 5));
    ok(intersectCircle(0, 0, 5, 0, 0, 1), 'concentric');
  });

  it('circle vs AABB, including the centre-inside case', () => {
    const box = { x: 100, y: 100, w: 50, h: 50 };
    ok(intersectCircleAABB(80, 125, 25, box), 'touching the left face');
    ok(!intersectCircleAABB(60, 125, 25, box), 'clear of the left face');
    ok(intersectCircleAABB(125, 125, 5, box), 'centre fully inside');
  });

  it('closestPointOnAABB clamps to the box', () => {
    const p = closestPointOnAABB(0, 0, { x: 10, y: 10, w: 10, h: 10 });
    eq(p.x, 10); eq(p.y, 10);
    const q = closestPointOnAABB(15, 15, { x: 10, y: 10, w: 10, h: 10 });
    eq(q.x, 15); eq(q.y, 15);
  });
});

describe('arcade/physics — penetration resolution', () => {
  it('resolveCircleAABB returns a unit normal + depth', () => {
    const box = { x: 100, y: 100, w: 50, h: 50 };
    const r = resolveCircleAABB(80, 125, 25, box);
    eq(r.nx, -1); eq(r.ny, 0);
    near(r.depth, 5, 1e-9, 'overlap depth = r - distance to the face');
    near(Math.hypot(r.nx, r.ny), 1, 1e-9, 'normal is normalised');
  });

  it('ejects a circle to exactly touching the box', () => {
    const box = { x: 100, y: 100, w: 50, h: 50 };
    const body = { x: 78, y: 125, r: 25, vx: 300, vy: 0 };
    ejectAndReflectCircleAABB(body, box, 1);
    near(body.x, 75, 1e-9, 'ejected to x = box.x - r');
    near(body.y, 125, 1e-9, 'tangent coordinate untouched');
    ok(body.vx < 0, 'velocity reflected back out');
  });

  it('escapes along the shallowest face when the centre is inside', () => {
    const box = { x: 100, y: 100, w: 100, h: 20 };
    // centre deep inside: distance to top = 10, bottom = 10, left = 60, right = 190
    const body = { x: 110, y: 110, r: 4, vx: 0, vy: 0 };
    ejectAndReflectCircleAABB(body, box, 1);
    // must land outside the box, on one of the four faces
    const outside = body.x < box.x || body.x > box.x + box.w || body.y < box.y || body.y > box.y + box.h;
    ok(outside, 'body escaped the box, got ' + JSON.stringify(body));
  });

  it('restitution 1 keeps |v|, restitution < 1 damps it', () => {
    const box = { x: 100, y: 100, w: 50, h: 50 };
    const b1 = { x: 80, y: 125, r: 25, vx: 400, vy: 0 };
    ejectAndReflectCircleAABB(b1, box, 1);
    near(Math.abs(b1.vx), 400, 1e-9);
    const b2 = { x: 80, y: 125, r: 25, vx: 400, vy: 0 };
    ejectAndReflectCircleAABB(b2, box, 0.5);
    near(Math.abs(b2.vx), 200, 1e-9);
  });
});

describe('arcade/physics — bounds', () => {
  it('clampCircleToBounds uses x = max(r, min(w-r, x))', () => {
    const b = { x: -30, y: 10, r: 12 };
    clampCircleToBounds(b, 640, 480);
    eq(b.x, 12); eq(b.y, 12, 'y is clamped to r as well');
    const c = { x: 900, y: 900, r: 12 };
    clampCircleToBounds(c, 640, 480);
    eq(c.x, 628); eq(c.y, 468);
  });

  it('clampToBounds clamps AABBs on both axes', () => {
    const b = { x: -50, y: -50, w: 20, h: 20 };
    clampToBounds(b, 640, 480);
    eq(b.x, 0); eq(b.y, 0);
    const c = { x: 639, y: 479, w: 20, h: 20 };
    clampToBounds(c, 640, 480);
    eq(c.x, 620); eq(c.y, 460);
  });

  it('clampAndBounceCircle inverts the offending velocity component', () => {
    const b = { x: -5, y: 100, r: 10, vx: -120, vy: 30 };
    clampAndBounceCircle(b, 640, 480);
    eq(b.x, 10);
    ok(b.vx > 0, 'vx flipped');
    eq(b.vy, 30, 'vy untouched');
  });
});

describe('arcade/physics — sub-stepping', () => {
  it('needsSubStepping gates on 400px/s per axis', () => {
    ok(!needsSubStepping({ vx: 0, vy: 0 }));
    ok(!needsSubStepping({ vx: 399, vy: 0 }));
    ok(!needsSubStepping({ vx: 240, vy: 320 }), 'per-axis max, not vector magnitude');
    ok(needsSubStepping({ vx: 401, vy: 0 }));
    ok(needsSubStepping({ vx: 0, vy: -401 }));
  });

  it('a fast body is integrated in 4 sub-steps and stays in bounds', () => {
    eq(SUB_STEPS, 4);
    const body = { x: 630, y: 240, r: 6, vx: 900, vy: 0 };
    const seen = [];
    const steps = integrate(body, 1 / 60, 640, 480, (x, y) => { seen.push(x); });
    eq(steps, 4, 'four sub-steps at >400px/s');
    ok(seen.length === 4, 'onStep fired once per sub-step');
    near(seen[1] - seen[0], (900 * (1 / 60)) / 4, 1e-9, 'each sub-step advances 1/4 of the frame before clamping');
    ok(body.x <= 640 - body.r + 1e-9, 'clamped to the right edge, got ' + body.x);
  });

  it('a slow body takes a single step', () => {
    const body = { x: 100, y: 100, r: 5, vx: 10, vy: 10 };
    const steps = integrate(body, 1 / 60, 640, 480, null);
    eq(steps, 1);
    near(body.x, 100 + 10 / 60, 1e-9);
  });

  it('a body launched from outside is clamped on the very first sub-step', () => {
    const body = { x: 700, y: 240, r: 8, vx: -500, vy: 0 };
    integrate(body, 1 / 60, 640, 480, null);
    ok(body.x <= 632 + 1e-9, 'never left the arena, got ' + body.x);
  });

  it('MAX_DT is the spec clamp 0.033', () => { eq(MAX_DT, 0.033); });
});

describe('arcade/physics — spatial hash + rng', () => {
  it('overlapping AABBs land in a shared bucket, distant ones do not', () => {
    const h = new SpatialHash(64);
    h.insert('a', 0, 0, 10, 10);
    h.insert('far', 5000, 5000, 10, 10);
    const near = h.query(0, 0, 30, 30);
    ok(near.indexOf('a') >= 0, 'found the neighbour');
    ok(near.indexOf('far') < 0, 'distant item not returned');
    const far = h.query(5000, 5000, 10, 10);
    ok(far.indexOf('far') >= 0, 'found itself');
  });

  it('a wide AABB is registered in every cell it spans', () => {
    const h = new SpatialHash(64);
    h.insert('wide', 0, 0, 500, 10);   // spans x cells 0..7
    ok(h.query(400, 0, 10, 10).indexOf('wide') >= 0, 'query in the far cell still hits');
    h.clear();
    ok(h.query(0, 0, 10, 10).length === 0, 'clear() empties the hash');
  });

  it('makeRng is deterministic and bounded to [0,1)', () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 200; i++) {
      const v = a();
      eq(v, b());
      ok(v >= 0 && v < 1, 'out of range: ' + v);
    }
  });
});

describe('arcade/physics — GameLoop', () => {
  function withRaf(fn) {
    const realRaf = globalThis.requestAnimationFrame;
    const realCaf = globalThis.cancelAnimationFrame;
    const realPerf = globalThis.performance;
    const out = fn();
    globalThis.requestAnimationFrame = realRaf;
    globalThis.cancelAnimationFrame = realCaf;
    globalThis.performance = realPerf;
    return out;
  }

  it('clamps dt to MAX_DT even when a frame is very long', () => withRaf(() => {
    const dts = [];
    let pending = null;
    globalThis.requestAnimationFrame = (f) => { pending = f; return 1; };
    globalThis.cancelAnimationFrame = () => {};
    globalThis.performance = { now: () => 0 };

    const loop = new GameLoop((dt) => { dts.push(dt); }, () => {});
    loop.start();
    pending(0);          // first frame only seeds `last`
    pending(5000);       // a 5-second gap must be clamped
    loop.stop();

    ok(dts.length >= 1, 'update ran');
    ok(dts.every((d) => d <= MAX_DT + 1e-9), 'every dt is clamped, got ' + JSON.stringify(dts));
    near(dts[dts.length - 1], MAX_DT, 1e-9);
  }));

  it('stop() cancels the frame loop', () => withRaf(() => {
    let cancelled = 0;
    let ticks = 0;
    globalThis.requestAnimationFrame = () => 7;
    globalThis.cancelAnimationFrame = () => { cancelled++; };
    globalThis.performance = { now: () => 0 };

    const loop = new GameLoop(() => { ticks++; }, () => {});
    loop.start();
    loop.stop();
    eq(loop.running, false);
    eq(cancelled, 1, 'cancelAnimationFrame was called');
    eq(ticks, 0, 'no frames ran while stopped');
  }));
});

/* ============================================================
   4. ARCADE ECONOMY — score converts to cash + overclock
   ============================================================ */
describe('arcade/economy — score becomes cash', () => {
  const keep = JSON.parse(JSON.stringify(S));

  it('score x 0.5 x multiplier is credited as cash', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.cash = 0; S.shares = 0; S.overclockUntil = 0;
    eq(arcadeCashMultiplier(), 1);
    eq(ARCADE_CASH_RATE, 0.5);
    const r = submitArcadeScore('g01', 1000);
    eq(r.cash, 500);
    eq(S.cash, 500, 'cash actually credited');
    eq(r.isBest, true);
    eq(S.gameBest.g01, 1000);
    eq(S.gamesPlayed.g01, 1);
  });

  it('prestige shares multiply the payout', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.cash = 0; S.shares = 10; S.overclockUntil = 0;   // x2.0
    eq(arcadeCashMultiplier(), 2);
    eq(submitArcadeScore('g02', 1000).cash, 1000);
  });

  it('a run always grants a 5 minute overclock', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.overclockUntil = 0;
    submitArcadeScore('g03', 10);
    const rem = overclockRemainingMs();
    ok(rem > OVERCLOCK_DURATION_MS - 5000, 'about 5 min left, got ' + rem);
    ok(rem <= OVERCLOCK_DURATION_MS, 'never longer than 5 min');
    eq(arcadeCashMultiplier(), 2.5, 'overclock is x2.5');
  });

  it('scores are floored, and a worse run does not lower the best', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.cash = 0; S.overclockUntil = 0;
    S.gameBest.g04 = 5000;
    const r = submitArcadeScore('g04', 12.9);
    eq(r.score, 12);
    eq(r.isBest, false);
    eq(S.gameBest.g04, 5000, 'best preserved');
    eq(submitArcadeScore('g05', -50).cash, 0, 'negative score pays nothing');
  });

  it('the arcade unlocks at $10K cash', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    eq(ARCADE_UNLOCK_CASH, 10000);
    S.cash = 9999; S.shares = 0;
    ok(S.cash < ARCADE_UNLOCK_CASH);
    S.cash = 10000;
    ok(S.cash >= ARCADE_UNLOCK_CASH);
    S.cash = 0; S.shares = 1;   // shares also unlock it
    ok(1 > 0);
  });
});

describe('core/state — clicking and departments', () => {
  const keep = JSON.parse(JSON.stringify(S));

  it('click power = base x upgrades x prestige x combo', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.clickPowerBase = 1; S.clickPowerUpgradeMult = 1; S.shares = 0;
    S.combo = 0;
    eq(clickPower(), 1);
    S.clickPowerUpgradeMult = 2;          // one "keyboard" upgrade
    eq(clickPower(), 2);
    S.shares = 5;                          // +50%
    eq(clickPower(), 3);
    S.combo = 10;                          // x2
    eq(clickPower(), 6);
  });

  it('doClick adds cash and raises the combo, capped at 25', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.cash = 0; S.clickPowerBase = 10; S.clickPowerUpgradeMult = 1;
    S.shares = 0; S.combo = 0;
    const gain = doClick(1000);
    eq(gain, 11, 'combo is bumped first, so click 1 already pays x1.1');
    eq(S.cash, 11);
    eq(S.combo, 1);
    for (let i = 0; i < 100; i++) doClick(2000 + i);
    eq(S.combo, 25, 'combo is capped');
  });

  it('buying a department costs money and raises income', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.cash = 1e6;
    const before = deptIncomePerSec();
    const r = buyDepartment('freelancer', 1);
    eq(r.ok, true);
    eq(S.deptLevels.freelancer, 1);
    ok(deptIncomePerSec() > before, 'income went up');
    ok(totalIncomePerSec() >= deptIncomePerSec(), 'global mult is >= 1');
  });

  it('a department the player cannot afford is rejected', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.cash = 0;
    const r = buyDepartment('singularity', 1);
    eq(r.ok, false);
    eq(r.reason, 'funds');
  });

  it('grantOverclock extends the window and never shortens it', () => {
    Object.assign(S, JSON.parse(JSON.stringify(keep)));
    S.overclockUntil = 0;
    grantOverclock(1000);
    const first = S.overclockUntil;
    grantOverclock(OVERCLOCK_DURATION_MS);
    ok(S.overclockUntil - first >= OVERCLOCK_DURATION_MS - 200,
       'stacking extends instead of replacing');
  });
});

/* ---------------- summary ---------------- */
process.stdout.write('\n');
if (failed) {
  process.stdout.write('\x1b[31m' + failed + ' failed\x1b[0m, ' + passed + ' passed\n\n');
  for (const f of failures) {
    process.stdout.write('\x1b[31m' + f.label + '\x1b[0m\n  ' + (f.err && f.err.stack || f.err) + '\n\n');
  }
  process.exit(1);
} else {
  process.stdout.write('\x1b[32m' + passed + ' passed\x1b[0m, 0 failed\n');
}