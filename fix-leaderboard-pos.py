with open("index.html", "r") as f:
    html = f.read()

# إزالة كود الصدارة الخاطئ اللي نزل برا المنيو
import re
html = re.sub(r'<!-- قسم لوحة الصدارة الحية.*?</script>', '', html, flags=re.DOTALL)

# وضع الكود الصحيح داخل الـ Sidebar نفسها تحت الأزرار مباشرة
new_leaderboard_block = """
  <!-- لوحة الصدارة داخل القائمة الجانبية -->
  <div id="leaderboard-section" style="margin-top: 25px; border-top: 1px solid rgba(0,243,255,0.3); padding-top: 15px;">
    <h3 style="color: #00f3ff; font-size: 13px; text-shadow: 0 0 8px #00f3ff; margin-bottom: 10px; text-transform: uppercase;">🔥 Global Leaderboard</h3>
    <div id="players-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; padding-right: 4px;">
      <!-- اللاعبين الحقيقيين -->
    </div>
  </div>
</div>

<script>
function updateLeaderboard() {
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
  
  const listContainer = document.getElementById('players-list');
  if(!listContainer) return;
  listContainer.innerHTML = '';
  
  players.forEach((player, index) => {
    let rank = index + 1;
    let glowStyle = '';
    let rankBadge = `#${rank}`;
    
    if (rank === 1) {
      glowStyle = 'border: 2px solid #ffd700; box-shadow: 0 0 12px rgba(255,215,0,0.6); background: rgba(255,215,0,0.1);';
      rankBadge = '👑 1';
    } else if (rank === 2) {
      glowStyle = 'border: 2px solid #c0c0c0; box-shadow: 0 0 10px rgba(192,192,192,0.5); background: rgba(192,192,192,0.1);';
      rankBadge = '🥈 2';
    } else if (rank === 3) {
      glowStyle = 'border: 2px solid #cd7f32; box-shadow: 0 0 8px rgba(205,127,50,0.5); background: rgba(205,127,50,0.1);';
      rankBadge = '🥉 3';
    } else {
      glowStyle = 'border: 1px solid rgba(0,243,255,0.2); background: rgba(5,5,15,0.5);';
    }
    
    const item = document.createElement('div');
    item.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; font-size: 11px; ${glowStyle}`;
    
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-weight: bold; width: 22px; color: ${rank <= 3 ? '#ff0055' : '#00f3ff'};">${rankBadge}</span>
        <img src="${player.avatar}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; border: 1px solid #00f3ff;">
        <span style="color: #fff; font-weight: bold; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${player.name}</span>
      </div>
      <span style="color: #00f3ff; font-weight: bold;">🪙 ${player.coins}</span>
    `;
    listContainer.appendChild(item);
  });
}

setInterval(updateLeaderboard, 2000);
window.addEventListener('load', updateLeaderboard);
</script>
"""

# استبدال نهايات الـ Sidebar بحيث تُحقن الصدارة قبل إغلاقها
html = re.sub(r'</div>\s*<script>\s*function toggleNeonMenu\(\)', new_leaderboard_block + '\n</div>\n<script>\nfunction toggleNeonMenu()', html)

with open("index.html", "w") as f:
    f.write(html)

print("Leaderboard fixed inside sidebar!")
