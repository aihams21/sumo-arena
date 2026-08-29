/* ═══════════════════════════════════════════════════════════════════════
   NEON SUMO ARENA — GAME CORE
   Reconstructed as a standalone classic <script> that plugs into the
   global state declared by index.html (player, bots, gameParticles, ctx,
   coins, upgrades, ARCADE_MODES, offlineArenaRadius, etc.).

   Exposes the functions the menu/loop scaffolding already calls:
     initializeGame(r, mode)  render()  updatePhysics(dt)
     updateBots(dt)           startGameLoop()  updateHUD()
     showShop()  buyUpgrade(type)  startOfflineStage(level)
     handleSwipe(angle)       shareRoomWhatsApp()  copyRoomLink()
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

/* ---------------------------------------------------------------- *
 *  Tuning constants
 * ---------------------------------------------------------------- */
const GAME_CENTER_X = 400;
const GAME_CENTER_Y = 300;
const GAME_LOGICAL_W = 800;
const GAME_LOGICAL_H = 600;
const PLAYER_SPEED = 260;
const PLAYER_MAX_HP = 3;
const BOSS_COLOR = '#ff2bd6';

let _loopRunning = false;
let playerHp = PLAYER_MAX_HP;

/* ---------------------------------------------------------------- *
 *  Logical → canvas coordinate transform (responsive)
 * ---------------------------------------------------------------- */
function computeScreenTransform() {
    const cw = canvas.width || GAME_LOGICAL_W;
    const ch = canvas.height || GAME_LOGICAL_H;
    const scale = Math.min(cw / GAME_LOGICAL_W, ch / GAME_LOGICAL_H);
    const ox = (cw - GAME_LOGICAL_W * scale) / 2;
    const oy = (ch - GAME_LOGICAL_H * scale) / 2;
    return { scale, ox, oy };
}

/* ---------------------------------------------------------------- *
 *  initializeGame(radius, mode)
 *  Called by index.html startModeBase for arcade modes.
 * ---------------------------------------------------------------- */
function initializeGame(radius, mode) {
    offlineArenaRadius = (typeof radius === 'number' && radius > 0) ? radius : 240;
    reviveSnapshot = { x: GAME_CENTER_X, y: GAME_CENTER_Y, radius: offlineArenaRadius };
    stageEnded = false;
    stageReady = true;
    player.x = GAME_CENTER_X;
    player.y = GAME_CENTER_Y;
    player.vx = 0;
    player.vy = 0;
    player.alive = true;
    playerHp = PLAYER_MAX_HP;
    modeScore = 0;
    modeEliminations = 0;
    modeRewarded = false;
    gameParticles = [];
    applyEquippedSkin();
}

/* ---------------------------------------------------------------- *
 *  startGameLoop()
 *  Kicks off the shared rAF loop owned by index.html's gameLoop().
 * ---------------------------------------------------------------- */
function startGameLoop() {
    lastTime = performance.now();
    if (!_loopRunning) {
        _loopRunning = true;
        requestAnimationFrame(gameLoop);
    }
}

/* Called by index.html gameLoop when a run ends; allows rebinding. */
function stopGameLoopBinding() {
    _loopRunning = false;
}

/* ---------------------------------------------------------------- *
 *  updateHUD()
 *  Refreshes the stage / mode / coin readouts.
 * ---------------------------------------------------------------- */
function updateHUD() {
    const hs = document.getElementById('hud-stage');
    if (hs) {
        if (activeMode === 'timeAttack') hs.innerText = String(Math.max(0, Math.ceil(modeTime)));
        else if (activeMode === 'shrinking') hs.innerText = String(Math.max(0, Math.floor(offlineArenaRadius)));
        else hs.innerText = String(currentPlayingStage || 1);
    }
    const hm = document.getElementById('hud-mode');
    if (hm) {
        hm.innerText = activeMode === 'chaos' ? 'CHAOS'
            : activeMode === 'timeAttack' ? 'TIME'
                : activeMode === 'shrinking' ? 'SHRINK'
                    : activeMode === 'stage' ? 'STAGE'
                        : activeMode === 'p2p' ? 'P2P' : '--';
    }
    updateDisplays();
}

/* ---------------------------------------------------------------- *
 *  updatePhysics(dt)
 *  Moves the player, applies input, drifts arena parameters for the
 *  selected mode, resolves collisions and ring-outs.
 * ---------------------------------------------------------------- */
