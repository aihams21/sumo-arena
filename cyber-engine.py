import re

with open("index.html", "r") as f:
    html = f.read()

# إزالة أي كانفاس قديم إن وجد
html = re.sub(r'<canvas id="matrix-bg".*?</script>', '', html, flags=re.DOTALL)

matrix_script = """
<!-- محرك الخلفية السيبرانية الخارق (Matrix Cyber Rain & Interactive Canvas) -->
<canvas id="matrix-bg" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vw; z-index: -2; pointer-events: none; opacity: 0.25;"></canvas>

<script>
const canvas = document.getElementById('matrix-bg');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const chars = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ01010101KAILINUXCYBER';
const fontSize = 16;
let columns = canvas.width / fontSize;
const drops = [];
for (let i = 0; i < columns; i++) {
  drops[i] = 1;
}

function drawMatrix() {
  ctx.fillStyle = 'rgba(2, 2, 5, 0.1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#00f3ff';
  ctx.font = fontSize + 'px monospace';

  for (let i = 0; i < drops.length; i++) {
    const text = chars.charAt(Math.floor(Math.random() * chars.length));
    ctx.fillText(text, i * fontSize, drops[i] * fontSize);

    if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
      drops[i] = 0;
    }
    drops[i]++;
  }
}
setInterval(drawMatrix, 50);
</script>
"""

if "</body>" in html:
    html = html.replace("</body>", matrix_script + "</body>")
    with open("index.html", "w") as f:
        f.write(html)
    print("Cyber canvas engine injected successfully!")
