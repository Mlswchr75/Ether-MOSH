import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasRecorder } from "./recorder";

class FakeTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private tracks: FakeTrack[];
  constructor(tracks: FakeTrack[]) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks; }
  getAudioTracks(): FakeTrack[] { return []; }
}

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  constructor(public stream: unknown, public opts: unknown) {}
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(["frame"]) });
    queueMicrotask(() => this.onstop?.());
  }
}

describe("CanvasRecorder", () => {
  let track: FakeTrack;
  let captureStream: ReturnType<typeof vi.fn>;
  const originalCaptureStream = HTMLCanvasElement.prototype.captureStream;

  beforeEach(() => {
    track = new FakeTrack();
    captureStream = vi.fn(() => new FakeMediaStream([track]) as unknown as MediaStream);
    HTMLCanvasElement.prototype.captureStream = captureStream as unknown as typeof HTMLCanvasElement.prototype.captureStream;
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.captureStream = originalCaptureStream;
    vi.unstubAllGlobals();
  });

  it("stops the captureStream track on stop(), instead of leaving it running", async () => {
    // Regression: canvas.captureStream()'s video track stays live until
    // explicitly stopped — every recorded clip used to leave one running for
    // the rest of the session.
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const recorder = new CanvasRecorder();

    recorder.start(canvas);
    expect(track.stop).not.toHaveBeenCalled();

    await recorder.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(recorder.state).toBe("idle");
  });
});
