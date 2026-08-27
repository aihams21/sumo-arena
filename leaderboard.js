// عرض كافة اللاعبين بالسيرفر من الأول ولحد الأخير بالكامل
function openLeaderboardModalSafe() {
  const sidebar = document.getElementById('neon-sidebar');
  if (sidebar) sidebar.style.right = '-320px';
  
  const accountModal = document.getElementById('account-modal');
  if (accountModal) accountModal.style.display = 'none';

  const modal = document.getElementById('leaderboard-modal');
  if (modal) {
    modal.style.display = 'flex';
    renderFullLeaderboard();
  }
}

function renderFullLeaderboard() {
  const currentName = localStorage.getItem('sumo_name') || 'aiham';
  const currentAvatar = localStorage.getItem('sumo_avatar') || 'https://api.iconify.design/lucide:user-cog.svg?color=%2300f3ff';
  const currentCoins = parseInt(localStorage.getItem('sumo_coins') || '280');
  
  let players = JSON.parse(localStorage.getItem('sumo_global_players') || '[]');
  
  // التأكد من وجود اللاعب الحالي ضمن القائمة أو تحديثه
  let existingIndex = players.findIndex(p => p.name === currentName);
  if (existingIndex >= 0) {
    players[existingIndex].coins = currentCoins;
    players[existingIndex].avatar = currentAvatar;
  } else {
    players.push({ name: currentName, coins: currentCoins, avatar: currentAvatar });
  }
  
  // فرز اللاعبين تنازلياً حسب الكوينز (من الأعلى للأقل) لضمان دقة الترتيب
  players.sort((a, b) => b.coins - a.coins);
  localStorage.setItem('sumo_global_players', JSON.stringify(players));
  
  const container = document.getElementById('modal-players-list');
  if(!container) return;
  container.innerHTML = '';
  
  // حلقة تكرارية تعرض كافة اللاعبين بدون إخفاء أي أحد
  players.forEach((player, index) => {
    let rank = index + 1;
    let rankStyle = 'border: 1px solid rgba(0,243,255,0.2); background: rgba(10,10,25,0.6);';
    let rankBadge = '#' + rank;
    let title = 'NetRunner 💻';
    let trend = '🟢';
    
    if (rank === 1) {
      rankStyle = 'background: rgba(255,215,0,0.15); border: 2px solid #ffd700; box-shadow: 0 0 15px rgba(255,215,0,0.4);';
      rankBadge = '👑 1';
      title = 'Cyber Overlord 👑';
      trend = '🔥';
    } else if (rank === 2) {
      rankStyle = 'background: rgba(192,192,192,0.15); border: 2px solid #c0c0c0;';
      rankBadge = '🥈 2';
      title = 'Neon Elite ⚡';
      trend = '🚀';
    } else if (rank === 3) {
      rankStyle = 'background: rgba(205,127,50,0.15); border: 2px solid #cd7f32;';
      rankBadge = '🥉 3';
      title = 'Neon Elite ⚡';
      trend = '🚀';
    }
    
    const row = document.createElement('div');
    row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: 0.2s; " + rankStyle;
    
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-weight: bold; font-size: 13px; width: 32px; color: ${rank <= 3 ? '#ffd700' : '#00f3ff'};">${rankBadge} ${trend}</span>
        <img src="${player.avatar || 'https://api.iconify.design/lucide:user-cog.svg?color=%2300f3ff'}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 2px solid #00f3ff;">
        <div>
          <div style="color: #fff; font-weight: bold; font-size: 13px;">${player.name}</div>
          <div style="color: ${rank === 1 ? '#ffd700' : '#00f3ff'}; font-size: 9px; opacity: 0.8;">${title}</div>
        </div>
      </div>
      <div style="color: #ffd700; font-weight: bold; font-size: 13px;">🪙 ${player.coins}</div>
    `;
    container.appendChild(row);
  });
}
