(() => {
  'use strict';
  let context = null; let muted = localStorage.getItem('neon_sumo_muted') === '1';
  let masterGain = null; let shakeIntensity = 0; let shakeX = 0; let shakeY = 0;
  let chromaIntensity = 0;
  const impactFreqs = [110, 165, 220, 330];
  const victoryNotes = [523, 659, 784, 1047];
  const deathNotes = [220, 165, 110, 80];

  function init() {
    if (!context && !muted) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) context = new AC();
    }
    if (!masterGain && context) {
      masterGain = context.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(context.destination);
    }
    if (context?.state === 'suspended') context.resume();
  }

  function tone(freq, dur = .08, type = 'sine', vol = .035) {
    if (muted) return;
    init();
    if (!context) return;
    try {
      const o = context.createOscillator();
      const g = context.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, freq), context.currentTime);
      g.gain.setValueAtTime(Math.max(.001, vol), context.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, context.currentTime + dur);
      o.connect(g); g.connect(masterGain || context.destination);
      o.start(); o.stop(context.currentTime + dur);
    } catch(_e) {}
  }

  function playImpact(intensity = 1) {
    if (muted) return; init(); if (!context) return;
    const f = impactFreqs[Math.floor(Math.random() * impactFreqs.length)] * intensity;
    try {
      const o = context.createOscillator();
      const g = context.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(Math.max(20, f), context.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f * .3), context.currentTime + .15);
      g.gain.setValueAtTime(.06, context.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, context.currentTime + .15);
      o.connect(g); g.connect(masterGain || context.destination);
      o.start(); o.stop(context.currentTime + .15);
    } catch(_e) {}
    triggerShake(3 * intensity);
    triggerChroma(.15 * intensity);
  }

  function playVictory() {
    if (muted) return; init(); if (!context) return;
    victoryNotes.forEach((f, i) => { setTimeout(() => tone(f, .2, 'sine', .05), i * 100); });
    screenFlash('rgba(0,243,255,.18)');
  }

  function playDeath() {
    if (muted) return; init(); if (!context) return;
    deathNotes.forEach((f, i) => { setTimeout(() => tone(f, .3, 'sawtooth', .04), i * 120); });
    screenFlash('rgba(255,0,85,.18)');
  }

  function playDash() {
    if (muted) return; init(); if (!context) return;
    tone(400, .1, 'sine', .03); tone(600, .08, 'triangle', .02);
    triggerShake(2);
  }

  function playPulse() {
    if (muted) return; init(); if (!context) return;
    tone(800, .06, 'sine', .025); setTimeout(() => tone(1200, .04, 'sine', .015), 50);
    triggerChroma(.08);
  }

  function playStageClear() {
    if (muted) return; init(); if (!context) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      setTimeout(() => { tone(f, .25, 'sine', .045); tone(f * 2, .15, 'triangle', .02); }, i * 120);
    });
    screenFlash('rgba(125,255,0,.14)');
  }

  function playClick() {
    if (muted) return; init(); if (!context) return;
    tone(1000, .04, 'sine', .02);
  }

  function triggerShake(intensity) { shakeIntensity = Math.min(8, intensity); }
  function getShake() {
    if (shakeIntensity <= 0) return {x: 0, y: 0};
    shakeX = (Math.random() - .5) * shakeIntensity * 2;
    shakeY = (Math.random() - .5) * shakeIntensity * 2;
    shakeIntensity *= .85;
    if (shakeIntensity < .1) shakeIntensity = 0;
    return {x: shakeX, y: shakeY};
  }
  function triggerChroma(intensity) { chromaIntensity = Math.max(chromaIntensity, intensity); }
  function updateChroma() {
    chromaIntensity *= .92;
    if (chromaIntensity < .005) chromaIntensity = 0;
    return chromaIntensity;
  }
  function screenFlash(color) {
    const el = document.querySelector('.screen-flash');
    if (el) el.remove();
    const f = document.createElement('div');
    f.className = 'screen-flash'; f.style.background = color;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 300);
  }
  function setMuted(value) { muted = Boolean(value); localStorage.setItem('neon_sumo_muted', muted ? '1' : '0'); }
  function isMuted() { return muted; }

  window.NeonSystems = window.NeonSystems || {};
  window.NeonSystems.audio = { init, tone, playImpact, playVictory, playDeath, playDash, playPulse, playStageClear, playClick, setMuted, isMuted, triggerShake, getShake, triggerChroma, updateChroma, screenFlash };
})();