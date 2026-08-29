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
    player.radius = 22 + (upgrades.weight * 1.5) + (upgrades.coreDensity * 1.8); bots = []; particles = [];
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
        radius: 18 + scale * 2, mass: 1 + scale * .12, speed: .45 + scale * .03, power: 5 + scale,
        color, isBoss: false, alive: true, cd: 0 });
}

function addBossMinion(boss) {
    const angle = (boss.attackCycle + bots.length) * 2.399;
    bots.push({ x: boss.x + Math.cos(angle) * (boss.radius + 18), y: boss.y + Math.sin(angle) * (boss.radius + 18), vx: 0, vy: 0,
        radius: 16, mass: 1.05, speed: .38, power: 5.5, color: '#ffbb00', isBoss: false, alive: true, cd: 0, bossMinion: true });
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

function offlineBossStats(level, playerRadius) {
    if (window.NeonSystems?.bosses) return window.NeonSystems.bosses.profile(level, playerRadius);
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
        tier
    };
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
        offlineArenaRadius = config.arenaRadius;
        player.x = 400; player.y = 300; player.vx = 0; player.vy = 0; player.alive = true;
        player.radius = 22 + (upgrades.weight * 1.5) + (upgrades.coreDensity * 1.8); bots = []; particles = [];
        if (config.isBoss || config.isMiniBoss) {
            const stats = offlineBossStats(level, player.radius);
            const bossDistance = Math.max(0, Math.min(130, offlineArenaRadius - stats.radius - 12));
            bots.push({
                x: 400, y: 300 - bossDistance, vx: 0, vy: 0, radius: stats.radius, mass: stats.mass,
                speed: stats.speed, power: stats.power, color: config.isBoss ? '#ff0055' : '#ffaa00',
                isBoss: true, isMiniBoss: config.isMiniBoss,
                alive: true, cd: 0, slamCd: 90, phase: 1, hp: stats.maxHp, maxHp: stats.maxHp,
                shield: stats.shield, maxShield: stats.shield, shieldCooldown: 0, hurtCd: 0,
                attackCooldown: 120, attackType: null, attackCycle: 0, telegraph: 0, dashTimer: 0, pulseRadius: 0,
                minionCooldown: 360, tier: stats.tier, abilities: stats.abilities
            });
        } else {
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
    const safeDistance = Math.max(30, reviveSnapshot.radius - player.radius - 8);
    const distance = Math.hypot(reviveSnapshot.x - 400, reviveSnapshot.y - 300);
    const scale = distance > safeDistance ? safeDistance / distance : 1;
    player.x = 400 + (reviveSnapshot.x - 400) * scale;
    player.y = 300 + (reviveSnapshot.y - 300) * scale;
    player.vx = 0; player.vy = 0; player.alive = true;
    hideAllMenus();
    document.getElementById('hud').classList.remove('hidden');
    touchBox.style.display = 'block';
    touchBox.classList.add('active');
    reviveSnapshot = { x: player.x, y: player.y, radius: offlineArenaRadius };
}

function spawnImpact(x, y, color) {
    for (let i = 0; i < (mobilePerformance ? 3 : 6); i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = 3 + Math.random() * 4;
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, a: 1, c: color });
    }
    if (particles.length > (mobilePerformance ? 45 : 120)) particles.splice(0, particles.length - (mobilePerformance ? 45 : 120));
    if (window.NeonSystems?.audio) window.NeonSystems.audio.tone(color === '#ff0055' ? 110 : 220, .045, 'triangle');
}

function distanceToPlayer(bot) { return Math.hypot(bot.x - player.x, bot.y - player.y); }

/* ---------------------------------------------------------------- *
 *  REAL SUMO PHYSICS — updatePhysics()
 * ---------------------------------------------------------------- */
