/* =============================================================
   NEXUS CORP — Central game state + derived math + event bus
   Single source of truth. UI reads it, tests exercise the pure fns.
   ============================================================= */

import { DEPARTMENTS, DEPT_BY_ID, deptCost, deptBulkCost, totalDeptRate, milestoneInfo, isDeptUnlocked } from '../tycoon/departments.js';
import { UPGRADES, upgradeCost, totalClickMult } from '../tycoon/upgrades.js';
import { managerCost, runAutoBuyers } from '../tycoon/managers.js';
import { prestigeMultiplier, sharesFor, canPrestige, prestigeProgress } from '../tycoon/prestige.js';
import { saveRaw, loadRaw, computeOfflineEarnings, nowMs, OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY } from './storage.js';
import { audio } from './audio.js';

export const OVERCLOCK_DURATION_MS = 5 * 60 * 1000;   // 5 minutes
export const ARCADE_UNLOCK_CASH = 10000;
export const COMBO_WINDOW_MS = 1200;
export const COMBO_MAX = 25;
export const COMBO_STEP_MS = 90;
export const ARCADE_CASH_RATE = 0.5;                  // score -> cash conversion base

/* ---------------- event bus ---------------- */
const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, payload) {
  const s = listeners.get(evt);
  if (!s) return;
  for (const fn of s) { try { fn(payload); } catch (e) { console.error('[bus]', evt, e); } }
}

/* ---------------- state ---------------- */

export function defaultState() {
  return {
    cash: 0,
    clickTotal: 0,
    deptLevels: Object.fromEntries(DEPARTMENTS.map(d => [d.id, 0])),
    upgradeLevels: Object.fromEntries(UPGRADES.map(u => [u.id, 0])),
    hired: Object.fromEntries(DEPARTMENTS.map(d => [d.id, false])),
    shares: 0,
    prestigeCount: 0,
    overclockUntil: 0,
    combo: 0,
    comboUntil: 0,
    clickPowerBase: 1,
    clickPowerUpgradeMult: 1,
    totalScoreAllTime: 0,
    gameBest: {},
    gamesPlayed: {},
    lastTick: nowMs(),
    lang: 'en',
    settings: { sfx: true, music: false },
    seenOfflineModal: false,
    createdAt: nowMs()
  };
}

export const S = loadState();

function loadState() {
  const base = defaultState();
  const saved = loadRaw();
  if (!saved) return base;
  return migrate(base, saved.state);
}

/** Shallow-merge a loaded save onto a fresh default so new fields never break. */
export function migrate(base, loaded) {
  const out = { ...base, ...(loaded && typeof loaded === 'object' ? loaded : {}) };
  out.deptLevels = { ...base.deptLevels, ...(loaded?.deptLevels || {}) };
  out.upgradeLevels = { ...base.upgradeLevels, ...(loaded?.upgradeLevels || {}) };
  out.hired = { ...base.hired, ...(loaded?.hired || {}) };
  out.settings = { ...base.settings, ...(loaded?.settings || {}) };
  out.gameBest = { ...(loaded?.gameBest || {}) };
  out.gamesPlayed = { ...(loaded?.gamesPlayed || {}) };
  out.cash = num(out.cash, 0);
  out.shares = num(out.shares, 0);
  return out;
}

function num(v, d) { const n = Number(v); return isFinite(n) ? n : d; }

/* ---------------- derived math (pure) ---------------- */

export function overclockMultiplier(ts = nowMs()) {
  return S.overclockUntil > ts ? 2.5 : 1;
}
export function overclockRemainingMs(ts = nowMs()) {
  return Math.max(0, S.overclockUntil - ts);
}

export function globalMultiplier() {
  return prestigeMultiplier(S.shares) * overclockMultiplier();
}

export function deptIncomePerSec() {
  return totalDeptRate(S.deptLevels, 1, 1);
}

export function totalIncomePerSec() {
  return deptIncomePerSec() * globalMultiplier();
}

