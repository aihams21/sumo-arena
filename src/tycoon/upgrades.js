/* Nexus Corp — Active (click) upgrades. Each multiplies click power. */

export const UPGRADE_GROWTH = 1.28;

export const UPGRADES = [
  { id: 'keyboard',  name: 'Better Keyboards',   icon: '⌨️', baseCost: 25,     mult: 2,   desc: 'Mechanical switches. +100% click.' },
  { id: 'monitors',  name: 'Dual Monitors',      icon: '🖥️', baseCost: 400,    mult: 3,   desc: 'Side-by-side hustle. ×3 click.' },
  { id: 'copilot',   name: 'AI Copilot',         icon: '🤖', baseCost: 12000,  mult: 5,   desc: 'It writes the boring parts. ×5 click.' },
  { id: 'fiber',     name: 'Fiber Optic Lines',  icon: '⚡', baseCost: 400000, mult: 8,   desc: 'Ping is now theoretical. ×8 click.' },
  { id: 'offshore',  name: 'Offshore Dev Team',  icon: '🌍', baseCost: 1.4e7,  mult: 12,  desc: 'Follow-the-sun commits. ×12 click.' },
  { id: 'quantumkb', name: 'Neural Keycap Matrix', icon: '🧬', baseCost: 5.5e8, mult: 20, desc: 'Your fingers outrun thought. ×20 click.' }
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

export function upgradeCost(up, level) {
  return up.baseCost * Math.pow(UPGRADE_GROWTH, level);
}

/** Aggregate click multiplier from all owned upgrades. */
export function totalClickMult(upgradeLevels) {
  let m = 1;
  for (const up of UPGRADES) {
    const lv = upgradeLevels[up.id] || 0;
    if (lv > 0) m *= Math.pow(up.mult, lv);
  }
  return m;
}