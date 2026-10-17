/* =============================================================
   NEXUS CORP — UI WIRING  (src/main.js)
   Boots the shell, drives the tycoon simulation, renders every
   card/grid, and mounts the Arcade Hub. Zero framework.
   ============================================================= */

import {
  S, on, tick as simTick, doClick, addCash,
  buyDepartment, buyUpgrade, hireManager, doPrestige,
  submitArcadeScore, applyOffline, saveNow, startAutosave,
  totalIncomePerSec, deptIncomePerSec, netWorth, clickPower,
  globalMultiplier, arcadeUnlocked,
  overclockRemainingMs, prestigeReady, prestigeGain, prestigeProgress,
  migrate, defaultState,
  ARCADE_UNLOCK_CASH, COMBO_MAX
} from './core/state.js';

import { nowMs, exportSave, importSave, clearSave } from './core/storage.js';
import { audio } from './core/audio.js';
import {
  formatMoney, formatRate, formatNum, formatMult,
  formatDuration, formatDurationLong, formatPct
} from './core/format.js';
import { setLang, getLang, toggleLang, t, gameName, gameHowTo, applyI18n } from './core/i18n.js';

import { DEPARTMENTS, DEPT_BY_ID, deptCost, deptBulkCost, deptRate, milestoneInfo, isDeptUnlocked, milestoneMultiplier, MILESTONES } from './tycoon/departments.js';
import { UPGRADES, upgradeCost } from './tycoon/upgrades.js';
import { MANAGER_BY_DEPT, managerCost } from './tycoon/managers.js';
import { PRESTIGE_REQUIREMENT } from './tycoon/prestige.js';
import { ArcadeHub, GAMES, loadGame, preloadAll } from './arcade/arcade_hub.js';

/* ---------------- tiny DOM helpers ---------------- */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const show = (node, on_) => { if (node) node.hidden = !on_; };

/* bilingual department labels (data module carries no names) */
const DEPT_NAMES = {
  freelancer:   ['Garage Freelancer',        'مستقل المرآب'],
  agency:      ['Indie Web Agency',         'وكالة ويب مستقلة'],
  mobile:      ['Mobile App Studio',        'استوديو تطبيقات الجوال'],
  saas:        ['SaaS Cloud Platform',      'منصة سحابية SaaS'],
  cyber:       ['Cybersecurity Division',   'قسم الأمن السيبراني'],
  ailab:       ['AI Research Lab',          'مختبر أبحاث الذكاء الاصطناعي'],
  quantum:     ['Quantum Computing Facility','منشأة الحوسبة الكمّية'],
  robotics:    ['Autonomous Robotics Plant','مصنع الروبوتات المستقلة'],
  orbital:     ['Orbital Satellite Network','شبكة الأقمار المدارية'],
  singularity: ['Global Neural Singularity','التفرّد العصبي العالمي']
};
const deptName = (id) => {
  const n = DEPT_NAMES[id];
  if (!n) return id;
  return getLang() === 'ar' ? n[1] : n[0];
};

/* ---------------- element cache ---------------- */
const UI = {
  boot: $('#boot'), bootBar: $('.boot-bar > i'),
  stCash: $('#stCash'), stRate: $('#stRate'), stWorth: $('#stWorth'),
  stClick: $('#stClick'), stShares: $('#stShares'),
  ocPill: $('#ocPill'), ocTime: $('#ocTime'),
  btnLang: $('#btnLang'), btnSound: $('#btnSound'), btnMusic: $('#btnMusic'),
  tabs: $('#tabs'),
  terminal: $('#terminal'), termFx: $('#termFx'), termClick: $('.term-click'),
  comboBar: $('#comboBar'), comboFill: $('#comboFill'), comboTxt: $('#comboTxt'),
  deptGrid: $('#deptGrid'), upList: $('#upList'), mgrList: $('#mgrList'),
  pgShares: $('#pgShares'), pgBonus: $('#pgBonus'), btnPrestige: $('#btnPrestige'),
  pgFill: $('#pgFill'), pgHint: $('#pgHint'),
  arcadeLock: $('#arcadeLock'), lockFill: $('#lockFill'), arcGrid: $('#arcGrid'),
  playStage: $('#playStage'), stageName: $('#stageName'), stageHow: $('#stageHow'),
  stageScore: $('#stageScore'), stageBest: $('#stageBest'),
  btnRestart: $('#btnRestart'), btnExit: $('#btnExit'),
  canvas: $('#gameCanvas'),
  stageOver: $('#stageOver'), ovScore: $('#ovScore'), ovBest: $('#ovBest'),
  ovCash: $('#ovCash'), ovRetry: $('#ovRetry'), ovBack: $('#ovBack'),
  ledgerGames: $('#ledgerGames'), ledgerCorp: $('#ledgerCorp'),
  setSfx: $('#setSfx'), setMusic: $('#setMusic'), setLang: $('#setLang'),
  btnExport: $('#btnExport'), btnImport: $('#btnImport'), btnReset: $('#btnReset'),
  saveBox: $('#saveBox'),
  modalBack: $('#modalBack'), modalTitle: $('#modalTitle'), modalBody: $('#modalBody'),
  modalNo: $('#modalNo'), modalYes: $('#modalYes'),
  toast: $('#toast')
};

