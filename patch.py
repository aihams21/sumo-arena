with open("index.html", "r") as f:
    content = f.read()

style_tag = """
<style>
:root {
  --neon-cyan: #00f3ff;
  --neon-pink: #ff0055;
  --bg-dark: #05050a;
}
body, html {
  background-color: var(--bg-dark) !important;
  color: #ffffff !important;
}
.neon-btn-cyan, button {
  border: 2px solid var(--neon-cyan) !important;
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.4) !important;
  transition: all 0.3s ease !important;
}
.neon-btn-cyan:hover {
  background: var(--neon-cyan) !important;
  color: #05050a !important;
  box-shadow: 0 0 30px var(--neon-cyan) !important;
}
</style>
"""

if "</head>" in content:
    content = content.replace("</head>", style_tag + "</head>")
    with open("index.html", "w") as f:
        f.write(content)
print("Patched successfully!")
