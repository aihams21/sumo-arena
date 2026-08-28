(() => {
  'use strict';
  const phases = Object.freeze({ calm: .5, enraged: .25, critical: 0 });
  function profile(level, playerRadius) { const wave = Math.max(1, Math.floor(level / 5)); const tier = Math.min(3, Math.floor(wave / 10)); return { radius: Math.max(38, playerRadius * 1.38 + Math.min(6, Math.sqrt(level) * .8)), mass: 9 + Math.min(5, Math.sqrt(level) * .45), speed: .34 + Math.min(.13, Math.sqrt(level) * .011), power: 9.5 + Math.min(8, Math.sqrt(level) * .8), maxHp: 8 + Math.min(8, Math.floor(wave * .4)), shield: 3 + Math.min(5, Math.floor(wave * .2)), tier }; }
  function phase(hp, maxHp) { const ratio = maxHp > 0 ? hp / maxHp : 0; return ratio <= phases.critical ? 'critical' : ratio <= phases.enraged ? 'enraged' : 'calm'; }
  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.bosses = { phases, profile, phase };
})();
