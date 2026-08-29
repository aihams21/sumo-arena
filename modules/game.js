/* ═══════════════════════════════════════════════════════════════════════
   NEON SUMO ARENA — GAME CORE
   Original real-sumo gameplay restored from git history (443850d):
   mass/power pushing, overlap resolution, boss AI, stage/arcade match
   loops and ring-outs. Plugs into the global state declared by index.html.

   Adaptations for the current shell (Option A):
     · hud-left is provided by index.html (status line card)
     · particles array is module-declared (shared global)
     · handleSwipe + P2P lobby share helpers retained from the shell
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

let particles = [];
let hazards = [];

const CENTER = { x: 400, y: 300 };

let _lastPhys = 0;
let bossRungOut = false;
let configHadBoss = false;

/* ---- Refined body scaling (diminishing returns) ---- */
function playerRadius() {
    return 22 + 20 * (1 - Math.exp(-(Math.max(1, upgrades.weight) - 1) / 6)) + (upgrades.coreDensity || 0) * 2.5;
}
function playerMass() {
    return 1 + 0.9 * (1 - Math.exp(-(Math.max(1, upgrades.weight) - 1) / 8)) + (upgrades.coreDensity || 0) * 0.9;
}
function playerPower() {
    return 6 + Math.min(24, (upgrades.power - 1) * 1.5) + (upgrades.coreDensity || 0) * 1.2;
}
/* Frame-rate independent damping: factor is per-reference-frame (60fps), n = frames elapsed. */
function dampStep(v, factor, n) { return v * Math.pow(Math.max(0, factor), Math.max(0, n)); }
function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Camera fit: pick a render scale so the whole arena (incl. enlarged boss
 * arenas) always fits the viewport with margin — edges never clipped/black.
 */
function arenaFitScale(canvasW, canvasH, radius) {
    if (!radius) return Math.min(canvasW / 800, canvasH / 600) || 1;
    const baseScale = Math.min((canvasW || 800) / 800, (canvasH || 600) / 600);
    const fitScale = Math.min(canvasW || 800, canvasH || 600) / (2 * (radius + 34));
    return Math.max(0.18, Math.min(baseScale, fitScale));
}

/* ---------------------------------------------------------------- *
 *  MODE / STAGE ENTRY
 * ---------------------------------------------------------------- */
function startGameMode(mode) {
    activeMode = mode;
    if (mode === 'chaos') startChaosArena();
    else if (mode === 'timeAttack') startTimeAttack();
    else startShrinkingArena();
}

function startModeBase(mode, radius) {
    gameActive = true;
    gameMode = 'offline'; activeMode = mode; stageEnded = false;
    stageReady = false;
    hideAllMenus(); document.getElementById('hud').classList.remove('hidden');
    touchBox.style.display = 'block';
    touchBox.classList.add('active');
    touchBox.style.bottom = (28 + (window.matchMedia('(max-width: 768px)').matches ? 0 : 28)) + 'px';
    player.x = 400; player.y = 300; player.vx = 0; player.vy = 0; player.alive = true;
    player.radius = playerRadius(); bots = []; particles = []; hazards = [];
    configHadBoss = false; bossRungOut = false;
    offlineArenaRadius = radius;
    modeTime = ARCADE_MODES[mode]?.duration || 0;
    modeElapsedMs = 0; modeLastTick = performance.now(); modeScore = 0;
    modeSpawnTimer = 0; modeEliminations = 0; modeRewarded = false;
    document.getElementById('hud-left').innerText = mode === 'chaos' ? '🌀 CHAOS ARENA' : mode === 'timeAttack' ? '⏱️ TIME ATTACK' : '🔻 SHRINKING ARENA';
    updateDisplays(); applyEquippedSkin();
    /* Resize canvas for the game mode */
    setTimeout(resizeCanvas, 50);
}

function startChaosArena() {
    const config = ARCADE_MODES.chaos;
    startModeBase('chaos', config.radius);
    for (let i = 0; i < config.bots; i++) addModeBot(i, config.botScale, '#ff3366');
    stageReady = bots.some(bot => bot.alive);
}

function startTimeAttack() {
    const config = ARCADE_MODES.timeAttack;
    startModeBase('timeAttack', config.radius);
    for (let i = 0; i < config.bots; i++) addModeBot(i, config.botScale, i % 2 ? '#ff3366' : '#ffaa00');
    stageReady = bots.some(bot => bot.alive);
}

function startShrinkingArena() {
    const config = ARCADE_MODES.shrinking;
    startModeBase('shrinking', config.radius);
    for (let i = 0; i < config.bots; i++) addModeBot(i, config.botScale, ['#ff0055', '#ffaa00', '#7dff00'][i]);
    stageReady = bots.some(bot => bot.alive);
}

function addModeBot(index, scale, color) {
    const angle = index * 2.399;
    bots.push({ x: 400 + Math.cos(angle) * 120, y: 300 + Math.sin(angle) * 120, vx: 0, vy: 0,
        radius: 18 + scale * 2, mass: 1 + scale * .12, speed: .48 + scale * .03, power: 5 + scale,
        color, isBoss: false, alive: true, cd: 0 });
}

function addBossMinion(boss) {
    const angle = (Math.random() * Math.PI * 2) + bots.length;
    bots.push({ x: boss.x + Math.cos(angle) * (boss.radius + 18), y: boss.y + Math.sin(angle) * (boss.radius + 18), vx: 0, vy: 0,
        radius: 16, mass: 1.08, speed: .42, power: 5.5, color: '#ffbb00', isBoss: false, alive: true, cd: 0, bossMinion: true });
}

function getActiveBoss() { return bots.find(bot => bot.isBoss && bot.alive); }

/* ---------------------------------------------------------------- *
 *  SHOP
 * ---------------------------------------------------------------- */
function showShop() {
    hideAllMenus();
    updateDisplays();
    document.getElementById('stat-weight').innerText = `Lvl ${upgrades.weight} (${100 + upgrades.weight * 20} KG)`;
    document.getElementById('stat-power').innerText = `Lvl ${upgrades.power} (${100 + upgrades.power * 25} N)`;
    document.getElementById('buy-weight').innerText = `Buy (${upgrades.weight * 20}🪙)`;
    document.getElementById('buy-power').innerText = `Buy (${upgrades.power * 20}🪙)`;
    renderBodyUpgrades();
    renderSkinShop();
    document.getElementById('menu-shop').classList.remove('hidden');
}

function renderBodyUpgrades() {
    const grid = document.getElementById('body-upgrade-grid');
    if (!grid) return;
    grid.innerHTML = bodyUpgrades.map(item => {
        const level = Number(upgrades[item.id]) || 0;
        const unlocked = maxUnlockedStage >= item.unlock;
        const cost = item.cost(level);
        return `<div class="body-upgrade-card ${unlocked ? '' : 'locked'}"><div class="body-upgrade-heading"><b>${item.icon} ${item.name}</b><strong>LVL ${level}/${item.max}</strong></div><small>${item.lore}</small><button class="shop-btn" type="button" onclick="buyBodyUpgrade('${item.id}')" ${!unlocked || level >= item.max ? 'disabled' : ''}>${level >= item.max ? 'MAXED' : unlocked ? `Upgrade ${cost}🪙` : `Unlocks at Wave ${item.unlock}`}</button></div>`;
    }).join('');
}

