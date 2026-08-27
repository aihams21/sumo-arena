with open("index.html", "r") as f:
    html = f.read()

import re

# استبدال دالة رندر الصدارة بنسخة نظيفة وسليمة 100% تعتمد Template Literals
old_render = re.sub(r'function renderFullLeaderboard\(\).*?^\}\s*</script>', '', html, flags=re.DOTALL)

clean_render_func = '''
<script>
function openAccountModal() {
  const sidebar = document.getElementById('neon-sidebar');
  if (sidebar) sidebar.style.right = '-320px';
  document.getElementById('leaderboard-modal').style.display = 'none';
  const modal = document.getElementById('account-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('input-sumo-name').value = localStorage.getItem('sumo_name') || 'aiham';
    document.getElementById('input-sumo-country').value = localStorage.getItem('sumo_country') || 'Jordan 🇯🇴';
  }
}

function saveAccountSettings() {
  const name = document.getElementById('input-sumo-name').value;
  const country = document.getElementById('input-sumo-country').value;
  if(name) localStorage.setItem('sumo_name', name);
  if(country) localStorage.setItem('sumo_country', country);
  document.getElementById('account-modal').style.display = 'none';
  location.reload();
}

function openLeaderboardModalSafe() {
  const sidebar = document.getElementById('neon-sidebar');
  if (sidebar) sidebar.style.right = '-320px';
  document.getElementById('account-modal').style.display = 'none';
  const modal = document.getElementById('leaderboard-modal');
  if (modal) {
    modal.style.display = 'flex';
    renderFullLeaderboard();
  }
}

function renderFullLeaderboard() {
  const currentName = localStorage.getItem('sumo_name') || 'aiham';
  const currentAvatar = localStorage.getItem('sumo_avatar') || 'https://api.iconify.design/lucide:user-cog.svg?color=%2300f3ff';
  let players = JSON.parse(localStorage.getItem('sumo_global_players') || '[]');
  let existingIndex = players.findIndex(p => p.name === currentName);
  let currentCoins = parseInt(localStorage.getItem('sumo_coins') || '280');
  
  if (existingIndex >= 0) {
    players[existingIndex].coins = currentCoins;
    players[existingIndex].avatar = currentAvatar;
  } else {
    players.push({ name: currentName, coins: currentCoins, avatar: currentAvatar });
  }
  
  players.sort((a, b) => b.coins - a.coins);
  localStorage.setItem('sumo_global_players', JSON.stringify(players));
  
  const container = document.getElementById('modal-players-list');
  if(!container) return;
  container.innerHTML = '';
  
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
    } else if (rank === 2 || rank === 3) {
      rankStyle = 'background: rgba(192,192,192,0.15); border: 2px solid #c0c0c0;';
      rankBadge = rank === 2 ? '🥈 2' : '🥉 3';
      title = 'Neon Elite ⚡';
      trend = '🚀';
    }
    
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: 0.2s; ${rankStyle}`;
    
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-weight: bold; font-size: 13px; width: 32px; color: ${rank <= 3 ? '#ffd700' : '#00f3ff'};">${rankBadge} ${trend}</span>
        <img src="${player.avatar}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 2px solid #00f3ff;">
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
</script>
'''

# إزالة السكربت القديم بالكامل واستبداله بالنظيف
html = re.sub(r'<script>\s*function openAccountModal\(\).*?</script>', clean_render_func, html, flags=re.DOTALL)

with open("index.html", "w") as f:
    f.write(html)

print("Display bug fixed cleanly!")
