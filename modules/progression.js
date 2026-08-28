(() => {
    'use strict';

    /**
     * Logical Progression System for Neon Sumo Arena
     * Handles difficulty scaling, stage types, and arena configurations.
     */

    const Progression = {
        // Core Constants
        MAX_LEVEL: 1000,
        BOSS_INTERVAL: 10, // Boss every 10 stages for a more epic feel
        MINI_BOSS_INTERVAL: 5, // Mini-boss every 5 stages
        ARENA_MIN_RADIUS: 140,
        ARENA_START_RADIUS: 250,

        /**
         * Get configuration for a specific stage level (1 to 1000)
         */
        getStageConfig(level) {
            level = Math.min(this.MAX_LEVEL, Math.max(1, level));
            const isBoss = level % this.BOSS_INTERVAL === 0;
            const isMiniBoss = !isBoss && (level % this.MINI_BOSS_INTERVAL === 0);
            
            // 1. Bot Count - Scales from 1 to 8 over 1000 stages
            let botCount = 1 + Math.floor(Math.log2(level / 2 + 1));
            botCount = Math.min(8, botCount);
            
            // 2. Arena Radius Scaling
            // Starts at 250, drops towards 140 very gradually over 1000 levels
            // Formula: Start - (TargetDrop * (level/MaxLevel)^0.5) for a curved descent
            const radiusDrop = (this.ARENA_START_RADIUS - this.ARENA_MIN_RADIUS) * Math.pow(level / this.MAX_LEVEL, 0.6);
            const arenaRadius = Math.max(this.ARENA_MIN_RADIUS, this.ARENA_START_RADIUS - radiusDrop);

            // 3. Difficulty Multipliers (Geometric Growth)
            // We use level/1000 to normalize, then apply curves
            const progressRatio = level / this.MAX_LEVEL;
            
            // Speed: 0.28 -> 0.75
            const speedBase = 0.28 + (progressRatio * 0.47);
            
            // Mass: 0.85 -> 3.5
            const massBase = 0.85 + (progressRatio * 2.65);
            
            // Power: 4.0 -> 25.0
            const powerBase = 4.0 + (progressRatio * 21.0);

            // Aggression: 0.3 -> 1.0 (reaches max earlier)
            const aggression = Math.min(1.0, 0.3 + (level / 200));

            return {
                level,
                isBoss,
                isMiniBoss,
                botCount: (isBoss || isMiniBoss) ? 1 : botCount,
                arenaRadius,
                botStats: {
                    radius: 18 + (progressRatio * 12),
                    mass: massBase,
                    speed: speedBase,
                    power: powerBase,
                    aggression: aggression
                }
            };
        },

        /**
         * Get Boss configuration based on level
         */
        getBossConfig(level, playerRadius) {
            const progressRatio = level / this.MAX_LEVEL;
            const tier = Math.floor(level / 50); // 20 Tiers of bosses total
            
            // Scale stats based on the 1000 stage range
            const hpBase = 10 + (progressRatio * 150);
            const shieldBase = 5 + (progressRatio * 80);
            const bossRadius = playerRadius * (1.3 + (progressRatio * 1.2));
            
            return {
                radius: Math.min(110, bossRadius),
                mass: 10 + (progressRatio * 40),
                speed: 0.32 + (progressRatio * 0.25),
                power: 10 + (progressRatio * 35),
                maxHp: Math.floor(hpBase),
                shield: Math.floor(shieldBase),
                tier: tier,
                abilities: this.getBossAbilities(tier)
            };
        },

        getBossAbilities(tier) {
            return {
                hasWave: true, // All bosses have basic wave
                hasDash: tier >= 1, // From level 50
                hasMinions: tier >= 3, // From level 150
                hasBerserk: tier >= 5, // From level 250
                hasVoidArmor: tier >= 8, // From level 400
                hasTeleport: tier >= 12, // From level 600
                hasMultiWave: tier >= 16 // From level 800
            };
        }
    };

    window.NeonSystems = window.NeonSystems || {};
    window.NeonSystems.progression = Progression;
})();
