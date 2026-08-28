(() => {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function resolveImpulse(body, force, direction, resistance = 1) { const length = Math.hypot(direction.x, direction.y) || 1; const scale = force / length / Math.max(.1, resistance); body.vx += direction.x * scale; body.vy += direction.y * scale; return body; }
  function keepInside(body, center, radius, padding = 0) { const dx = body.x - center.x; const dy = body.y - center.y; const distance = Math.hypot(dx, dy); const limit = Math.max(0, radius - padding); if (distance > limit) { const scale = limit / distance; body.x = center.x + dx * scale; body.y = center.y + dy * scale; body.vx *= .25; body.vy *= .25; return false; } return true; }
  function damp(body, factor, delta = 1) { const amount = Math.pow(clamp(factor, 0, 1), delta); body.vx *= amount; body.vy *= amount; return body; }
  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.physics = { clamp, resolveImpulse, keepInside, damp };
})();
