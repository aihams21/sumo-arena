import re

with open("index.html", "r") as f:
    html = f.read()

# إزالة لوحة الصدارة القديمة إن وجدت
html = re.sub(r'<!-- قسم لوحة الصدارة -->.*?</script>', '', html, flags=re.DOTALL)

leaderboard_code = """
<!-- قسم لوحة الصدارة الحية (Live Leaderboard) داخل القائمة الجانبية أو كقسم فخم -->
<div id="leaderboard-section" style="margin-top: 25px; border-top: 1px solid rgba(0,243,255,0.2); padding-top: 15px;">
  <h3 style="color: #00f3ff; font-size: 14px; text-shadow: 0 0 8px #00f3ff; margin-bottom: 10px; text-transform: uppercase;">🔥 Global Leaderboard</h3>
  <div id="players-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; padding-right: 5px;">
    <!-- يتم تعبئة اللاعبين الحقيقيين هنا برمجياً -->
  </div>
</div>

<script>
// دمج وتحديث بيانات اللاعبين الحقيقيين في لوحة الصدارة
function updateLeaderboard() {
  const currentName = localStorage.getItem('sumo_name') || 'RASHID';
  const currentAvatar = localStorage.getItem('sumo_avatar') || 'https://api.iconify.design/lucide:user-cog.svg?color=%2300f3ff';
  
  // جلب قائمة اللاعبين أو إنشاء اللاعب الحالي
  let players = JSON.parse(localStorage.getItem('sumo_global_players') || '[]');
  
  // البحث عن اللاعب الحالي وتحديثه أو إضافته
  let existingIndex = players.findIndex(p => p.name === currentName);
  let currentCoins = parseInt(localStorage.getItem('sumo_coins') || '260');
  
  if (existingIndex >= 0) {
    players[existingIndex].coins = currentCoins;
    players[existingIndex].avatar = currentAvatar;
  } else {
    players.push({ name: currentName, coins: currentCoins, avatar: currentAvatar });
  }
  
  // ترتيب اللاعبين تنازلياً حسب النقاط/العملات
  players.sort((a, b) => b.coins - a.coins);
  localStorage.setItem('sumo_global_players', JSON.stringify(players));
  
  // عرض اللاعبين في القائمة مع التوهج للتوب 3
  const listContainer = document.getElementById('players-list');
  if(!listContainer) return;
  listContainer.innerHTML = '';
  
  players.forEach((player, index) => {
    let rank = index + 1;
    let glowStyle = '';
    let rankBadge = `#${rank}`;
    
    if (rank === 1) {
      glowStyle = 'border: 2px solid #ffd700; box-shadow: 0 0 15px rgba(255,215,0,0.6); background: rgba(255,215,0,0.1);';
      rankBadge = '👑 1';
    } else if (rank === 2) {
      glowStyle = 'border: 2px solid #c0c0c0; box-shadow: 0 0 12px rgba(192,192,192,0.5); background: rgba(192,192,192,0.1);';
      rankBadge = '🥈 2';
    } else if (rank === 3) {
      glowStyle = 'border: 2px solid #cd7f32; box-shadow: 0 0 10px rgba(205,127,50,0.5); background: rgba(205,127,50,0.1);';
      rankBadge = '🥉 3';
    } else {
      glowStyle = 'border: 1px solid rgba(0,243,255,0.2); background: rgba(5,5,15,0.5);';
    }
    
    const item = document.createElement('div');
    item.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 8px; font-size: 12px; ${glowStyle}`;
    
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-weight: bold; width: 25px; color: ${rank <= 3 ? '#ff0055' : '#00f3ff'};">${rankBadge}</span>
        <img src="${player.avatar}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #00f3ff;">
        <span style="color: #fff; font-weight: bold; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${player.name}</span>
      </div>
      <span style="color: #00f3ff; font-weight: bold;">🪙 ${player.coins}</span>
    `;
    listContainer.appendChild(item);
  });
}

// تحديث تلقائي كل ثانيتين لتظل الصدارة مولعة ولحظية
setInterval(updateLeaderboard, 2000);
window.addEventListener('load', updateLeaderboard);
</script>
"""

if '<div id="neon-sidebar"' in html:
    # حقن لوحة الصدارة داخل القائمة الجانبية تحت التفاصيل
    html = html.replace('<div id="neon-sidebar"', leaderboard_code + '\n<div id="neon-sidebar"')
    with open("index.html", "w") as f:
        f.write(f.write(html) if hasattr(f, 'write') else html) # syntax safe
    # إعادة فتح الملف بطريقة سليمة
    with open("index.html", "w") as f2:
        f2.write(html)
    print("Leaderboard injected successfully!")