export function netWorth() {
  return S.cash + deptIncomePerSec() * 86400 * 0.5;   // cash + 12h of production
}

export function clickPower() {
  return S.clickPowerBase * S.clickPowerUpgradeMult * prestigeMultiplier(S.shares) *
         (S.combo > 0 ? (1 + S.combo * 0.1) : 1);
}

export function arcadeCashMultiplier() {
  return prestigeMultiplier(S.shares) * overclockMultiplier();
}

export function arcadeUnlocked() {
  return S.cash >= ARCADE_UNLOCK_CASH || S.shares > 0;
}

export function prestigeReady() { return canPrestige(netWorth(), S.shares); }
export function prestigeGain() { return sharesFor(netWorth()); }
export { prestigeProgress };

/* ---------------- actions ---------------- */

let saveTimer = null;

export function addCash(amount, opts = {}) {
  const v = num(amount, 0);
  if (!v) return 0;
  S.cash += v;
  if (opts.earned) S.totalScoreAllTime += v;
  emit('cash', v);
  emit('dirty');
  return v;
}

export function doClick(nowTs = nowMs()) {
  // combo decay
  if (S.combo > 0 && nowTs > S.comboUntil) S.combo = 0;
  S.combo = Math.min(COMBO_MAX, S.combo + 1);
  S.comboUntil = nowTs + COMBO_WINDOW_MS;
  S.clickTotal++;
  const gain = clickPower();
  S.cash += gain;
  emit('cash', gain);
  emit('combo', S.combo);
  emit('click', gain);
  emit('dirty');
  scheduleSave();
  return gain;
}

export function buyDepartment(id, count = 1) {
  const def = DEPT_BY_ID[id];
  if (!def) return { ok: false, reason: 'unknown' };
  const lv = S.deptLevels[id] || 0;
  const cost = count === 1 ? deptCost(def, lv) : deptBulkCost(def, lv, count);
  if (S.cash < cost) return { ok: false, reason: 'funds', cost };
  S.cash -= cost;
  S.deptLevels[id] = lv + count;
  audio.buy();
  emit('dept', { id, level: S.deptLevels[id] });
  emit('dirty');
  scheduleSave();
  return { ok: true, cost, level: S.deptLevels[id] };
}

export function buyUpgrade(id) {
  const up = UPGRADES.find(u => u.id === id);
  if (!up) return { ok: false, reason: 'unknown' };
  const lv = S.upgradeLevels[id] || 0;
  const cost = upgradeCost(up, lv);
  if (S.cash < cost) return { ok: false, reason: 'funds', cost };
  S.cash -= cost;
  S.upgradeLevels[id] = lv + 1;
  S.clickPowerUpgradeMult = totalClickMult(S.upgradeLevels);
  audio.buy();
  emit('upgrade', { id, level: lv + 1 });
  emit('dirty');
  scheduleSave();
  return { ok: true, cost, level: lv + 1 };
}

export function hireManager(id) {
  if (!DEPT_BY_ID[id]) return { ok: false, reason: 'unknown' };
  if (S.hired[id]) return { ok: false, reason: 'already' };
  const hiredCount = Object.values(S.hired).filter(Boolean).length;
  const cost = managerCost(hiredCount);
  if (S.cash < cost) return { ok: false, reason: 'funds', cost };
  S.cash -= cost;
  S.hired[id] = true;
  audio.levelUp();
  emit('hire', { id, cost });
  emit('dirty');
  scheduleSave();
  return { ok: true, cost };
}

export function grantOverclock(ms = OVERCLOCK_DURATION_MS) {
  const t = nowMs();
  // stacking refreshes and never shortens below the current window
  S.overclockUntil = Math.max(S.overclockUntil, t) + ms;
  audio.powerup();
  emit('overclock');
  emit('dirty');
  scheduleSave();
  return S.overclockUntil - t;
}

