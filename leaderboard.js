const LEADERBOARD_STORAGE_KEY = 'neon_sumo_player_profile_v1';
const LEADERBOARD_API = '/api/leaderboard';
let leaderboardSort = 'stage';
let leaderboardPlayers = [];
let leaderboardAllPlayers = [];

const leaderboardFallback = [
  { name: 'NOVA JACKAL', level: 42, stage: 86, coins: 1280, skin: 'Void Samurai' },
  { name: 'CYBER RIKISHI', level: 35, stage: 71, coins: 1045, skin: 'Toxic Fang' },
  { name: 'MANGO TITAN', level: 28, stage: 54, coins: 790, skin: 'Ember Ring' },
  { name: 'AIHAM AM', level: 12, stage: 24, coins: 420, skin: 'Pulse Core' }
];

function getStablePlayerId() {
  let playerId = localStorage.getItem('sumo_player_id');
  if (!playerId) {
    playerId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('sumo_player_id', playerId);
  }
  return playerId;
}

function setLeaderboardSort(sort, button) {
  leaderboardSort = sort;
  document.querySelectorAll('.lb-tab').forEach(tab => tab.classList.remove('active'));
  if (button) button.classList.add('active');
  renderPlayersList(leaderboardPlayers);
}

function getLocalLeaderboardPlayer() {
  const stage = Number(localStorage.getItem('sumo_stage')) || 1;
  const skinState = JSON.parse(localStorage.getItem('sumo_skins') || '{"equipped":"cyan"}');
  const skinNames = { cyan: 'Pulse Core', ember: 'Ember Ring', toxic: 'Toxic Fang', void: 'Void Samurai' };
  const player = { id: getStablePlayerId(), name: localStorage.getItem('sumo_name') || 'aiham', level: stage, stage, coins: Number(localStorage.getItem('sumo_coins')) || 0, skin: skinNames[skinState.equipped] || 'Pulse Core', avatar: localStorage.getItem('sumo_avatar') || '' };
  localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(player));
  return player;
}

function refreshLeaderboardWithLocalPlayer() {
  const localPlayer = getLocalLeaderboardPlayer();
  if (!leaderboardAllPlayers.length) return;
  const existingIndex = leaderboardAllPlayers.findIndex(player => player.id === localPlayer.id || player.name === localPlayer.name);
  if (existingIndex >= 0) leaderboardAllPlayers[existingIndex] = { ...leaderboardAllPlayers[existingIndex], ...localPlayer };
  else leaderboardAllPlayers.push(localPlayer);
  renderPlayersList(leaderboardAllPlayers);
  syncPlayerToServer(localPlayer);
}

