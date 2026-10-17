/* ============================================================
 * GAME 20 — DDoS BOSS
 * Survive the four-phase flood-node and break its cores.
 * ============================================================ */
import {
  integrate, clampCircleToBounds, clamp,
  pointerPos, circle, roundRect, glow, noGlow, labelCenter, label, makeRng,
} from '../physics.js';

export const id = 'g20';
export const accent = '#F43F5E';

const W = 640, H = 480;
const MAX_BULLETS = 420;
const MAX_SHIELDS = 3;
const PLAYER_SPEED = 205;
const DASH_SPEED = 720;
const DASH_CD = 1.4;
const GRAZE_R = 30;
const CHARGE_PER_GRAZE = 0.055;
const PHASES = 4;

// per-phase tuning: cores, core hp, ring/spiral/aimed/wall cadence, contact dps, exposure cycle
const TUNE = [
  { cores: 3, hp: 22, ringGap: 1.55, ringSpeed: 78, ringN: 12, spiralGap: 0.17, aimedGap: 2.6, wallGap: 4.2, contact: 40, open: 4.2, shut: 2.8 },
  { cores: 4, hp: 26, ringGap: 1.2, ringSpeed: 96, ringN: 14, spiralGap: 0.1, aimedGap: 1.9, wallGap: 3.2, contact: 50, open: 3.8, shut: 2.4 },
  { cores: 5, hp: 30, ringGap: 0.95, ringSpeed: 118, ringN: 16, spiralGap: 0.075, aimedGap: 1.35, wallGap: 2.3, contact: 62, open: 3.4, shut: 2.0 },
  { cores: 5, hp: 34, ringGap: 0.75, ringSpeed: 142, ringN: 18, spiralGap: 0.055, aimedGap: 0.95, wallGap: 1.7, contact: 78, open: 3.0, shut: 1.6 },
];
const REACH = 24;
const BULLET_COLS = ['#6366F1', '#10B981', '#F43F5E', '#F59E0B'];

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xD205);
  const state = {
    t: 0, score: 0, shown: -1, shields: MAX_SHIELDS, over: false, won: false,
    phase: 0, phaseFlash: 0, shake: 0, hitFlash: 0,
    charge: 0, bombReady: false, bombFx: 0, grazeRun: 0, bestGraze: 0,
    time: 0, kills: 0, spawnAcc: 0, atk: 0, spiralAcc: 0, aimedAcc: 0, wallAcc: 0,
  };
  const keys = new Set();
  const bullets = [];
  const beams = [];
  const parts = [];
  const floats = [];
  const player = {
    x: W / 2, y: H - 96, vx: 0, vy: 0, r: 7, tx: W / 2, ty: H - 96, usingPointer: false,
    dashT: 0, dashCd: 0, inv: 1.1, blink: 0,
  };
  const boss = {
    x: W / 2, y: 92, r: 42, hp: 1, hpMax: 1, ph: 0, vx: 0, vy: 0,
    exposed: false, expT: 0, closed: 2.8, hitT: 0, dead: false, cores: [],
  };

  // ---- core setup -----------------------------------------------------------
  const buildCores = (tune) => {
    boss.cores = [];
    const n = tune.cores;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const ring = n <= 3 ? 30 : 36;
      const hp = Math.round(tune.hp * (i === 0 ? 1.45 : 1));
      boss.cores.push({
        i, hp, hpMax: hp, alive: true,
        ox: Math.cos(a) * ring, oy: Math.sin(a) * ring * 0.68,
        ph: a, flash: 0,
      });
    }
    let sum = 0;
    for (const k of boss.cores) sum += k.hp;
    return sum;
  };
  const totalHp = () => boss.cores.reduce((s, k) => s + (k.alive ? k.hp : 0), 0);
  boss.hpMax = buildCores(TUNE[0]);
  boss.hp = boss.hpMax;

  const spawnCores = () => {
    for (let i = 0; i < 6; i++) {
      parts.push({ x: boss.x + (rng() - 0.5) * 60, y: boss.y + (rng() - 0.5) * 50, vx: (rng() - 0.5) * 90, vy: -60 - rng() * 80, r: 3, life: 1, col: '#6366F1' });
    }
  };

  // ---- bullets --------------------------------------------------------------
  const pushBullet = (x, y, ang, speed, r, col, kind = 'std') => {
    if (bullets.length >= MAX_BULLETS) {
      // graceful degrade: shed the oldest instead of growing without bound
      bullets.shift();
    }
    bullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, col, kind, spin: rng() * 6.28, life: 7, gz: -9 });
  };
  const ringBurst = (n, speed, off) => {
    for (let i = 0; i < n; i++) pushBullet(boss.x, boss.y, off + (i / n) * Math.PI * 2, speed, 5, '#6366F1');
  };
  const ringFromCore = (core, n, speed, off) => {
    const cx = boss.x + core.ox, cy = boss.y + core.oy;
    for (let i = 0; i < n; i++) pushBullet(cx, cy, off + (i / n) * Math.PI * 2, speed, 4, '#10B981');
  };
  const aimedShot = (speed, n, spread) => {
    const bx = player.x, by = player.y;
    const base = Math.atan2(by - boss.y, bx - boss.x);
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * spread;
      pushBullet(boss.x, boss.y + 14, base + off, speed, 6, '#F43F5E');
    }
  };

  // ---- boss pattern state machine ------------------------------------------
  const firePattern = (dt) => {
    const tune = TUNE[state.phase];
    state.atk += dt;
    state.spiralAcc += dt;
    state.aimedAcc += dt;
    state.wallAcc += dt;
    const live = boss.cores.filter((k) => k.alive);

    if (state.atk >= tune.ringGap) {
      state.atk = 0;
      if (state.phase === 0) ringBurst(tune.ringN, tune.ringSpeed, rng() * 6.28);
      else if (state.phase === 1) { ringBurst(tune.ringN, tune.ringSpeed, state.t * 0.8); if (live.length) ringFromCore(live[0], 8, tune.ringSpeed * 0.8, rng() * 6.28); }
      else if (state.phase === 2) {
        ringBurst(tune.ringN, tune.ringSpeed, state.t);
        if (live.length) ringFromCore(live[0], 6, tune.ringSpeed * 0.7, -state.t * 1.3);
        ringFromCore(live[live.length - 1] || live[0], 6, tune.ringSpeed * 0.7, state.t * 1.1);
      } else {
        for (const k of live) ringFromCore(k, 7, tune.ringSpeed * 0.72, rng() * 6.28);
        if (live.length > 1) ringBurst(tune.ringN, tune.ringSpeed * 0.55, state.t * 1.6);
      }
      if (ctx.audio) ctx.audio.shoot();
      if (live.length) live[(rng() * live.length) | 0].flash = 0.18;
    }

    // spiral stream — arms grow with phase
    if (state.phase >= 1) {
      const arms = state.phase + 1;
      const gap = tune.spiralGap;
      while (state.spiralAcc >= gap) {
        state.spiralAcc -= gap;
        const off = state.t * 2.6;
        for (let a = 0; a < arms; a++) ringFromCore(live[a % live.length] || boss.cores[0], 1, 116 + state.phase * 14, off + (a / arms) * Math.PI * 2);
        if (state.phase === 3) {
          for (let a = 0; a < arms; a++) ringFromCore(live[a % live.length] || boss.cores[0], 1, 104, off + Math.PI + (a / arms) * Math.PI * 2);
        }
      }
    }

    // aimed shotgun
    if (state.aimedAcc >= tune.aimedGap) {
      state.aimedAcc = 0;
      const shots = state.phase === 0 ? 1 : state.phase === 1 ? 3 : state.phase === 2 ? 5 : 7;
      const spd = 150 + state.phase * 34;
      const spread = 0.16 + state.phase * 0.05;
      aimedShot(spd, shots, spread);
      if (ctx.audio) ctx.audio.shoot();
    }

    // sweeping wall with a gap
    if (state.wallAcc >= tune.wallGap) {
      state.wallAcc = 0;
      const gapW = Math.max(1, 3 - state.phase * 0.5);
      const gapCenter = 70 + rng() * (W - 140);
      const step = 26;
      const off = rng() * step;
      for (let x = off; x < W; x += step) {
        for (let y = 26; y < H; y += step) {
          if (x > gapCenter - gapW * 13 && x < gapCenter + gapW * 13) continue;
          pushBullet(x, y, Math.PI / 2, 118 + state.phase * 22, 5, '#F59E0B', 'wall');
        }
      }
      if (ctx.audio) ctx.audio.alarm();
      state.shake = Math.min(14, 5 + state.phase * 2);
    }
  };

  // ---- player actions -------------------------------------------------------
  // single place that applies core damage and handles the kill, so bombs and
