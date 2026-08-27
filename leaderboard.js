let leaderboardSort = 'coins';
let leaderboardPlayers = [];
let leaderboardAllPlayers = [];

const leaderboardFallback = [
  { name: 'NOVA JACKAL', level: 42, stage: 86, coins: 1280, skin: 'Void Samurai' },
  { name: 'CYBER RIKISHI', level: 35, stage: 71, coins: 1045, skin: 'Toxic Fang' },
  { name: 'MANGO TITAN', level: 28, stage: 54, coins: 790, skin: 'Ember Ring' },
  { name: 'AIHAM AM', level: 12, stage: 24, coins: 420, skin: 'Pulse Core' }
];

function setLeaderboardSort(sort, button) {
  leaderboardSort = sort;
  document.querySelectorAll('.lb-tab').forEach(tab => tab.classList.remove('active'));
  if (button) button.classList.add('active');
  renderPlayersList(leaderboardPlayers);
}

function filterLeaderboard(query) {
  const needle = (query || '').trim().toLowerCase();
  renderPlayersList(leaderboardAllPlayers.filter(player => (player.name || '').toLowerCase().includes(needle)));
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
    const response = await fetch('/api/leaderboard', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
    const players = await response.json();
    if (!Array.isArray(players) || players.length === 0) throw new Error('Empty leaderboard');
    leaderboardAllPlayers = players;
  } catch (_error) {
    const currentName = localStorage.getItem('sumo_name') || 'aiham';
    const current = { name: currentName, level: parseInt(localStorage.getItem('sumo_stage') || '1'), stage: parseInt(localStorage.getItem('sumo_stage') || '1'), coins: parseInt(localStorage.getItem('sumo_coins') || '0'), skin: 'Pulse Core' };
    leaderboardAllPlayers = leaderboardFallback.filter(player => player.name !== currentName);
    leaderboardAllPlayers.push(current);
  }
  renderPlayersList(leaderboardAllPlayers);
}

function renderPlayersList(players) {
  const container = document.getElementById('modal-players-list');
  if (!container) return;
  leaderboardPlayers = players || [];
  const ranked = leaderboardPlayers.map(player => ({
    ...player,
    level: Number(player.level) || Number(player.stage) || 1,
    stage: Number(player.stage) || 1,
    coins: Number(player.coins) || 0,
    skin: player.skin || player.skinName || 'Pulse Core'
  })).sort((a, b) => (b[leaderboardSort] - a[leaderboardSort]) || (b.coins - a.coins));
  container.innerHTML = '';
  const currentName = localStorage.getItem('sumo_name') || 'aiham';
  const currentRank = ranked.findIndex(player => player.name === currentName) + 1;
  const self = document.getElementById('leaderboard-self');
  if (self) self.innerText = currentRank ? `YOUR POSITION #${currentRank}` : '';
  const menuRank = document.getElementById('menu-rank');
  if (menuRank) menuRank.innerText = currentRank ? `#${currentRank}` : '--';
  ranked.forEach((player, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `leaderboard-row ${index < 3 ? `rank-${index + 1}` : ''}`;
    row.innerHTML = `<span class="leaderboard-rank">#${index + 1}</span><span class="leaderboard-player-avatar"></span><span class="leaderboard-player-copy"><b>${escapeLeaderboardText(player.name)}</b><small>LVL ${player.level} • ${escapeLeaderboardText(player.skin)} • ${player.stage} STAGES</small></span><span class="leaderboard-player-value">${leaderboardSort === 'stage' ? `🌊 ${player.stage}` : `🪙 ${player.coins}`}</span>`;
    row.addEventListener('click', () => openPlayerProfile(player, index + 1));
    container.appendChild(row);
  });
}

function openPlayerProfile(player, rank) {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  const skin = player.skin || player.skinName || 'Pulse Core';
  document.getElementById('profile-name').innerText = player.name || 'Fighter';
  document.getElementById('profile-title').innerText = `GLOBAL RANK #${rank} • ${skin}`;
  document.getElementById('profile-avatar').style.backgroundColor = '#00f3ff';
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
