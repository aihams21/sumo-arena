import re

with open("index.html", "r") as f:
    html = f.read()

# تنظيف أي كود قديم لليدربورد أو المودل الخاص فيه
html = re.sub(r'<!-- نافذة لوحة الصدارة.*?</script>', '', html, flags=re.DOTALL)
html = re.sub(r'id="leaderboard-section".*?</div>\s*</div>', '', html, flags=re.DOTALL)
html = re.sub(r'<button onclick="openLeaderboardModal\(\)".*?</button>', '', html, flags=re.DOTALL)

# إدراج زر لوحة الصدارة بين "تعديل الحساب" و "الدعم الفني" في المنيو
old_buttons_block = """    <button onclick="openAccountModal()" style="background: rgba(0,243,255,0.1); border: 1px solid #00f3ff; color: #00f3ff; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; text-align: left; transition: 0.3s;">⚙️ تعديل الحساب (My Account)</button>
    <a href="https://www.instagram.com/nn1v4/" target="_blank" style="text-decoration: none;">"""

new_buttons_block = """    <button onclick="openAccountModal()" style="background: rgba(0,243,255,0.1); border: 1px solid #00f3ff; color: #00f3ff; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; text-align: left; transition: 0.3s;">⚙️ تعديل الحساب (My Account)</button>
    <button onclick="openLeaderboardModal()" style="background: rgba(255,215,0,0.1); border: 1px solid #ffd700; color: #ffd700; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; text-align: left; transition: 0.3s;">🏆 لوحة الصدارة (Leaderboard)</button>
    <a href="https://www.instagram.com/nn1v4/" target="_blank" style="text-decoration: none;">"""

html = html.replace(old_buttons_block, new_buttons_block)

# إنشاء نافذة المودل الأسطورية لليدربورد بالكامل
leaderboard_modal_code = """
<!-- نافذة لوحة الصدارة الشاملة (Leaderboard Modal) -->
<div id="leaderboard-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 20000; justify-content: center; align-items: center; font-family: 'Orbitron', sans-serif; backdrop-filter: blur(10px);">
  <div style="background: #060612; border: 2px solid #ffd700; padding: 30px; border-radius: 16px; width: 420px; max-height: 80vh; box-shadow: 0 0 40px rgba(255,215,0,0.4); color: #fff; display: flex; flex-direction: column; box-sizing: border-box;">
    
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,215,0,0.3); padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: #ffd700; font-size: 18px; text-shadow: 0 0 10px #ffd700; margin: 0;">🏆 GLOBAL LEADERBOARD</h2>
      <span onclick="closeLeaderboardModal()" style="color: #ff0055; font-size: 28px; cursor: pointer; text-shadow: 0 0 10px #ff0055; line-height: 1;">&times;</span>
    </div>

    <!-- قائمة اللاعبين الحقيقيين الكاملة -->
    <div id="modal-players-list" style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 50vh; padding-right: 5px;">
      <!-- يتم تعبئتها ديناميكياً -->
    </div>

    <button onclick="closeLeaderboardModal()" style="margin-top: 20px; background: rgba(255,0,85,0.2); border: 1px solid #ff0055; color: #ff0055; padding: 10px; font-weight: bold; border-radius: 8px; cursor: pointer; text-transform: uppercase;">إغلاق</button>
  </div>
</div>

<script>
function openLeaderboardModal() {
  toggleNeonMenu(); // إغلاق المنيو الجانبي
  document.getElementById('leaderboard-modal').style.display = 'flex';
  renderFullLeaderboard();
}

function closeLeaderboardModal() {
  document.getElementById('leaderboard-modal').style.display = 'none';
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
    
    if (rank === 1) {
      rankStyle = 'border: 2px solid #ffd700; box-shadow: 0 0 20px rgba(255,215,0,0.5); background: rgba(255,215,0,0.15);';
      rankBadge = '👑 1';
    } else if (rank === 2) {
      rankStyle = 'border: 2px solid #c0c0c0; box-shadow: 0 0 15px rgba(192,192,192,0.4); background: rgba(192,192,192,0.15);';
      rankBadge = '🥈 2';
    } else if (rank === 3) {
      rankStyle = 'border: 2px solid #cd7f32; box-shadow: 0 0 12px rgba(205,127,50,0.4); background: rgba(205,127,50,0.15);';
      rankBadge = '🥉 3';
    }
    
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 12px 15px; border-radius: 10px; ${rankStyle}`;
    
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: bold; font-size: 14px; width: 35px; color: ${rank <= 3 ? '#ffd700' : '#00f3ff'};">${rankBadge}</span>
        <img src="${player.avatar}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid #00f3ff;">
        <span style="color: #fff; font-weight: bold; font-size: 14px;">${player.name}</span>
      </div>
      <div style="color: #ffd700; font-weight: bold; font-size: 14px;">🪙 ${player.coins}</div>
    `;
    container.appendChild(row);
  });
}
</script>
"""

if "</body>" in html:
    html = html.replace("</body>", leaderboard_modal_code + "\n</body>")
    with open("index.html", "w") as f:
        f.write(html)
    print("Leaderboard modal injected perfectly!")
