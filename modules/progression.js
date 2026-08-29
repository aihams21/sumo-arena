(() => {
    'use strict';

    /**
     * Logical Progression System for Neon Sumo Arena
     * Smooth, monotonic difficulty across all 1000 stages with explicit
     * tier bands and a fully wired boss-ability ladder.
     */

    const Progression = {
        MAX_LEVEL: 1000,
        BOSS_INTERVAL: 10,
        MINI_BOSS_INTERVAL: 5,
        ARENA_MIN_RADIUS: 140,
        ARENA_START_RADIUS: 250,

        // Stage tier bands for behavioral tuning (not just raw stats)
        TIERS: [
            { min: 1,    name: 'Early' },
            { min: 101,  name: 'Mid'   },
            { min: 301,  name: 'Late'  },
            { min: 601,  name: 'Endgame' },
            { min: 801,  name: 'Apex' }
        ],

        tierFor(level) {
            let t = this.TIERS[0];
            for (const band of this.TIERS) if (level >= band.min) t = band;
            return t.name;
        },
        tierIndex(level) {
            let idx = 0;
            for (let i = 0; i < this.TIERS.length; i++) if (level >= this.TIERS[i].min) idx = i;
            return idx;
        },

        /**
         * Smooth difficulty curves normalized to progressRatio = level/1000.
         * All speed values are per-second (frame-rate independent).
         */
        getStageConfig(level) {
            level = Math.min(this.MAX_LEVEL, Math.max(1, level));
            const isBoss = level % this.BOSS_INTERVAL === 0;
            const isMiniBoss = !isBoss && (level % this.MINI_BOSS_INTERVAL === 0);
            const p = level / this.MAX_LEVEL;              // 0..1
            const tierIdx = this.tierIndex(level);

            // Bot count: gentle rise 1 -> 8 (1 + ~0.3/level at a decaying rate)
            let botCount = 1 + Math.floor(7 * (1 - Math.pow(1 - p, 0.45)));
            botCount = Math.min(8, Math.max(1, botCount));

            // Arena radius: curved descent 250 -> 145 with horizon feel
            const radiusDrop = (this.ARENA_START_RADIUS - this.ARENA_MIN_RADIUS) * Math.pow(p, 0.55);
            const arenaRadius = Math.max(this.ARENA_MIN_RADIUS, this.ARENA_START_RADIUS - radiusDrop);

            // Bot base stats (per-second speeds)
            const speedBase = 0.34 + (p * 0.55) + (tierIdx >= 3 ? 0.04 * (tierIdx - 2) : 0);   // 0.34 -> ~0.97
            const massBase = 0.85 + (p * 2.4) + Math.pow(p, 3) * 1.6;                            // -> ~4.85
            const powerBase = 4.0 + (p * 20.0) + Math.pow(p, 4) * 14;                            // -> ~38
            const aggression = Math.min(1.0, 0.35 + (level / 180));

            // Radius: puffy but capped
            const radius = 18 + (p * 12) + (tierIdx >= 2 ? 2 : 0);

            return {
                level,
                isBoss,
                isMiniBoss,
                tier: tierIdx,
                tierName: this.tierFor(level),
                botCount: (isBoss || isMiniBoss) ? 1 : botCount,
                arenaRadius,
                botStats: {
                    radius: Math.min(34, radius),
                    mass: massBase,
                    speed: speedBase,
                    power: powerBase,
                    aggression
                }
            };
        },

        /**
         * Boss configuration ladder — the single source of truth for bosses.
         * Returns full stats + the ability set for the given tier.
         */
        getBossConfig(level, playerRadius) {
            const p = level / this.MAX_LEVEL;
            const tier = Math.floor(level / 50); // 0..20
            const tierIdx = this.tierIndex(level);

            const hpBase = 10 + (p * 150) + Math.pow(p, 3) * 60;
            const shieldBase = 5 + (p * 90) + Math.pow(p, 4) * 40;
            const bossRadius = playerRadius * (1.25 + (p * 1.1));
            const speedBase = 0.34 + (p * 0.28) + (tierIdx >= 3 ? 0.05 : 0);
            const massBase = 10 + (p * 42);
            const powerBase = 10 + (p * 40) + Math.pow(p, 4) * 20;

            return {
                radius: Math.min(120, bossRadius),
                mass: massBase,
                speed: speedBase,
                power: powerBase,
                maxHp: Math.floor(hpBase),
                shield: Math.floor(shieldBase),
                tier,
                tierIdx,
                abilities: this.getBossAbilities(tier)
            };
        },

        /**
         * Ability ladder. Every boss has wave; higher tiers unlock distinct,
         * powerful moves that each demand a different counter.
         */
        getBossAbilities(tier) {
            return {
                hasWave: true,          // radial push (all)
                hasDash: tier >= 1,     // telegraphed charge
                hasMinions: tier >= 3,  // spawn peelers on phase gates
                hasBerserk: tier >= 5,  // surge + periodic shockwave below 50%
                hasVoidArmor: tier >= 8,// re-materializing shield + knockback resist
                hasTeleport: tier >= 12,// blink to flank behind player
                hasMultiWave: tier >= 16,// cascading multi-wave barrage
                hasGrab: tier >= 14     // reverse pressure pull
            };
        }
    };

    window.NeonSystems = window.NeonSystems || {};
    window.NeonSystems.progression = Progression;
})();
