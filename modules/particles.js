(() => {
  'use strict';
  let ambientParticles = [];
  let particleCanvas = null;
  let pCtx = null;
  const AMBIENT_COUNT = 35;

  function init(canvasId) {
    particleCanvas = document.getElementById(canvasId);
    if (!particleCanvas) return;
    pCtx = particleCanvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    createAmbient();
  }

  function resize() {
    if (!particleCanvas) return;
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  }

  function createAmbient() {
    ambientParticles = [];
    if (!particleCanvas) return;
    for (let i = 0; i < AMBIENT_COUNT; i++) {
      ambientParticles.push({
        x: Math.random() * particleCanvas.width,
        y: Math.random() * particleCanvas.height,
        vx: (Math.random() - .5) * .3,
        vy: (Math.random() - .5) * .3,
        radius: Math.random() * 2 + .5,
        alpha: Math.random() * .25 + .05,
        color: Math.random() > .5 ? '0,243,255' : '157,0,255',
        pulsePhase: Math.random() * Math.PI * 2
      });
    }
  }

  function spawnBurst(x, y, color, count = 24) {
    const burst = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * .4;
      const speed = Math.random() * 5 + 2;
      burst.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3 + 1,
        life: 1,
        decay: Math.random() * .025 + .015,
        color
      });
    }
    return burst;
  }

  function renderAmbient() {
    if (!pCtx || !particleCanvas) return;
    pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    const time = Date.now() * .001;
    ambientParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = particleCanvas.width;
      if (p.x > particleCanvas.width) p.x = 0;
      if (p.y < 0) p.y = particleCanvas.height;
      if (p.y > particleCanvas.height) p.y = 0;
      const pulse = Math.sin(time * 1.5 + p.pulsePhase) * .1 + .5;
      const r = Math.max(.1, p.radius * pulse);
      const a = p.alpha * pulse;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      pCtx.fillStyle = `rgba(${p.color},${a})`;
      pCtx.shadowColor = `rgba(${p.color},${a * 2})`;
      pCtx.shadowBlur = 6;
      pCtx.fill();
    });
    pCtx.shadowBlur = 0;
  }

  function renderBurst(ctx, particles, dt) {
    if (!ctx || !particles) return;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vx *= .96;
      p.vy *= .96;
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const r = Math.max(.3, p.radius * p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color},${Math.max(0, p.life)})`;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function resizeAmbient() { createAmbient(); }

  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.particles = { init, renderAmbient, renderBurst, spawnBurst, resizeAmbient };
})();