with open("index.html", "r") as f:
    html = f.read()

# إصلاح الزر والدالة بحيث تستدعي المودل وتتأكد من إظهاره مباشرة
old_btn = '<button onclick="openLeaderboardModal()"'
new_btn = '<button onclick="console.log(\'Opening Leaderboard...\'); document.getElementById(\'leaderboard-modal\').style.display = \'flex\'; renderFullLeaderboard(); toggleNeonMenu();"'

html = html.replace(old_btn, new_btn)

with open("index.html", "w") as f:
    f.write(html)

print("Click bug fixed successfully!")