function buyBodyUpgrade(id) {
    const item = bodyUpgrades.find(entry => entry.id === id);
    if (!item) return;
    const level = Number(upgrades[id]) || 0;
    const cost = item.cost(level);
    if (maxUnlockedStage < item.unlock || level >= item.max || coins < cost) return;
    coins -= cost;
    upgrades[id] = level + 1;
    saveData();
    showShop();
}

function buyUpgrade(type) {
    if (type !== 'weight' && type !== 'power') return;
    const level = Number(upgrades[type]) || 1;
    const cost = level * 20;
    if (coins >= cost) {
        coins -= cost;
        upgrades[type] = level + 1;
        saveData();
        showShop();
    } else {
        alert(`الكوينز غير كافية! تحتاج ${cost} 🪙`);
    }
}

/* ---------------------------------------------------------------- *
 *  OFFLINE STAGE PROGRESSION
 * ---------------------------------------------------------------- */
function offlineEnemyCount(level) {
    if (level < 8) return 1;
    if (level < 22) return 2;
    return 3;
}

function offlineBotStats(level) {
    const curve = Math.sqrt(level);
    return {
        radius: 18 + Math.min(7, curve * 0.85),
        mass: 0.85 + Math.min(1.4, level * 0.011),
        speed: 0.30 + Math.min(0.16, curve * 0.016),
        power: 4.2 + Math.min(8.5, curve * 0.9)
    };
}

function offlineBossStats(level, playerRadius, scale = 1) {
    if (window.NeonSystems?.bosses) return window.NeonSystems.bosses.profile(level, playerRadius, scale);
    const curve = Math.sqrt(level);
    const wave = Math.max(1, Math.floor(level / 5));
    const tier = Math.min(3, Math.floor(wave / 10));
    return {
        radius: Math.max(38, playerRadius * 1.38 + Math.min(6, curve * .8)),
        mass: 9 + Math.min(5, curve * 0.45),
        speed: 0.34 + Math.min(0.13, curve * 0.011),
        power: 9.5 + Math.min(8, curve * 0.8),
        maxHp: 8 + Math.min(8, Math.floor(wave * 0.4)),
        shield: 3 + Math.min(5, Math.floor(wave * 0.2)),
        tier,
        abilities: { wave: true, dash: tier >= 1 }
    };
}

/**
 * Spawn a stage's hazard field (plasma orbs + mines) scaled by tier + body build.
 * Hazards are spatial pressure, not lethal: they bounce off the arena wall and
 * nudge bodies with dt-based knockback.
 */
function spawnHazards(level) {
    hazards = [];
    const hc = window.NeonSystems?.progression?.getHazardConfig?.(level, { radius: playerRadius(), mass: playerMass() });
    if (!hc || hc.total <= 0) return;
    const R = Math.max(offlineArenaRadius - 26, 20);
    const cx = 400, cy = 300;
    for (let i = 0; i < hc.plasma; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * Math.max(1, R - 12);
        const dir = Math.random() * Math.PI * 2;
        const spd = hc.speed * (0.7 + Math.random() * 0.8);
        hazards.push({
            type: 'plasma', alive: true,
            x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist,
            vx: Math.cos(dir) * spd, vy: Math.sin(dir) * spd,
            radius: hc.radius, pulse: Math.random() * Math.PI * 2, seed: Math.random() * 100
        });
    }
    for (let i = 0; i < hc.mines; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * Math.max(1, R - 14);
        hazards.push({
            type: 'mine', alive: true,
            x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist,
            vx: 0, vy: 0, radius: hc.mineRadius, pulse: (i / Math.max(1, hc.mines)) * Math.PI * 2,
            seed: Math.random() * 100, wobble: 2 + Math.random() * 2
        });
    }
}

function startOfflineStage(level) {
    try {
        const config = window.NeonSystems?.progression?.getStageConfig(level);
        if (!config) { console.warn('Stage config not found for level:', level); stageReady = false; showMainMenu(); return; }
        gameMode = 'offline';
        activeMode = 'stage';
        currentPlayingStage = level;
        gameActive = true;
        hideAllMenus();
        document.getElementById('hud').classList.remove('hidden');
        touchBox.style.display = 'block';
        touchBox.classList.add('active');
        stageEnded = false;
        stageReady = false;
        configHadBoss = !!(config.isBoss || config.isMiniBoss);
        bossRungOut = false;
        if (config.isBoss || config.isMiniBoss) {
            // Massive boss arena: plenty of room for tactical dodging. Always
            // derived from THIS stage's config — never from a leftover/compounding
            // value — so retries and revives get a stable, predictable arena
            // (a shifting arena was a source of out-of-nowhere ring-outs).
            offlineArenaRadius = Math.min(560, config.arenaRadius * (config.isMiniBoss ? 1.5 : 1.85));
        } else {
            offlineArenaRadius = config.arenaRadius;
        }
        player.x = 400; player.y = 300; player.vx = 0; player.vy = 0; player.alive = true;
        player.radius = playerRadius(); bots = []; particles = []; hazards = [];
        if (config.isBoss || config.isMiniBoss) {
            const isMini = !!config.isMiniBoss;
            const stats = offlineBossStats(level, player.radius, isMini ? 0.75 : 1);
            const visual = stats.visual || defaultBossVisual(level, stats.tier, isMini);
            const bossDistance = Math.max(0, Math.min(130, offlineArenaRadius - stats.radius - 12));
            bots.push({
                x: 400, y: 300 - bossDistance, vx: 0, vy: 0, radius: stats.radius, mass: stats.mass,
                speed: stats.speed, power: stats.power, color: visual.color,
                isBoss: true, isMiniBoss: isMini, visual,
                alive: true, cd: 0, slamCd: 90, phaseName: 'calm', hp: stats.maxHp, maxHp: stats.maxHp,
                shield: stats.shield, maxShield: stats.shield, shieldGap: 0, hurtCd: 0,
                broken: false, brokenFlash: 0,
                attackCd: 120, curAttack: null, cue: null, telegraph: 0, dashT: 0, dashDur: 0,
                dashVx: 0, dashVy: 0, dashDur2: 0, grabT: 0, pulseR: 0, minionCd: 320,
                pattern: null, patIdx: 0, tier: stats.tier, abilities: stats.abilities
            });
        } else {
            spawnHazards(level);
            const count = config.botCount;
            const stats = config.botStats;
            const spawnDistance = Math.max(0, Math.min(140, offlineArenaRadius - stats.radius - 12));
            for (let i = 0; i < count; i++) {
                let angle = (i / count) * Math.PI * 2 + Math.PI / 4;
                bots.push({
                    x: 400 + Math.cos(angle) * spawnDistance, y: 300 + Math.sin(angle) * spawnDistance,
                    vx: 0, vy: 0, radius: stats.radius, mass: stats.mass, speed: stats.speed,
                    power: stats.power, color: '#ffaa00', isBoss: false, alive: true, cd: 0
                });
            }
        }
        stageReady = bots.some(bot => bot.alive);
        document.getElementById('hud-left').innerText = config.isBoss ? `👑 BOSS: ${level}` : config.isMiniBoss ? `💀 MINI-BOSS: ${level}` : `STAGE: ${level}`;
        updateDisplays();
        applyEquippedSkin();
        setTimeout(resizeCanvas, 50);
    } catch (err) {
        console.error('Failed to start stage:', err);
        stageReady = false;
        showMainMenu();
    }
}

