with open("index.html", "r") as f:
    html = f.read()

# التأكد من نظافة الملف وعدم وجود أخطاء تكرار
print("Index.html length:", len(html))
