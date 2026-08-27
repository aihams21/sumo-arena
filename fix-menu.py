with open("index.html", "r") as f:
    content = f.read()

# التأكد من إضافة دالة toggleNeonMenu المفقودة قبل نهاية الـ body مباشرة
menu_fix_script = '''
<script>
function toggleNeonMenu() {
  const sb = document.getElementById('neon-sidebar');
  if (sb) {
    sb.style.right = (sb.style.right === '0px') ? '-320px' : '0px';
  }
}

function openHome() {
  toggleNeonMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>
</body>
'''

if "</body>" in content:
    content = content.replace("</body>", menu_fix_script)
    with open("index.html", "w") as f:
        f.write(content)
    print("Menu toggle fixed successfully!")