/* ---------------- toast / modal ---------------- */
let toastTimer = 0;
function toast(msg, bad) {
  const n = UI.toast;
  if (!n) return;
  n.textContent = msg;
  n.classList.toggle('bad', !!bad);
  n.hidden = false;
  n.style.animation = 'none';
  void n.offsetWidth;
  n.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.hidden = true; }, 2200);
}

let modalResolve = null;
function openModal(title, bodyHtml, yesLabel) {
  UI.modalTitle.textContent = title;
  UI.modalBody.innerHTML = bodyHtml;
  UI.modalYes.textContent = yesLabel || t('confirm');
  UI.modalBack.classList.remove('hidden');
  return new Promise((res) => { modalResolve = res; });
}
function closeModal(v) {
  UI.modalBack.classList.add('hidden');
  const r = modalResolve;
  modalResolve = null;
  if (r) r(v);
}
UI.modalNo.addEventListener('click', () => closeModal(false));
UI.modalYes.addEventListener('click', () => closeModal(true));
UI.modalBack.addEventListener('click', (e) => { if (e.target === UI.modalBack) closeModal(false); });

/* ---------------- audio unlock on first gesture ---------------- */
let audioReady = false;
function unlockAudio() {
  if (audioReady) return;
  audioReady = true;
  audio.unlock();
  audio.setSfx(S.settings.sfx);
  audio.setMusic(S.settings.music);
}
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });

/* ---------------- tabs ---------------- */
let currentTab = 'tycoon';
function setTab(name) {
  currentTab = name;
  for (const b of UI.tabs.querySelectorAll('.tab')) {
    b.classList.toggle('active', b.dataset.tab === name);
  }
  for (const v of document.querySelectorAll('.view')) {
    v.classList.toggle('active', v.id === 'view-' + name);
  }
  if (name === 'arcade') hub.resize();
  if (name === 'ledger') renderLedger();
  audio.select();
}
UI.tabs.addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (b) setTab(b.dataset.tab);
});

/* ---------------- HUD ---------------- */
function renderHud() {
  UI.stCash.textContent = formatMoney(S.cash);
  UI.stRate.textContent = formatRate(totalIncomePerSec());
  UI.stWorth.textContent = formatMoney(netWorth());
  UI.stClick.textContent = formatMoney(clickPower());
  UI.stShares.textContent = formatNum(S.shares);

  const ocLeft = overclockRemainingMs(nowMs());
  if (ocLeft > 0) {
    UI.ocPill.hidden = false;
    UI.ocTime.textContent = formatDuration(ocLeft / 1000);
  } else {
    UI.ocPill.hidden = true;
  }

  // combo bar
  const c = S.combo;
  if (c > 0) {
    const p = c / COMBO_MAX;
    UI.comboBar.classList.add('on');
    UI.comboFill.style.width = (p * 100).toFixed(1) + '%';
    UI.comboTxt.textContent = '×' + (1 + c * 0.1).toFixed(1);
  } else {
    UI.comboBar.classList.remove('on');
    UI.comboFill.style.width = '0%';
  }
  UI.termClick.textContent = formatMoney(clickPower());

  // arcade lock progress
  const lockP = Math.min(1, S.cash / ARCADE_UNLOCK_CASH);
  UI.lockFill.style.width = (lockP * 100).toFixed(1) + '%';
  UI.arcadeLock.style.display = arcadeUnlocked() ? 'none' : '';

  // prestige
  const gain = prestigeGain();
  const prog = prestigeProgress(netWorth());     // 0..1
  UI.pgShares.textContent = formatNum(S.shares);
  UI.pgBonus.textContent = '×' + (1 + S.shares * 0.10).toFixed(2);
  UI.pgFill.style.width = (prog * 100).toFixed(1) + '%';
  UI.btnPrestige.disabled = !prestigeReady();
  UI.pgHint.textContent = prestigeReady()
    ? `+${formatNum(gain)} ${t('shares')}`
    : `${t('prestige_req')} — ${formatPct(prog * 100)}`;
}

