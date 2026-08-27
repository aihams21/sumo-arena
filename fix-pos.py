with open("index.html", "r") as f:
    html = f.read()

# تعديل إحداثيات الـ top لزر المنيو ليصير أنزل للمكان المطلوب
html = html.replace("top: 35px;", "top: 110px;")

with open("index.html", "w") as f:
    f.write(html)
print("Position fixed!")
