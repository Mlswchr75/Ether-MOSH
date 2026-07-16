import { describe, expect, it, vi } from "vitest";
import { useStore } from "@/store/useStore";
import { EFFECTS, EFFECTS_BY_ID } from "@/engine/effects";
import { resolveLayers, bpmPulse } from "@/engine/modulate";

const silentLevels = { bass: 0, mid: 0, treble: 0, overall: 0, beat: 0 };

function makeFakeStream(): MediaStream {
  const track = { stop: vi.fn(), kind: "video", label: "fake cam" };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

describe("effects catalog", () => {
  it("registers every effect by id with params in range", () => {
    expect(EFFECTS.length).toBeGreaterThanOrEqual(50);
    for (const e of EFFECTS) {
      expect(EFFECTS_BY_ID[e.id]).toBe(e);
      for (const p of e.params) {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      }
    }
  });
});

describe("store", () => {
  it("mosh builds a stack and undo restores the previous one", () => {
    const s = useStore.getState();
    s.clearLayers();
    s.mosh("nuclear");
    const count = useStore.getState().layers.length;
    expect(count).toBeGreaterThanOrEqual(3);
    useStore.getState().undo();
    expect(useStore.getState().layers.length).toBe(0);
  });

  it("live video source replaces the image and is stopped on clear", () => {
    const stream = makeFakeStream();
    useStore.getState().setVideoSource(stream, "front cam");
    let st = useStore.getState();
    expect(st.videoStream).toBe(stream);
    expect(st.imageElement).toBeNull();
    expect(st.sourceName).toBe("front cam");
    expect(st.videoElement?.muted).toBe(true);
    expect(st.videoElement?.playsInline).toBe(true);

    useStore.getState().clearVideoSource();
    st = useStore.getState();
    expect(st.videoStream).toBeNull();
    expect(st.videoElement).toBeNull();
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
  });

  it("switching to a new stream stops the previous one", () => {
    const a = makeFakeStream();
    const b = makeFakeStream();
    useStore.getState().setVideoSource(a);
    useStore.getState().setVideoSource(b);
    expect(a.getTracks()[0].stop).toHaveBeenCalled();
    expect(useStore.getState().videoStream).toBe(b);
    useStore.getState().clearVideoSource();
  });
});

describe("modulation", () => {
  it("clamps modulated params to the schema range", () => {
    const def = EFFECTS[0];
    const key = def.params[0].key;
    const layer = {
      id: "l1",
      effectId: def.id,
      hidden: false,
      locked: false,
      opacity: 1,
      blend: "normal" as const,
      params: { [key]: def.params[0].max },
      mods: { [key]: { type: "sine" as const, speed: 1, depth: 1, offset: 1 } },
      audioMaps: {},
    };
    for (let t = 0; t < 3; t += 0.1) {
      const out = resolveLayers([layer], t, silentLevels, 0);
      expect(out[0].params[key]).toBeLessThanOrEqual(def.params[0].max);
      expect(out[0].params[key]).toBeGreaterThanOrEqual(def.params[0].min);
    }
  });

  it("bpm pulse peaks on the beat and decays", () => {
    expect(bpmPulse(0, 120)).toBeCloseTo(1);
    expect(bpmPulse(0.25, 120)).toBeLessThan(0.2);
    expect(bpmPulse(0.5, 120)).toBeCloseTo(1); // next beat at 120bpm
  });
});
