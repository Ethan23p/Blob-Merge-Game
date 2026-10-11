// Procedural Web Audio Sound Engine for Gravity Blobs

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // Play launcher shoot sound (soft squishy pop with pitch bend)
  public playShoot() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignore audio context errors
    }
  }

  // Play soft blob collision squish
  public playCollision(intensity: number = 1) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const vol = Math.min(0.25, Math.max(0.02, intensity * 0.08));
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120 + Math.random() * 40, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Ignore
    }
  }

  // Play merge chime (frequency scales with power exponent k, chain multiplier increases harmonic richness)
  public playMerge(powerExponent: number, comboMultiplier: number = 1) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const baseFreq = 220 * Math.pow(2, (powerExponent % 12) / 12); // Chromatic scale progression
      const octaveShift = Math.floor(powerExponent / 12);
      const freq = baseFreq * Math.pow(1.5, octaveShift);

      // Primary tone
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.25);

      const vol = Math.min(0.35, 0.15 + comboMultiplier * 0.03);
      gain1.gain.setValueAtTime(vol, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.3);

      // Harmony tone for combo
      if (comboMultiplier > 1) {
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 1.25, now + 0.04);
        osc2.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.35);

        gain2.gain.setValueAtTime(vol * 0.7, now + 0.04);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);

        osc2.start(now + 0.04);
        osc2.stop(now + 0.35);
      }
    } catch {
      // Ignore
    }
  }

  // Play bond formation chime (crystalline snap/tether sound)
  public playBond() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Ignore
    }
  }

  // Play Gravity Supernova / Respawn sound when 1 blob remains!
  public playNova() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Rising sweep followed by explosive chord
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.7);

      // Secondary chord notes
      [440, 554.37, 659.25, 880].forEach((noteFreq, idx) => {
        const noteOsc = this.ctx!.createOscillator();
        const noteGain = this.ctx!.createGain();

        noteOsc.type = 'sine';
        noteOsc.frequency.setValueAtTime(noteFreq, now + 0.3);
        noteGain.gain.setValueAtTime(0.2, now + 0.3);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9 + idx * 0.1);

        noteOsc.connect(noteGain);
        noteGain.connect(this.ctx!.destination);

        noteOsc.start(now + 0.3);
        noteOsc.stop(now + 0.9 + idx * 0.1);
      });
    } catch {
      // Ignore
    }
  }

  // Play Game Over warning or end chime
  public playGameOver() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.6);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.6);
    } catch {
      // Ignore
    }
  }
}

export const soundEngine = new SoundEngine();
