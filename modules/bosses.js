(() => {
  'use strict';

  // HP-ratio thresholds for each phase.
  const phases = Object.freeze({ calm: 1, enraged: .5, critical: .25 });

  /**
   * Boss ability metadata — name, colour, cue string and description.
   * Used by both the AI (game.js) and UI (render/HUD).
   */
  const ABILITY_META = {
    wave:       { name: 'Shock Wave',      cue: '🜂' },
    dash:       { name: 'Titan Charge',    cue: '➤' },
    minions:    { name: 'Peeler Swarm',    cue: '⌗' },
    berserk:    { name: 'Berserk Pulse',   cue: '✦' },
    voidArmor:  { name: 'Void Armor',      cue: '⬡' },
    teleport:   { name: 'Void Blink',      cue: '⟁' },
    multiWave:  { name: 'Cascade Waves',   cue: '❋' },
    grab:       { name: 'Abyss Pull',      cue: '◈' }
  };

  /**
   * Boss profile with tier tied to the progression ladder.
   * scale (0..1) lets mini-bosses use a scaled-down subset of abilities.
   */
  function profile(level, playerRadius, scale = 1) {
    const prog = window.NeonSystems?.progression;
    if (prog && typeof prog.getBossConfig === 'function') {
      const cfg = prog.getBossConfig(level, playerRadius);
      const s = Math.max(0.65, scale);
      const abilities = {};
      // Mini-bosses only inherit a subset (no teleport/grab/multiWave).
      for (const key of Object.keys(cfg.abilities)) {
        if (cfg.abilities[key]) {
          if (key === 'hasTeleport' || key === 'hasGrab' || key === 'hasMultiWave') {
            if (scale >= 1) abilities[key] = true;
          } else {
            abilities[key] = true;
          }
        }
      }
      return {
        radius: Math.max(38, cfg.radius * (0.6 + 0.4 * s)),
        mass: cfg.mass * s,
        speed: cfg.speed * (0.85 + 0.15 * s),
        power: cfg.power * (0.8 + 0.2 * s),
        maxHp: Math.max(8, Math.floor(cfg.maxHp * (0.5 + 0.5 * s))),
        shield: Math.max(2, Math.floor(cfg.shield * (0.5 + 0.5 * s))),
        tier: cfg.tier,
        tierIdx: cfg.tierIdx,
        abilities,
        isMini: scale < 1
      };
    }
    // Fallback if progression unavailable.
    const wave = Math.max(1, Math.floor(level / 5));
    const tier = Math.min(3, Math.floor(wave / 10));
    return {
      radius: Math.max(38, playerRadius * 1.38 + Math.min(6, Math.sqrt(level) * .8)),
      mass: 9 + Math.min(5, Math.sqrt(level) * .45),
      speed: .34 + Math.min(.13, Math.sqrt(level) * .011),
      power: 9.5 + Math.min(8, Math.sqrt(level) * .8),
      maxHp: 8 + Math.min(8, Math.floor(wave * .4)),
      shield: 3 + Math.min(5, Math.floor(wave * .2)),
      tier,
      abilities: { wave: true, dash: tier >= 1 },
      isMini: scale < 1
    };
  }

  function phase(hp, maxHp) {
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    return ratio <= phases.critical ? 'critical' : ratio <= phases.enraged ? 'enraged' : 'calm';
  }

  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.bosses = { phases, phase, profile, ABILITY_META };
})();