function retryStageDirectly() { startOfflineStage(currentPlayingStage); }
function nextStageOffline() { startOfflineStage(Math.min(1000, currentPlayingStage + 1)); }

function finishOfflineStage() {
    if (stageEnded) return;
    stageEnded = true;
    const clearedStage = currentPlayingStage;
    if (clearedStage >= maxUnlockedStage && maxUnlockedStage < 1000) {
        maxUnlockedStage = clearedStage + 1;
        localStorage.setItem('sumo_stage', maxUnlockedStage);
    }
    let coinReward = 5;
    if (clearedStage % 10 === 0) coinReward = 50;
    else if (clearedStage % 5 === 0) coinReward = 20;
    else if (clearedStage > 500) coinReward = 15;
    else if (clearedStage > 100) coinReward = 10;
    coins += coinReward;
    const streak = parseInt(localStorage.getItem('sumo_streak') || '0') + 1;
    localStorage.setItem('sumo_streak', streak);
    resetDailyMissionIfNeeded();
    dailyMission.wins = Math.min(3, (dailyMission.wins || 0) + 1);
    saveData();
    if (window.NeonSystems?.achievements) window.NeonSystems.achievements.evaluate({ wins: Number(localStorage.getItem('sumo_wins') || '0') + 1, bosses: clearedStage % 5 === 0 ? '1' : '0', stage: maxUnlockedStage, maxCombo: 0, bestSurvival: 0, skins: skinState.owned.length });
    hideAllMenus();
    document.getElementById('modal-win-stage').classList.remove('hidden');
}

function endArcadeMode(title, score) {
    if (modeRewarded) return;
    modeRewarded = true;
    stageEnded = true;
    const reward = Math.max(5, ARCADE_MODES[activeMode]?.reward || 5) + Math.floor(score / 10);
    coins += reward;
    const streak = parseInt(localStorage.getItem('sumo_streak') || '0') + 1;
    localStorage.setItem('sumo_streak', streak);
    resetDailyMissionIfNeeded();
    dailyMission.wins = Math.min(3, (dailyMission.wins || 0) + 1);
    saveData(); hideAllMenus();
    if (window.NeonSystems?.achievements) window.NeonSystems.achievements.evaluate({ wins: Number(localStorage.getItem('sumo_wins') || '0') + 1, bosses: 0, stage: maxUnlockedStage, maxCombo: 0, bestSurvival: 0, skins: skinState.owned.length });
    document.getElementById('round-title').innerText = title;
    document.getElementById('round-score').innerText = `${score} PTS • +${reward} 🪙`;
    document.getElementById('modal-round').classList.remove('hidden');
}

function registerPlayerDeath() {
    totalDeaths += 1;
    localStorage.setItem('sumo_total_deaths', totalDeaths);
    document.getElementById('death-count-copy').innerText = `Total ring-outs: ${totalDeaths} • ${counterLimits.revive - counters.revive} revive visits remaining`;
    updateRewardButtons();
}

function reviveInPlaceOffline() {
    gameActive = true;
    stageEnded = false;
    // Player body/build must stay FULLY intact: re-sync radius from the live
    // upgrades and re-apply the equipped skin — never a hardcoded/reset size.
    player.radius = playerRadius();
    applyEquippedSkin();
    // Drop the player safely mid-arena (never dangling at the rim where a boss
    // attack could instantly re-ring them out).
    const dropRadius = Math.max(40, offlineArenaRadius * 0.45);
    const distance = Math.hypot(reviveSnapshot.x - 400, reviveSnapshot.y - 300);
    const scale = distance > 1 ? Math.min(1, dropRadius / distance) : 1;
    player.x = 400 + (reviveSnapshot.x - 400) * scale;
    player.y = 300 + (reviveSnapshot.y - 300) * scale;
    player.vx = 0; player.vy = 0; player.alive = true;
    player.spawnGrace = 30; // brief protection so a revive can't die instantly
    hideAllMenus();
    document.getElementById('hud').classList.remove('hidden');
    touchBox.style.display = 'block';
    touchBox.classList.add('active');
    reviveSnapshot = { x: player.x, y: player.y, radius: offlineArenaRadius };
}

function spawnImpact(x, y, color) {
    const budget = mobilePerformance ? 3 : 6;
    for (let i = 0; i < budget; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = 3 + Math.random() * 4;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, a: 1, c: color });
    }
    const cap = mobilePerformance ? 45 : 120;
    if (particles.length > cap) particles.splice(0, particles.length - cap);
    if (window.NeonSystems?.audio) window.NeonSystems.audio.tone(color === '#ff0055' ? 110 : 220, .045, 'triangle');
}

function distanceToPlayer(bot) { return Math.hypot(bot.x - player.x, bot.y - player.y); }

/* ------- Boss helpers --------------------------------------------------- */
function bossPhaseInfo(bot) {
    const names = window.NeonSystems?.bosses?.phase ? window.NeonSystems.bosses.phase(bot.hp, bot.maxHp)
        : (bot.hp <= bot.maxHp * .25 ? 'critical' : bot.hp <= bot.maxHp * .5 ? 'enraged' : 'calm');
    const colors = { calm: '#ff0055', enraged: '#ff3366', critical: '#ffbb00' };
    return { phase: names, color: colors[names] || '#ff0055' };
}
function bossHas(bot, key) { return !!(bot.abilities && bot.abilities[key]); }

function spawnMinions(bot, count) {
    for (let i = 0; i < count; i++) {
        if (bots.filter(c => c.alive && c.bossMinion).length >= 3) break;
        addBossMinion(bot);
    }
    if (window.NeonSystems?.audio) window.NeonSystems.audio.tone(180, .12, 'sawtooth');
}

