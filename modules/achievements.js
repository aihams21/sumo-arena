(() => {
  'use strict';
  const definitions = [
    { id: 'first-win', name: 'First Impact', test: stats => stats.wins >= 1 },
    { id: 'boss-breaker', name: 'Boss Breaker', test: stats => stats.bosses >= 1 },
    { id: 'combo-10', name: 'Pressure Chain', test: stats => stats.maxCombo >= 10 },
    { id: 'survivor', name: 'Ring Survivor', test: stats => stats.bestSurvival >= 60 },
    { id: 'collector', name: 'Neon Collector', test: stats => stats.skins >= 4 },
    { id: 'wave-50', name: 'Deep Runner', test: stats => stats.stage >= 50 }
  ];
  function evaluate(stats) { const state = window.NeonSystems.storage.readState(); state.stats = { ...state.stats, ...stats }; const unlocked = new Set(state.achievements); definitions.forEach(item => { if (item.test(state.stats)) unlocked.add(item.id); }); state.achievements = [...unlocked]; window.NeonSystems.storage.writeState(state); return definitions.filter(item => unlocked.has(item.id)); }
  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.achievements = { definitions, evaluate };
})();