/** Arcade result: score -> instant cash + overclock boost. */
export function submitArcadeScore(gameId, score) {
  const sc = Math.max(0, Math.floor(num(score, 0)));
  const mult = arcadeCashMultiplier();
  const cash = Math.floor(sc * ARCADE_CASH_RATE * mult);
  if (cash > 0) S.cash += cash;
  S.totalScoreAllTime += sc;
  const prev = S.gameBest[gameId] || 0;
  if (sc > prev) S.gameBest[gameId] = sc;
  S.gamesPlayed[gameId] = (S.gamesPlayed[gameId] || 0) + 1;
  grantOverclock();
  audio.bigCash();
  emit('arcadeResult', { gameId, score: sc, cash, mult });
  emit('dirty');
  scheduleSave();
  return { score: sc, cash, mult, best: Math.max(prev, sc), isBest: sc > prev };
}

export function doPrestige() {
  if (!prestigeReady()) return { ok: false, reason: 'requirement' };
  const gain = prestigeGain();
  const keep = {
    shares: S.shares + gain,
    prestigeCount: S.prestigeCount + 1,
    totalScoreAllTime: S.totalScoreAllTime,
    lang: S.lang,
    settings: { ...S.settings },
    gameBest: { ...S.gameBest },
    gamesPlayed: { ...S.gamesPlayed },
    createdAt: S.createdAt
  };
  const fresh = defaultState();
  Object.assign(S, fresh, keep);
  S.lastTick = nowMs();
  audio.prestige();
  emit('prestige', { gain, total: keep.shares });
  emit('dirty');
  saveNow();
  return { ok: true, gain, total: keep.shares };
}

/* ---------------- tick / loop ---------------- */

/**
 * Advance simulation by dt seconds. Applies passive income, auto-buyers,
 * and combo decay. Returns a small report the HUD can render.
 */
export function tick(dt, ts = nowMs()) {
  const before = S.cash;
  const income = totalIncomePerSec() * dt;
  S.cash += income;

  const ab = runAutoBuyers(S.cash, S.deptLevels, S.hired);
  S.cash = ab.cash;

  if (S.combo > 0 && ts > S.comboUntil) { S.combo = 0; emit('combo', 0); }
  if (S.overclockUntil && ts > S.overclockUntil) { S.overclockUntil = 0; emit('overclock', false); }
  S.lastTick = ts;

  if (Math.abs(S.cash - before) > 0.0001) emit('cash', S.cash - before);
  return { income, autoBought: ab.bought };
}

/* ---------------- save ---------------- */

export function saveNow() {
  return saveRaw(S);
}

export function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 1000);
}

export function startAutosave(intervalMs = 5000) {
  const id = setInterval(saveNow, intervalMs);
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });
  }
  return id;
}

/**
 * Award offline income for time spent away. Pure-ish: mutates S.cash and
 * returns the report for the "Welcome Back" modal. Null when nothing earned.
 */
export function applyOffline(savedAt, ts = nowMs()) {
  if (!savedAt || savedAt > ts) return null;
  const elapsedSeconds = (ts - savedAt) / 1000;
  if (elapsedSeconds < 5) return { elapsedSeconds, usedSeconds: 0, earned: 0, wasCapped: false };
  const rate = totalIncomePerSec();
  const report = computeOfflineEarnings(rate, elapsedSeconds, OFFLINE_CAP_SECONDS, OFFLINE_EFFICIENCY);
  // auto-buyers also get a shot at offline cash
  const ab = runAutoBuyers(report.earned, S.deptLevels, S.hired);
  S.cash += ab.cash;
  S.lastTick = ts;
  if (report.earned > 0) { audio.cash(); emit('cash', report.earned); emit('dirty'); saveNow(); }
  return { ...report, elapsedSeconds, autoBought: ab.bought };
}

/* ---------------- helpers for UI ---------------- */
export { DEPARTMENTS, DEPT_BY_ID, UPGRADES, deptCost, deptBulkCost, milestoneInfo, isDeptUnlocked, upgradeCost, managerCost, prestigeMultiplier };