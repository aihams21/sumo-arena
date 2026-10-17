/* ============================================================
 * GAME 15 — DATA FROGGER
 * Hop the router from the bottom safe zone up through the packet
 * belts, the firewall river and the security trucks to the bank.
 * ============================================================ */
import {
  integrate, clamp, clampCircleToBounds, needsSubStepping,
  intersectAABB, pointerPos, circle, roundRect, glow, noGlow,
  label, labelCenter, makeRng,
} from '../physics.js';

export const id = 'g15';
export const accent = '#10B981';

const W = 640, H = 480;
const HUD_H = 46;
const ROW_H = 46, ROWS = 9;
const ROW_TOP = H - ROWS * ROW_H;
const CELL = 40, COLS = 13, GRID_X = (W - COLS * CELL) / 2;
const R_GOAL = 0, R_HOME = 1, R_TRUCK = 2, R_RIVER_A = 3, R_RIVER_B = 4;
const R_PKT_A = 5, R_PKT_B = 6, R_PKT_C = 7, R_START = 8;
const LIVES = 3;
const HOP_MS = 110;
const DEAD_MS = 620;
const FREEZE_MS = 460;
const MAX_LEVEL = 9;
const HOP_ARC = 20;
const BODY = 26;

// ---- lane table: every moving row, its direction and base speed ----
const LANE_DEFS = {
  [R_TRUCK]: { kind: 'truck', dir: -1, base: 128, w: 78, gap: 196, hue: '#F43F5E', want: 3 },
  [R_RIVER_A]: { kind: 'wall', dir: 1, base: 82, w: 98, gap: 202, hue: '#F43F5E', want: 3 },
  [R_RIVER_B]: { kind: 'wall', dir: -1, base: 108, w: 104, gap: 216, hue: '#F43F5E', want: 3 },
  [R_PKT_A]: { kind: 'packet', dir: 1, base: 98, w: 44, gap: 134, hue: '#6366F1', want: 4 },
  [R_PKT_B]: { kind: 'packet', dir: -1, base: 126, w: 48, gap: 150, hue: '#6366F1', want: 4 },
  [R_PKT_C]: { kind: 'packet', dir: 1, base: 154, w: 42, gap: 128, hue: '#6366F1', want: 4 },
};
const RIVER_ROWS = [R_RIVER_A, R_RIVER_B];
const MOVING_ROWS = Object.keys(LANE_DEFS).map(Number);

const rowY = (r) => ROW_TOP + r * ROW_H;
const snapX = (col) => GRID_X + col * CELL;
const colOf = (x) => clamp(Math.round((x - GRID_X) / CELL), 0, COLS - 1);

