import re

with open("index.html", "r") as f:
    html = f.read()

# إزالة كود المودل القديم
html = re.sub(r'<!-- نافذة لوحة الصدارة الأسطورية الشاملة.*?</script>', '', html, flags=re.DOTALL)

pulse_leaderboard_code = """
<!-- نافذة لوحة الصدارة الأسطورية مع وميض النيون المتحرك -->
<div id="leaderboard-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.88); z-index: 20000; justify-content: center; align-items: center; font-family: 'Orbitron', sans-serif; backdrop-filter: blur(12px);">
  <div style="background: #060612; border: 2px solid #ffd700; padding: 25px; border-radius: 16px; width: 460px; max-height: 85vh; box-shadow: 0 0 50px rgba(255,215,0,0.4); color: #fff; display: flex; flex-direction: column; box-sizing: border-box;">
    
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,215,0,0.3); padding-bottom: 12px; margin-bottom: 15px;">
      <div>
        <h2 style="color: #ffd700; font-size: 16px; text-shadow: 0 0 10px #ffd700; margin: 0;">🏆 CYBER HALL OF FAME</h2>
        <span style="font-size: 10px; color: #00f3ff;">Live Global Rankings & Pulse FX</span>
      </div>
      <span onclick="closeLeaderboardModal()" style="color: #ff0055; font-size: 26px; cursor: pointer; text-shadow: 0 0 10px #ff0055; line-height: 1;">&times;</span>
    </div>

    <!-- قائمة اللاعبين مع تأثير الوميض -->
    <div id="modal-players-list" style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 52vh; padding-right: 5px;">
      <!-- يتم تعبئتها ديناميكياً -->
    </div>

    <button onclick="closeLeaderboardModal()" style="margin-top: 15px; background: rgba(255,0,85,0.2); border: 1px solid #ff0055; color: #ff0055; padding: 10px; font-weight: bold; border-radius: 8px; cursor: pointer; text-transform: uppercase; font-size: 12px;">إغلاق القائمة</button>
  </div>
</div>

<!-- نافذة إحصائيات اللاعب -->
<div id="player-stats-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); z-index: 25000; justify-content: center; align-items: center; font-family: 'Orbitron', sans-serif;">
  <div style="background: #08081a; border: 2px solid #00f3ff; padding: 25px; border-radius: 14px; width: 360px; box-shadow: 0 0 30px rgba(0,243,255,0.4); text-align: center; color: #fff;">
    <img id="stats-avatar" src="" style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid #00f3ff; margin-bottom: 10px; object-fit: cover;">
    <h3 id="stats-name" style="color: #00f3ff; margin: 5px 0; font-size: 16px;"></h3>
    <p id="stats-title" style="color: #ffd700; font-size: 11px; margin-bottom: 15px;"></p>
    <div style="background: rgba(0,243,255,0.05); border: 1px solid rgba(0,243,255,0.2); border-radius: 8px; padding: 12px; text-align: left; font-size: 12px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px;">
      <div>🪙 رصيد العملات: <span id="stats-coins" style="color: #ffd700; font-weight: bold;"></span></div>
      <div>⚡ حالة الشبكة: <span style="color: #00ff66;">متصل ومؤمن (Online)</span></div>
      <div>🛡️ رتبة الترتيب: <span id="stats-rank" style="color: #ff0055; font-weight: bold;"></span></div>
    </div>
    <button onclick="document.getElementById('player-stats-modal').style.display='none'" style="background: rgba(0,243,255,0.2); border: 1px solid #00f3ff; color: #00f3ff; padding: 8px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">رجوع</button>
  </div>
</div>

<style>
@keyframes neonPulse {
  0% { box-shadow: 0 0 10px rgba(255, 215, 0, 0.3); border-color: #ffd700; }
  50% { box-shadow: 0 0 25px rgba(255, 215, 0, 0.8); border-color: #fff; }
  100% { box-shadow: 0 0 10px rgba(255, 215, 0, 0.3); border-color: #ffd700; }
}
.pulse-glow-gold {
  animation: neonPulse 2s infinite ease-in-out;
}
@keyframes cyanPulse {
  0% { box-shadow: 0 0 8px rgba(0, 243, 255, 0.2); }
  50% { box-shadow: 0 0 18px rgba(0, 243, 255, 0.6); }
  100% { box-shadow: 0 0 8px rgba(0, 243, 255, 0.2); }
}
.pulse-glow-cyan {
  animation: cyanPulse 2.5s infinite ease-in-out;
}
</style>

<script>
function openLeaderboardModal() {
  toggleNeonMenu();
  document.getElementById('leaderboard-modal').style.display = 'flex';
  renderFullLeaderboard();
}

function closeLeaderboardModal() {
  document.getElementById('leaderboard-modal').style.display = 'none';
}

function showPlayerStats(name, coins, avatar, rank, title) {
  document.getElementById('stats-name').innerText = name;
  document.getElementById('stats-coins').innerText = coins;
  document.getElementById('stats-avatar').src = avatar;
  document.getElementById('stats-rank').innerText = `#${rank} (${title})`;
  document.getElementById('player-stats-modal').style.display = 'flex';
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
    let rankBadge = `#${rank}`;
    let title = 'NetRunner 💻';
    let trend = '🟢';
    let pulseClass = 'pulse-glow-cyan';
    
    if (rank === 1) {
      rankStyle = 'background: rgba(255,215,0,0.15);';
      rankBadge = '👑 1';
      title = 'Cyber Overlord 👑';
      trend = '🔥';
      pulseClass = 'pulse-glow-gold';
    } else if (rank === 2 || rank === 3) {
      rankStyle = 'background: rgba(192,192,192,0.15);';
      rankBadge = rank === 2 ? '🥈 2' : '🥉 3';
      title = 'Neon Elite ⚡';
      trend = '🚀';
    }
    
    const row = document.createElement('div');
    row.className = pulseClass;
    row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: 0.2s; ${rankStyle}`;
    row.onmouseover = () => row.style.transform = 'scale(1.02)';
    row.onmouseout = () => row.style.transform = 'scale(1)';
    row.onclick = () => showPlayerStats(player.name, player.coins, player.avatar, rank, title);
    
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-weight: bold; font-size: 13px; width: 32px; color: ${rank <= 3 ? '#ffd700' : '#00f3ff'};">${rankBadge} ${trend}</span>
        <img src="${player.avatar}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 2px solid #00f3ff;">
        <div>
          <div style="color: #fff; font-weight: bold; font-size: 13px;">${player.name}</div>
          <div style="color: ${rank === 1 ? '#ffd700' : '#00f3ff'}; font-size: 9px; opacity: 0.8;">${title}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="color: #ffd700; font-weight: bold; font-size: 13px;">🪙 ${player.coins}</div>
      </div>
    `;
    container.appendChild(row);
  });
}
</script>
"""

if "</body>" in html:
    html = html.replace("</body>", pulse_leaderboard_code + "\n</body>")
    with open("index.html", "w") as f:
        f.write(html)
    print("Leaderboard with pulse glow animation injected!")