function updatePhysics(dt) {
    if (!gameActive || stageEnded) return;

    const fs = dt * 60;

    /* Input → velocity (touch stick and/or keyboard). */
    let ix = touchVec ? touchVec.x : 0;
    let iy = touchVec ? touchVec.y : 0;
    if (keys) {
        if (keys['a'] || keys['arrowleft']) ix -= 1;
        if (keys['d'] || keys['arrowright']) ix += 1;
        if (keys['w'] || keys['arrowup']) iy -= 1;
        if (keys['s'] || keys['arrowdown']) iy += 1;
    }
    const ilen = Math.hypot(ix, iy);
    if (ilen > 1) { ix /= ilen; iy /= ilen; }

    player.vx = ix * PLAYER_SPEED;
    player.vy = iy * PLAYER_SPEED;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    /* Knockback persistence decays naturally through integration. */

    /* Per-mode dynamics. */
    if (activeMode === 'shrinking') {
        offlineArenaRadius = Math.max((ARCADE_MODES.shrinking.minRadius || 125),
            offlineArenaRadius - (ARCADE_MODES.shrinking.shrinkPerSecond || 2) * dt);
        if (offlineArenaRadius <= (ARCADE_MODES.shrinking.minRadius || 125)) {
            onStageClear();
            return;
        }
    }
    if (activeMode === 'timeAttack') {
        modeTime -= dt;
        if (modeTime <= 0) {
            modeTime = 0;
            if (player.alive) onStageClear();
            else { gameActive = false; showGameOverScreen('TIME UP'); }
            return;
        }
    }

    /* Move bots and resolve interactions. */
    updateBots(dt);

    /* Collisions: player vs every alive bot. */
    resolveCollisions(dt, fs);

    /* Ring-outs. */
    checkRingOuts();

    if (activeMode === 'stage' && player.alive) {
        const anyAlive = bots.some(b => b.alive);
        if (!anyAlive) onStageClear();
    }

    updateHUD();
}

/* ---------------------------------------------------------------- *
 *  resolveCollisions
 * ---------------------------------------------------------------- */
function resolveCollisions(dt, fs) {
    if (!player.alive) return;

    const pPower = 5 + (Number(upgrades.power) || 1) * 3;
    const pWeight = 1 + (Number(upgrades.weight) || 1) * 0.35 + (Number(upgrades.coreDensity) || 0) * 0.8;

    for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        if (!bot || !bot.alive) continue;
        const dx = bot.x - player.x;
        const dy = bot.y - player.y;
        const dist = Math.hypot(dx, dy);
        const minDist = player.radius + bot.radius;
        if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            /* Separate. */
            player.x -= nx * overlap * 0.35;
            player.y -= ny * overlap * 0.35;
            bot.x += nx * overlap * 0.65;
            bot.y += ny * overlap * 0.65;

            /* Knockback. Bots are lighter than the player, so they fly. */
            const push = (pPower / Math.max(0.4, pWeight)) * 60 * dt;
            bot.vx += nx * push;
            bot.vy += ny * push;
            player.vx -= nx * push * 0.3;
            player.vy -= ny * push * 0.3;
            bot.lastHitTime = (performance.now ? performance.now() : Date.now());

            /* Impact feedback. */
            const burst = spawnExplosion(player.x + nx * 10, player.y + ny * 10, bot.color, 10);
            if (burst && Array.isArray(burst)) gameParticles.push.apply(gameParticles, burst);
            if (typeof window.NeonSystems?.audio?.playImpact === 'function') {
                window.NeonSystems.audio.playImpact(Math.min(1.5, push * 0.4));
            }
        }
    }
}

/* ---------------------------------------------------------------- *
 *  checkRingOuts — sumo edge rule
 * ---------------------------------------------------------------- */
function checkRingOuts() {
    const distPlayer = Math.hypot(player.x - GAME_CENTER_X, player.y - GAME_CENTER_Y);
    if (player.alive && distPlayer > offlineArenaRadius) {
        player.alive = false;
        ringOutPlayer();
        return;
    }
    for (let i = bots.length - 1; i >= 0; i--) {
        const bot = bots[i];
        if (!bot.alive) continue;
        const d = Math.hypot(bot.x - GAME_CENTER_X, bot.y - GAME_CENTER_Y);
        if (d > offlineArenaRadius + bot.radius * 0.5) {
            bot.alive = false;
            modeEliminations += 1;
            modeScore += bot.isBoss ? 3 : 1;
            const burst = spawnExplosion(bot.x, bot.y, bot.color || '#ff3366', bot.isBoss ? 36 : 18);
            if (burst && Array.isArray(burst)) gameParticles.push.apply(gameParticles, burst);
            if (typeof window.NeonSystems?.audio?.playImpact === 'function') window.NeonSystems.audio.playImpact(1);
            bots.splice(i, 1);
        }
    }
}

