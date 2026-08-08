/**
 * Global time controller for visualizer playback effects:
 *  - Freeze: brief slow-motion + ease back to normal speed.
 *  - Reverse: invert time direction until toggled or page reload.
 *  - Loop: lock the modulator clock to a fixed period so visuals
 *    repeat seamlessly (8–12 s). Works because all our continuous
 *    modulators (sine/triangle/saw/perlin) are deterministic
 *    functions of `t`, so wrapping `t` produces a frame-perfect loop.
 */

export type TimeFxState = {
  reversed: boolean;
  freezing: boolean;
  freezeUntil: number; // ms timestamp
  freezeStartedAt: number;
  loopSeconds: number; // 0 = no loop
  loopStartedAt: number; // performance.now() ms when loop began
};

export class TimeController {
  private virtualT = 0; // accumulated seconds (can be wrapped or reversed)
  private lastNow = performance.now();
  private state: TimeFxState = {
    reversed: false,
    freezing: false,
    freezeUntil: 0,
    freezeStartedAt: 0,
    loopSeconds: 0,
    loopStartedAt: 0,
  };

  get reversed() { return this.state.reversed; }
  get isLooping() { return this.state.loopSeconds > 0; }
  get isFrozen() { return this.state.freezing; }
  get loopSeconds() { return this.state.loopSeconds; }

  /** Returns current scalar time scale (1 = normal, <1 during freeze). */
  private currentScale(now: number): number {
    if (!this.state.freezing) return 1;
    const total = this.state.freezeUntil - this.state.freezeStartedAt;
    const elapsed = now - this.state.freezeStartedAt;
    if (elapsed >= total) {
      this.state.freezing = false;
      return 1;
    }
    // Curve: ease into ~5% speed, hold, ease back to 100%.
    // 0..0.2: ramp 1 -> 0.05
    // 0.2..0.7: hold 0.05
    // 0.7..1.0: ramp 0.05 -> 1
    const p = elapsed / total;
    if (p < 0.2) return 1 - (1 - 0.05) * (p / 0.2);
    if (p < 0.7) return 0.05;
    const q = (p - 0.7) / 0.3;
    return 0.05 + (1 - 0.05) * q;
  }

  /** Advance the virtual clock and return seconds-since-start to feed modulators. */
  tick(): number {
    const now = performance.now();
    const dtMs = Math.min(100, now - this.lastNow); // cap dt to avoid jumps
    this.lastNow = now;
    const scale = this.currentScale(now);
    const dir = this.state.reversed ? -1 : 1;
    this.virtualT += (dtMs / 1000) * scale * dir;

    if (this.state.loopSeconds > 0) {
      const L = this.state.loopSeconds;
      // Wrap into [0, L) so all periodic modulators repeat seamlessly.
      const wrapped = ((this.virtualT % L) + L) % L;
      return wrapped;
    }
    return this.virtualT;
  }

  triggerFreeze(durationMs = 1200) {
    const now = performance.now();
    this.state.freezing = true;
    this.state.freezeStartedAt = now;
    this.state.freezeUntil = now + durationMs;
  }

  toggleReverse(): boolean {
    this.state.reversed = !this.state.reversed;
    return this.state.reversed;
  }

  startLoop(seconds: number) {
    const s = Math.max(8, Math.min(12, seconds));
    this.state.loopSeconds = s;
    this.state.loopStartedAt = performance.now();
    // Snap virtualT to start of loop so the first frame is the loop's t=0.
    this.virtualT = 0;
  }

  stopLoop() {
    this.state.loopSeconds = 0;
  }

  toggleLoop(seconds = 8): boolean {
    if (this.state.loopSeconds > 0) { this.stopLoop(); return false; }
    this.startLoop(seconds);
    return true;
  }
}

export const timeController = new TimeController();