/* ------- Telegraph -> attack resolution ---------------------------------- */
function resolveBossAttack(bot, n, angle) {
    const abilities = bot.abilities || {};
    const phase = bossPhaseInfo(bot).phase;
    const raged = phase === 'enraged';
    const crit = phase === 'critical';
    const a = bot.curAttack;
    let hit = false;

    if (a === 'wave') {
        bot.pulseR = 14;
        if (distanceToPlayer(bot) < 190) {
            const waveForce = (crit ? 11 : raged ? 9.5 : 7.5) * n;
            player.vx += Math.cos(angle) * waveForce;
            player.vy += Math.sin(angle) * waveForce;
        }
        hit = true;
    } else if (a === 'multiWave') {
        bot.multiLeft = bot.multiLeft || 3;
        bot.multiT = 0;
        bot.pulseR = 14;
        if (distanceToPlayer(bot) < 220) {
            const force = (crit ? 12 : 9) * n;
            player.vx += Math.cos(angle) * force;
            player.vy += Math.sin(angle) * force;
        }
        hit = true;
    } else if (a === 'dash') {
        bot.dashT = n; // run for ~1 frame then integrate
        bot.dashDur = (crit ? 30 : raged ? 24 : 20);
        bot.dashVx = Math.cos(angle) * (crit ? 8.5 : raged ? 7.8 : 6.6);
        bot.dashVy = Math.sin(angle) * (crit ? 8.5 : raged ? 7.8 : 6.6);
        hit = true;
    } else if (a === 'grab') {
        if (distanceToPlayer(bot) < 250) {
            const pull = (crit ? -8.5 : -7) * n;   // pull player TOWARD boss (reverse pressure)
            player.vx += Math.cos(angle) * pull;
            player.vy += Math.sin(angle) * pull;
            bot.grabT = 40;
        }
        hit = true;
    } else if (a === 'teleport') {
        // blink to the flank behind the player (opposite the boss->player vector)
        const dist = clampNum((bot.radius + player.radius) * 1.4, 70, 150);
        const backAngle = angle + Math.PI * (Math.random() > .5 ? .7 : -.7);
        const tx = clampNum(player.x + Math.cos(backAngle) * dist, 40, 760);
        const ty = clampNum(player.y + Math.sin(backAngle) * dist, 40, 560);
        if (Math.hypot(tx - CENTER.x, ty - CENTER.y) < offlineArenaRadius - bot.radius - 10) {
            bot.x = tx; bot.y = ty; bot.vx = 0; bot.vy = 0;
            spawnImpact(bot.x, bot.y, '#cc00ff');
            bot.dashDur2 = 24; bot.dashVx = Math.cos(angle) * 6; bot.dashVy = Math.sin(angle) * 6;
        }
        hit = true;
    } else if (a === 'berserk') {
        bot.pulseR = 14; // shockwave pulse
        if (distanceToPlayer(bot) < 240) {
            const force = (crit ? 10.5 : 8.5) * n;
            player.vx += Math.cos(angle) * force;
            player.vy += Math.sin(angle) * force;
        }
        hit = true;
    }

    if (a === 'multiWave' && (bot.multiLeft || 0) > 0) {
        bot.multiLeft -= 1;
        bot.curAttack = 'multiWave';
        bot.telegraph = 46; // quick re-telegraph for next cascade
        if (bot.multiLeft <= 0) {
            bot.curAttack = null;
            bot.attackCd = bossCooldown(bot, phase);
        }
    } else if (hit) {
        bot.curAttack = null;
        bot.attackCd = bossCooldown(bot, phase);
    }

    bot.telegraph = 0;
}

function bossCooldown(bot, phase) {
    const base = phase === 'critical' ? 78 : phase === 'enraged' ? 96 : 124;
    return Math.max(60, base - (bot.tier || 0) * 6 + Math.floor(Math.random() * 20));
}

function bossPickAttack(bot) {
    const abilities = bot.abilities || {};
    const phase = bossPhaseInfo(bot).phase;
    const pool = ['wave'];
    if (abilities.hasDash) pool.push('dash');
    if (abilities.hasGrab) pool.push('grab');
    if (abilities.hasTeleport) pool.push('teleport');
    if (abilities.hasMultiWave) pool.push('multiWave');
    if (abilities.hasBerserk && phase !== 'calm') pool.push('berserk');
    // deterministic rotation to avoid repeats
    if (!bot.pattern || bot.patIdx >= bot.pattern.length) {
        // shuffle a fresh copy but always lead with a "wave-family" attack
        const copy = pool.slice();
        for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
        bot.pattern = copy; bot.patIdx = 0;
    }
    return bot.pattern[bot.patIdx++];
}

/* ---------------------------------------------------------------- *
 *  REAL SUMO PHYSICS — updatePhysics()  (frame-rate independent / dt)
 * ---------------------------------------------------------------- */
