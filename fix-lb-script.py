with open("index.html", "r") as f:
    html = f.read()

# إزالة كود الـ renderFullLeaderboard و openLeaderboardModalSafe القديم من الـ index.html لتجنب التكرار
import re
html = re.sub(r'function renderFullLeaderboard\(\).*?^\}\s*\}\s*\)', '', html, flags=re.DOTALL)
html = re.sub(r'function openLeaderboardModalSafe\(\).*?^\}', '', html, flags=re.DOTALL)

# إضافة استدعاء ملف الـ leaderboard.js قبل الـ body في حال لم يكن موجوداً
if 'leaderboard.js' not in html:
    html = html.replace('</body>', '<script src="leaderboard.js"></script>\n</body>')

with open("index.html", "w") as f:
    f.write(html)

print("Leaderboard separated into leaderboard.js successfully!")
