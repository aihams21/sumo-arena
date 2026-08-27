with open("index.html", "r") as f:
    html = f.read()

import re

# تنظيف كامل لأي كود أو نصوص متداخلة سابقة
html = re.sub(r'<!-- ACCOUNT MODAL -->.*?</script>', '', html, flags=re.DOTALL)
html = re.sub(r'<!-- LEADERBOARD MODAL -->.*?</script>', '', html, flags=re.DOTALL)
html = re.sub(r'<!-- 1\. نافذة تعديل الحساب.*?</script>', '', html, flags=re.DOTALL)
html = re.sub(r'<!-- 2\. نافذة لوحة الصدارة المستقلة تماماً.*?</script>', '', html, flags=re.DOTALL)
html = re.sub(r'<div id="leaderboard-modal".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
html = re.sub(r'<div id="account-modal".*?</div>\s*</div>\s*</div>', '', html, flags=re.DOTALL)
html = re.sub(r'container\.appendChild\(row\);.*?</script>', '', html, flags=re.DOTALL)

clean_modals = '''
<!-- ACCOUNT MODAL -->
<div id="account-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 99999; justify-content: center; align-items: center; font-family: 'Orbitron', sans-serif;">
  <div style="background: #060612; border: 2px solid #00f3ff; padding: 25px; border-radius: 14px; width: 380px; box-shadow: 0 0 40px rgba(0,243,255,0.3); color: #fff;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid rgba(0,243,255,0.3); padding-bottom: 10px;">
      <h3 style="color: #00f3ff; margin: 0; font-size: 15px;">EDIT ACCOUNT</h3>
      <span onclick="document.getElementById('account-modal').style.display='none'" style="color: #ff0055; font-size: 24px; cursor: pointer;">&times;</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px; font-size: 12px;">
      <label>اسم اللاعب:</label>
      <input type="text" id="input-sumo-name" style="background: rgba(0,243,255,0.1); border: 1px solid #00f3ff; color: #fff; padding: 10px; border-radius: 6px; outline: none;">
      <label>علم الدولة / الايموجي:</label>
      <input type="text" id="input-sumo-country" style="background: rgba(0,243,255,0.1); border: 1px solid #00f3ff; color: #fff; padding: 10px; border-radius: 6px; outline: none;">
    </div>
    <div style="display: flex; gap: 10px; margin-top: 20px;">
      <button onclick="saveAccountSettings()" style="flex: 1; background: rgba(0,243,255,0.2); border: 1px solid #00f3ff; color: #00f3ff; padding: 10px; font-weight: bold; border-radius: 6px; cursor: pointer;">حفظ</button>
      <button onclick="document.getElementById('account-modal').style.display='none'" style="flex: 1; background: rgba(255,0,85,0.1); border: 1px solid #ff0055; color: #ff0055; padding: 10px; font-weight: bold; border-radius: 6px; cursor: pointer;">إغلاق</button>
    </div>
  </div>
</div>

<!-- LEADERBOARD MODAL -->
<div id="leaderboard-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.92); z-index: 99999; justify-content: center; align-items: center; font-family: 'Orbitron', sans-serif; backdrop-filter: blur(15px);">
  <div style="background: #050510; border: 2px solid #ffd700; padding: 25px; border-radius: 16px; width: 450px; max-height: 85vh; box-shadow: 0 0 60px rgba(255,215,0,0.5); color: #fff; display: flex; flex-direction: column; box-sizing: border-box;">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,215,0,0.3); padding-bottom: 12px; margin-bottom: 15px;">
      <div>
        <h2 style="color: #ffd700; font-size: 16px; text-shadow: 0 0 10px #ffd700; margin: 0;">🏆 CYBER HALL OF FAME</h2>
        <span style="font-size: 10px; color: #00f3ff;">Ultimate Global Rankings</span>
      </div>
      <span onclick="document.getElementById('leaderboard-modal').style.display='none'" style="color: #ff0055; font-size: 28px; cursor: pointer; text-shadow: 0 0 10px #ff0055; line-height: 1;">&times;</span>
    </div>
    <div id="modal-players-list" style="display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 52vh; padding-right: 5px;"></div>
    <button onclick="document.getElementById('leaderboard-modal').style.display='none'" style="margin-top: 15px; background: rgba(255,0,85,0.2); border: 1px solid #ff0055; color: #ff0055; padding: 10px; font-weight: bold; border-radius: 8px; cursor: pointer; text-transform: uppercase; font-size: 12px;">إغلاق القائمة</button>
  </div>
</div>

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
    row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: 0.2s; ' + rankStyle;
    row.innerHTML = '<div style="display: flex; align-items: center; gap: 10px;"><span style="font-weight: bold; font-size: 13px; width: 32px; color: ' + (rank <= 3 ? '#ffd700' : '#00f3ff') + ';">' + rankBadge + ' ' + trend + '</span><img src="' + player.avatar + '" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 2px solid #00f3ff;"><div><div style="color: #fff; font-weight: bold; font-size: 13px;">' + player.name + '</div><div style="color: ' + (rank === 1 ? '#ffd700' : '#00f3ff') + '; font-size: 9px; opacity: 0.8;">' + title + '</div></div></div><div style="color: #ffd700; font-weight: bold; font-size: 13px;">🪙 ' + player.coins + '</div>';
    container.appendChild(row);
  });
}
</script>
'''

if "</body>" in html:
    html = html.replace("</body>", clean_modals + "\n</body>")
    with open("index.html", "w") as f:
        f.write(html)
    print("Clean reset complete!")
