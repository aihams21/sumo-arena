with open("index.html", "r") as f:
    html = f.read()

# التأكد من استدعاء ملف الـ js الجديد في حال لم يكن موجوداً
if 'account-manager.js' not in html:
    html = html.replace('</body>', '<script src="account-manager.js"></script>\n</body>')

with open("index.html", "w") as f:
    f.write(html)

print("Account manager file created and linked successfully!")