// contact can never leave a dead core flagged alive
  const coreHurt = (k, dmg) => {
    if (!k.alive) return false;
    k.hp -= dmg;
    k.flash = 0.3;
    if (k.hp > 0) return true;
    k.alive = false;
    state.kills++;
    state.score += 60 * (state.phase + 1);
    pushScore();
    state.shake = Math.min(16, 8 + state.phase * 2);
    if (ctx.audio) ctx.audio.explode();
    floats.push({ x: boss.x + k.ox, y: boss.y + k.oy, life: 1, txt: 'CORE DOWN' });
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, sp = 70 + rng() * 180;
      parts.push({ x: boss.x + k.ox, y: boss.y + k.oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2, life: 0.8, col: '#F59E0B' });
    }
    return true;
  };

  const bomb = () => {
    if (!state.bombReady || state.over) return;
    state.bombReady = false;
    state.charge = 0;
    state.bombFx = 0.55;
    state.shake = 16;
    bullets.length = 0;
    beams.length = 0;
    let gained = 0;
    const dmg = 6 + state.phase * 3;
    for (const k of boss.cores) {
      if (k.alive && !boss.exposed && coreHurt(k, dmg)) gained += dmg;
    }
    boss.hp = totalHp();
    scoreHit(gained, false);
    if (ctx.audio) ctx.audio.explode();
    if (boss.cores.every((k) => !k.alive) && !boss.dead) breakCore();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      parts.push({ x: player.x, y: player.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 3, life: 1, col: '#10B981' });
    }
  };

  const scoreHit = (amount, exposeBonus) => {
    if (amount <= 0) return;
    const gain = Math.round(amount * (state.phase + 1) * (exposeBonus ? 1.5 : 1));
    if (gain <= 0) return;
    state.score += gain;
    pushScore();
    if (gain >= 24 && ctx.audio) ctx.audio.perfect();
    else if (ctx.audio) ctx.audio.hit();
  };

  const damageBoss = (dt) => {
    if (state.over || boss.dead || !boss.exposed) return;
    let hit = false;
    for (const k of boss.cores) {
      if (!k.alive) continue;
      const dx = player.x - (boss.x + k.ox), dy = player.y - (boss.y + k.oy);
      const rad = k.r0 + player.r + REACH;
      if (dx * dx + dy * dy > rad * rad) continue;
      const dmg = TUNE[state.phase].contact * dt;
      k.flash = 0.12;
      if (!coreHurt(k, dmg)) continue;
      hit = true;
    }
    if (!hit) return;
    scoreHit(dt * 8, true);
    boss.hp = totalHp();
    if (boss.cores.every((k) => !k.alive)) { breakCore(); return; }
    const left = boss.cores.filter((k) => k.alive).length;
    if (left === 1 && !boss.exposed) openCores(TUNE[state.phase].open + 1.2);
  };

  const openCores = (secs) => {
    if (boss.dead) return;
    boss.exposed = true;
    boss.expT = secs;
    if (ctx.audio) ctx.audio.powerup();
    floats.push({ x: boss.x, y: boss.y + 40, life: 1, txt: 'CORES EXPOSED' });
  };

  const breakCore = () => {
    boss.dead = true;
    state.shake = 20;
    state.phaseFlash = 0.5;
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2, s = 90 + rng() * 300;
      parts.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + rng() * 4, life: 1.3, col: rng() < 0.5 ? '#F43F5E' : '#F59E0B' });
    }
    ctx.after(420, () => {
      if (state.over) return;
      bullets.length = 0;
      beams.length = 0;
      if (state.phase < PHASES - 1) {
        state.phase++;
        state.phaseFlash = 0.7;
        state.shake = 14;
        const tune = TUNE[state.phase];
        boss.hpMax = buildCores(tune);
        boss.hp = boss.hpMax;
        boss.dead = false;
        boss.exposed = false;
        boss.closed = TUNE[state.phase].shut;
        player.inv = 1.4;
        state.charge = Math.min(1, state.charge + 0.35);
        if (ctx.audio) ctx.audio.alarm();
      } else win();
    });
  };

  // onScore fires the live HUD feed, so only push when the integer actually moves
  const pushScore = () => {
    const shown = state.score | 0;
    if (shown === state.shown) return;
    state.shown = shown;
    ctx.onScore(shown);
  };

  const win = () => {
    if (state.over) return;
    state.over = true;
    state.won = true;
    const bonus = Math.max(0, Math.round((6000 - state.time * 1000))) + state.score;
    state.score = bonus;
    state.shown = -1;
    pushScore();
    ctx.loop && ctx.loop.stop();
    if (ctx.audio) ctx.audio.win();
    ctx.finish(state.score);
  };

  const lose = () => {
    if (state.over) return;
    state.over = true;
    ctx.loop && ctx.loop.stop();
    if (ctx.audio) ctx.audio.gameOver();
    ctx.finish(state.score);
  };

  // ---- input ----------------------------------------------------------------
  const toGame = (ev) => {
    const p = pointerPos(ctx.canvas, ev);
    return { x: (p.x * W) / ctx.canvas.width, y: (p.y * H) / ctx.canvas.height };
  };
  const setPointer = (ev) => {
    if (state.over) return;
    const g = toGame(ev);
    player.tx = g.x; player.ty = g.y;
    player.usingPointer = true;
  };
  const movePtr = (ev) => setPointer(ev);
  ctx.listeners.on(ctx.canvas, 'pointermove', movePtr);
  ctx.listeners.on(ctx.canvas, 'pointerdown', (ev) => { setPointer(ev); });
  ctx.listeners.on(ctx.canvas, 'pointerleave', () => { player.usingPointer = false; });

  const keyName = (ev) => {
    const k = ev.key;
    if (k === ' ' || ev.code === 'Space') return 'dash';
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') return 'left';
    if (k === 'ArrowRight' || k === 'd' || k === 'D') return 'right';
    if (k === 'ArrowUp' || k === 'w' || k === 'W') return 'up';
    if (k === 'ArrowDown' || k === 's' || k === 'S') return 'down';
    if (k === 'x' || k === 'X') return 'bomb';
    if (k === 'Escape') return 'esc';
    return null;
  };
  const onKeyDown = (ev) => {
    const n = keyName(ev);
    if (!n) return;
    if (n === 'esc') return;
    keys.add(n);
    if (n === 'dash') tryDash();
    if (n === 'bomb') bomb();
    if (ev.preventDefault) ev.preventDefault();
  };
  const onKeyUp = (ev) => {
    const n = keyName(ev);
    if (n) keys.delete(n);
  };
  ctx.listeners.on(window, 'keydown', onKeyDown);
  ctx.listeners.on(window, 'keyup', onKeyUp);

  const tryDash = () => {
    if (state.over || player.dashCd > 0 || player.dashT > 0) return;
    let dx = 0, dy = 0;
    if (keys.has('left')) dx -= 1;
    if (keys.has('right')) dx += 1;
    if (keys.has('up')) dy -= 1;
    if (keys.has('down')) dy += 1;
    if (dx === 0 && dy === 0) {
      if (player.usingPointer) {
        const ang = Math.atan2(player.ty - player.y, player.tx - player.x);
        dx = Math.cos(ang); dy = Math.sin(ang);
      } else dy = -1;
    }
    const m = Math.hypot(dx, dy) || 1;
    player.vx = (dx / m) * DASH_SPEED;
    player.vy = (dy / m) * DASH_SPEED;
    player.dashT = 0.16;
    player.dashCd = DASH_CD;
    player.inv = Math.max(player.inv, 0.22);
    if (ctx.audio) ctx.audio.jump();
    for (let i = 0; i < 7; i++) {
      const a = Math.atan2(-player.vy, -player.vx) + (rng() - 0.5) * 0.8;
      parts.push({ x: player.x, y: player.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, r: 2, life: 0.5, col: '#10B981' });
    }
  };

  // ---- per-phase start hook -------------------------------------------------
  ctx.every(1500, () => {
    if (state.over) return;
    spawnCores();
    if (ctx.audio) ctx.audio.tick();
  });

  // ---- update ---------------------------------------------------------------
  const movePlayer = (dt) => {
    let dx = 0, dy = 0;
    const kx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    const ky = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    if (kx || ky) { dx = kx; dy = ky; player.usingPointer = false; }
    const m = Math.hypot(dx, dy);
    if (m > 0) { dx /= m; dy /= m; player.vx = dx * PLAYER_SPEED; player.vy = dy * PLAYER_SPEED; player.dashT = 0; }
    else if (player.dashT <= 0) {
      if (player.usingPointer) {
        const tx = clamp(player.tx, player.r, W - player.r);
        const ty = clamp(player.ty, player.r, H - player.r);
        const ang = Math.atan2(ty - player.y, tx - player.x);
        const d = Math.hypot(tx - player.x, ty - player.y);
        const sp = Math.min(PLAYER_SPEED, 40 + d * 6);
        player.vx = Math.cos(ang) * sp;
        player.vy = Math.sin(ang) * sp;
        if (d < 2) { player.vx = 0; player.vy = 0; }
      } else { player.vx *= Math.max(0, 1 - dt * 9); player.vy *= Math.max(0, 1 - dt * 9); }
    }
    if (player.dashT > 0) player.dashT = Math.max(0, player.dashT - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.inv = Math.max(0, player.inv - dt);
    player.blink += dt;
    integrate(player, dt, W, H, null);
  };

  const updateBullets = (dt) => {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.spin += dt * 3;
      b.life -= dt;
      if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30 || b.life <= 0) { bullets.splice(i, 1); continue; }
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const bm = beams[i];
      bm.life -= dt;
      bm.w = 8 + (1 - bm.life / bm.max) * 26;
      if (bm.life <= 0) beams.splice(i, 1);
    }
  };

  const collide = () => {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const dx = b.x - player.x, dy = b.y - player.y;
      const d2 = dx * dx + dy * dy;
      const hitR = player.r + b.r;
      if (d2 < hitR * hitR) {
        if (player.inv > 0) continue;
        state.shields--;
        player.inv = 1.6;
        state.hitFlash = 0.4;
        state.shake = 13;
        state.grazeRun = 0;
        state.charge = Math.max(0, state.charge - 0.2);
        bullets.splice(i, 1);
        if (ctx.audio) ctx.audio.hit();
        floats.push({ x: player.x, y: player.y - 20, life: 1, txt: 'NODE HIT' });
        if (state.shields <= 0) { lose(); return; }
        continue;
      }
      if (d2 < (hitR + GRAZE_R) ** 2) {
        if (state.t - b.gz < 0.45) continue;
        b.gz = state.t;
        state.grazeRun++;
        if (state.grazeRun > state.bestGraze) state.bestGraze = state.grazeRun;
        if (!state.bombReady) {
          state.charge = Math.min(1, state.charge + CHARGE_PER_GRAZE);
          if (state.charge >= 1) {
            state.bombReady = true;
            if (ctx.audio) ctx.audio.powerup();
            floats.push({ x: player.x, y: player.y - 26, life: 1, txt: 'OVERDRIVE' });
          }
        }
        if (ctx.audio && ((state.t * 9) | 0) % 3 === 0) ctx.audio.tick();
      }
    }
  };

  const updateBoss = (dt) => {
    boss.ph += dt;
    boss.hitT = Math.max(0, boss.hitT - dt);
    for (const k of boss.cores) k.flash = Math.max(0, k.flash - dt);
    const sway = Math.sin(boss.ph * 0.7) * 46;
    boss.vx = Math.cos(boss.ph * 0.7) * 32;
    boss.vy = Math.cos(boss.ph * 1.1) * 11;
    boss.x = W / 2 + sway;
    boss.y = 88 + Math.sin(boss.ph * 1.1) * 10;
    clampCircleToBounds(boss, W, H);
    for (const k of boss.cores) {
      k.ox = Math.cos(k.ph + boss.ph * 0.35) * (boss.cores.length <= 3 ? 30 : 36);
      k.oy = Math.sin(k.ph + boss.ph * 0.35) * (boss.cores.length <= 3 ? 20 : 25);
      k.r0 = 14;
    }
    if (boss.exposed) {
      boss.expT -= dt;
      if (boss.expT <= 0) { boss.exposed = false; boss.closed = TUNE[state.phase].shut; state.phaseFlash = 0.3; }
    } else {
      boss.closed -= dt;
      if (boss.closed <= 0) openCores(TUNE[state.phase].open);
    }
    boss.hp = totalHp();
  };

  const updateFx = (dt) => {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 2.4); p.vy *= Math.max(0, 1 - dt * 2.4);
      p.life -= dt * 1.6;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.y -= dt * 22; f.life -= dt * 1.1;
      if (f.life <= 0) floats.splice(i, 1);
    }
    state.phaseFlash = Math.max(0, state.phaseFlash - dt);
    state.hitFlash = Math.max(0, state.hitFlash - dt);
    state.shake *= Math.max(0, 1 - dt * 6);
    state.bombFx = Math.max(0, state.bombFx - dt);
  };

  const update = (dt) => {
    state.t += dt;
    if (state.over) { updateFx(dt); return; }
    state.time += dt;
    movePlayer(dt);
    updateBoss(dt);
    if (!boss.dead) firePattern(dt);
    updateBullets(dt);
    damageBoss(dt);
    if (!state.over) collide();
    updateFx(dt);
  };

  // ---- draw -----------------------------------------------------------------
  const drawBackdrop = () => {
    c.fillStyle = '#090D16';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(99,102,241,0.10)';
    c.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 40) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    // flood wash under the boss, thicker each phase
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(244,63,94,${0.05 + state.phase * 0.02})`);
    g.addColorStop(0.5, 'rgba(9,13,22,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  };

  const drawBoss = () => {
    const ex = boss.exposed;
    const coreCol = boss.dead ? '#64748B' : ex ? '#F59E0B' : '#6366F1';
    // shell
    glow(c, coreCol, 18 + (ex ? 16 : 0));
    c.fillStyle = '#111A2E';
    c.strokeStyle = coreCol;
    c.lineWidth = 2;
    circle(c, boss.x, boss.y, boss.r);
    c.fill();
    c.stroke();
    // rotating shell arcs
    for (let i = 0; i < 3; i++) {
      const a0 = boss.ph * (0.5 + i * 0.28) + i * 2.1;
      c.strokeStyle = i % 2 ? 'rgba(16,185,129,0.55)' : 'rgba(99,102,241,0.7)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(boss.x, boss.y, boss.r - 9 - i * 7, a0, a0 + 1.5 + i * 0.3);
      c.stroke();
      c.beginPath();
      c.arc(boss.x, boss.y, boss.r - 9 - i * 7, a0 + Math.PI, a0 + Math.PI + 1.2);
      c.stroke();
    }
    noGlow(c);
    // heat readout
    c.fillStyle = '#0B1220';
    circle(c, boss.x, boss.y, 13);
    c.fill();
    const frac = boss.hpMax ? clamp(boss.hp / boss.hpMax, 0, 1) : 0;
    glow(c, frac < 0.3 ? '#F43F5E' : '#10B981', 12);
    c.fillStyle = frac < 0.3 ? '#F43F5E' : '#10B981';
    circle(c, boss.x, boss.y, 11 * frac + 1);
    c.fill();
    noGlow(c);

    // cores
    for (const k of boss.cores) {
      if (!k.alive) continue;
      const cx = boss.x + k.ox, cy = boss.y + k.oy;
      const cf = clamp(k.hp / k.hpMax, 0, 1);
      const col = k.flash > 0 ? '#E2E8F0' : ex ? '#F59E0B' : '#10B981';
      glow(c, col, 14);
      c.fillStyle = '#0B1220';
      c.strokeStyle = col;
      c.lineWidth = 2;
      circle(c, cx, cy, k.r0);
      c.fill();
      c.stroke();
      c.fillStyle = col;
      circle(c, cx, cy, k.r0 * cf * 0.72 + 1);
      c.fill();
      noGlow(c);
    }
  };

  const drawPlayer = () => {
    if (player.inv > 0 && Math.floor(player.blink * 18) % 2 === 0) return;
    const boosting = state.bombReady;
    glow(c, boosting ? '#F43F5E' : '#10B981', 16);
    c.fillStyle = boosting ? '#F43F5E' : '#10B981';
    c.strokeStyle = '#E2E8F0';
    c.lineWidth = 1.5;
    circle(c, player.x, player.y, player.r);
    c.fill();
    c.stroke();
    if (player.dashT > 0) {
      c.strokeStyle = 'rgba(16,185,129,0.5)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(player.x, player.y);
      c.lineTo(player.x - player.vx * 0.03, player.y - player.vy * 0.03);
      c.stroke();
    }
    noGlow(c);
    // shield pips orbit the node
    for (let i = 0; i < state.shields; i++) {
      const a = boss.ph * 0.9 + (i / MAX_SHIELDS) * Math.PI * 2;
      glow(c, '#6366F1', 10);
      c.fillStyle = '#6366F1';
      circle(c, player.x + Math.cos(a) * 15, player.y + Math.sin(a) * 15, 3);
      c.fill();
      noGlow(c);
    }
    // dash cooldown ring
    const cdFrac = 1 - player.dashCd / DASH_CD;
    c.strokeStyle = cdFrac >= 1 ? '#10B981' : 'rgba(100,116,139,0.7)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(player.x, player.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(cdFrac, 0, 1));
    c.stroke();
  };

  // one shadow pass per colour instead of one per bullet — at 420 bullets the
  // per-bullet glow was the single most expensive thing in the frame
  const drawBullets = () => {
    for (const b of bullets) {
      if (b.kind !== 'wall') continue;
      c.fillStyle = b.col;
      roundRect(c, b.x - b.r, b.y - b.r * 0.8, b.r * 2, b.r * 1.6, 2);
      c.fill();
    }
    for (let ci = 0; ci < BULLET_COLS.length; ci++) {
      const col = BULLET_COLS[ci];
      let any = false;
      for (const b of bullets) if (!any && b.kind !== 'wall' && b.col === col) any = true;
      if (!any) continue;
      glow(c, col, 7);
      c.fillStyle = col;
      for (const b of bullets) {
        if (b.kind === 'wall' || b.col !== col) continue;
        circle(c, b.x, b.y, b.r);
        c.fill();
      }
      noGlow(c);
    }
    for (const b of bullets) {
      if (b.kind === 'wall') continue;
      c.fillStyle = '#090D16';
      circle(c, b.x, b.y, b.r * 0.4);
      c.fill();
    }
  };

  const drawBeams = () => {
    for (const bm of beams) {
      c.globalAlpha = clamp(bm.life / bm.max, 0, 1);
      c.fillStyle = bm.col;
      circle(c, bm.x, bm.y, bm.w * (0.6 + (bm.life / bm.max) * 0.4));
      c.fill();
    }
    c.globalAlpha = 1;
  };

  const drawFx = () => {
    for (const p of parts) {
      c.globalAlpha = clamp(p.life, 0, 1);
      c.fillStyle = p.col;
      circle(c, p.x, p.y, p.r * clamp(p.life, 0, 1));
      c.fill();
    }
    c.globalAlpha = 1;
    for (const f of floats) {
      c.globalAlpha = clamp(f.life, 0, 1);
      labelCenter(c, f.txt, f.x, f.y, 12, '#E2E8F0');
    }
    c.globalAlpha = 1;
    if (state.bombFx > 0) {
      const r = (1 - state.bombFx / 0.55) * 720;
      glow(c, '#10B981', 24);
      c.strokeStyle = '#10B981';
      c.lineWidth = 6 * (state.bombFx / 0.55);
      circle(c, player.x, player.y, r);
      c.stroke();
      noGlow(c);
    }
  };

  const drawHud = () => {
    c.fillStyle = 'rgba(9,13,22,0.78)';
    c.fillRect(0, 0, W, 58);
    label(c, `SCORE ${state.score}`, 14, 28, 18, '#10B981');
    label(c, `PHASE ${state.phase + 1}/4`, 200, 28, 18, state.phase >= 2 ? '#F43F5E' : '#6366F1');
    label(c, `${state.time.toFixed(1)}s`, W - 14, 28, 18, '#E2E8F0', 'right');

    // boss health bar + name
    labelCenter(c, 'DDoS BOSS // FLOOD-NODE CLUSTER', W / 2, 74, 13, boss.exposed ? '#F59E0B' : '#64748B');
    const bw = 420, bx = (W - bw) / 2, by = 80;
    c.fillStyle = 'rgba(99,102,241,0.22)';
    roundRect(c, bx, by, bw, 9, 4);
    c.fill();
    const frac = boss.hpMax ? clamp(boss.hp / boss.hpMax, 0, 1) : 0;
    glow(c, frac < 0.3 ? '#F43F5E' : '#6366F1', 10);
    c.fillStyle = frac < 0.3 ? '#F43F5E' : '#6366F1';
    roundRect(c, bx, by, Math.max(3, bw * frac), 9, 4);
    c.fill();
    noGlow(c);
    // phase ticks
    c.fillStyle = '#090D16';
    for (let i = 1; i < PHASES; i++) c.fillRect(bx + (bw / PHASES) * i - 1, by, 2, 9);
    if (boss.exposed) labelCenter(c, 'CORE EXPOSED', W / 2, 102, 12, '#F59E0B');

    // shield pips
    for (let i = 0; i < MAX_SHIELDS; i++) {
      const px = 16 + i * 16, py = 44;
      c.fillStyle = i < state.shields ? '#6366F1' : 'rgba(100,116,139,0.35)';
      circle(c, px, py, 5);
      c.fill();
    }

    // overdrive meter
    const mw = 150, mx = W - mw - 16, my = 36;
    c.fillStyle = 'rgba(16,185,129,0.18)';
    roundRect(c, mx, my, mw, 10, 5);
    c.fill();
    glow(c, state.bombReady ? '#F43F5E' : '#10B981', 10);
    c.fillStyle = state.bombReady ? '#F43F5E' : '#10B981';
    roundRect(c, mx, my, Math.max(2, mw * clamp(state.charge, 0, 1)), 10, 5);
    c.fill();
    noGlow(c);
    label(c, state.bombReady ? 'OVERDRIVE [X]' : 'GRAZE TO CHARGE', mx, 26, 11, state.bombReady ? '#F43F5E' : '#64748B');

    label(c, `GRAZE x${state.grazeRun}`, 16, H - 14, 12, state.grazeRun > 4 ? '#F59E0B' : '#64748B');
    label(c, `BULLETS ${bullets.length}`, W - 16, H - 14, 12, bullets.length > MAX_BULLETS - 40 ? '#F43F5E' : '#64748B', 'right');

    if (state.over) {
      c.fillStyle = 'rgba(9,13,22,0.6)';
      c.fillRect(0, H / 2 - 46, W, 92);
      labelCenter(c, state.won ? 'FLOOD BULKHEAD ONLINE' : 'NODE DOWN', W / 2, H / 2 - 14, 26, state.won ? '#10B981' : '#F43F5E');
      labelCenter(c, `SCORE ${state.score}`, W / 2, H / 2 + 16, 18, '#E2E8F0');
    }
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    drawBackdrop();
    drawBeams();
    drawBullets();
    if (!state.over || !state.won) drawBoss();
    drawPlayer();
    drawFx();
    drawHud();
    if (state.hitFlash > 0) {
      c.globalAlpha = clamp(state.hitFlash, 0, 1) * 0.5;
      c.fillStyle = '#F43F5E';
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
    if (state.phaseFlash > 0) {
      c.globalAlpha = clamp(state.phaseFlash, 0, 1) * 0.55;
      c.fillStyle = '#E2E8F0';
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}