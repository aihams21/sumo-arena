(() => {
  'use strict';
  let frames = 0; let last = performance.now(); let fps = 60; let lowPower = false;
  function tick(now = performance.now()) { frames += 1; if (now - last >= 1000) { fps = frames * 1000 / (now - last); lowPower = fps < 45; frames = 0; last = now; } return { fps, lowPower }; }
  function particleLimit(mobile) { return lowPower || mobile ? 45 : 120; }
  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.performance = { tick, particleLimit, getStatus: () => ({ fps, lowPower }) };
})();
