import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHOWCASE_TRACKS, trackPlayer } from "./trackPlayer";
let element: HTMLAudioElement;
let contextState = "running";
let resumeContext: () => Promise<void> = async () => {};
let playElement: () => Promise<void> = async () => {};
beforeEach(() => {
  vi.useFakeTimers();
  contextState = "running";
  resumeContext = async () => {};
  playElement = async () => {};
  vi.stubGlobal("Audio", class {
    constructor() { element = document.createElement("audio"); Object.defineProperties(element, {
      play: { value: vi.fn(() => playElement()) }, pause: { value: vi.fn() },
    }); return element; }
  });
  const node = () => ({ connect: vi.fn(), gain: { value: 0.75, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } });
  vi.stubGlobal("AudioContext", class {
    get state() { return contextState; }
    currentTime = 0;
    destination = {};
    createMediaElementSource = node;
    createGain = node;
    createAnalyser = () => ({ ...node(), frequencyBinCount: 512 });
    resume = () => resumeContext();
    close = async () => {};
  });
});
afterEach(() => { trackPlayer.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("audible playback startup", () => {
  it("reaches play and reports blocking even if AudioContext.resume never settles", async () => {
    contextState = "suspended";
    resumeContext = () => new Promise(() => {});
    const attempt = trackPlayer.play().catch(e => e);
    expect(element.play).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(6_001);
    expect((await attempt).name).toBe("NotAllowedError");
    contextState = "running";
    await trackPlayer.play();
    expect(trackPlayer.enabled).toBe(true);
  });
  it("a fast song change starts a fresh attempt while an old one is pending", async () => {
    let resolveOld!: () => void;
    playElement = () => new Promise<void>(r => { resolveOld = r; });
    const old = trackPlayer.playTrackFromStart(SHOWCASE_TRACKS[0]).catch(e => e);
    playElement = async () => {};
    await trackPlayer.playTrackFromStart(SHOWCASE_TRACKS[1]);
    resolveOld();
    expect((await old).name).toBe("AbortError");
    expect(trackPlayer.title).toBe(SHOWCASE_TRACKS[1].title);
    expect(trackPlayer.enabled).toBe(true);
  });
  it("a late play resolution cannot undo a user's pause", async () => {
    let finish!: () => void;
    playElement = () => new Promise<void>(r => { finish = r; });
    const attempt = trackPlayer.play().catch(e => e);
    trackPlayer.pause(); finish();
    expect((await attempt).name).toBe("AbortError");
    expect(trackPlayer.enabled).toBe(false);
  });
});
