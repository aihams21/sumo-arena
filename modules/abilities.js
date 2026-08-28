(() => {
  'use strict';
  const cooldowns = new Map();
  const abilities = {
    dash: { cooldown: 900, activate(player, input) { const length = Math.hypot(input.x, input.y) || 1; player.vx += input.x / length * 8; player.vy += input.y / length * 8; } },
    pulse: { cooldown: 2400, activate(player, input, bots) { bots.forEach(bot => { const dx = bot.x - player.x; const dy = bot.y - player.y; const distance = Math.hypot(dx, dy); if (bot.alive && distance < 150) { bot.vx += dx / (distance || 1) * 5; bot.vy += dy / (distance || 1) * 5; } }); } }
  };
  function use(name, player, input, bots, now = performance.now()) { const ability = abilities[name]; if (!ability || now < (cooldowns.get(name) || 0)) return false; ability.activate(player, input, bots); cooldowns.set(name, now + ability.cooldown); return true; }
  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.abilities = { abilities, use };
})();
