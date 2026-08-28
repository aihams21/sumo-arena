(() => {
  'use strict';
  let context = null; let muted = localStorage.getItem('neon_sumo_muted') === '1';
  function init() { if (!context && !muted) { const AudioContext = window.AudioContext || window.webkitAudioContext; if (AudioContext) context = new AudioContext(); } if (context?.state === 'suspended') context.resume(); }
  function tone(frequency, duration = .08, type = 'sine') { if (muted) return; init(); if (!context) return; const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration); }
  function setMuted(value) { muted = Boolean(value); localStorage.setItem('neon_sumo_muted', muted ? '1' : '0'); }
  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.audio = { init, tone, setMuted, isMuted: () => muted };
})();