/* ---------------- tycoon cards (built once, refreshed) ---------------- */
const deptCards = new Map();
const upCards = new Map();
const mgrCards = new Map();

function buildDepartments() {
  UI.deptGrid.textContent = '';
  deptCards.clear();
  for (const def of DEPARTMENTS) {
    const card = el('div', 'dept');
    const top = el('div', 'dept-top');
    top.appendChild(el('span', 'dept-icon', def.icon));
    const nm = el('span', 'dept-name');
    top.appendChild(nm);
    const lv = el('span', 'dept-lv', 'Lv 0');
    top.appendChild(lv);
    card.appendChild(top);

    const rate = el('div', 'dept-rate', '—');
    card.appendChild(rate);

    const mstone = el('div', 'mstone', '—');
    card.appendChild(mstone);

    const buy = el('button', 'dept-buy');
    buy.appendChild(el('span', 'buy-label', t('buy')));
    const cost = el('span', 'buy-cost', '$0');
    buy.appendChild(cost);
    card.appendChild(buy);

    const mgr = el('div', 'dept-mgr');
    const mgrBtn = el('button', '', t('hire'));
    mgr.appendChild(mgrBtn);
    card.appendChild(mgr);

    buy.addEventListener('click', () => {
      const n = buyHeld ? 10 : 1;
      const r = buyDepartment(def.id, n);
      if (!r.ok && r.reason === 'funds') { audio.error(); toast(t('cash') + ' — ' + formatMoney(r.cost), true); }
      refreshTycoon();
    });
    mgrBtn.addEventListener('click', () => {
      const r = hireManager(def.id);
      if (!r.ok && r.reason === 'funds') { audio.error(); toast(t('cash') + ' — ' + formatMoney(r.cost), true); }
      refreshTycoon();
    });

    UI.deptGrid.appendChild(card);
    deptCards.set(def.id, { card, nm, lv, rate, mstone, buy, cost, mgr, mgrBtn });
  }
}

function refreshDepartments() {
  for (const def of DEPARTMENTS) {
    const c = deptCards.get(def.id);
    if (!c) continue;
    const lvl = S.deptLevels[def.id] || 0;
    const unlocked = isDeptUnlocked(def.id, S.deptLevels);
    const cost1 = deptCost(def, lvl);
    const cost10 = deptBulkCost(def, lvl, 10);
    const need = buyHeld ? cost10 : cost1;

    c.nm.textContent = deptName(def.id);
    c.lv.textContent = t('level') + ' ' + lvl;
    c.lv.classList.toggle('zero', lvl === 0);
    c.card.classList.toggle('locked', !unlocked);

    c.rate.textContent = lvl > 0
      ? formatRate(deptRate(def, lvl))
      : `${formatRate(def.baseRate)} @ ${t('level')} 1`;

    const mi = milestoneInfo(lvl);
    if (mi.next) {
      c.mstone.textContent = `${t('milestone')} ${mi.hits}/${MILESTONES.length} ×${mi.multiplier} · ${mi.next}`;
      c.mstone.classList.toggle('done', lvl >= mi.next);
    } else {
      c.mstone.textContent = `${t('milestone')} MAX ×${mi.multiplier}`;
      c.mstone.classList.add('done');
    }

    c.buy.textContent = '';
    c.buy.appendChild(el('span', 'buy-label', unlocked ? (buyHeld ? '×10' : t('buy')) : t('locked')));
    c.buy.appendChild(el('span', 'buy-cost', formatMoney(need)));
    c.buy.disabled = !unlocked || S.cash < need;
    c.card.classList.toggle('afford', unlocked && S.cash >= need);

    const hired = !!S.hired[def.id];
    c.mgr.classList.toggle('on', hired);
    c.mgrBtn.textContent = hired ? t('hired') : t('hire');
    c.mgrBtn.disabled = hired || lvl === 0 || S.cash < managerCost(hiredCount());
  }
}

