import re

with open("index.html", "r") as f:
    html = f.read()

# إزالة القائمة القديمة إن وجدت لتجنب التكرار
html = re.sub(r'<!-- زر القائمة الجانبية النيون -->.*?</script>', '', html, flags=re.DOTALL)

new_features = """
<!-- زر القائمة الجانبية النيون - نازل لتحت وأنيق -->
<div id="neon-menu-btn" onclick="toggleNeonMenu()" style="position: fixed; top: 35px; right: 30px; z-index: 9999; cursor: pointer; background: rgba(5,5,15,0.95); border: 2px solid #00f3ff; border-radius: 12px; padding: 12px 18px; box-shadow: 0 0 20px rgba(0,243,255,0.5); transition: 0.3s;">
  <span style="color: #00f3ff; font-weight: bold; font-family: 'Orbitron', sans-serif; font-size: 14px;">☰ MENU</span>
</div>

<!-- القائمة الجانبية المتقدمة -->
<div id="neon-sidebar" style="position: fixed; top: 0; right: -320px; width: 300px; height: 100vh; background: rgba(3, 3, 8, 0.98); border-left: 2px solid #00f3ff; box-shadow: -15px 0 40px rgba(0, 243, 255, 0.4); z-index: 10000; transition: right 0.4s ease; padding: 30px 20px; backdrop-filter: blur(20px); font-family: 'Orbitron', sans-serif; color: #fff; box-sizing: border-box; overflow-y: auto;">
  
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid rgba(0,243,255,0.2); padding-bottom: 15px;">
    <h2 style="color: #00f3ff; font-size: 18px; text-shadow: 0 0 10px #00f3ff; margin: 0;">CYBER MENU</h2>
    <span onclick="toggleNeonMenu()" style="color: #ff0055; font-size: 26px; cursor: pointer; text-shadow: 0 0 10px #ff0055;">&times;</span>
  </div>

  <!-- صورة وحساب اللاعب -->
  <div style="text-align: center; margin-bottom: 25px;">
    <label for="avatar-input" style="cursor: pointer;">
      <img id="sidebar-avatar" src="https://api.iconify.design/lucide:user-cog.svg?color=%2300f3ff" style="width: 70px; height: 70px; border-radius: 50%; border: 2px solid #00f3ff; object-fit: cover; box-shadow: 0 0 15px rgba(0,243,255,0.4); margin-bottom: 8px;" title="اضغط لتغيير الصورة">
    </label>
    <input type="file" id="avatar-input" accept="image/*" style="display: none;" onchange="loadAvatar(event)">
    <div id="sidebar-name" style="font-size: 16px; font-weight: bold; color: #00f3ff; text-shadow: 0 0 8px #00f3ff;">RASHID</div>
    <div id="sidebar-flag" style="font-size: 14px; color: #aaa; margin-top: 4px;">🇯🇴 Jordan</div>
  </div>

  <!-- أزرار التنقل -->
  <div style="display: flex; flex-direction: column; gap: 12px;">
    <button onclick="openHome()" style="background: rgba(0,243,255,0.1); border: 1px solid #00f3ff; color: #00f3ff; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; text-align: left; transition: 0.3s;">🏠 الشاشة الرئيسية (Home)</button>
    <button onclick="openAccountModal()" style="background: rgba(0,243,255,0.1); border: 1px solid #00f3ff; color: #00f3ff; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; text-align: left; transition: 0.3s;">⚙️ تعديل الحساب (My Account)</button>
    <a href="https://www.instagram.com/nn1v4/" target="_blank" style="text-decoration: none;">
      <button style="width: 100%; background: rgba(255,0,85,0.1); border: 1px solid #ff0055; color: #ff0055; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; text-align: left; transition: 0.3s;">💬 الدعم الفني (Instagram)</button>
    </a>
  </div>
</div>

<!-- نافذة تعديل الحساب (Modal) -->
<div id="account-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 10005; justify-content: center; align-items: center; font-family: 'Orbitron', sans-serif;">
  <div style="background: #080812; border: 2px solid #00f3ff; padding: 30px; border-radius: 15px; width: 320px; box-shadow: 0 0 30px rgba(0,243,255,0.5); color: #fff;">
    <h3 style="color: #00f3ff; margin-top: 0; text-shadow: 0 0 10px #00f3ff;">EDIT ACCOUNT</h3>
    <label style="font-size: 12px; color: #aaa;">اسم اللاعب:</label>
    <input type="text" id="input-name" placeholder="أدخل اسمك الجديد" style="width: 100%; padding: 10px; background: #111; border: 1px solid #00f3ff; color: #fff; border-radius: 6px; margin: 8px 0 15px 0; box-sizing: border-box;">
    
    <label style="font-size: 12px; color: #aaa;">علم الدولة / الايموجي:</label>
    <input type="text" id="input-flag" placeholder="مثال: 🇯🇴 Jordan" style="width: 100%; padding: 10px; background: #111; border: 1px solid #00f3ff; color: #fff; border-radius: 6px; margin: 8px 0 20px 0; box-sizing: border-box;">
    
    <div style="display: flex; gap: 10px;">
      <button onclick="saveAccount()" style="flex: 1; background: #00f3ff; color: #000; border: none; padding: 10px; font-weight: bold; border-radius: 6px; cursor: pointer;">حفظ</button>
      <button onclick="closeAccountModal()" style="flex: 1; background: transparent; border: 1px solid #ff0055; color: #ff0055; padding: 10px; font-weight: bold; border-radius: 6px; cursor: pointer;">إلغاء</button>
    </div>
  </div>
</div>

<script>
function toggleNeonMenu() {
  const sb = document.getElementById('neon-sidebar');
  sb.style.right = (sb.style.right === '0px') ? '-320px' : '0px';
}

function openHome() {
  toggleNeonMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openAccountModal() {
  toggleNeonMenu();
  document.getElementById('account-modal').style.display = 'flex';
  document.getElementById('input-name').value = localStorage.getItem('sumo_name') || 'RASHID';
  document.getElementById('input-flag').value = localStorage.getItem('sumo_flag') || '🇯🇴 Jordan';
}

function closeAccountModal() {
  document.getElementById('account-modal').style.display = 'none';
}

function saveAccount() {
  const name = document.getElementById('input-name').value;
  const flag = document.getElementById('input-flag').value;
  if(name) localStorage.setItem('sumo_name', name);
  if(flag) localStorage.setItem('sumo_flag', flag);
  updateAccountUI();
  closeAccountModal();
}

function loadAvatar(event) {
  const reader = new FileReader();
  reader.onload = function(){
    localStorage.setItem('sumo_avatar', reader.result);
    updateAccountUI();
  };
  reader.readAsDataURL(event.target.files[0]);
}

function updateAccountUI() {
  const savedName = localStorage.getItem('sumo_name');
  const savedFlag = localStorage.getItem('sumo_flag');
  const savedAvatar = localStorage.getItem('sumo_avatar');
  
  if(savedName) document.getElementById('sidebar-name').innerText = savedName;
  if(savedFlag) document.getElementById('sidebar-flag').innerText = savedFlag;
  if(savedAvatar) document.getElementById('sidebar-avatar').src = savedAvatar;
}

window.onload = updateAccountUI;
</script>
"""

if "</body>" in html:
    html = html.replace("</body>", new_features + "</body>")
    with open("index.html", "w") as f:
        f.write(html)
    print("Full updated successfully!")
