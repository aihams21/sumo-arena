/**
 * Neon Sumo Arena — Enemy AI System
 * Human-like behaviors with 4 difficulty levels
 */
(function() {
    'use strict';

    // Difficulty profiles with distinct behavior
    const DIFFICULTY = {
        easy: {
            name: 'Easy',
            reactionTime: 0.8,      // seconds to react
            dodgeChance: 0.15,      // chance to dodge player charge
            flankChance: 0.1,       // chance to flank
            edgeRetreatChance: 0.2, // chance to retreat when near edge
            aggression: 0.3,        // how aggressively to chase
            mistakes: 0.35          // chance to make mistakes
        },
        medium: {
            name: 'Medium',
            reactionTime: 0.4,
            dodgeChance: 0.3,
            flankChance: 0.25,
            edgeRetreatChance: 0.4,
            aggression: 0.55,
            mistakes: 0.15
        },
        hard: {
            name: 'Hard',
            reactionTime: 0.2,
            dodgeChance: 0.5,
            flankChance: 0.45,
            edgeRetreatChance: 0.65,
            aggression: 0.8,
            mistakes: 0.05
        },
        legendary: {
            name: 'Legendary',
            reactionTime: 0.08,
            dodgeChance: 0.7,
            flankChance: 0.6,
            edgeRetreatChance: 0.85,
            aggression: 0.95,
            mistakes: 0.01
        }
    };

    // Get current difficulty from localStorage or default to medium
    function getDifficulty() {
        const saved = localStorage.getItem('neon_sumo_difficulty');
        return DIFFICULTY[saved] || DIFFICULTY.medium;
    }

    function setDifficulty(level) {
        if (DIFFICULTY[level]) {
            localStorage.setItem('neon_sumo_difficulty', level);
            return true;
        }
        return false;
    }

    // Calculate distance from arena center
    function distanceFromCenter(x, y, radius) {
        return Math.hypot(x - 400, y - 300) / radius;
    }

    /**
     * Determine bot's next action based on difficulty and game state
     * @param {object} bot - Bot object
     * @param {object} player - Player object
     * @param {number} arenaRadius - Current arena radius
     * @returns {object} - Action directive: { type: 'chase'|'dodge'|'flank'|'retreat', angle: number }
     */
    function computeBotAction(bot, player, arenaRadius) {
        const diff = getDifficulty();
        const distToPlayer = Math.hypot(player.x - bot.x, player.y - bot.y);
        const playerSpeed = Math.hypot(player.vx, player.vy);
        const distFromCenter = distanceFromCenter(bot.x, bot.y, arenaRadius);

        // Update bot's internal reaction timer if not set
        if (!bot.aiTimer) bot.aiTimer = Math.random() * diff.reactionTime;
        bot.aiTimer -= 0.016; // ~60fps decrement

        // Check if bot is ready to make a decision
        if (bot.aiTimer > 0) {
            // Return last action or default chase
            return bot.lastAction || { type: 'chase', angle: Math.atan2(player.y - bot.y, player.x - bot.x) };
        }

        // Reset timer with some randomness
        bot.aiTimer = diff.reactionTime * (0.7 + Math.random() * 0.6);

        // Make mistake check
        if (Math.random() < diff.mistakes) {
            // Bot makes a mistake - random direction
            bot.lastAction = { type: 'chase', angle: Math.atan2(player.y - bot.y, player.x - bot.x) + (Math.random() - 0.5) * 1.5 };
            return bot.lastAction;
        }

        // Edge retreat: when near the rim, try to go back to center
        if (distFromCenter > 0.75 && Math.random() < diff.edgeRetreatChance) {
            const retreatAngle = Math.atan2(300 - bot.y, 400 - bot.x);
            bot.lastAction = { type: 'retreat', angle: retreatAngle };
            return bot.lastAction;
        }

        // Dodge: if player is charging toward bot, dodge sideways
        if (playerSpeed > 4 && distToPlayer < 120 && Math.random() < diff.dodgeChance) {
            // Calculate perpendicular dodge direction
            const toPlayer = Math.atan2(player.y - bot.y, player.x - bot.x);
            const dodgeDir = Math.random() < 0.5 ? 1 : -1;
            const dodgeAngle = toPlayer + dodgeDir * Math.PI / 2.5;
            bot.lastAction = { type: 'dodge', angle: dodgeAngle };
            return bot.lastAction;
        }

        // Flank: try to get to player's side/back
        if (distToPlayer > 60 && distToPlayer < 200 && Math.random() < diff.flankChance) {
            const toPlayer = Math.atan2(player.y - bot.y, player.x - bot.x);
            // Flank from random side
            const flankAngle = toPlayer + (Math.random() < 0.5 ? Math.PI * 0.6 : -Math.PI * 0.6);
            bot.lastAction = { type: 'flank', angle: flankAngle };
            return bot.lastAction;
        }

        // Default: chase player
        const chaseAngle = Math.atan2(player.y - bot.y, player.x - bot.x);
        bot.lastAction = { type: 'chase', angle: chaseAngle };
        return bot.lastAction;
    }

    /**
     * Apply AI decision to bot velocity
     * @param {object} bot - Bot object to control
     * @param {object} player - Player object
     * @param {number} arenaRadius - Current arena radius
     * @param {number} dt - Delta time in seconds
     */
    function applyBotAI(bot, player, arenaRadius, dt) {
        if (!bot.alive || bot.isBoss) return; // Boss has its own AI

        const action = computeBotAction(bot, player, arenaRadius);
        const diff = getDifficulty();

        // Calculate target velocity based on action type and aggression
        const baseSpeed = bot.maxSpeed || bot.speed * 20;
        const targetSpeed = baseSpeed * diff.aggression;

        // Convert angle to input
        const inputX = Math.cos(action.angle);
        const inputY = Math.sin(action.angle);

        // Use physics accelerate if available
        if (window.NeonSystems?.physics?.accelerate) {
            const result = window.NeonSystems.physics.accelerate(
                inputX, inputY,
                bot.accel || 12,
                targetSpeed,
                bot.vx, bot.vy,
                dt
            );
            bot.vx = result.vx;
            bot.vy = result.vy;
        } else {
            // Fallback to simple acceleration
            bot.vx += inputX * (bot.accel || 12) * dt;
            bot.vy += inputY * (bot.accel || 12) * dt;

            // Clamp to max speed
            const spd = Math.hypot(bot.vx, bot.vy);
            if (spd > targetSpeed) {
                bot.vx = (bot.vx / spd) * targetSpeed;
                bot.vy = (bot.vy / spd) * targetSpeed;
            }
        }

        // Apply friction
        if (window.NeonSystems?.physics?.applyFriction) {
            const fricResult = window.NeonSystems.physics.applyFriction(bot.vx, bot.vy, (bot.friction || 2) * dt);
            bot.vx = fricResult.vx;
            bot.vy = fricResult.vy;
        }

        // Update facing angle
        const spd = Math.hypot(bot.vx, bot.vy);
        if (spd > 0.1) {
            const travelAngle = Math.atan2(bot.vy, bot.vx);
            if (window.NeonSystems?.physics?.rotateToward) {
                bot.faceAngle = window.NeonSystems.physics.rotateToward(
                    bot.faceAngle || 0,
                    travelAngle,
                    bot.rotationSpeed || 1.8,
                    dt
                );
            } else {
                bot.faceAngle = travelAngle;
            }
        }

        // Track player for adaptive difficulty
        bot.lastPlayerDist = Math.hypot(player.x - bot.x, player.y - bot.y);
    }

    /**
     * Track player wins for adaptive difficulty
     */
    let winStreak = 0;

    function recordWin() {
        winStreak++;
        // If player wins easily 5 times in a row, nudge difficulty up
        if (winStreak >= 5) {
            const current = localStorage.getItem('neon_sumo_difficulty') || 'medium';
            if (current === 'easy') setDifficulty('medium');
            else if (current === 'medium') setDifficulty('hard');
            winStreak = 0;
        }
    }

    function recordLoss() {
        winStreak = 0;
    }

    function getWinStreak() {
        return winStreak;
    }

    // Export AI system
    window.NeonSystems = window.NeonSystems || {};
    window.NeonSystems.ai = {
        DIFFICULTY,
        getDifficulty,
        setDifficulty,
        computeBotAction,
        applyBotAI,
        recordWin,
        recordLoss,
        getWinStreak
    };
})();