async function syncPlayerToServer(player) {
  try {
    await fetch(`${LEADERBOARD_API}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(player), keepalive: true });
  } catch (_error) {
    // The local profile remains the source for offline play until the API is available.
  }
}

function filterLeaderboard(query) {
  const needle = (query || '').trim().toLowerCase();
  renderPlayersList(leaderboardAllPlayers.filter(player => (player.name || '').toLowerCase().includes(needle)));
}

function normalizeLeaderboardPlayer(player) {
  const stage = Number(player.stage ?? player.stagesCompleted ?? player.completedStages ?? player.level) || 1;
  return { ...player, id: player.id || player.playerId || player.name, level: Number(player.level) || stage, stage, coins: Number(player.coins) || 0, skin: player.skin || player.skinName || 'Pulse Core' };
}

function sortLeaderboardPlayers(players) {
  return players.map(normalizeLeaderboardPlayer).sort((a, b) => {
    const primary = b[leaderboardSort] - a[leaderboardSort];
    if (primary) return primary;
    const level = b.level - a.level;
    return level || (b.coins - a.coins) || String(a.name).localeCompare(String(b.name));
  });
}

function openLeaderboardModalSafe() {
  const sidebar = document.getElementById('neon-sidebar');
  if (sidebar) sidebar.style.right = '-320px';
  const accountModal = document.getElementById('account-modal');
  if (accountModal) accountModal.style.display = 'none';
  const modal = document.getElementById('leaderboard-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  const search = document.getElementById('leaderboard-search');
  if (search) search.value = '';
  fetchRealLeaderboard();
}

async function fetchRealLeaderboard() {
  const container = document.getElementById('modal-players-list');
  if (!container) return;
  container.innerHTML = '<div class="leaderboard-loading">SYNCING GLOBAL FIGHTERS...</div>';
  try {
    const response = await fetch(LEADERBOARD_API, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
      const payload = await response.json();
      const players = Array.isArray(payload) ? payload : payload.players;
    if (!Array.isArray(players) || players.length === 0) throw new Error('Empty leaderboard');
    leaderboardAllPlayers = players;
    refreshLeaderboardWithLocalPlayer();
  } catch (_error) {
    const current = getLocalLeaderboardPlayer();
    leaderboardAllPlayers = leaderboardFallback.filter(player => player.name !== current.name && player.name !== 'AIHAM AM');
    leaderboardAllPlayers.push(current);
  }
  renderPlayersList(leaderboardAllPlayers);
}

function renderPlayersList(players) {
  const container = document.getElementById('modal-players-list');
  if (!container) return;
  leaderboardPlayers = players || [];
    const ranked = sortLeaderboardPlayers(leaderboardPlayers);
  container.innerHTML = '';
  const currentName = localStorage.getItem('sumo_name') || 'aiham';
  const currentId = getStablePlayerId();
  const currentRank = ranked.findIndex(player => player.id === currentId || player.name === currentName) + 1;
  const self = document.getElementById('leaderboard-self');
  if (self) self.innerText = currentRank ? `YOUR POSITION #${currentRank}` : '';
  const menuRank = document.getElementById('menu-rank');
  if (menuRank) menuRank.innerText = currentRank ? `#${currentRank}` : '--';
  ranked.forEach((player, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `leaderboard-row ${index < 3 ? `rank-${index + 1}` : ''}`;
    const rankBadge = index === 0 ? '👑 1' : index === 1 ? '🥈 2' : index === 2 ? '🥉 3' : `#${index + 1}`;
    row.innerHTML = `<span class="leaderboard-rank">${rankBadge}</span><span class="leaderboard-player-avatar"></span><span class="leaderboard-player-copy"><b>${escapeLeaderboardText(player.name)}</b><small>LVL ${player.level} • ${escapeLeaderboardText(player.skin)} • ${player.stage} STAGES</small></span><span class="leaderboard-player-value">${leaderboardSort === 'stage' ? `🌊 ${player.stage}` : `🪙 ${player.coins}`}</span>`;
    row.addEventListener('click', () => openPlayerProfile(player, index + 1));
    container.appendChild(row);
  });
}

function openPlayerProfile(player, rank) {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  const skin = player.skin || player.skinName || 'Pulse Core';
  const panel = modal.querySelector('.profile-panel');
  if (panel) panel.className = `profile-panel profile-rank-${Math.min(rank, 3)}`;
  document.getElementById('profile-name').innerText = player.name || 'Fighter';
  document.getElementById('profile-title').innerText = `GLOBAL RANK #${rank} • ${skin}`;
  const skinColors = { 'Void Samurai': '#ff2bd6', 'Toxic Fang': '#7dff00', 'Ember Ring': '#ff6b00', 'Pulse Core': '#00e5ff' };
  const profileAvatar = document.getElementById('profile-avatar');
  profileAvatar.style.backgroundColor = skinColors[skin] || '#00f3ff';
  profileAvatar.style.boxShadow = `0 0 22px ${skinColors[skin] || '#00f3ff'}`;
  document.getElementById('profile-stats').innerHTML = `<div>LEVEL<strong>${Number(player.level) || 1}</strong></div><div>STAGES<strong>${Number(player.stage) || 1}</strong></div><div>COINS<strong>${Number(player.coins) || 0}</strong></div><div>SKIN<strong>${escapeLeaderboardText(skin)}</strong></div>`;
  modal.style.display = 'flex';
}

function closePlayerProfile() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.style.display = 'none';
}

function escapeLeaderboardText(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}
