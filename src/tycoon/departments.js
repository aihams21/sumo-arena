/* =============================================================
   NEXUS CORP — Departments
   10 corporate departments producing passive $/sec.

   Cost(n) = BaseCost * (Growth ^ n)      Growth = 1.15 (spec)
   Milestone levels [10, 25, 50, 100, 200] each grant a x2 multiplier.
   ============================================================= */

export const GROWTH = 1.15;
export const MILESTONES = [10, 25, 50, 100, 200];

export const DEPARTMENTS = [
  { id: 'freelancer', baseCost: 15,   baseRate: 0.1,   tier: 0, icon: '⌨️' },
  { id: 'agency',    baseCost: 110,  baseRate: 0.9,   tier: 1, icon: '🌐' },
  { id: 'mobile',    baseCost: 1200, baseRate: 7.5,   tier: 2, icon: '📱' },
  { id: 'saas',      baseCost: 13000,baseRate: 62,    tier: 3, icon: '☁️' },
  { id: 'cyber',     baseCost: 140000,baseRate: 520,  tier: 4, icon: '🛡️' },
  { id: 'ailab',     baseCost: 1.5e6,baseRate: 4300,  tier: 5, icon: '🧠' },
  { id: 'quantum',   baseCost: 1.8e7,baseRate: 36000, tier: 6, icon: '⚛️' },
  { id: 'robotics',  baseCost: 2.2e8,baseRate: 300000,tier: 7, icon: '🤖' },
  { id: 'orbital',   baseCost: 2.9e9,baseRate: 2.5e6, tier: 8, icon: '🛰️' },
  { id: 'singularity', baseCost: 4.2e10, baseRate: 2.1e7, tier: 9, icon: '👁️' }
];

export const DEPT_BY_ID = Object.fromEntries(DEPARTMENTS.map(d => [d.id, d]));

/**
 * Milestone multiplier for a department level.
 * Level 10 -> x2, 25 -> x3 (2x2), 50 -> x4 ... i.e. 2^hitCount.
 */
export function milestoneMultiplier(level) {
  let hits = 0;
  for (const m of MILESTONES) if (level >= m) hits++;
  return Math.pow(2, hits);
}

/** How many milestone thresholds have been crossed, and the next one. */
export function milestoneInfo(level) {
  let hits = 0;
  let next = null;
  for (const m of MILESTONES) {
    if (level >= m) hits++;
    else if (next === null) next = m;
  }
  return { hits, next, multiplier: Math.pow(2, hits) };
}

/** Cost of buying the NEXT level (n = current level). */
export function deptCost(def, level) {
  return def.baseCost * Math.pow(GROWTH, level);
}

/** Cost of buying `count` levels in one go, summed. */
export function deptBulkCost(def, level, count) {
  let total = 0;
  for (let i = 0; i < count; i++) total += def.baseCost * Math.pow(GROWTH, level + i);
  return total;
}

/** Production of a department at a given level (per second). */
export function deptRate(def, level) {
  if (level <= 0) return 0;
  return def.baseRate * level * milestoneMultiplier(level);
}

/** Sum of every department's production. Pure fn — unit tested. */
export function totalDeptRate(levels, globalMult = 1, overclockMult = 1) {
  let sum = 0;
  for (const def of DEPARTMENTS) sum += deptRate(def, levels[def.id] || 0);
  return sum * globalMult * overclockMult;
}

/**
 * A department is "visible" once the previous tier has been bought at least once,
 * so the hub doesn't dump 10 greyed cards on a fresh player.
 */
export function isDeptUnlocked(defId, levels) {
  const idx = DEPARTMENTS.findIndex(d => d.id === defId);
  if (idx <= 0) return true;
  const prev = DEPARTMENTS[idx - 1];
  return (levels[prev.id] || 0) > 0;
}