function updatePhysics() {
    if (gameMode === 'none') { gameActive = false; return; }
    if (!gameActive) { touchBox.style.display = 'none'; touchBox.classList.remove('active'); return; }
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vx *= 0.9; p.vy *= 0.9; p.a -= 0.06;
        if (p.a <= 0) particles.splice(i, 1);
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
        const momentum = 1.6 + upgrades.neonMomentum * 0.12;
        player.vx += dx * momentum; player.vy += dy * momentum;
        player.vx *= 0.88; player.vy *= 0.88;
        const recovery = Math.max(0.82, 0.88 - upgrades.hydroPusher * 0.015);
        player.vx *= recovery; player.vy *= recovery;
        player.x += player.vx; player.y += player.vy;
        if (Math.hypot(player.x - 400, player.y - 300) > offlineArenaRadius) {
            reviveSnapshot = { x: player.x, y: player.y, radius: offlineArenaRadius };
            player.alive = false; stageEnded = true;
            registerPlayerDeath();
            hideAllMenus();
            document.getElementById('modal-death').classList.remove('hidden');
            return;
        }
        let active = bots.filter(bot => bot.alive);
        for (let bot of active) {
            let angle = Math.atan2(player.y - bot.y, player.x - bot.x);
            bot.cd = (bot.cd || 0) + 1;
            if (bot.hurtCd > 0) bot.hurtCd -= 1;
            let raging = bot.isBoss && bot.hp <= bot.maxHp * 0.5;
            let critical = bot.isBoss && bot.hp <= bot.maxHp * 0.25;
            if (raging && bot.phase === 1) { bot.phase = 2; bot.color = '#ff3366'; spawnImpact(bot.x, bot.y, '#ff3366'); }
            if (critical && bot.phase === 2) { bot.phase = 3; bot.color = '#ffbb00'; bot.shield = bot.maxShield; bot.shieldCooldown = 240; bot.minionCooldown = 1; spawnImpact(bot.x, bot.y, '#ffbb00'); }
            if (bot.isBoss) {
                if (bot.shieldCooldown > 0) bot.shieldCooldown -= 1;
                if (bot.shield <= 0 && bot.shieldCooldown === 0 && bot.hp > 0) { bot.shield = Math.min(bot.maxShield, bot.shield + 0.02); }
                bot.minionCooldown -= 1;
                const minionCount = bots.filter(candidate => candidate.alive && candidate.bossMinion).length;
                if (bot.minionCooldown <= 0 && minionCount < 2 && bot.hp > 0) { addBossMinion(bot); bot.minionCooldown = Math.max(260, 420 - bot.tier * 35); }
                bot.attackCooldown -= 1;
                if (bot.telegraph > 0) {
                    bot.telegraph -= 1;
                    if (bot.telegraph === 0) {
                        if (bot.attackType === 'wave') {
                            bot.pulseRadius = 12;
                            if (distanceToPlayer(bot) < 190) {
                                const waveForce = raging ? 9.5 : 7.5;
                                player.vx += Math.cos(angle) * waveForce;
                                player.vy += Math.sin(angle) * waveForce;
                            }
                        } else {
                            bot.dashTimer = raging ? 20 : 16;
                            bot.dashVx = Math.cos(angle) * (raging ? 7.2 : 6.2);
                            bot.dashVy = Math.sin(angle) * (raging ? 7.2 : 6.2);
                        }
                        bot.attackType = null;
                        bot.attackCooldown = Math.max(68, (critical ? 78 : raging ? 92 : 118) - bot.tier * 6);
                    }
                } else if (bot.attackCooldown <= 0) {
                    bot.attackType = bot.attackCycle % 2 === 0 ? 'wave' : 'dash';
                    bot.attackCycle = (bot.attackCycle || 0) + 1;
                    bot.telegraph = 42 + bot.tier * 3;
                }
                if (bot.pulseRadius > 0) bot.pulseRadius += 10;
                if (bot.pulseRadius > 210) bot.pulseRadius = 0;
            }
            let speed = bot.speed * (critical ? 1.5 : raging ? 1.35 : 1);
            let dashAt = bot.isBoss ? (raging ? 48 : 68) : 80;
            let dashEnd = dashAt + (bot.isBoss ? 22 : 28);
            let dashMul = bot.isBoss ? (raging ? 3.1 : 2.35) : 1.85;
            if (bot.cd > dashAt) speed *= dashMul;
            if (bot.cd > dashEnd) bot.cd = 0;
            if (bot.isBoss && bot.dashTimer > 0) {
                bot.vx = bot.dashVx; bot.vy = bot.dashVy; bot.dashTimer -= 1;
            } else {
                bot.vx += Math.cos(angle) * speed; bot.vy += Math.sin(angle) * speed;
            }
            bot.vx *= bot.isBoss ? 0.92 : 0.9;
            bot.vy *= bot.isBoss ? 0.92 : 0.9;
            bot.x += bot.vx; bot.y += bot.vy;
            let fromCenter = Math.hypot(bot.x - 400, bot.y - 300);
            if (bot.isBoss && bot.hp > 0 && fromCenter > offlineArenaRadius - 10) {
                let nx = (bot.x - 400) / fromCenter; let ny = (bot.y - 300) / fromCenter;
                bot.x = 400 + nx * (offlineArenaRadius - 12); bot.y = 300 + ny * (offlineArenaRadius - 12);
                bot.vx *= 0.25; bot.vy *= 0.25;
            } else if (fromCenter > Math.max(0, offlineArenaRadius - bot.radius - 8)) { bot.alive = false; }
            let distance = Math.hypot(bot.x - player.x, bot.y - player.y);
            if (bot.isBoss) {
                bot.slamCd = (bot.slamCd || 0) + 1;
                if (bot.slamCd > (raging ? 110 : 150) && distance < bot.radius + player.radius + 55) {
                    let slam = (raging ? 18 : 13) + bot.power * 0.22;
                    player.vx -= Math.cos(angle) * slam; player.vy -= Math.sin(angle) * slam;
                    bot.slamCd = 0; spawnImpact(player.x, player.y, '#ff0055');
                }
            }
            if (distance < player.radius + bot.radius) {
                let overlap = player.radius + bot.radius - distance;
                let collisionAngle = Math.atan2(bot.y - player.y, bot.x - player.x);
                player.x -= Math.cos(collisionAngle) * (overlap * 0.45); player.y -= Math.sin(collisionAngle) * (overlap * 0.45);
                bot.x += Math.cos(collisionAngle) * (overlap * 0.55); bot.y += Math.sin(collisionAngle) * (overlap * 0.55);
                let playerMass = 1.0 + upgrades.weight * 0.25;
                let playerPower = 6.0 + upgrades.power * 1.5;
                const armorFactor = Math.max(0.55, 1 - upgrades.voidArmor * 0.12);
                player.vx -= Math.cos(collisionAngle) * (bot.power / playerMass) * armorFactor;
                player.vy -= Math.sin(collisionAngle) * (bot.power / playerMass) * armorFactor;
                let armor = bot.isBoss && bot.hp > 0 ? 0.22 : 1;
                if (bot.isBoss && bot.hp > 0 && (bot.hurtCd || 0) <= 0 && Math.hypot(player.vx, player.vy) > 3.5) {
                    let damage = 1;
                    if (bot.shield > 0) { bot.shield = Math.max(0, bot.shield - damage); bot.shieldCooldown = 180; }
                    else { bot.hp = Math.max(0, bot.hp - damage); bot.hurtCd = 22; if (bot.hp <= 0) { bot.alive = false; spawnImpact(bot.x, bot.y, '#00ff66'); } }
                }
                bot.vx += Math.cos(collisionAngle) * (playerPower / bot.mass) * armor;
                bot.vy += Math.sin(collisionAngle) * (playerPower / bot.mass) * armor;
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
        const bossDefeated = activeMode === 'stage' && bots.some(bot => bot.isBoss && bot.hp <= 0);
        const stageVictory = activeMode === 'stage' && (bossDefeated ? !activeBoss : remainingBots === 0);
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
        let radius = offlineArenaRadius;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const scale = Math.min(canvas.width / 800, canvas.height / 600);
        const rScaled = radius * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, rScaled, 0, Math.PI * 2);
        ctx.fillStyle = '#0f121d'; ctx.fill();
        ctx.lineWidth = 4 * scale; ctx.strokeStyle = radius < 170 ? '#ff0055' : '#00e5ff'; ctx.stroke();

        for (let p of particles) {
            ctx.beginPath(); ctx.arc(p.x * scale, p.y * scale, Math.max(1, 3 * scale), 0, Math.PI * 2);
            ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill(); ctx.globalAlpha = 1;
        }
        for (let bot of bots) {
            if (!bot.alive) continue;
            const br = bot.radius * scale;
            ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, br, 0, Math.PI * 2);
            ctx.fillStyle = bot.color; ctx.fill();
            ctx.lineWidth = (bot.isBoss ? 4 : 2) * scale; ctx.strokeStyle = '#fff'; ctx.stroke();
            if (bot.isBoss) {
                if (bot.telegraph > 0) {
                    const warningRadius = bot.attackType === 'wave' ? 190 : 64;
                    const wrScaled = warningRadius * scale;
                    ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, wrScaled, 0, Math.PI * 2);
                    ctx.lineWidth = 3 * scale; ctx.strokeStyle = bot.attackType === 'wave' ? '#ffbb00' : '#ff0055';
                    ctx.globalAlpha = 0.35 + (bot.telegraph % 10) / 20;
                    ctx.stroke(); ctx.globalAlpha = 1;
                }
                if (bot.pulseRadius > 0) {
                    const prScaled = bot.pulseRadius * scale;
                    ctx.beginPath(); ctx.arc(bot.x * scale, bot.y * scale, prScaled, 0, Math.PI * 2);
                    ctx.lineWidth = 5 * scale; ctx.strokeStyle = '#ffbb00';
                    ctx.globalAlpha = Math.max(0, 1 - bot.pulseRadius / 220);
                    ctx.stroke(); ctx.globalAlpha = 1;
                }
                const bw = bot.radius * 2.2 * scale;
                const bx = bot.x * scale - bw / 2;
                const by = bot.y * scale - bot.radius * scale - 16 * scale;
                ctx.fillStyle = '#351323'; ctx.fillRect(bx, by, bw, 5 * scale);
                ctx.fillStyle = '#00ff66'; ctx.fillRect(bx, by, bw * Math.max(0, bot.hp / bot.maxHp), 5 * scale);
                ctx.fillStyle = '#172d48'; ctx.fillRect(bx, by - 7 * scale, bw, 3 * scale);
                ctx.fillStyle = '#00e5ff'; ctx.fillRect(bx, by - 7 * scale, bw * Math.max(0, bot.shield / bot.maxShield), 3 * scale);
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