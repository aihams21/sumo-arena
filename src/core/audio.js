/* =============================================================
   NEXUS CORP — Procedural Web Audio Synthesizer
   Zero external files. Every SFX is generated from oscillators +
   noise buffers through the native AudioContext.
   ============================================================= */

const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568.0, C3: 130.81, E3: 164.81, G3: 196.0
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.sfxOn = true;
    this.musicOn = false;
    this._noise = null;
    this._musicTimer = null;
    this._musicStep = 0;
    this._unlocked = false;
  }

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock() {
    if (this._unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = typeof window !== 'undefined' &&
      (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 1 : 0;
      this.sfxGain.connect(this.master);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);

      this._buildNoise();
      this._unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    } catch (e) {
      console.warn('[Audio] unlock failed', e);
      return false;
    }
  }

  _buildNoise() {
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;   // slightly brown-tinted
      d[i] = white * 0.7 + last * 3;
    }
    this._noise = buf;
  }

  _now() { return this.ctx.currentTime; }

  /* ---- primitive voices ---- */

  tone(freq, dur = 0.12, type = 'square', vol = 0.25, slideTo = null, delay = 0) {
    if (!this._unlocked || !this.sfxOn) return;
    const t0 = this._now() + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo && slideTo !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  noise(dur = 0.15, vol = 0.25, filterType = 'bandpass', freq = 1200, q = 1, delay = 0) {
    if (!this._unlocked || !this.sfxOn) return;
    const t0 = this._now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(freq, t0);
    flt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  arpeggio(freqs, step = 0.06, type = 'triangle', vol = 0.2) {
    freqs.forEach((f, i) => this.tone(f, step * 2.2, type, vol, null, i * step));
  }

  /* ---- named game SFX ---- */

  click()    { this.tone(680, 0.045, 'square', 0.16, 420); this.noise(0.03, 0.08, 'highpass', 2600); }
  tap()      { this.tone(520, 0.05, 'sine', 0.14, 700); }
  cash()     { this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5], 0.05, 'triangle', 0.2);
               this.noise(0.09, 0.1, 'bandpass', 4200, 2); }
  bigCash()  { this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6], 0.055, 'triangle', 0.22);
               this.tone(NOTE.C3, 0.35, 'sine', 0.14, NOTE.C4); }
  coin()     { this.tone(NOTE.E5, 0.07, 'square', 0.16, NOTE.B5); this.tone(NOTE.B5, 0.12, 'square', 0.12, null, 0.06); }
  buy()      { this.tone(300, 0.09, 'sawtooth', 0.16, 640); this.tone(640, 0.12, 'square', 0.1, 880, 0.05); }
  error()    { this.tone(200, 0.16, 'sawtooth', 0.18, 110); }
  levelUp()  { this.arpeggio([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.07, 'square', 0.16);
               this.tone(NOTE.C3, 0.4, 'triangle', 0.12, NOTE.G3); }
  prestige() { this.arpeggio([NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.085, 'sawtooth', 0.14); }
  bounce()   { this.tone(420 + Math.random() * 120, 0.05, 'square', 0.14, 300); }
  hit()      { this.noise(0.07, 0.18, 'bandpass', 1800, 1.4); this.tone(240, 0.06, 'square', 0.1, 160); }
  explode()  { this.noise(0.32, 0.3, 'lowpass', 900, 0.8);
               this.tone(120, 0.3, 'sawtooth', 0.2, 40); }
  powerup()  { this.tone(300, 0.3, 'sawtooth', 0.14, 1200); this.noise(0.18, 0.1, 'highpass', 1800); }
  shoot()    { this.tone(900, 0.05, 'square', 0.09, 340); }
  jump()     { this.tone(380, 0.09, 'square', 0.12, 700); }
  land()     { this.tone(200, 0.06, 'sine', 0.12, 120); this.noise(0.04, 0.08, 'lowpass', 700); }
  gameOver() { this.arpeggio([NOTE.G4, NOTE.E4, NOTE.C4, NOTE.G3], 0.13, 'sawtooth', 0.18); }
  win()      { this.arpeggio([NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.C6], 0.08, 'square', 0.18); }
  perfect()  { this.tone(NOTE.E5, 0.06, 'square', 0.14, NOTE.G5);
               this.tone(NOTE.G5, 0.06, 'square', 0.14, NOTE.C6, 0.06);
               this.tone(NOTE.C6, 0.16, 'square', 0.14, null, 0.12); }
  tick()     { this.tone(1500, 0.02, 'square', 0.06, 1200); }
  alarm()    { this.tone(880, 0.12, 'square', 0.16, 620); this.tone(880, 0.12, 'square', 0.16, 620, 0.16); }
  select()   { this.tone(760, 0.05, 'sine', 0.12, 980); }

  /* ---- ambient corporate music (procedural arpeggio loop) ---- */

  startMusic() {
    if (!this._unlocked || !this.musicOn || this._musicTimer) return;
    const prog = [
      [NOTE.C3, NOTE.C4, NOTE.E4, NOTE.G4],
      [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4],
      [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4],
      [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.F4]
    ];
    let step = 0;
    const beat = 190;
    const tickFn = () => {
      const bar = prog[Math.floor(step / 4) % prog.length];
      const n = bar[step % 4];
      this._toneAt(this.musicGain, n / 2, 0.5, 'sine', 0.14, 0);
      this._toneAt(this.musicGain, n, 0.32, 'triangle', 0.07, 0);
      this._toneAt(this.musicGain, n * 2, 0.16, 'sine', 0.028, beat / 1000 * 0.5);
      step++;
    };
    this.musicGain.gain.setTargetAtTime(0.5, this._now(), 0.4);
    tickFn();
    this._musicTimer = setInterval(tickFn, beat);
  }

  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    if (this._unlocked) this.musicGain.gain.setTargetAtTime(0, this._now(), 0.25);
  }

  _toneAt(dest, freq, dur, type, vol, delay) {
    if (!this._unlocked) return;
    const t0 = this._now() + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(dest);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  setSfx(on) {
    this.sfxOn = !!on;
    if (this._unlocked) this.sfxGain.gain.setTargetAtTime(on ? 1 : 0, this._now(), 0.05);
    return this.sfxOn;
  }

  setMusic(on) {
    this.musicOn = !!on;
    if (on) this.startMusic(); else this.stopMusic();
    return this.musicOn;
  }
}

export const audio = new AudioEngine();
export default audio;