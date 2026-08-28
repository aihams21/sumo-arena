(() => {
  'use strict';
  const VERSION = 2;
  const PREFIX = 'neon_sumo_';
  const defaults = { coins: 0, stage: 1, upgrades: { weight: 1, power: 1, coreDensity: 0, neonMomentum: 0, hydroPusher: 0, voidArmor: 0 }, stats: { wins: 0, losses: 0, eliminations: 0, bestScore: 0 }, achievements: [] };
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
  function readJson(key, fallback) { try { const value = JSON.parse(localStorage.getItem(PREFIX + key)); return value && typeof value === 'object' ? value : fallback; } catch (_) { return fallback; } }
  function readState() { return { ...defaults, ...readJson('state', defaults), version: VERSION }; }
  function writeState(state) { const clean = { version: VERSION, coins: number(state.coins), stage: Math.min(1000, Math.max(1, Math.floor(number(state.stage, 1)))), upgrades: { ...defaults.upgrades, ...(state.upgrades || {}) }, stats: { ...defaults.stats, ...(state.stats || {}) }, achievements: Array.isArray(state.achievements) ? [...new Set(state.achievements)] : [] }; try { localStorage.setItem(PREFIX + 'state', JSON.stringify(clean)); localStorage.setItem('sumo_coins', String(clean.coins)); localStorage.setItem('sumo_stage', String(clean.stage)); localStorage.setItem('sumo_upgrades', JSON.stringify(clean.upgrades)); return clean; } catch (_) { return null; } }
  function transaction(mutator) { const next = readState(); mutator(next); return writeState(next); }
  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.storage = { VERSION, readState, writeState, transaction, number };
})();
