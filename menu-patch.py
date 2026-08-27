import re

with open("index.html", "r") as f:
    html = f.read()

# إضافة أيقونة القائمة وزر الـ Hamburger مع الـ Sidebar النيون الفخم
sidebar_code = """
<!-- زر القائمة الجانبية النيون -->
<div id="neon-menu-btn" onclick="toggleNeonMenu()" style="position: fixed; top: 20px; right: 20px; z-index: 9999; cursor: pointer; background: rgba(5,5,15,0.9); border: 2px solid #00f3ff; border-radius: 10px; padding: 10px 15px; box-shadow: 0 0 15px rgba(0,243,255,0.4);">
  <span style="color: #00f3ff; font-weight: bold; font-family: 'Orbitron', sans-serif;">☰ MENU</span>
</div>

<!-- القائمة الجانبية My Account -->
<div id="neon-sidebar" style="position: fixed; top: 0; right: -300px; width: 280px; height: 100vh; background: rgba(5, 5, 12, 0.95); border-left: 2px solid #00f3ff; box-shadow: -10px 0 30px rgba(0, 243, 255, 0.3); z-index: 10000; transition: right 0.4s ease; padding: 30px 20px; backdrop-filter: blur(15px); font-family: 'Orbitron', sans-serif;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px;">
    <h2 style="color: #00f3ff; font-size: 20px; text-shadow: 0 0 10px #00f3ff; margin: 0;">MY ACCOUNT</h2>
    <span onclick="toggleNeonMenu()" style="color: #ff0055; font-size: 24px; cursor: pointer; text-shadow: 0 0 10px #ff0055;">&times;</span>
  </div>
  <div style="color: #fff; margin-bottom: 20px; font-size: 14px; border-bottom: 1px solid rgba(0,243,255,0.2); padding-bottom: 15px;">
    <p style="color: #00f3ff; margin-bottom: 5px;">FIGHTER:</p>
    <span style="font-weight: bold; font-size: 16px;">RASHID</span>
  </div>
  <div style="color: #fff; margin-bottom: 30px; font-size: 14px;">
    <p style="color: #ff0055; margin-bottom: 5px;">STATUS:</p>
    <span>VIP ELITE // ACTIVE</span>
  </div>
  <button onclick="alert('Profile settings loaded successfully!')" style="width: 100%; background: transparent; border: 2px solid #00f3ff; color: #00f3ff; padding: 10px; border-radius: 8px; cursor: pointer; font-weight: bold; box-shadow: 0 0 10px rgba(0,243,255,0.3); transition: 0.3s;">SETTINGS</button>
</div>

<script>
function toggleNeonMenu() {
  const sb = document.getElementById('neon-sidebar');
  if (sb.style.right === '0px') {
    sb.style.right = '-300px';
  } else {
    sb.style.right = '0px';
  }
}
</script>
"""

if "</body>" in html:
    html = html.replace("</body>", sidebar_code + "</body>")
    with open("index.html", "w") as f:
        f.write(html)
    print("Sidebar injected successfully!")
