import re

with open("index.html", "r") as f:
    html = f.read()

# تنظيف أي كود قديم لليدربورد أو المودل المتضارب
html = re.sub(r'<div id="leaderboard-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 99999; justify-content: center; align-items: center; font-family: 'Orbitron', sans-serif; backdrop-filter: blur(15px);">
  <div style="background: #050510; border: 2px solid #ffd700; padding: 25px; border-radius: 16px; width: 450px; max-height: 85vh; box-shadow: 0 0 60px rgba(255,215,0,0.5); color: #fff; display: flex; flex-direction: column; box-sizing: border-box;">
    
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,215,0,0.3); padding-bottom: 12px; margin-bottom: 15px;">
      <div>
        <h2 style="color: #ffd700; font-size: 16px; text-shadow: 0 0 10px #ffd700; margin: 0;">🏆 CYBER HALL OF FAME</h2>
        <span style="font-size: 10px; color: #00f3ff;">Ultimate Global Rankings</span>
      </div>
      <span id="close-lb-btn" style="color: #ff0055; font-size: 28px; cursor: pointer; text-shadow: 0 0 10px #ff0055; line-height: 1;">&times;</span>
    </div>

    <div id="modal-players-list" style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 52vh; padding-right: 5px;">
    </div>

    <button id="close-lb-footer-btn" style="margin-top: 15px; background: rgba(255,0,85,0.2); border: 1px solid #ff0055; color: #ff0055; padding: 10px; font-weight: bold; border-radius: 8px; cursor: pointer; text-transform: uppercase; font-size: 12px;">إغلاق القائمة</button>
  </div>
</div>

<script>
// دوال الفتح والإغلاق المستقلة والنهائية
function openLeaderboardModalSafe() {
  const sidebar = document.getElementById('neon-sidebar');
  if (sidebar) sidebar.style.right = '-320px'; // إغلاق المنيو الجانبي تلقائياً
  
  const modal = document.getElementById('leaderboard-modal');
  if (modal) {
    modal.style.display = 'flex';
    renderFullLeaderboard();
  }
}

function closeLeaderboardModalSafe() {
  const modal = document.getElementById('leaderboard-modal');
  if (modal) modal.style.display = 'none';
}

// ربط الأحداث برمجياً لضمان عدم حدوث أي خطأ بالكبس
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn1 = document.getElementById('close-lb-btn');
  const closeBtn2 = document.getElementById('close-lb-footer-btn');
  if (closeBtn1) closeBtn1.onclick = closeLeaderboardModalSafe;
  if (closeBtn2) closeBtn2.onclick = closeLeaderboardModalSafe;
});

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
    let rankBadge = `#${rank}`;
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
"""

# استبدال زر القائمة القديم بالدالة الآمنة الجديدة
html = re.sub(r'onclick="openLeaderboardModal\(\)"', 'onclick="openLeaderboardModalSafe()"', html)

if "</body>" in html:
    html = html.replace("</body>", final_modal_system + "\n</body>")
    with open("index.html", "w") as f:
        f.write(html)
    print("Final modal system injected successfully!")
