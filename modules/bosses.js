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
   * Per-tier boss palettes — distinct body colour, aura colour, accent ring
   * colour and rim accent shape. Canonical 5-tier ramp (Early→Apex).
   */
  const TIER_VISUALS = [
    { name: 'TITAN',        color: '#ff0055', aura: '#ff3366', accent: '#ff88aa', rim: 4, label: '🔥 TITAN' },
    { name: 'WARDEN',       color: '#ff8800', aura: '#ffbb00', accent: '#ffe08a', rim: 5, label: '🌀 WARDEN' },
    { name: 'VOID CASTER',  color: '#00e5ff', aura: '#22ddff', accent: '#a8f4ff', rim: 6, label: '⬡ VOID CASTER' },
    { name: 'NIGHTMARE',    color: '#cc00ff', aura: '#bb66ff', accent: '#e4b8ff', rim: 7, label: '☠ NIGHTMARE' },
    { name: 'APEX COLOSSUS',color: '#ff5533', aura: '#ff0000', accent: '#ffd0b0', rim: 8, label: '◈ APEX COLOSSUS' }
  ];

  /**
   * Choose a tier visual set. τ = floor(level/50) mapped onto the 5-tier ramp
   * so boss 10 → Early and boss 1000 → Apex with smooth interpolation.
   */
  function tierPalette(level, isMini) {
    const p = Math.min(1, Math.max(0, level / 1000));
    const idx = Math.min(TIER_VISUALS.length - 1, Math.floor(p * TIER_VISUALS.length));
    const base = TIER_VISUALS[idx];
    // Mini-bosses: desaturated variant of the same ramp.
    if (isMini) {
      return { name: base.name, color: '#dd8800', aura: '#ffcc66', accent: '#ffe9b0', rim: 4, label: '⚔ MINI ' + base.name };
    }
    return base;
  }

  /** Fallback visual if progression/bosses is unavailable. */
  function defaultBossVisual(level, tier, isMini = false) {
    return tierPalette(level || 10, isMini);
  }
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
        visual: tierPalette(level, scale < 1),
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
      visual: tierPalette(level, scale < 1),
      isMini: scale < 1
    };
  }

  function phase(hp, maxHp) {
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    return ratio <= phases.critical ? 'critical' : ratio <= phases.enraged ? 'enraged' : 'calm';
  }

  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.bosses = { phases, phase, profile, ABILITY_META, tierPalette, defaultBossVisual, TIER_VISUALS };
})();