function ringOutPlayer() {
    gameActive = false;
    stageEnded = true;
    totalDeaths += 1;
    try { localStorage.setItem('sumo_total_deaths', String(totalDeaths)); } catch (_e) {}
    const burst = spawnExplosion(player.x, player.y, player.color || '#00e5ff', 40);
    if (burst && Array.isArray(burst)) gameParticles.push.apply(gameParticles, burst);
    showGameOverScreen('RING OUT!');
}

/* ---------------------------------------------------------------- *
 *  onStageClear — success path
 * ---------------------------------------------------------------- */
function onStageClear() {
    if (stageEnded) return;
    stageEnded = true;
    gameActive = false;
    modeRewarded = true;

    const bonus = (ARCADE_MODES[activeMode] && ARCADE_MODES[activeMode].reward) ? ARCADE_MODES[activeMode].reward : 15;
    coins += bonus;
    if (activeMode === 'stage') {
        maxUnlockedStage = Math.max(maxUnlockedStage, currentPlayingStage);
    }
    saveData();

    if (activeMode === 'stage') {
        showWinStage();
    } else {
        showWinStage();
    }
}

/* ---------------------------------------------------------------- *
 *  updateBots(dt) — AI movement, boss behaviour, death cleanup
 * ---------------------------------------------------------------- */
function updateBots(dt) {
    const fs = dt * 60;
    for (let i = bots.length - 1; i >= 0; i--) {
        const bot = bots[i];
        if (!bot.alive) { bots.splice(i, 1); continue; }

        /* Knockback integrates; add gentle damping. */
        const damp = Math.pow(0.90, dt);
        bot.vx *= damp;
        bot.vy *= damp;
        bot.x += bot.vx * dt;
        bot.y += bot.vy * dt;

        bot.aiTimer -= dt;
        bot.walkCycle += dt * 10;

        if (!player.alive) continue;
        if (bot.aiTimer <= 0) {
            bot.aiState = bot.aiState === 'chase' ? 'flank' : 'chase';
            bot.aiTimer = 1 + Math.random() * 2.2;
        }

        const dx = player.x - bot.x;
        const dy = player.y - bot.y;
        const dist = Math.hypot(dx, dy) || 1;

        let mx = dx / dist;
        let my = dy / dist;

        /* Flank state: orbit slightly to approach from the side. */
        if (bot.aiState === 'flank') {
            const ortho = ((dx * 0 - dy) / dist);
            mx += (ortho !== 0 ? ortho : 0) * 0.6;
            my += (dx / dist) * 0.6;
        }

        /* Edge / abyss avoidance. */
        const cd = Math.hypot(GAME_CENTER_X - bot.x, GAME_CENTER_Y - bot.y) || 1;
        const edgeLimit = offlineArenaRadius * 0.86;
        if (cd > edgeLimit) {
            mx += ((GAME_CENTER_X - bot.x) / cd) * 0.9;
            my += ((GAME_CENTER_Y - bot.y) / cd) * 0.9;
        }
        if (cd > offlineArenaRadius) {
            mx += ((GAME_CENTER_X - bot.x) / cd) * 2.2;
            my += ((GAME_CENTER_Y - bot.y) / cd) * 2.2;
        }

        const mag = Math.hypot(mx, my) || 1;
        mx /= mag; my /= mag;

        /* Bosses are slower but heavier and aggressive. */
        const speedScale = bot.isBoss ? 0.72 : 1;
        const moveSpeed = (bot.baseSpeed || 1.5) * 100 * speedScale * (0.8 + bot.aiAggression * 0.5);
        bot.x += mx * moveSpeed * dt;
        bot.y += my * moveSpeed * dt;

        /* Boss special: radial shockwave pulse. */
        if (bot.isBoss && player.alive) {
            const bossDist = Math.hypot(player.x - bot.x, player.y - bot.y);
            if (bossDist < bot.radius + player.radius + 8) {
                bot.lastHitTime = (performance.now ? performance.now() : Date.now());
                const n = Math.hypot(player.x - bot.x, player.y - bot.y) || 1;
                player.vx += (player.x - bot.x) / n * 320 * dt;
                player.vy += (player.y - bot.y) / n * 320 * dt;
                const burst = spawnExplosion(player.x, player.y, BOSS_COLOR, 18);
                if (burst && Array.isArray(burst)) gameParticles.push.apply(gameParticles, burst);
            }
        }
    }
}

