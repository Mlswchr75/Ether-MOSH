/**
 * Device tilt + shake sensors for the Kaoss instrument.
 * Gracefully no-ops on devices without DeviceOrientation/Motion.
 */

export type SensorState = {
  /** -90..90 (left/right tilt) */
  gamma: number;
  /** -180..180 (forward/back tilt) */
  beta: number;
  /** Last shake magnitude 0..1 (decays). */
  shake: number;
};

export class KaossSensors {
  state: SensorState = { gamma: 0, beta: 0, shake: 0 };
  enabled = false;
  private _onShake?: () => void;
  private _shakeUntil = 0;
  private _lastAccel = { x: 0, y: 0, z: 0 };

  isSupported() {
    return typeof window !== "undefined" && (
      "DeviceOrientationEvent" in window || "DeviceMotionEvent" in window
    );
  }

  async start(onShake?: () => void) {
    if (this.enabled) return;
    this._onShake = onShake;
    // iOS 13+ requires explicit permission.
    const DOE: any = (window as any).DeviceOrientationEvent;
    const DME: any = (window as any).DeviceMotionEvent;
    try {
      if (DOE && typeof DOE.requestPermission === "function") {
        const p = await DOE.requestPermission();
        if (p !== "granted") return;
      }
      if (DME && typeof DME.requestPermission === "function") {
        const p = await DME.requestPermission();
        if (p !== "granted") return;
      }
    } catch { /* ignore */ }
    window.addEventListener("deviceorientation", this._onOrient);
    window.addEventListener("devicemotion", this._onMotion);
    this.enabled = true;
  }

  stop() {
    window.removeEventListener("deviceorientation", this._onOrient);
    window.removeEventListener("devicemotion", this._onMotion);
    this.enabled = false;
  }

  private _onOrient = (e: DeviceOrientationEvent) => {
    this.state.gamma = e.gamma ?? 0;
    this.state.beta = e.beta ?? 0;
  };

  private _onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    const dx = (a.x ?? 0) - this._lastAccel.x;
    const dy = (a.y ?? 0) - this._lastAccel.y;
    const dz = (a.z ?? 0) - this._lastAccel.z;
    this._lastAccel = { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 };
    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (mag > 18) {
      const now = performance.now();
      if (now > this._shakeUntil) {
        this._shakeUntil = now + 600;
        this.state.shake = 1;
        this._onShake?.();
      }
    }
    // decay
    this.state.shake *= 0.85;
  };
}

export const kaossSensors = new KaossSensors();