function buildUpgrades() {
  UI.upList.textContent = '';
  upCards.clear();
  for (const up of UPGRADES) {
    const card = el('div', 'up');
    card.appendChild(el('span', 'up-ico', up.icon));
    const mid = el('div', 'up-mid');
    const nm = el('div', 'up-name');
    mid.appendChild(nm);
    mid.appendChild(el('div', 'up-desc', up.desc));
    card.appendChild(mid);
    const buy = el('button', 'up-buy');
    card.appendChild(buy);
    buy.addEventListener('click', () => {
      const r = buyUpgrade(up.id);
      if (!r.ok && r.reason === 'funds') { audio.error(); toast(t('cash') + ' — ' + formatMoney(r.cost), true); }
      refreshTycoon();
    });
    UI.upList.appendChild(card);
    upCards.set(up.id, { card, nm, buy });
  }
}

function refreshUpgrades() {
  for (const up of UPGRADES) {
    const c = upCards.get(up.id);
    if (!c) continue;
    const lvl = S.upgradeLevels[up.id] || 0;
    const cost = upgradeCost(up, lvl);
    c.nm.textContent = `${up.name} ×${Math.pow(up.mult, lvl)}`;
    c.buy.textContent = formatMoney(cost);
    c.buy.disabled = S.cash < cost;
    c.card.classList.toggle('afford', S.cash >= cost);
  }
}

function buildManagers() {
  UI.mgrList.textContent = '';
  mgrCards.clear();
  for (const def of DEPARTMENTS) {
    const m = MANAGER_BY_DEPT[def.id];
    const card = el('div', 'mgr');
    card.appendChild(el('span', 'mgr-sigil', m.sigil));
    const mid = el('div', 'mgr-mid');
    const ttl = el('div', 'mgr-title');
    mid.appendChild(ttl);
    const dp = el('div', 'mgr-dept');
    mid.appendChild(dp);
    card.appendChild(mid);
    const buy = el('button', 'mgr-buy');
    card.appendChild(buy);
    buy.addEventListener('click', () => {
      const r = hireManager(def.id);
      if (!r.ok && r.reason === 'funds') { audio.error(); toast(t('cash') + ' — ' + formatMoney(r.cost), true); }
      else if (!r.ok && r.reason === 'already') toast(t('hired'));
      refreshTycoon();
    });
    UI.mgrList.appendChild(card);
    mgrCards.set(def.id, { card, ttl, dp, buy });
  }
}

function refreshManagers() {
  const cost = managerCost(hiredCount());
  for (const def of DEPARTMENTS) {
    const c = mgrCards.get(def.id);
    if (!c) continue;
    const m = MANAGER_BY_DEPT[def.id];
    const hired = !!S.hired[def.id];
    c.ttl.textContent = getLang() === 'ar' ? m.titleAr : m.title;
    c.dp.textContent = deptName(def.id) + ' · ' + t('auto_buyer');
    c.buy.textContent = hired ? t('hired') : formatMoney(cost);
    c.buy.disabled = hired || S.cash < cost || (S.deptLevels[def.id] || 0) === 0;
    c.card.classList.toggle('on', hired);
    c.card.classList.toggle('afford', !hired && S.cash >= cost);
  }
}

const hiredCount = () => Object.values(S.hired).filter(Boolean).length;

let buyHeld = false;
function refreshTycoon() {
  refreshDepartments();
  refreshUpgrades();
  refreshManagers();
}

/* ---------------- terminal ---------------- */
function spawnBit(x, y, text) {
  const bit = el('span', 'fx-bit', text);
  bit.style.left = x + 'px';
  bit.style.top = y + 'px';
  UI.termFx.appendChild(bit);
  setTimeout(() => bit.remove(), 760);
}
UI.terminal.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const r = UI.terminal.getBoundingClientRect();
  const gain = doClick(nowMs());
  audio.click();
  spawnBit(e.clientX - r.left - 14, e.clientY - r.top - 10, '+' + formatMoney(gain));
  renderHud();
});
UI.terminal.addEventListener('contextmenu', (e) => e.preventDefault());
UI.terminal.addEventListener('keydown', () => {});
UI.terminal.addEventListener('mouseenter', () => audio.tap());

