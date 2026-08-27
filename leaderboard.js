function openLeaderboardModalSafe() {
  const sidebar = document.getElementById('neon-sidebar');
  if (sidebar) sidebar.style.right = '-320px';
  
  const accountModal = document.getElementById('account-modal');
  if (accountModal) accountModal.style.display = 'none';

  const modal = document.getElementById('leaderboard-modal');
  if (modal) {
    modal.style.display = 'flex';
    fetchRealLeaderboard();
  }
}

async function fetchRealLeaderboard() {
  const container = document.getElementById('modal-players-list');
  if(!container) return;
  
  container.innerHTML = '<div style="text-align: center; color: #00f3ff; padding: 25px; font-family: monospace; text-shadow: 0 0 10px rgba(0,243,255,0.5);">جاري مزامنة أساطير السيرفر... ⚡</div>';

  try {
    let response = await fetch('/api/leaderboard');
    let players = await response.json();
    renderPlayersList(players);
  } catch (error) {
    const currentName = localStorage.getItem('sumo_name') || 'aiham';
    const currentAvatar = localStorage.getItem('sumo_avatar') || 'https://api.iconify.design/lucide:user-cog.svg?color=%2300f3ff';
    const currentCoins = parseInt(localStorage.getItem('sumo_coins') || '280');
    
    // جلب اللاعبين المحليين أو المحفوظين لتشكيل قائمة حية
    let players = JSON.parse(localStorage.getItem('sumo_global_players') || '[]');
    let existingIndex = players.findIndex(p => p.name === currentName);
    if (existingIndex >= 0) {
      players[existingIndex].coins = currentCoins;
      players[existingIndex].avatar = currentAvatar;
    } else {
      players.push({ name: currentName, coins: currentCoins, avatar: currentAvatar });
    }
    
    renderPlayersList(players);
  }
}

function renderPlayersList(players) {
  const container = document.getElementById('modal-players-list');
  if(!container) return;
  container.innerHTML = '';
  
  if (!players || players.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #ff0055; padding: 25px; font-family: monospace;">لا توجد بيانات متاحة حالياً بالسيرفر</div>';
    return;
  }

  players.sort((a, b) => b.coins - a.coins);
  localStorage.setItem('sumo_global_players', JSON.stringify(players));
  
  players.forEach((player, index) => {
    let rank = index + 1;
    let rankStyle = 'background: rgba(10, 15, 35, 0.7); border: 1px solid rgba(0, 243, 255, 0.25); box-shadow: inset 0 0 10px rgba(0, 243, 255, 0.05);';
    let rankBadge = '#' + rank;
    let title = 'NetRunner 💻';
    let glowColor = '#00f3ff';
    
    if (rank === 1) {
      rankStyle = 'background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(10,15,35,0.9)); border: 2px solid #ffd700; box-shadow: 0 0 20px rgba(255,215,0,0.3), inset 0 0 10px rgba(255,215,0,0.2);';
      rankBadge = '👑 1';
      title = 'CYBER OVERLORD 👑';
      glowColor = '#ffd700';
    } else if (rank === 2) {
      rankStyle = 'background: linear-gradient(135deg, rgba(192,192,192,0.15), rgba(10,15,35,0.9)); border: 2px solid #c0c0c0; box-shadow: 0 0 15px rgba(192,192,192,0.2);';
      rankBadge = '🥈 2';
      title = 'NEON ELITE ⚡';
      glowColor = '#c0c0c0';
    } else if (rank === 3) {
      rankStyle = 'background: linear-gradient(135deg, rgba(205,127,50,0.15), rgba(10,15,35,0.9)); border: 2px solid #cd7f32; box-shadow: 0 0 15px rgba(205,127,50,0.2);';
      rankBadge = '🥉 3';
      title = 'NEON MASTER ⚔️';
      glowColor = '#cd7f32';
    }
    
    const row = document.createElement('div');
    row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; transition: all 0.3s ease; cursor: pointer; " + rankStyle;
    
    row.onmouseover = () => { row.style.transform = 'scale(1.02)'; row.style.borderColor = glowColor; };
    row.onmouseout = () => { row.style.transform = 'scale(1)'; };

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: 900; font-size: 14px; width: 40px; color: ${glowColor}; text-shadow: 0 0 8px ${glowColor};">${rankBadge}</span>
        <img src="${player.avatar || 'https://api.iconify.design/lucide:user-cog.svg?color=%2300f3ff'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid ${glowColor}; box-shadow: 0 0 10px ${glowColor};">
        <div>
          <div style="color: #ffffff; font-weight: bold; font-size: 14px; letter-spacing: 0.5px;">${player.name}</div>
          <div style="color: ${glowColor}; font-size: 10px; font-weight: bold; opacity: 0.9; text-transform: uppercase;">${title}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.4); padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(255,215,0,0.3);">
        <span style="font-size: 14px;">🪙</span>
        <span style="color: #ffd700; font-weight: 900; font-size: 14px; text-shadow: 0 0 8px rgba(255,215,0,0.5);">${player.coins}</span>
      </div>
    `;
    container.appendChild(row);
  });
}