export function create(ctx) {
  const c = ctx.ctx2d;
  const rng = makeRng(0xF206);

  const state = {
    t: 0, score: 0, level: 1, lives: LIVES, over: false,
    bonus: 0, bonusSec: -1, shake: 0, invuln: 0, crossT: 0, deadT: 0,
    crossGain: 0,
  };
  const lanes = [];
  const sparks = [];

  const player = {
    row: R_START, baseX: snapX(6), carry: 0,
    hopT: 1, fromX: snapX(6), fromY: rowY(R_START), toX: snapX(6), toRow: R_START,
    dead: false, drowned: false, spin: 0, face: 1,
  };

  const speedMul = () => 1 + (state.level - 1) * 0.15;

  // ---- lanes ----
  const makeEnt = (row, def, x, vx) => ({
    row, kind: def.kind, hue: def.hue,
    x, y: rowY(row) + ROW_H / 2, w: def.w, h: ROW_H - 10,
    r: def.w / 2, vx, vy: 0, dir: def.dir, phase: rng() * 6.28,
  });

  const buildLanes = () => {
    lanes.length = ROWS;
    for (const row of MOVING_ROWS) {
      const def = LANE_DEFS[row];
      const vx = def.dir * def.base * speedMul();
      const lane = { row, def, vx, ents: [], want: def.want };
      for (let i = 0; i < lane.want; i++) {
        const x = def.dir > 0 ? -def.w - i * def.gap : W + i * def.gap;
        lane.ents.push(makeEnt(row, def, x, vx));
      }
      lanes[row] = lane;
    }
  };

  const retuneLanes = () => {
    for (const row of MOVING_ROWS) {
      const lane = lanes[row];
      lane.vx = lane.def.dir * lane.def.base * speedMul();
      lane.want = lane.def.want + Math.min(4, state.level - 1);
      for (const e of lane.ents) e.vx = lane.vx;
    }
  };

  buildLanes();

  // ---- movement ----
  const wrapX = (e) => {
    if (e.x > W + 60) e.x = -60 - e.w;
    else if (e.x + e.w < -60) e.x = W + 60;
  };

  const stepEntity = (e, dt) => {
    if (needsSubStepping(e)) {
      integrate(e, dt, W, H, (x, y) => { e.x = x; e.y = y; wrapX(e); });
    } else {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      clampCircleToBounds(e, W, H);
      wrapX(e);
    }
  };

  const playerX = () => player.baseX + player.carry;
  const playerCX = () => playerX() + CELL / 2;
  const playerCY = () => {
    let y = player.fromY;
    if (player.hopT < 1) {
      const t = player.hopT;
      y = player.fromY + (rowY(player.toRow) - player.fromY) * t;
      y -= HOP_ARC * Math.sin(t * Math.PI);
    } else {
      y = rowY(player.row);
    }
    return y + ROW_H / 2;
  };

  const playerBox = () => ({
    x: playerCX() - BODY / 2, y: playerCY() - BODY / 2, w: BODY, h: BODY,
  });

  const entBox = (e) => ({ x: e.x, y: e.y - e.h / 2, w: e.w, h: e.h });
  const attachRow = () => (player.hopT < 1 ? player.toRow : player.row);

  // ---- input ----
  const hop = (dx, dy) => {
    if (state.over || player.dead || state.crossT > 0) return;
    if (player.hopT < 1) return;
    const here = colOf(playerX());
    const nr = clamp(player.row + dy, R_GOAL, R_START);
    const nc = clamp(here + dx, 0, COLS - 1);
    if (nr === player.row && nc === here) return;
    player.fromX = player.baseX;
    player.fromY = rowY(player.row);
    player.toX = snapX(nc);
    player.toRow = nr;
    player.hopT = 0;
    if (dx !== 0) player.face = dx > 0 ? 1 : -1;
    if (ctx.audio) ctx.audio.jump();
  };

  const KEYMAP = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
  };

  const onKey = (ev) => {
    let d = KEYMAP[ev.code || ''];
    if (!d && ev.key) d = KEYMAP[`Key${ev.key.toUpperCase()}`];
    if (!d) return;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.repeat) return;
    hop(d[0], d[1]);
  };
  ctx.listeners.on(window, 'keydown', onKey);

  const cellAt = (ev) => {
    const p = pointerPos(ctx.canvas, ev);
    return { gx: (p.x * W) / ctx.canvas.width, gy: (p.y * H) / ctx.canvas.height };
  };

  const tapHop = (gx, gy) => {
    if (gy < HUD_H) return;
    const targetRow = clamp(Math.floor((gy - ROW_TOP) / ROW_H), R_GOAL, R_START);
    const targetCol = clamp(Math.floor((gx - GRID_X) / CELL), 0, COLS - 1);
    const dr = Math.sign(targetRow - player.row);
    if (dr !== 0) hop(0, dr);
    else hop(Math.sign(targetCol - colOf(playerX())), 0);
  };

  let drag = null;
  const onDown = (ev) => {
    if (state.over || player.dead) return;
    if (ev.preventDefault) ev.preventDefault();
    const p = cellAt(ev);
    drag = p;
    tapHop(p.gx, p.gy);
  };
  const onMove = (ev) => {
    if (!drag || state.over || player.dead) return;
    const p = cellAt(ev);
    const dx = p.gx - drag.gx, dy = p.gy - drag.gy;
    if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
    if (Math.abs(dx) > Math.abs(dy)) hop(Math.sign(dx), 0);
    else hop(0, Math.sign(dy));
    drag = p;
  };
  ctx.listeners.on(ctx.canvas, 'pointerdown', onDown, { passive: false });
  ctx.listeners.on(ctx.canvas, 'pointermove', onMove);
  ctx.listeners.on(window, 'pointerup', () => { drag = null; });

  // ---- rules ----
  const burst = (x, y, hue, n) => {
    for (let i = 0; i < n; i++) {
      sparks.push({
        x, y, vx: (rng() - 0.5) * 320, vy: (rng() - 0.9) * 260,
        r: 2 + rng() * 3, life: 1, hue,
      });
    }
  };

  const resetPlayer = () => {
    player.row = R_START;
    player.baseX = snapX(6);
    player.carry = 0;
    player.hopT = 1;
    player.fromX = player.baseX;
    player.fromY = rowY(R_START);
    player.toX = player.baseX;
    player.toRow = R_START;
    player.dead = false;
    player.drowned = false;
    player.spin = 0;
    state.invuln = 0.9;
  };

  const loseLife = (kind) => {
    if (player.dead || state.over) return;
    player.dead = true;
    player.drowned = kind === 'river';
    player.spin = 0;
    state.deadT = DEAD_MS / 1000;
    state.shake = 9;
    state.lives--;
    burst(playerCX(), playerCY(), kind === 'river' ? '#6366F1' : '#F43F5E', 16);
    if (ctx.audio) { if (kind === 'river') ctx.audio.explode(); else ctx.audio.hit(); }
    ctx.onScore(state.score);
  };

  const bank = () => {
    const gain = 100 + Math.floor(state.bonus / 1000) * 25;
    state.score += gain;
    state.crossGain = gain;
    state.crossT = FREEZE_MS / 1000;
    state.level = Math.min(MAX_LEVEL, state.level + 1);
    state.bonus = 12000;
    state.shake = 4;
    burst(playerCX(), playerCY(), '#10B981', 20);
    if (ctx.audio) { ctx.audio.cash(); ctx.audio.win(); }
    ctx.onScore(state.score);
  };

  const endRun = () => {
    if (state.over) return;
    state.over = true;
    if (ctx.audio) ctx.audio.gameOver();
    ctx.loop && ctx.loop.stop();
    ctx.finish(state.score);
  };

  const stepSparks = (dt) => {
    for (const s of sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 700 * dt;
      s.life -= dt * 1.6;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
  };

  // ---- simulation ----
  const update = (dt) => {
    state.t += dt;
    state.shake *= Math.max(0, 1 - dt * 6);
    if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);

    for (const row of MOVING_ROWS) {
      const lane = lanes[row];
      for (const e of lane.ents) stepEntity(e, dt);
      while (lane.ents.length < lane.want) {
        const last = lane.ents[lane.ents.length - 1];
        const step = lane.def.gap * speedMul();
        const x = lane.vx > 0
          ? (last ? last.x - step : -lane.def.w - 70)
          : (last ? last.x + step : W + 70);
        lane.ents.push(makeEnt(row, lane.def, x, lane.vx));
      }
      if (lane.ents.length > lane.want + 2) lane.ents.length = lane.want;
    }

    if (player.dead) {
      state.deadT -= dt;
      player.spin += dt * (player.drowned ? 3.5 : 9);
      stepSparks(dt);
      if (state.deadT <= 0) {
        if (state.lives <= 0) { endRun(); return; }
        resetPlayer();
      }
      return;
    }

    if (state.crossT > 0) {
      state.crossT -= dt;
      stepSparks(dt);
      if (state.crossT <= 0) {
        player.row = R_HOME;
        player.baseX = snapX(colOf(playerX()));
        player.carry = 0;
        player.hopT = 1;
        player.fromY = rowY(R_HOME);
        player.toX = player.baseX;
        player.toRow = R_HOME;
        retuneLanes();
      }
      return;
    }

    // the belt the router rides carries him sideways while he is on it
    const lane = lanes[attachRow()];
    if (lane) player.carry += lane.vx * dt;

    if (player.hopT < 1) {
      player.hopT = Math.min(1, player.hopT + (dt * 1000) / HOP_MS);
      player.baseX = player.fromX + (player.toX - player.fromX) * player.hopT;
      if (player.hopT >= 1) {
        player.row = player.toRow;
        // snap back onto the grid in the lane's own frame so the landing stays square
        player.baseX = snapX(colOf(playerX()));
        player.carry = 0;
        if (ctx.audio) ctx.audio.bounce();
      }
    }

    // the time bonus only burns down out in traffic
    if (state.bonus > 0 && player.row < R_START) {
      state.bonus = Math.max(0, state.bonus - dt * 1000);
      const sec = Math.ceil(state.bonus / 1000);
      if (sec !== state.bonusSec) {
        state.bonusSec = sec;
        if (ctx.audio && sec > 0) ctx.audio.tick();
      }
    }

    if (player.row === R_GOAL) { bank(); return; }

    if (playerX() < -CELL || playerX() > W) { loseLife('truck'); return; }

    if (state.invuln <= 0) {
      const box = playerBox();
      const row = attachRow();
      const hit = lanes[row];
      if (hit) {
        const deadly = RIVER_ROWS.indexOf(row) >= 0;
        for (const e of hit.ents) {
          if (!intersectAABB(box, entBox(e))) continue;
          loseLife(deadly ? 'river' : 'truck');
          return;
        }
      }
    }

    stepSparks(dt);
  };

  // ---- drawing ----
  const drawBackdrop = () => {
    c.fillStyle = '#090D16';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(99,102,241,0.08)';
    c.lineWidth = 1;
    for (let y = HUD_H; y < H; y += ROW_H) {
      c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
    }
  };

  const drawRowBands = () => {
    for (let r = 0; r < ROWS; r++) {
      const y = rowY(r);
      if (r === R_GOAL) {
        c.fillStyle = 'rgba(16,185,129,0.16)';
        c.fillRect(GRID_X - 8, y, COLS * CELL + 16, ROW_H);
        glow(c, 'rgba(16,185,129,0.35)', 16);
        c.strokeStyle = '#10B981';
        c.lineWidth = 2;
        roundRect(c, GRID_X - 8, y + 4, COLS * CELL + 16, ROW_H - 8, 6);
        c.stroke();
        noGlow(c);
        labelCenter(c, 'SERVER BANK', W / 2, y + ROW_H / 2 + 5, 13, '#10B981');
        continue;
      }
      if (r === R_START || r === R_HOME) {
        c.fillStyle = r === R_START ? 'rgba(16,185,129,0.10)' : 'rgba(99,102,241,0.08)';
        c.fillRect(0, y, W, ROW_H);
        c.strokeStyle = r === R_START ? 'rgba(16,185,129,0.35)' : 'rgba(99,102,241,0.30)';
        c.lineWidth = 1;
        c.setLineDash([6, 8]);
        c.beginPath();
        c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5);
        c.moveTo(0, y + ROW_H - 0.5); c.lineTo(W, y + ROW_H - 0.5);
        c.stroke();
        c.setLineDash([]);
        continue;
      }
      if (RIVER_ROWS.indexOf(r) >= 0) {
        c.fillStyle = 'rgba(244,63,94,0.07)';
        c.fillRect(0, y, W, ROW_H);
        c.fillStyle = 'rgba(99,102,241,0.06)';
        for (let x = -20; x < W; x += 24) c.fillRect(x, y, 2, ROW_H);
        continue;
      }
      c.fillStyle = 'rgba(9,13,22,0.55)';
      c.fillRect(0, y, W, ROW_H);
      c.strokeStyle = 'rgba(99,102,241,0.18)';
      c.lineWidth = 1;
      c.setLineDash([10, 14]);
      c.beginPath();
      c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5);
      c.stroke();
      c.setLineDash([]);
    }
  };

  const drawEnt = (e) => {
    const y = e.y - e.h / 2;
    if (e.kind === 'wall') {
      glow(c, '#F43F5E', 12);
      c.fillStyle = 'rgba(244,63,94,0.30)';
      roundRect(c, e.x, y, e.w, e.h, 6);
      c.fill();
      c.strokeStyle = '#F43F5E';
      c.lineWidth = 2;
      roundRect(c, e.x, y, e.w, e.h, 6);
      c.stroke();
      noGlow(c);
      c.strokeStyle = 'rgba(244,63,94,0.75)';
      c.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const ly = y + (e.h / 4) * i;
        c.beginPath(); c.moveTo(e.x + 3, ly); c.lineTo(e.x + e.w - 3, ly); c.stroke();
      }
      label(c, 'FW', e.x + 6, y + e.h - 7, 9, '#F43F5E');
      return;
    }
    if (e.kind === 'truck') {
      glow(c, '#F43F5E', 14);
      c.fillStyle = '#1B2233';
      roundRect(c, e.x, y, e.w, e.h, 5);
      c.fill();
      c.strokeStyle = '#F43F5E';
      c.lineWidth = 2;
      roundRect(c, e.x, y, e.w, e.h, 5);
      c.stroke();
      noGlow(c);
      c.fillStyle = 'rgba(99,102,241,0.55)';
      const wx = e.dir > 0 ? e.x + 5 : e.x + e.w - 21;
      roundRect(c, wx, y + 5, 16, e.h - 10, 3);
      c.fill();
      c.fillStyle = '#F59E0B';
      const lx = e.dir > 0 ? e.x + e.w - 12 : e.x + 4;
      c.fillRect(lx, y + 4, 8, 3);
      c.fillRect(lx, y + e.h - 7, 8, 3);
      return;
    }
    glow(c, '#6366F1', 10);
    c.fillStyle = '#111827';
    roundRect(c, e.x, y, e.w, e.h, 4);
    c.fill();
    c.strokeStyle = '#6366F1';
    c.lineWidth = 1.5;
    roundRect(c, e.x, y, e.w, e.h, 4);
    c.stroke();
    noGlow(c);
    c.fillStyle = '#10B981';
    const inset = 5;
    for (let i = 0; i < 3; i++) {
      const bx = e.x + inset + i * ((e.w - inset * 2) / 3);
      c.fillRect(bx, y + 7, Math.max(2, (e.w - inset * 2) / 3 - 3), e.h - 14);
    }
  };

  const drawRouter = () => {
    const cx = playerCX();
    const cy = playerCY();
    const sink = player.drowned ? Math.min(14, (DEAD_MS - state.deadT * 1000) * 0.02) : 0;
    const blink = state.invuln > 0 && Math.floor(state.t * 18) % 2 === 0;
    c.save();
    c.globalAlpha = blink ? 0.35 : 1;
    c.translate(cx, cy + sink);
    c.rotate(player.spin * (player.drowned ? 1 : -1));
    const r = 13;
    glow(c, '#10B981', player.dead ? 8 : 18);
    c.fillStyle = player.dead ? '#F43F5E' : '#0B1220';
    roundRect(c, -r, -r, r * 2, r * 2, 6);
    c.fill();
    c.strokeStyle = player.dead ? '#F43F5E' : '#10B981';
    c.lineWidth = 2;
    roundRect(c, -r, -r, r * 2, r * 2, 6);
    c.stroke();
    noGlow(c);
    c.strokeStyle = player.dead ? '#F43F5E' : '#10B981';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-5 * player.face, 4);
    c.lineTo(6 * player.face, 4);
    c.moveTo(6 * player.face, 4);
    c.lineTo(2 * player.face, 0);
    c.moveTo(6 * player.face, 4);
    c.lineTo(2 * player.face, 8);
    c.stroke();
    c.fillStyle = player.dead ? '#F43F5E' : '#F59E0B';
    circle(c, -4 * player.face, -4, 3);
    c.fill();
    c.restore();
  };

  const drawHud = () => {
    c.fillStyle = 'rgba(9,13,22,0.78)';
    c.fillRect(0, 0, W, HUD_H);
    label(c, `SCORE ${state.score}`, 14, 31, 20, '#10B981');
    label(c, `LV ${state.level}`, 186, 31, 16, state.level >= MAX_LEVEL ? '#F59E0B' : '#64748B');

    for (let i = 0; i < LIVES; i++) {
      const px = W - 24 - i * 20;
      const live = i < state.lives;
      c.fillStyle = live ? '#10B981' : 'rgba(100,116,139,0.35)';
      roundRect(c, px, 20, 14, 14, 4);
      c.fill();
    }
    label(c, `${Math.ceil(state.bonus / 1000)}s`, W - 130, 31, 16, state.bonus > 0 ? '#F59E0B' : '#64748B');

    c.fillStyle = 'rgba(99,102,241,0.22)';
    c.fillRect(0, HUD_H - 5, W, 5);
    c.fillStyle = state.bonus > 3000 ? '#10B981' : '#F43F5E';
    c.fillRect(0, HUD_H - 5, W * Math.min(1, state.bonus / 12000), 5);
  };

  const draw = () => {
    c.save();
    if (state.shake > 0.2) {
      c.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawBackdrop();
    drawRowBands();

    for (const row of MOVING_ROWS) {
      for (const e of lanes[row].ents) {
        if (e.x > W || e.x + e.w < 0) continue;
        drawEnt(e);
      }
    }

    if (!player.dead) {
      const row = attachRow();
      const lane = lanes[row];
      if (lane && RIVER_ROWS.indexOf(row) >= 0) {
        c.strokeStyle = 'rgba(16,185,129,0.55)';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(playerCX(), rowY(row) + ROW_H / 2, 20, 12, 0, 0, 6.2832);
        c.stroke();
      }
    }

    drawRouter();

    for (const s of sparks) {
      c.globalAlpha = Math.max(0, s.life);
      c.fillStyle = s.hue;
      circle(c, s.x, s.y, s.r * s.life);
      c.fill();
    }
    c.globalAlpha = 1;

    if (state.crossT > 0) {
      c.fillStyle = 'rgba(9,13,22,0.66)';
      roundRect(c, W / 2 - 132, H / 2 - 46, 264, 92, 10);
      c.fill();
      glow(c, '#10B981', 14);
      c.strokeStyle = '#10B981';
      c.lineWidth = 2;
      roundRect(c, W / 2 - 132, H / 2 - 46, 264, 92, 10);
      c.stroke();
      noGlow(c);
      labelCenter(c, 'UPLINK BANKED', W / 2, H / 2 - 14, 18, '#10B981');
      labelCenter(c, `+${state.crossGain}   NEXT LANE x${state.level}`, W / 2, H / 2 + 16, 15, '#F59E0B');
    }

    if (state.over) {
      c.fillStyle = 'rgba(9,13,22,0.72)';
      c.fillRect(0, HUD_H, W, H - HUD_H);
      labelCenter(c, 'CONNECTION LOST', W / 2, H / 2 - 10, 26, '#F43F5E');
      labelCenter(c, `FINAL SCORE ${state.score}`, W / 2, H / 2 + 22, 18, '#E2E8F0');
    }

    drawHud();
    label(c, 'ARROWS / WASD  TAP', GRID_X, H - 8, 10, 'rgba(100,116,139,0.9)');
    label(c, 'SERVERS UP TOP', W - 14, H - 8, 10, 'rgba(16,185,129,0.9)', 'right');
    c.restore();
  };

  ctx.attachLoop(update, draw);

  return null;
}