function updatePhysics() {
    if (gameMode === 'none') { gameActive = false; return; }
    if (!gameActive) { touchBox.style.display = 'none'; touchBox.classList.remove('active'); return; }

    const _now = performance.now();
    let _dtms = _now - (_lastPhys || _now);
    _lastPhys = _now;
    if (_dtms <= 0) _dtms = 16;
    const dt = Math.min(0.1, _dtms / 1000);
    const n = dt * 60; // reference frames elapsed this tick (60fps reference)

    // dt-based particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * n; p.y += p.vy * n;
        p.vx = dampStep(p.vx, 0.9, n); p.vy = dampStep(p.vy, 0.9, n);
        p.a -= 0.06 * n;
        if (p.a <= 0 || p.x < -50 || p.x > 850 || p.y < -50 || p.y > 650) particles.splice(i, 1);
    }

    // dt-based hazards (plasma orbs + pulsing mines) — spatial pressure only.
    if (hazards.length) {
        const hub = 400;
        const hud = 300;
        const hR = clampNum(offlineArenaRadius * 0.96, 40, 900);
        for (let i = hazards.length - 1; i >= 0; i--) {
            const hz = hazards[i];
            if (!hz.alive) { hazards.splice(i, 1); continue; }
            hz.pulse += 0.06 * n;
            if (hz.type === 'plasma') {
                hz.x += hz.vx * n; hz.y += hz.vy * n;
                const d = Math.hypot(hz.x - hub, hz.y - hud);
                if (d > hR - hz.radius) {
                    // reflect off the wall
                    const nx = (hz.x - hub) / d, ny = (hz.y - hud) / d;
                    hz.x = hub + nx * (hR - hz.radius);
                    hz.y = hud + ny * (hR - hz.radius);
                    const dot = hz.vx * nx + hz.vy * ny;
                    hz.vx -= 2 * dot * nx; hz.vy -= 2 * dot * ny;
                    hz.vx = dampStep(hz.vx, 0.985, n); hz.vy = dampStep(hz.vy, 0.985, n);
                }
            } else {
                // mine: subtle radial wobble
                hz.x += Math.cos(hz.pulse / hz.wobble) * 0.12 * n;
                hz.y += Math.sin(hz.pulse / hz.wobble) * 0.12 * n;
                const dm = Math.hypot(hz.x - hub, hz.y - hud);
                if (dm > hR - hz.radius) {
                    const nx = (hz.x - hub) / dm, ny = (hz.y - hud) / dm;
                    hz.x = hub + nx * (hR - hz.radius);
                    hz.y = hud + ny * (hR - hz.radius);
                }
            }
            // Hazard ↔ bodies: mild nudge, never lethal on its own.
            const targets = [];
            if (player.alive && !stageEnded && gameMode === 'offline') targets.push(player);
            for (const b of bots) if (b.alive) targets.push(b);
            for (const t of targets) {
                const ex = t.x - hz.x, ey = t.y - hz.y;
                const rr = hz.radius + t.radius;
                const dist = Math.hypot(ex, ey);
                if (dist < rr && dist > 0.001) {
                    const nx = ex / dist, ny = ey / dist;
                    const push = hz.type === 'mine' ? 1.4 : 2.2;
                    const k = 1 - rr / (rr + Math.max(0, 16 - hz.radius)) * 0.5;
                    t.vx += nx * push * k * n;
                    t.vy += ny * push * k * n;
                }
            }
        }
    }

    let dx = 0, dy = 0;
    if (keys['arrowup'] || keys['w']) dy -= 1;
    if (keys['arrowdown'] || keys['s']) dy += 1;
    if (keys['arrowleft'] || keys['a']) dx -= 1;
    if (keys['arrowright'] || keys['d']) dx += 1;
    if (touchVec.x || touchVec.y) { dx = touchVec.x; dy = touchVec.y; }
    let magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }

    if (gameMode === 'offline' && player.alive && !stageEnded) {
        const now = performance.now();
        const deltaSeconds = Math.min(0.1, Math.max(0, (now - modeLastTick) / 1000));
        modeLastTick = now;
        if (activeMode === 'timeAttack') {
            modeElapsedMs += deltaSeconds * 1000;
            modeTime = Math.max(0, ARCADE_MODES.timeAttack.duration - modeElapsedMs / 1000);
            if (modeTime <= 0) { endArcadeMode('TIME UP', modeScore); return; }
            modeSpawnTimer += deltaSeconds;
            if (modeSpawnTimer >= ARCADE_MODES.timeAttack.spawnEvery) {
                modeSpawnTimer = 0;
                addModeBot(bots.length, 1, Math.random() > .5 ? '#ffaa00' : '#ff3366');
            }
            document.getElementById('hud-left').innerText = `⏱️ ${Math.ceil(modeTime)}s • ${modeScore} PTS`;
        } else if (activeMode === 'shrinking') {
            modeElapsedMs += deltaSeconds * 1000;
            offlineArenaRadius = Math.max(ARCADE_MODES.shrinking.minRadius, offlineArenaRadius - ARCADE_MODES.shrinking.shrinkPerSecond * deltaSeconds);
            document.getElementById('hud-left').innerText = `🔻 RADIUS ${Math.round(offlineArenaRadius)}`;
        }

        // —— Player movement (dt-normalized) ——
        const momentum = (1.6 + upgrades.neonMomentum * 0.12) * n;
        player.vx += dx * momentum; player.vy += dy * momentum;
        // Post-revive spawn grace: brief knockback resistance + no ring-out so
        // a freshly revived player is never instantly re-flung out of the arena.
        if ((player.spawnGrace || 0) > 0) {
            player.spawnGrace -= n;
            player.vx *= 0.55; player.vy *= 0.55;
        }
        const recovery = Math.max(0.82, 0.88 - upgrades.hydroPusher * 0.015);
        player.vx = dampStep(player.vx, 0.88, n); player.vy = dampStep(player.vy, 0.88, n);
        player.vx = dampStep(player.vx, recovery, n); player.vy = dampStep(player.vy, recovery, n);
        // Velocity cap: a single frame can never launch the player across the
        // arena (stacked boss knockback on a high-dt/lag frame previously killed
        // from mid-arena in one frame — the "death out of nowhere").
        const pSpd = Math.hypot(player.vx, player.vy);
        if (pSpd > 30) { player.vx = (player.vx / pSpd) * 30; player.vy = (player.vy / pSpd) * 30; }
        player.x += player.vx * n; player.y += player.vy * n;
        // Legitimate ring-out ONLY: the player dies when their whole body has
        // been pushed past the arena bounds (center + radius beyond the line).
        // A single clipped frame right at the rim never counts as a death.
        if (Math.hypot(player.x - 400, player.y - 300) > offlineArenaRadius + player.radius && !((player.spawnGrace || 0) > 0)) {
            reviveSnapshot = { x: player.x, y: player.y, radius: offlineArenaRadius };
            player.alive = false; stageEnded = true;
            registerPlayerDeath();
            hideAllMenus();
            document.getElementById('modal-death').classList.remove('hidden');
            return;
        }

        // —— Bot / Boss update loop ——
        let active = bots.filter(bot => bot.alive);

        for (let bot of active) {
            const angle = Math.atan2(player.y - bot.y, player.x - bot.x);
            bot.cd = (bot.cd || 0) + n;
            if (bot.hurtCd && bot.hurtCd > 0) bot.hurtCd -= n;
            const selfPower = playerPower();
            const selfMass = playerMass();

            if (bot.isBoss) {
                // ---- Phase state machine ----
                const info = bossPhaseInfo(bot);
                if (info.phase !== bot.phaseName) {
                    const was = bot.phaseName;
                    bot.phaseName = info.phase;
                    bot.color = info.color;
                    bot.phaseFlash = 30;
                    spawnImpact(bot.x, bot.y, info.color);
                    if (info.phase === 'enraged' || info.phase === 'critical') {
                        bot.attackCd = 0;                       // immediate next attack
                        if (info.phase === 'critical') {
                            if (bossHas(bot, 'voidArmor') && !bot.broken) bot.shield = bot.maxShield;
                            if (bossHas(bot, 'minions')) spawnMinions(bot, 2);
                        } else if (was === 'calm' && bossHas(bot, 'berserk')) {
                            // berserk opener pulse
                            bot.pulseR = 14;
                            if (distanceToPlayer(bot) < 240) {
                                const f = 8 * n;
                                player.vx += Math.cos(angle) * f; player.vy += Math.sin(angle) * f;
                            }
                        }
                    }
                }
                bot.phaseFlash = Math.max(0, (bot.phaseFlash || 0) - n);
                bot.brokenFlash = Math.max(0, (bot.brokenFlash || 0) - n);

                // ---- Shield: recharges whenever the player stops attacking ----
                bot.shieldGap = Math.max(0, (bot.shieldGap || 0) - n); // reset on every shield hit
                if (bot.hp <= 0) bot.broken = true; // armor always breaks at 0 HP (defensive sync)
                if (bot.broken) {
                    bot.shield = 0;
                } else if (bot.shieldGap <= 0 && bot.shield < bot.maxShield && bot.hp > 0) {
                    const regen = bossHas(bot, 'voidArmor') ? 0.09 : 0.05;
                    bot.shield = Math.min(bot.maxShield, bot.shield + regen);
                }

                // ---- Minions ----
                if (bossHas(bot, 'minions')) {
                    bot.minionCd = (bot.minionCd || 0) - n;
                    const minionCount = bots.filter(c => c.alive && c.bossMinion).length;
                    if (bot.minionCd <= 0 && minionCount < 2 && bot.hp > 0) {
                        spawnMinions(bot, 1);
                        bot.minionCd = Math.max(320, 520 - (bot.tier || 0) * 6);
                    }
                }

                // ---- Berserk periodic pulses ----
                if (bossHas(bot, 'berserk') && info.phase !== 'calm') {
                    bot.berserkPulse = (bot.berserkPulse || 200) - n;
                    if (bot.berserkPulse <= 0) {
                        bot.berserkPulse = info.phase === 'critical' ? 300 : 420;
                        bot.pulseR = 14;
                        if (distanceToPlayer(bot) < 240) {
                            const f = (info.phase === 'critical' ? 9 : 7.5) * n;
                            player.vx += Math.cos(angle) * f; player.vy += Math.sin(angle) * f;
                        }
                    }
                }

                // ---- Teleport follow-up dash ----
                if (bot.dashDur2 && bot.dashDur2 > 0) {
                    bot.dashDur2 -= n;
                    bot.vx = bot.dashVx; bot.vy = bot.dashVy;
                }

                // ---- Telegraph -> resolve attack ----
                if (bot.curAttack && bot.telegraph > 0) {
                    bot.telegraph -= n;
                    if (bot.telegraph <= 0) resolveBossAttack(bot, n, angle);
                } else if (bot.curAttack && bot.multiLeft > 0) {
                    bot.telegraph -= n;
                    if (bot.telegraph <= 0) resolveBossAttack(bot, n, angle);
                } else if (bot.attackCd > 0) {
                    bot.attackCd -= n;
                } else if (!bot.curAttack) {
                    const pick = bossPickAttack(bot);
                    bot.curAttack = pick;
                    bot.cue = pick;
                    bot.telegraph = (pick === 'grab' || pick === 'teleport') ? 66 : (pick === 'multiWave' ? 60 : 46);
                }

                // ---- Grab follow-through (brief pull continues) ----
                if (bot.grabT && bot.grabT > 0) {
                    bot.grabT -= n;
                    if (distanceToPlayer(bot) < 250) {
                        const pull = -6 * n;
                        player.vx += Math.cos(angle) * pull; player.vy += Math.sin(angle) * pull;
                    }
                }

                // ---- Shockwave pulse visual/timer ----
                if (bot.pulseR && bot.pulseR > 0) {
                    bot.pulseR += n * 10;
                    if (bot.pulseR > 230) bot.pulseR = 0;
                }

                // ---- Dash state ----
                if (bot.dashT && bot.dashT > 0) {
                    bot.dashDur -= n;
                    bot.vx = bot.dashVx; bot.vy = bot.dashVy;
                    if (bot.dashDur <= 0) bot.dashT = 0;
                }

                // ---- Slam ----
                bot.slamCd = (bot.slamCd || 0) + n;
                const slamAt = info.phase === 'enraged' || info.phase === 'critical' ? 115 : 150;
                const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
                if (bot.slamCd > slamAt && dist < bot.radius + player.radius + 55) {
                    const slam = ((info.phase === 'critical' ? 19 : info.phase === 'enraged' ? 16 : 13) + bot.power * 0.22) * n;
                    player.vx -= Math.cos(angle) * slam; player.vy -= Math.sin(angle) * slam;
                    bot.slamCd = 0; spawnImpact(player.x, player.y, '#ff0055');
                }

                // ---- Boss chase speed (broken boss is staggered / vulnerable) ----
                const speed = bot.broken
                    ? bot.speed * 0.5
                    : bot.speed * (info.phase === 'critical' ? 1.5 : info.phase === 'enraged' ? 1.35 : 1);
                if (bot.dashT <= 0 && !bot.dashDur2) {
                    bot.vx += Math.cos(angle) * speed * n; bot.vy += Math.sin(angle) * speed * n;
                }
                bot.vx = dampStep(bot.vx, 0.92, n); bot.vy = dampStep(bot.vy, 0.92, n);
            } else {
                // ---- Regular bot / minion movement (dt) ----
                let speed = bot.speed;
                const dashAt = 80, dashEnd = dashAt + 28, dashMul = 1.85;
                if (bot.cd > dashAt) speed *= dashMul;
                if (bot.cd > dashEnd) bot.cd = 0;
                bot.vx += Math.cos(angle) * speed * n; bot.vy += Math.sin(angle) * speed * n;
                bot.vx = dampStep(bot.vx, 0.9, n); bot.vy = dampStep(bot.vy, 0.9, n);
            }

            bot.x += bot.vx * n; bot.y += bot.vy * n;

            // ---- Boundary (real sumo: only a physical ring-out eliminates) ----
            const fromCenter = Math.hypot(bot.x - 400, bot.y - 300);
            if (bot.isBoss) {
                const ringEdge = offlineArenaRadius - bot.radius;        // center must stay inside this
                if (fromCenter > ringEdge) {
                    if (bot.hp > 0) {
                        // Armor intact => cannot be ringed out; clamp back inside.
                        const nx = (bot.x - 400) / fromCenter, ny = (bot.y - 300) / fromCenter;
                        const rest = Math.max(0, ringEdge - 4);
                        bot.x = 400 + nx * rest; bot.y = 300 + ny * rest;
                        bot.vx *= 0.25; bot.vy *= 0.25;
                    } else if (fromCenter > offlineArenaRadius - bot.radius + 6) {
                        // Armor broken => boss can finally be physically thrown out.
                        bot.alive = false;
                        spawnImpact(bot.x, bot.y, '#ff6600');
                        bossRungOut = true;
                    }
                }
            } else if (fromCenter > Math.max(0, offlineArenaRadius - bot.radius - 8)) {
                bot.alive = false;
            }

            // ---- Collision / push (dt-normalized) ----
            const distance = Math.hypot(bot.x - player.x, bot.y - player.y);
            if (distance < player.radius + bot.radius) {
                const overlap = player.radius + bot.radius - distance;
                const collisionAngle = Math.atan2(bot.y - player.y, bot.x - player.x);
                player.x -= Math.cos(collisionAngle) * (overlap * 0.45);
                player.y -= Math.sin(collisionAngle) * (overlap * 0.45);
                bot.x += Math.cos(collisionAngle) * (overlap * 0.55);
                bot.y += Math.sin(collisionAngle) * (overlap * 0.55);

                const armorFactor = Math.max(0.55, (1 - upgrades.voidArmor * 0.12) * (bot.isBoss && bossHas(bot, 'voidArmor') ? 0.7 : 1));
                player.vx -= Math.cos(collisionAngle) * (bot.power / selfMass) * armorFactor * n;
                player.vy -= Math.sin(collisionAngle) * (bot.power / selfMass) * armorFactor * n;

                // Knockback armor: intact boss resists pushes; broken boss takes full shove.
                const armor = bot.isBoss && bot.hp > 0 ? 0.22 : 1;
                const broken = bot.isBoss && bot.broken;
                if (bot.isBoss && bot.hp > 0 && (bot.hurtCd || 0) <= 0 && Math.hypot(player.vx, player.vy) > 3.5) {
                    const damage = 1;
                    if (bot.shield > 0) {
                        bot.shield = Math.max(0, bot.shield - damage);
                        bot.shieldGap = 90; // player attacking => delay shield recharge
                        if (bot.shield <= 0) spawnImpact(bot.x, bot.y, '#00e5ff');
                    } else {
                        bot.hp = Math.max(0, bot.hp - damage);
                        bot.hurtCd = 22;
                        if (bot.hp <= 0 && !bot.broken) {
                            // Armor broken: boss does NOT die — it becomes vulnerable to being thrown out.
                            bot.broken = true;
                            bot.brokenFlash = 60;
                            bot.shield = 0;
                            spawnImpact(bot.x, bot.y, '#ff6600');
                            if (window.NeonSystems?.audio) window.NeonSystems.audio.tone(120, .25, 'sawtooth', .05);
                        }
                    }
                }
                // Broken boss: amplified shove so the player can physically throw it out (ring-out win).
                const pushMass = broken ? Math.max(1, bot.mass * 0.25) : bot.mass;
                bot.vx += Math.cos(collisionAngle) * (selfPower / pushMass) * (broken ? 4.0 : armor) * n;
                bot.vy += Math.sin(collisionAngle) * (selfPower / pushMass) * (broken ? 4.0 : armor) * n;
                spawnImpact((player.x + bot.x) / 2, (player.y + bot.y) / 2, bot.color);
            }
        }

        if (activeMode === 'timeAttack') {
            const aliveCount = bots.filter(bot => bot.alive).length;
            modeEliminations += active.length - aliveCount;
            modeScore = modeEliminations * 10;
            if (aliveCount === 0 && modeTime > 0) addModeBot(bots.length, 1, '#ffaa00');
        }
        const activeBoss = getActiveBoss();
        const remainingBots = bots.filter(bot => bot.alive).length;
        // Victory in a boss stage is a REAL sumo ring-out — the boss must be
        // physically thrown out of the arena. Depleting its HP only breaks its
        // armor; it never auto-wins when HP/shield runs out.
        const stageVictory = activeMode === 'stage' && (remainingBots === 0 || (configHadBoss && !activeBoss));
        const arcadeVictory = activeMode !== 'stage' && remainingBots === 0;
        if (stageReady && (stageVictory || arcadeVictory) && !stageEnded) {
            if (activeMode === 'stage') { finishOfflineStage(); return; }
            modeScore = activeMode === 'timeAttack' ? modeEliminations * 10 : bots.length * 10;
            endArcadeMode(activeMode === 'chaos' ? 'CHAOS CLEARED' : 'SHRINKING CLEARED', modeScore);
            return;
        }
    }
}

