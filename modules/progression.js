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
        getStageConfig(level, playerPowerFactor) {
            level = Math.min(this.MAX_LEVEL, Math.max(1, level));
            const isBoss = level % this.BOSS_INTERVAL === 0;
            const isMiniBoss = !isBoss && (level % this.MINI_BOSS_INTERVAL === 0);
            const p = level / this.MAX_LEVEL;              // 0..1
            const tierIdx = this.tierIndex(level);

            // Bot count: aggressive rise 1 -> 12 (steeper, sub-linear but fast)
            const botCountCurve = 1 - Math.pow(1 - p, 0.34);
            let botCount = 1 + Math.floor(11 * botCountCurve) + (tierIdx >= 3 ? Math.floor(p * 1.5) : 0);
            botCount = Math.min(12, Math.max(1, botCount));

            // Arena radius: curved descent 250 -> 140 with horizon feel
            const radiusDrop = (this.ARENA_START_RADIUS - this.ARENA_MIN_RADIUS) * Math.pow(p, 0.52);
            const arenaRadius = Math.max(this.ARENA_MIN_RADIUS, this.ARENA_START_RADIUS - radiusDrop);

            // Bot base stats (per-second speeds) — aggressively steepened
            let speedBase = 0.34 + (p * 0.72) + (tierIdx >= 3 ? 0.05 * (tierIdx - 2) : 0) + (tierIdx >= 4 ? 0.08 : 0);   // ~1.2
            let massBase = 0.85 + (p * 3.1) + Math.pow(p, 2.4) * 2.1;                                                    // ~6.5
            let powerBase = 4.0 + (p * 26.0) + Math.pow(p, 3.2) * 20;                                                    // ~50
            const aggression = Math.min(1.0, 0.35 + (level / 150) + Math.pow(p, 3) * 0.3);

            // Radius: puffy but capped (slightly larger, late-tier boost)
            const radius = 18 + (p * 14) + (tierIdx >= 2 ? 2 : 0) + (tierIdx >= 4 ? 2 : 0);

            // Scale difficulty by player's upgrade power
            const pf = Math.max(0.6, Math.min(1.6, playerPowerFactor || 1));
            massBase *= pf;
            speedBase *= Math.pow(pf, 0.3);
            powerBase *= pf;

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
         * Hazard pressure config for a non-boss stage. Scales plasma/mine count
         * with stage tier AND the player's body build (radius/mass) so stronger
         * bodies face a denser obstacle field. Values are pressure-flavoured,
         * NOT lethal — the sumo ring-out remains the win condition.
         */
        getHazardConfig(level, body = { radius: 22, mass: 1 }) {
            const p = level / this.MAX_LEVEL;
            const tierIdx = this.tierIndex(level);
            const isBoss = level % this.BOSS_INTERVAL === 0;
            const isMiniBoss = !isBoss && (level % this.MINI_BOSS_INTERVAL === 0);
            if (isBoss || isMiniBoss) return null; // hazards are reserved for swarm stages

            const tierMult = 1 + tierIdx * 0.9;
            const bodyRadius = Math.max(22, body.radius || 22);
            const bodyMass = Math.max(1, body.mass || 1);
            // Body build contribution: bigger/heavier players draw more hazards.
            const bodyBonus = (bodyRadius - 22) * 0.12 + (bodyMass - 1) * 0.9;
            const tierBase = 1 + p * 5 + Math.pow(p, 2) * 3;
            let count = Math.floor(tierBase * tierMult + bodyBonus * tierMult);
            count = Math.max(0, Math.min(14, count));

            // Mix: mines appear later, plasma sooner.
            const plasma = Math.max(0, count - Math.floor(p * 4));
            const mines = count - plasma;
            return {
                total: count,
                plasma,
                mines,
                speed: 0.6 + p * 1.4,          // per-second
                radius: 7 + p * 4,
                mineRadius: 10 + p * 4,
                tier: tierIdx
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