/* x10 bulk-buy: shift-click a department */
window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') buyHeld = true;
  if (e.key === 'Escape') { if (hub.isActive()) exitGame(); else closeModal(false); }
});
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') buyHeld = false; });

/* ---------------- prestige ---------------- */
UI.btnPrestige.addEventListener('click', async () => {
  if (!prestigeReady()) { audio.error(); toast(t('prestige_req'), true); return; }
  const gain = prestigeGain();
  const ok = await openModal(
    t('prestige_title'),
    `${t('prestige_desc')}<br><br><b>+${formatNum(gain)}</b> ${t('shares')} → <b>×${(1 + (S.shares + gain) * 0.1).toFixed(2)}</b>`,
    t('prestige_go')
  );
  if (!ok) return;
  const r = doPrestige();
  if (r.ok) {
    toast(`+${formatNum(r.gain)} ${t('shares')}`);
    renderHud();
    refreshTycoon();
    renderLedger();
    applyI18n(document);
  }
});

/* ---------------- arcade ---------------- */
const hub = new ArcadeHub({
  canvas: UI.canvas,
  audio,
  fx: {
    toast: (m) => toast(String(m)),
    flash: () => { /* decorative */ }
  },
  onScore: (score, gameId) => {
    UI.stageScore.textContent = formatNum(score);
    UI.stageBest.textContent = formatNum(Math.max(S.gameBest[gameId] || 0, score));
  },
  onFinish: (score, gameId) => {
    const res = submitArcadeScore(gameId, score);
    hub.unmount();
    UI.ovScore.textContent = formatNum(res.score);
    UI.ovBest.textContent = formatNum(res.best);
    UI.ovCash.textContent = formatMoney(res.cash);
    UI.stageOver.hidden = false;
    UI.stageScore.textContent = formatNum(res.score);
    UI.stageBest.textContent = formatNum(res.best);
    renderHud();
    refreshTycoon();
    renderLedger();
  },
  onExit: () => {
    UI.playStage.hidden = true;
    setTab('arcade');
  },
  onError: (msg) => {
    audio.error();
    toast(msg, true);
    UI.playStage.hidden = true;
  }
});

let runningGame = null;

async function launchGame(id) {
  unlockAudio();
  runningGame = id;
  show(UI.playStage, true);
  show(UI.stageOver, false);
  UI.stageName.textContent = gameName(id);
  UI.stageHow.textContent = gameHowTo(id);
  UI.stageScore.textContent = '0';
  UI.stageBest.textContent = formatNum(S.gameBest[id] || 0);
  UI.arcGrid.style.display = 'none';
  const ok = await hub.launch(id);
  if (!ok && runningGame === id) {
    show(UI.playStage, false);
    UI.arcGrid.style.display = '';
  }
}

function exitGame() {
  hub.unmount();
  runningGame = null;
  show(UI.stageOver, false);
  show(UI.playStage, false);
  UI.arcGrid.style.display = '';
  renderHud();
}

UI.btnExit.addEventListener('click', () => { audio.click(); exitGame(); });
UI.btnRestart.addEventListener('click', () => { audio.click(); if (runningGame) launchGame(runningGame); });
UI.ovRetry.addEventListener('click', () => { audio.click(); if (runningGame) launchGame(runningGame); });
UI.ovBack.addEventListener('click', () => { audio.click(); exitGame(); });

function buildArcade() {
  UI.arcGrid.textContent = '';
  GAMES.forEach((g, i) => {
    const card = el('div', 'arc');
    card.dataset.game = g.id;
    const top = el('div', 'arc-top');
    top.appendChild(el('span', 'arc-no', String(i + 1).padStart(2, '0')));
    const best = el('span', 'arc-best', '');
    best.dataset.role = 'best';
    top.appendChild(best);
    card.appendChild(top);
    card.appendChild(el('div', 'arc-name', gameName(g.id)));
    const play = el('button', 'arc-play', t('play'));
    card.appendChild(play);
    card.addEventListener('click', () => { audio.select(); launchGame(g.id); });
    UI.arcGrid.appendChild(card);
    g._card = card;
    g._best = best;
  });
}

