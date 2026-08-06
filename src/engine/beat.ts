/**
 * Beat sync: tap tempo + manual BPM. Produces a 0..1 pulse envelope synced to the beat.
 */
export class BeatClock {
  bpm = 120;
  enabled = false;
  private startedAt = performance.now();
  private taps: number[] = [];

  setBpm(bpm: number) {
    this.bpm = Math.max(20, Math.min(300, bpm));
  }

  tap() {
    const now = performance.now();
    this.taps = this.taps.filter(t => now - t < 2500);
    this.taps.push(now);
    if (this.taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < this.taps.length; i++) intervals.push(this.taps[i] - this.taps[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      this.setBpm(60000 / avg);
    }
    this.startedAt = now;
  }

  /** Returns 0..1 pulse: 1 on beat, decaying. */
  pulse(now = performance.now()): number {
    if (!this.enabled) return 0;
    const beatMs = 60000 / this.bpm;
    const phase = ((now - this.startedAt) % beatMs) / beatMs; // 0..1
    // Sharp attack, fast decay
    return Math.pow(1 - phase, 3);
  }
}