/* ---------------------------------------------------------------- *
 *  render() — draws arena, player, bots
 * ---------------------------------------------------------------- */
function render() {
    const t = computeScreenTransform();
    const S = (x, y) => ({ x: t.ox + x * t.scale, y: t.oy + y * t.scale });

    /* Arena bed. */
    ctx.save();
    ctx.scale(t.scale, t.scale);

    /* Outer glow ring. */
    ctx.beginPath();
    ctx.arc(GAME_CENTER_X, GAME_CENTER_Y, offlineArenaRadius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(157,0,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();

    /* Boundary ring. */
    ctx.beginPath();
    ctx.arc(GAME_CENTER_X, GAME_CENTER_Y, offlineArenaRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,243,255,0.65)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* Inner decorative ring. */
    ctx.beginPath();
    ctx.arc(GAME_CENTER_X, GAME_CENTER_Y, offlineArenaRadius * 0.88, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,243,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    /* Center stone. */
    ctx.beginPath();
    ctx.arc(GAME_CENTER_X, GAME_CENTER_Y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(125,255,0,0.25)';
    ctx.shadowColor = '#7dff00';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    /* Bots. */
    for (const bot of bots) {
        if (!bot.alive) continue;
        if (bot.isBoss) renderBoss(bot);
        else renderBot(bot);
    }

    /* Player. */
    if (player.alive) renderPlayer();

    ctx.restore();
}

function renderPlayer() {
    const t = computeScreenTransform();
    const s = t.scale;
    ctx.fillStyle = player.color || '#00e5ff';
    ctx.shadowColor = player.color || '#00e5ff';
    ctx.shadowBlur = 20 * s;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    /* Glint. */
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(player.x - player.radius * 0.28, player.y - player.radius * 0.32, player.radius * 0.16, 0, Math.PI * 2);
    ctx.fill();
    /* HP pip hint. */
    if (playerHp < PLAYER_MAX_HP) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `${Math.round(9 * s)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('♥'.repeat(Math.max(0, playerHp)), player.x, player.y - player.radius - 8 * s);
    }
}

function renderBot(bot) {
    ctx.save();
    ctx.fillStyle = bot.color || '#ff3366';
    ctx.shadowColor = bot.color || '#ff3366';
    ctx.shadowBlur = 10;
    /* Body. */
    ctx.beginPath();
    ctx.ellipse(bot.x, bot.y, bot.radius, bot.radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    /* Eyes — direction toward centre. */
    const eyes = Math.atan2(GAME_CENTER_Y - bot.y, GAME_CENTER_X - bot.x);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bot.x + Math.cos(eyes - 0.4) * bot.radius * 0.4, bot.y + Math.sin(eyes - 0.4) * bot.radius * 0.4, bot.radius * 0.14, 0, Math.PI * 2);
    ctx.arc(bot.x + Math.cos(eyes + 0.4) * bot.radius * 0.4, bot.y + Math.sin(eyes + 0.4) * bot.radius * 0.4, bot.radius * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function renderBoss(bot) {
    ctx.save();
    ctx.fillStyle = BOSS_COLOR;
    ctx.shadowColor = BOSS_COLOR;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(bot.x, bot.y, bot.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    /* Crown. */
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(bot.x - bot.radius * 0.5, bot.y - bot.radius - 12, bot.radius, 6);
    ctx.beginPath();
    ctx.moveTo(bot.x - bot.radius * 0.5, bot.y - bot.radius);
    ctx.lineTo(bot.x - bot.radius * 0.25, bot.y - bot.radius - 10);
    ctx.lineTo(bot.x, bot.y - bot.radius);
    ctx.lineTo(bot.x + bot.radius * 0.25, bot.y - bot.radius - 10);
    ctx.lineTo(bot.x + bot.radius * 0.5, bot.y - bot.radius);
    ctx.fill();
    /* Boss HP bar. */
    const w = bot.radius * 2;
    const hpRatio = bot.maxHp > 0 ? (bot.hp / bot.maxHp) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bot.x - w / 2, bot.y - bot.radius - 24, w, 6);
    ctx.fillStyle = '#ff2bd6';
    ctx.fillRect(bot.x - w / 2, bot.y - bot.radius - 24, w * Math.max(0, hpRatio), 6);
    ctx.restore();
}

/* ---------------------------------------------------------------- *
 *  handleSwipe(angle) — swipe-triggered dash
 * ---------------------------------------------------------------- */
function handleSwipe(angle) {
    const rad = angle * Math.PI / 180;
    player.vx = Math.cos(rad) * 430;
    player.vy = Math.sin(rad) * 430;
    const burst = spawnExplosion(player.x, player.y, player.color || '#00e5ff', 14);
    if (burst && Array.isArray(burst)) gameParticles.push.apply(gameParticles, burst);
    if (typeof window.NeonSystems?.audio?.playDash === 'function') window.NeonSystems.audio.playDash();
    if (typeof window.NeonSystems?.audio?.screenFlash === 'function') window.NeonSystems.audio.screenFlash('rgba(0,243,255,0.10)');
}

/* ---------------------------------------------------------------- *
 *  STAGE MODE — startOfflineStage(level)
 * ---------------------------------------------------------------- */
function startOfflineStage(level) {
    const lvl = Math.max(1, Math.floor(level) || 1);
    currentPlayingStage = lvl;
    gameActive = true;
    gameMode = 'offline';
    activeMode = 'stage';
    stageEnded = false;
    stageReady = true;
    playerHp = PLAYER_MAX_HP;
    modeScore = 0;
    modeEliminations = 0;
    modeRewarded = false;

    let cfg = null;
    if (typeof window.NeonSystems?.progression?.getStageConfig === 'function') {
        try { cfg = window.NeonSystems.progression.getStageConfig(lvl); } catch (_e) { cfg = null; }
    }
    const radius = (cfg && cfg.arenaRadius) ? cfg.arenaRadius : Math.max(160, 250 - Math.floor(lvl / 5) * 2);
    offlineArenaRadius = radius;
    reviveSnapshot = { x: GAME_CENTER_X, y: GAME_CENTER_Y, radius };

    hideAllMenus();
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.classList.remove('hidden');
    if (touchBox) { touchBox.style.display = 'block'; touchBox.classList.add('active'); }

    player.x = GAME_CENTER_X;
    player.y = GAME_CENTER_Y;
    player.vx = 0; player.vy = 0;
    player.alive = true;
    applyEquippedSkin();

    bots = [];
    gameParticles = [];

    const botCountRaw = (cfg && cfg.botCount) ? cfg.botCount : 1 + Math.floor(lvl / 2);
    const botCount = Math.min(8, Math.max(1, botCountRaw));
    const isBossStage = !!(cfg && cfg.isBoss);
    const isMiniBoss = !!(cfg && cfg.isMiniBoss && !isBossStage);

    for (let i = 0; i < botCount; i++) {
        const angle = (Math.PI * 2 * i) / botCount + Math.random() * 0.6;
        const rr = Math.min(190, radius * 0.72);
        const bx = GAME_CENTER_X + Math.cos(angle) * rr;
        const by = GAME_CENTER_Y + Math.sin(angle) * rr;
        const st = (cfg && cfg.botStats) || {};
        const boss = isBossStage && i === 0;
        const bossProf = (boss && window.NeonSystems?.bosses && typeof window.NeonSystems.bosses.profile === 'function')
            ? window.NeonSystems.bosses.profile(lvl, player.radius) : null;
        bots.push({
            x: bx, y: by, vx: 0, vy: 0,
            radius: boss ? ((bossProf && bossProf.radius) || 32)
                : (isMiniBoss ? ((st.radius || 18) * 1.5) : (st.radius || 18)),
            color: boss ? BOSS_COLOR : (i % 2 === 0 ? '#ff3366' : '#ffbb00'),
            alive: true, team: i % 2 === 0 ? 'red' : 'blue',
            w: 22, h: 30, walkCycle: 0, score: 0,
            aiState: 'patrol', aiTimer: 0, aiTarget: null,
            baseSpeed: (st.speed || 0.6) + 0.5,
            aiAggression: (st.aggression != null) ? st.aggression : 0.5,
            edgeAvoidTimer: 0, lastHitTime: 0, knockbackX: 0, knockbackY: 0,
            isBoss: boss, isMiniBoss: !!isMiniBoss,
            power: (st.power || 6), mass: (st.mass || 1.2),
            hp: boss ? ((bossProf && bossProf.maxHp) || 6) : 1,
            maxHp: boss ? ((bossProf && bossProf.maxHp) || 6) : 1
        });
    }

    updateHUD();
    startGameLoop();
    if (typeof window.NeonSystems?.audio?.playClick === 'function') window.NeonSystems.audio.playClick();
    if (typeof screenFlash === 'function') screenFlash('rgba(0,243,255,0.12)');
    saveData();
}

/* ---------------------------------------------------------------- *
 *  SHOP
 * ---------------------------------------------------------------- */
function renderBodyUpgrades() {
    const grid = document.getElementById('body-upgrade-grid');
    if (!grid) return;
    grid.innerHTML = '';
    (typeof bodyUpgrades !== 'undefined' ? bodyUpgrades : []).forEach(def => {
        const cur = Number(upgrades[def.id]) || 0;
        const maxed = cur >= def.max;
        const cost = def.cost ? def.cost(cur) : (cur + 1) * 45;
        const locked = (maxUnlockedStage || 1) < def.unlock;
        const card = document.createElement('div');
        card.className = 'body-upgrade-card';
        card.innerHTML = '<div class="body-upgrade-name"><span>'
            + (def.icon || '◈') + '</span> ' + def.name
            + (maxed ? ' <span style="color:#7dff00">MAX</span>' : '')
            + '</div>'
            + '<small>' + def.lore + '</small>'
            + '<small style="color:#ffbb00">' + (locked ? 'Unlock at wave ' + def.unlock : 'Lv ' + cur + '/' + def.max) + '</small>'
            + '<button class="shop-btn" type="button" '
            + (locked || maxed ? 'disabled' : `onclick="buyUpgrade('${def.id}')"`)
            + '>' + (locked ? '🔒 Locked' : maxed ? 'Maxed' : (def.cost ? cost + ' 🪙' : 'Buy'))
            + '</button>';
        grid.appendChild(card);
    });

    const sw = document.getElementById('stat-weight');
    if (sw) sw.innerText = 'Lvl ' + (Number(upgrades.weight) || 1);
    const sp = document.getElementById('stat-power');
    if (sp) sp.innerText = 'Lvl ' + (Number(upgrades.power) || 1);
}

function showShop() {
    hideAllMenus();
    const shop = document.getElementById('menu-shop');
    if (shop) shop.classList.remove('hidden');
    const sc = document.getElementById('shop-coins');
    if (sc) sc.innerText = coins;
    if (typeof renderSkinShop === 'function') renderSkinShop();
    renderBodyUpgrades();
}

function buyUpgrade(type) {
    if (type === 'weight' || type === 'power') {
        const cur = Number(upgrades[type]) || 1;
        const cost = (cur) * 20;
        if (coins < cost) { try { alert('الكوينز غير كافية!'); } catch (_e) {} return; }
        coins -= cost;
        upgrades[type] = cur + 1;
        saveData();
        renderBodyUpgrades();
        return;
    }

    const def = (typeof bodyUpgrades !== 'undefined' ? bodyUpgrades : []).find(b => b.id === type);
    if (!def) return;
    const cur = Number(upgrades[def.id]) || 0;
    if (cur >= def.max) return;
    if ((maxUnlockedStage || 1) < def.unlock) { try { alert('Unlock at stage ' + def.unlock); } catch (_e) {} return; }
    const cost = def.cost ? def.cost(cur) : (cur + 1) * 45;
    if (coins < cost) { try { alert('الكوينز غير كافية!'); } catch (_e) {} return; }
    coins -= cost;
    upgrades[def.id] = cur + 1;
    saveData();
    renderBodyUpgrades();
}

/* ---------------------------------------------------------------- *
 *  P2P LOBBY SHARE
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

/* Signature required by index.html wiring — exported globally. */
window.NeonSumoGame = {
    initializeGame: initializeGame,
    startGameLoop: startGameLoop,
    stopGameLoopBinding: stopGameLoopBinding,
    updateHUD: updateHUD,
    updatePhysics: updatePhysics,
    updateBots: updateBots,
    render: render,
    handleSwipe: handleSwipe,
    startOfflineStage: startOfflineStage,
    showShop: showShop,
    buyUpgrade: buyUpgrade,
    shareRoomWhatsApp: shareRoomWhatsApp,
    copyRoomLink: copyRoomLink
};