/* ---------------------------------------------------------------- *
 *  RENDER
 * ---------------------------------------------------------------- */
function render() {
    ctx.fillStyle = '#08090f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (gameMode !== 'none') {
        const radius = offlineArenaRadius;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        // Camera fit: zoom out so the WHOLE arena (incl. huge boss arenas) is
        // always visible with margin — never clipped into "black" edges.
        const scale = arenaFitScale(canvas.width, canvas.height, radius);
        const rScaled = radius * scale;

        // --- Arena floor (rich, scaled) ---
        const grad = ctx.createRadialGradient(cx, cy, rScaled * 0.15, cx, cy, rScaled);
        grad.addColorStop(0, '#131a2b');
        grad.addColorStop(0.72, '#0f1422');
        grad.addColorStop(1, '#0a0d18');
        ctx.beginPath(); ctx.arc(cx, cy, rScaled, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();

        // concentric ring bands
        ctx.lineWidth = 1 * scale;
        for (let i = 1; i <= 6; i++) {
            ctx.beginPath(); ctx.arc(cx, cy, rScaled * (i / 6), 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.10)'; ctx.stroke();
        }
        // center disc + inner danger ring
        ctx.beginPath(); ctx.arc(cx, cy, 10 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.25)'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, rScaled * 0.18, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.14)'; ctx.lineWidth = 2 * scale; ctx.stroke();

        // radial grid spokes
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.07)';
        ctx.lineWidth = 1 * scale;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 14 * scale, cy + Math.sin(a) * 14 * scale);
            ctx.lineTo(cx + Math.cos(a) * (rScaled - 4 * scale), cy + Math.sin(a) * (rScaled - 4 * scale));
            ctx.stroke();
        }

        // boundary rim: layered glow so the edge reads as a lit ring, never black
        const bossNow = bots.find(b => b.isBoss && b.alive);
        const rimColor = bossNow ? (bossNow.visual && bossNow.visual.aura) || '#ff3366' :
            (radius < 170 ? '#ff0055' : '#00e5ff');
        for (let i = 3; i >= 1; i--) {
            ctx.beginPath(); ctx.arc(cx, cy, rScaled + i * 6 * scale, 0, Math.PI * 2);
            ctx.lineWidth = i * 3 * scale;
            ctx.strokeStyle = rimColor;
            ctx.globalAlpha = (0.06 + 0.05 * (4 - i)) * 0.6;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(cx, cy, rScaled, 0, Math.PI * 2);
        ctx.lineWidth = 4 * scale; ctx.strokeStyle = rimColor; ctx.stroke();

        // --- Hazards (dt-based plasma orbs + pulsing mines) ---
        for (let hz of hazards) {
            if (!hz.alive) continue;
            const hx = hz.x * scale, hy = hz.y * scale;
            if (hz.type === 'mine') {
                const mR = hz.radius * scale;
                const pulseAlpha = 0.5 + 0.4 * Math.sin(hz.pulse);
                ctx.beginPath(); ctx.arc(hx, hy, mR * (1 + 0.18 * Math.sin(hz.pulse / hz.wobble)), 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 60, 80, 0.10)'; ctx.fill();
                ctx.beginPath(); ctx.arc(hx, hy, mR, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 90, 110, ${pulseAlpha})`; ctx.fill();
                ctx.lineWidth = 2 * scale; ctx.strokeStyle = '#ff8aa0'; ctx.stroke();
            } else {
                const pR = Math.max(1, hz.radius * scale);
                const pAlpha = 0.55 + 0.35 * Math.sin(hz.pulse);
                ctx.beginPath(); ctx.arc(hx, hy, pR, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 229, 255, ${pAlpha})`; ctx.fill();
                ctx.beginPath(); ctx.arc(hx, hy, pR * 0.55, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(210, 250, 255, 0.9)'; ctx.fill();
                ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = 'rgba(180, 245, 255, 0.8)'; ctx.stroke();
            }
        }

        for (let p of particles) {
            ctx.beginPath(); ctx.arc(p.x * scale, p.y * scale, Math.max(1, 3 * scale), 0, Math.PI * 2);
            ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill(); ctx.globalAlpha = 1;
        }
        for (let bot of bots) {
            if (!bot.alive) continue;
            const br = bot.radius * scale;
            ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, br, 0, Math.PI * 2);
            ctx.fillStyle = bot.color; ctx.fill();
            ctx.lineWidth = (bot.isBoss ? 4 : 2) * scale; ctx.strokeStyle = bot.visual?.accent || '#fff'; ctx.stroke();
            if (bot.isBoss) {
                const vis = bot.visual || {};
                // Tier-distinct rim accents (spikes / scallops around the body)
                const spokeCount = Math.max(4, Math.min(14, 3 + Math.floor(bot.radius / 9)));
                const spokeLen = (4 + (vis.rim || 4)) * scale;
                ctx.strokeStyle = vis.accent || '#ff88aa';
                ctx.lineWidth = Math.max(1, 1.6 * scale);
                for (let si = 0; si < spokeCount; si++) {
                    const sa = (si / spokeCount) * Math.PI * 2 + (performance.now() % 4000) / 4000 * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(bot.x * scale + Math.cos(sa) * (br - 2 * scale), bot.y * scale + Math.sin(sa) * (br - 2 * scale));
                    ctx.lineTo(bot.x * scale + Math.cos(sa) * (br + spokeLen), bot.y * scale + Math.sin(sa) * (br + spokeLen));
                    ctx.stroke();
                }
                // Tier name tag
                ctx.font = `bold ${Math.max(10, 12 * scale)}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillStyle = vis.accent || '#fff';
                ctx.fillText(vis.label || 'TITAN', bot.x * scale, bot.y * scale - br - 36 * scale);
                // telegraph cue ring (per ability)
                if (bot.curAttack && bot.telegraph > 0) {
                    const meta = window.NeonSystems?.bosses?.ABILITY_META || {};
                    const cueCfg = {
                        wave:      { r: 190, c: '#ffbb00' },
                        wavePush:  { r: 190, c: '#ffbb00' },
                        multiWave: { r: 220, c: '#ff6600' },
                        berserk:   { r: 240, c: '#ff3366' },
                        dash:      { r: 64,  c: '#ff0055' },
                        grab:      { r: 250, c: '#cc00ff' },
                        teleport:  { r: 70,  c: '#cc00ff' }
                    };
                    const cfg = cueCfg[bot.curAttack] || { r: 190, c: '#ffbb00' };
                    const wrScaled = cfg.r * scale;
                    ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, wrScaled, 0, Math.PI * 2);
                    ctx.lineWidth = (3 + Math.floor(bot.telegraph / 6) % 3) * scale;
                    ctx.strokeStyle = cfg.c;
                    ctx.globalAlpha = 0.3 + (bot.telegraph % 8) / 16;
                    ctx.stroke(); ctx.globalAlpha = 1;
                    // ability name tag
                    const label = (meta[bot.curAttack] && meta[bot.curAttack].name) || bot.curAttack;
                    ctx.font = `${Math.max(9, 11 * scale)}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.fillStyle = cfg.c;
                    ctx.globalAlpha = 0.85;
                    ctx.fillText(label.toUpperCase(), bot.x * scale, bot.y * scale - br - 22 * scale);
                    ctx.globalAlpha = 1;
                }
                // shockwave / berserk pulse
                if (bot.pulseR > 0) {
                    const prScaled = bot.pulseR * scale;
                    ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, prScaled, 0, Math.PI * 2);
                    ctx.lineWidth = 5 * scale; ctx.strokeStyle = vis.aura || '#ffbb00';
                    ctx.globalAlpha = Math.max(0, 1 - bot.pulseR / 230);
                    ctx.stroke(); ctx.globalAlpha = 1;
                }
                // phase flash ring
                if (bot.phaseFlash && bot.phaseFlash > 0) {
                    ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, br + 8 * scale, 0, Math.PI * 2);
                    ctx.lineWidth = 3 * scale; ctx.strokeStyle = vis.aura || bot.color;
                    ctx.globalAlpha = Math.min(1, bot.phaseFlash / 30) * 0.8;
                    ctx.stroke(); ctx.globalAlpha = 1;
                }
                // Berserk rage aura (enraged / critical) — tined by tier palette
                if (bot.phaseName === 'enraged' || bot.phaseName === 'critical') {
                    const pulse = (performance.now() % 800) / 800;
                    ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, br + (10 + pulse * 8) * scale, 0, Math.PI * 2);
                    ctx.lineWidth = 6 * scale; ctx.strokeStyle = bot.phaseName === 'critical' ? '#ffbb00' : (vis.aura || '#ff3366');
                    ctx.globalAlpha = 0.35 + 0.3 * (1 - pulse);
                    ctx.stroke(); ctx.globalAlpha = 1;
                }
                // Broken (armor shattered): the boss is now shove-able to a ring-out.
                if (bot.broken) {
                    ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, br + 5 * scale, 0, Math.PI * 2);
                    ctx.lineWidth = 3 * scale; ctx.strokeStyle = '#ff6600';
                    ctx.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(bot.brokenFlash / 8));
                    ctx.stroke(); ctx.globalAlpha = 1;
                    ctx.font = `bold ${Math.max(10, 13 * scale)}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#ff6600';
                    ctx.fillText('ARMOR BROKEN', bot.x * scale, bot.y * scale - br - 30 * scale);
                }
                const bw = bot.radius * 2.2 * scale;
                const bx = bot.x * scale - bw / 2;
                const by = bot.y * scale - bot.radius * scale - (bot.broken ? 58 : 46) * scale;
                // Shield (top bar, cyan) — layered with HP
                ctx.fillStyle = '#172d48'; ctx.fillRect(bx, by - 8 * scale, bw, 5 * scale);
                ctx.fillStyle = bot.broken ? '#ff6600' : '#00e5ff';
                ctx.fillRect(bx, by - 8 * scale, bw * Math.max(0, bot.shield / bot.maxShield), 5 * scale);
                // HP / armor (lower bar, green -> gold when nearly gone)
                ctx.fillStyle = '#351323'; ctx.fillRect(bx, by, bw, 5 * scale);
                const hpColor = bot.hp <= 0 ? '#ff6600' : bot.hp / bot.maxHp <= 0.25 ? '#ffbb00' : '#00ff66';
                ctx.fillStyle = hpColor;
                ctx.fillRect(bx, by, bw * Math.max(0, bot.hp / bot.maxHp), 5 * scale);
                if (bot.broken) {
                    ctx.font = `${Math.max(8, 9 * scale)}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#ffffff';
                    ctx.globalAlpha = 0.6;
                    ctx.fillText('PUSH OUT TO WIN', bx + bw / 2, by + 22 * scale);
                    ctx.globalAlpha = 1;
                }
            }
        }
        if (player.alive) {
            const pr = player.radius * scale;
            ctx.beginPath(); ctx.arc(player.x * scale, player.y * scale, pr, 0, Math.PI * 2);
            ctx.fillStyle = player.color; ctx.fill();
            ctx.lineWidth = 2.5 * scale; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
    }
}