async function paintAccents() {
  const mods = await Promise.all(GAMES.map((g) => loadGame(g.id).catch(() => null)));
  GAMES.forEach((g, i) => {
    const mod = mods[i];
    const accent = (mod && mod.accent) || null;
    if (accent && g._card) g._card.style.setProperty('--ac', accent);
    if (g._best) g._best.textContent = (S.gameBest[g.id] || 0) > 0 ? '★ ' + formatNum(S.gameBest[g.id]) : '';
  });
}

function refreshArcade() {
  const unlocked = arcadeUnlocked();
  for (const g of GAMES) {
    if (!g._card) continue;
    const best = S.gameBest[g.id] || 0;
    g._best.textContent = best > 0 ? '★ ' + formatNum(best) : '';
    g._card.style.opacity = unlocked ? '' : '.42';
    g._card.style.pointerEvents = unlocked ? '' : 'none';
  }
}

/* ---------------- ledger ---------------- */
function renderLedger() {
  const rows = (host, arr) => {
    host.textContent = '';
    for (const [k, v, hi] of arr) {
      const r = el('div', 'tbl-row' + (hi ? ' hi' : ''));
      r.appendChild(el('span', 'k', k));
      r.appendChild(el('span', 'v', v));
      host.appendChild(r);
    }
  };

  const played = GAMES.filter((g) => (S.gamesPlayed[g.id] || 0) > 0 || (S.gameBest[g.id] || 0) > 0);
  const gRows = played.length
    ? played.map((g) => [
        `${String(GAMES.indexOf(g) + 1).padStart(2, '0')} · ${gameName(g.id)}`,
        `${formatNum(S.gameBest[g.id] || 0)} · ${formatNum(S.gamesPlayed[g.id] || 0)}×`,
        (S.gameBest[g.id] || 0) >= 1000
      ])
    : [['—', '—', false]];
  rows(UI.ledgerGames, gRows);

  const deptOwned = DEPARTMENTS.reduce((a, d) => a + (S.deptLevels[d.id] || 0), 0);
  const deptMax = DEPARTMENTS.reduce((a, d) => a + (S.deptLevels[d.id] || 0) * milestoneMultiplier(S.deptLevels[d.id] || 0), 0);
  rows(UI.ledgerCorp, [
    [t('cash'), formatMoney(S.cash), true],
    [t('per_sec'), formatRate(totalIncomePerSec()), false],
    [t('net_worth'), formatMoney(netWorth()), false],
    [t('prestige_bonus'), '×' + (1 + S.shares * 0.1).toFixed(2), false],
    [t('shares'), formatNum(S.shares), false],
    ['IPO count', formatNum(S.prestigeCount), false],
    [t('departments'), `${formatNum(deptOwned)} levels · ${formatNum(deptMax)} ×milestones`, false],
    [t('managers'), `${formatNum(hiredCount())}/${DEPARTMENTS.length}`, false],
    ['Clicks', formatNum(S.clickTotal), false],
    ['Total score', formatNum(Math.round(S.totalScoreAllTime)), false],
    ['Base rate', formatRate(deptIncomePerSec()), false]
  ]);
}

/* ---------------- settings ---------------- */
UI.setSfx.checked = !!S.settings.sfx;
UI.setMusic.checked = !!S.settings.music;
UI.setLang.value = S.lang || 'en';

UI.setSfx.addEventListener('change', () => {
  S.settings.sfx = UI.setSfx.checked;
  audio.setSfx(UI.setSfx.checked);
  UI.btnSound.classList.toggle('off', !UI.setSfx.checked);
  if (UI.setSfx.checked) audio.click();
  saveNow();
});
UI.setMusic.addEventListener('change', () => {
  S.settings.music = UI.setMusic.checked;
  audio.setMusic(UI.setMusic.checked);
  UI.btnMusic.classList.toggle('off', !UI.setMusic.checked);
  saveNow();
});
UI.setLang.addEventListener('change', () => {
  setLang(UI.setLang.value);
  S.lang = UI.setLang.value;
  renderAll();
  saveNow();
});

