import type { WeatherMode } from './types';

export class RacingAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private tireGain: GainNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private windGain: GainNode | null = null;

  private initialized = false;
  public muted = false;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.38;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Multi-harmonic flat-6 / V8 GT3 engine synth
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 3.2;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.0001;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 55;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 110;

      const osc3 = ctx.createOscillator();
      osc3.type = 'sine';
      osc3.frequency.value = 27.5;

      const subGain = ctx.createGain();
      subGain.gain.value = 0.55;
      const harmGain = ctx.createGain();
      harmGain.gain.value = 0.38;

      osc1.connect(filter);
      osc2.connect(harmGain);
      harmGain.connect(filter);
      osc3.connect(subGain);
      subGain.connect(filter);

      filter.connect(engGain);
      engGain.connect(master);

      osc1.start();
      osc2.start();
      osc3.start();

      this.oscPrimary = osc1;
      this.oscHarmonic = osc2;
      this.oscSub = osc3;
      this.engineFilter = filter;
      this.engineGain = engGain;

      // Shared white noise buffer for tire screech, rain & wind
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      // Tire screech loop
      const tireNoise = ctx.createBufferSource();
      tireNoise.buffer = noiseBuffer;
      tireNoise.loop = true;
      const tireFilter = ctx.createBiquadFilter();
      tireFilter.type = 'bandpass';
      tireFilter.frequency.value = 1450;
      tireFilter.Q.value = 6.5;
      const tireGain = ctx.createGain();
      tireGain.gain.value = 0;
      tireNoise.connect(tireFilter);
      tireFilter.connect(tireGain);
      tireGain.connect(master);
      tireNoise.start();
      this.tireFilter = tireFilter;
      this.tireGain = tireGain;

      // Rain ambience loop
      const rainNoise = ctx.createBufferSource();
      rainNoise.buffer = noiseBuffer;
      rainNoise.loop = true;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 2200;
      rainFilter.Q.value = 0.7;
      const rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      rainNoise.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(master);
      rainNoise.start();
      this.rainGain = rainGain;

      // Wind rush loop
      const windNoise = ctx.createBufferSource();
      windNoise.buffer = noiseBuffer;
      windNoise.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 340;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      windNoise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windNoise.start();
      this.windGain = windGain;

      this.initialized = true;
    } catch {
      // Ignore if AudioContext blocked
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.38, this.ctx.currentTime, 0.04);
    }
  }

  public silenceLoops(): void {
    if (!this.ctx || !this.initialized) return;
    const t = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0.0001, t, 0.05);
    this.tireGain?.gain.setTargetAtTime(0, t, 0.05);
    this.rainGain?.gain.setTargetAtTime(0, t, 0.08);
    this.windGain?.gain.setTargetAtTime(0, t, 0.08);
  }

  public update(
    rpm: number,
    throttle: number,
    speedKmh: number,
    slipRatio: number,
    weather: WeatherMode,
    active: boolean,
  ): void {
    if (!this.initialized || !this.ctx || !active) return;
    const t = this.ctx.currentTime;

    // Engine pitch & timbre
    const baseFreq = 34 + (rpm / 8600) * 168;
    this.oscPrimary?.frequency.setTargetAtTime(baseFreq, t, 0.03);
    this.oscHarmonic?.frequency.setTargetAtTime(baseFreq * 1.995, t, 0.03);
    this.oscSub?.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.03);

    const cutoff = 280 + throttle * 1150 + (rpm / 8600) * 1450;
    this.engineFilter?.frequency.setTargetAtTime(cutoff, t, 0.04);

    const engVol = 0.14 + throttle * 0.14 + (rpm / 8600) * 0.08;
    this.engineGain?.gain.setTargetAtTime(engVol, t, 0.04);

    // Tire screech (damped on wet asphalt)
    const wetScreechMult = weather === 'rain' || weather === 'storm' ? 0.32 : 1.0;
    const screech = Math.max(0, slipRatio - 0.16) * 0.24 * wetScreechMult;
    this.tireGain?.gain.setTargetAtTime(screech, t, 0.04);
    this.tireFilter?.frequency.setTargetAtTime(1150 + Math.min(800, speedKmh * 3.5), t, 0.05);

    // Rain ambience
    const rainTarget = weather === 'storm' ? 0.16 : weather === 'rain' ? 0.09 : 0;
    this.rainGain?.gain.setTargetAtTime(rainTarget, t, 0.2);

    // High-speed wind rush
    const windTarget = Math.min(0.14, Math.pow(speedKmh / 260, 2) * 0.14);
    this.windGain?.gain.setTargetAtTime(windTarget, t, 0.1);
  }

  public playImpact(weight = 0.6): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110 + weight * 40, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.18);
    g.gain.setValueAtTime(0.35 * Math.min(1, weight), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  public playCountdownBeep(isGo = false): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, t);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (isGo ? 0.42 : 0.18));
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + (isGo ? 0.44 : 0.2));
  }

  public playThunder(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(62, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 1.4);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 140;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.26, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 1.55);
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.initialized = false;
    }
  }
}