function gameLoop() {
    if (window.NeonSystems?.performance) window.NeonSystems.performance.tick();
    try { updatePhysics(); render(); } catch (_error) {}
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

/* ---------------------------------------------------------------- *
 *  SWIPE DASH (mobile) — retained from the current shell
 * ---------------------------------------------------------------- */
function handleSwipe(angle) {
    const rad = angle * Math.PI / 180;
    player.vx = Math.cos(rad) * 5;
    player.vy = Math.sin(rad) * 5;
    spawnImpact(player.x, player.y, player.color || '#00e5ff');
}

/* ---------------------------------------------------------------- *
 *  P2P LOBBY SHARE — retained from the current shell
 * ---------------------------------------------------------------- */
function getLobbyCode() {
    const el = document.getElementById('lobby-code');
    if (el) {
        const txt = (el.innerText || '').trim();
        if (txt && txt !== 'Connecting...') return txt;
    }
    const input = document.getElementById('room-input');
    if (input && input.value) return input.value.trim();
    return '';
}

function copyRoomLink() {
    const code = getLobbyCode();
    const url = window.location.href.split('#')[0] + (code ? '#' + code : '');
    const ok = function () {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url);
                return true;
            }
        } catch (_e) {}
        try {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const done = document.execCommand('copy');
            ta.remove();
            return done;
        } catch (_e) { return false; }
    };
    if (ok()) { try { alert('Link copied: ' + url); } catch (_e) {} }
    else { try { alert(url); } catch (_e) {} }
    if (typeof window.NeonSystems?.audio?.playClick === 'function') window.NeonSystems.audio.playClick();
}

function shareRoomWhatsApp() {
    const code = getLobbyCode();
    const url = window.location.href.split('#')[0] + (code ? '#' + code : '');
    const text = encodeURIComponent('Join me in Neon Sumo Arena! Room: ' + rootRoomLabel() + ' ' + url + ' 🥊');
    window.open('https://wa.me/?text=' + text, '_blank');
}

function rootRoomLabel() {
    const code = getLobbyCode();
    return code ? '#' + code : 'ONLINE 1v1';
}