UI.btnSound.addEventListener('click', () => {
  unlockAudio();
  UI.setSfx.checked = !UI.setSfx.checked;
  UI.setSfx.dispatchEvent(new Event('change'));
});
UI.btnMusic.addEventListener('click', () => {
  unlockAudio();
  UI.setMusic.checked = !UI.setMusic.checked;
  UI.setMusic.dispatchEvent(new Event('change'));
});
UI.btnLang.addEventListener('click', () => {
  const next = toggleLang();
  S.lang = next;
  UI.setLang.value = next;
  renderAll();
  audio.click();
  saveNow();
});

UI.btnExport.addEventListener('click', async () => {
  const str = exportSave(S);
  UI.saveBox.value = str;
  try { await navigator.clipboard.writeText(str); toast(t('copied')); }
  catch (_) { toast(t('exported')); }
});
UI.btnImport.addEventListener('click', async () => {
  const str = UI.saveBox.value.trim();
  if (!str) { toast(t('imported_bad'), true); audio.error(); return; }
  try {
    const { state } = importSave(str);
    Object.assign(S, migrate(defaultState(), state));
    saveNow();
    toast(t('imported'));
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    audio.error();
    toast(t('imported_bad'), true);
  }
});
UI.btnReset.addEventListener('click', async () => {
  const ok = await openModal(t('reset_save'), t('confirm_reset'), t('reset_save'));
  if (!ok) return;
  clearSave();
  location.reload();
});

/* ---------------- language ---------------- */
function renderAll() {
  applyI18n(document);
  renderHud();
  refreshTycoon();
  refreshArcade();
  renderLedger();
  if (runningGame) {
    UI.stageName.textContent = gameName(runningGame);
    UI.stageHow.textContent = gameHowTo(runningGame);
  }
}

/* ---------------- offline / welcome-back ---------------- */
async function welcomeBack() {
  const report = applyOffline(S.lastTick, nowMs());
  if (!report) return;
  if (report.earned <= 0) return;
  S.seenOfflineModal = true;
  await openModal(
    t('welcome_title'),
    `${t('welcome_body')}<br><br><b>${formatDurationLong(report.elapsedSeconds)}</b><br>` +
    `<b style="color:#F59E0B">${formatMoney(report.earned)}</b>` +
    (report.wasCapped ? `<br><small>${t('offline_cap')}: ${formatDurationLong(report.usedSeconds)}</small>` : '') +
    (report.autoBought && report.autoBought.length
      ? `<br><small>${report.autoBought.length} × ${t('auto_buyer')}</small>` : ''),
    t('welcome_claim')
  );
  renderHud();
  refreshTycoon();
}

/* ---------------- boot ---------------- */
function setBootProgress(p) {
  if (UI.bootBar) UI.bootBar.style.width = Math.round(Math.max(0.08, Math.min(1, p)) * 100) + '%';
}

async function boot() {
  setLang(S.lang || 'en');
  buildDepartments();
  buildUpgrades();
  buildManagers();
  buildArcade();
  UI.btnSound.classList.toggle('off', !S.settings.sfx);
  UI.btnMusic.classList.toggle('off', !S.settings.music);
  setBootProgress(0.08);

  const results = await preloadAll((done, total) => setBootProgress(0.1 + 0.85 * (done / total)));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) console.warn('[nexus] games failed to load:', failed);
  await paintAccents();

  renderAll();
  startAutosave(5000);

  // offline earnings modal runs before the first frame so cash is correct
  try { await welcomeBack(); } catch (e) { console.warn('[nexus] offline', e); }

  UI.boot.classList.add('gone');
  setTimeout(() => { UI.boot.style.display = 'none'; }, 400);
  requestAnimationFrame(frame);
}

/* ---------------- main loop ---------------- */
let lastFrame = 0;
let listAccum = 0;

function frame(ts) {
  const now = ts || performance.now();
  if (!lastFrame) lastFrame = now;
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  dt = Math.min(dt, 0.033);          // hard clamp, same rule as the physics kernel

  if (dt > 0) simTick(dt, nowMs());

  renderHud();
  listAccum += dt;
  if (listAccum >= 0.15) {
    listAccum = 0;
    refreshTycoon();
    refreshArcade();
  }
  requestAnimationFrame(frame);
}

/* keep the canvas crisp when the layout changes */
window.addEventListener('resize', () => { if (hub.isActive()) hub.resize(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

boot().catch((err) => {
  console.error('[nexus] boot failed', err);
  const b = document.querySelector('.boot-text');
  if (b) b.textContent = 'Boot error: ' + err.message;
});