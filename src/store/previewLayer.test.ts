import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./useStore";

const reset = () => useStore.setState({
  layers: [], past: [], future: [], previewLayerId: null, selectedLayerId: null,
});

describe("preview layers", () => {
  beforeEach(reset);

  it("renders the auditioned effect immediately", () => {
    useStore.getState().previewLayer("pixelSort");
    const state = useStore.getState();
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].effectId).toBe("pixelSort");
    expect(state.previewLayerId).toBe(state.layers[0].id);
    // Selected too, so its parameters are what the wheel's inner ring shows.
    expect(state.selectedLayerId).toBe(state.layers[0].id);
  });

  it("swaps rather than stacks — tapping through a catalogue leaves one layer", () => {
    useStore.getState().previewLayer("pixelSort");
    useStore.getState().previewLayer("datamosh");
    useStore.getState().previewLayer("pixelSort");
    const state = useStore.getState();
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].effectId).toBe("pixelSort");
  });

  it("costs the undo timeline nothing while auditioning", () => {
    useStore.getState().addLayer("datamosh");
    const historyAfterRealEdit = useStore.getState().past.length;
    for (const id of ["pixelSort", "datamosh", "pixelSort", "datamosh"]) {
      useStore.getState().previewLayer(id);
    }
    expect(useStore.getState().past.length).toBe(historyAfterRealEdit);
  });

  it("leaves the existing stack alone underneath", () => {
    useStore.getState().addLayer("datamosh");
    const kept = useStore.getState().layers[0].id;
    useStore.getState().previewLayer("pixelSort");
    expect(useStore.getState().layers.map(l => l.id)).toContain(kept);
    expect(useStore.getState().layers).toHaveLength(2);
  });

  it("commits exactly one undo step, and one undo takes the effect back off", () => {
    useStore.getState().addLayer("datamosh");
    const before = useStore.getState().layers.map(l => l.id);
    useStore.getState().previewLayer("pixelSort");
    useStore.getState().commitPreview();

    const committed = useStore.getState();
    expect(committed.previewLayerId).toBeNull();
    expect(committed.layers).toHaveLength(2);
    expect(committed.layers[1].effectId).toBe("pixelSort");

    useStore.getState().undo();
    expect(useStore.getState().layers.map(l => l.id)).toEqual(before);
  });

  it("keeps parameter tweaks made while auditioning, and undo still removes the whole thing", () => {
    useStore.getState().previewLayer("pixelSort");
    const id = useStore.getState().previewLayerId!;
    useStore.getState().setParam(id, "amount", 0.9);
    useStore.getState().commitPreview();
    expect(useStore.getState().layers[0].params.amount).toBe(0.9);
    useStore.getState().undo();
    expect(useStore.getState().layers).toHaveLength(0);
  });

  it("discards cleanly, putting the frame back", () => {
    useStore.getState().addLayer("datamosh");
    const before = useStore.getState().layers.map(l => l.id);
    useStore.getState().previewLayer("pixelSort");
    useStore.getState().discardPreview();
    expect(useStore.getState().layers.map(l => l.id)).toEqual(before);
    expect(useStore.getState().previewLayerId).toBeNull();
  });

  it("clears on previewLayer(null)", () => {
    useStore.getState().previewLayer("pixelSort");
    useStore.getState().previewLayer(null);
    expect(useStore.getState().layers).toHaveLength(0);
    expect(useStore.getState().previewLayerId).toBeNull();
  });

  it("re-points the selection at a real layer when the preview goes", () => {
    useStore.getState().addLayer("datamosh");
    const kept = useStore.getState().layers[0].id;
    useStore.getState().previewLayer("pixelSort");
    expect(useStore.getState().selectedLayerId).not.toBe(kept);
    useStore.getState().discardPreview();
    expect(useStore.getState().selectedLayerId).toBe(kept);
  });

  it("ignores an unknown effect id rather than adding a broken layer", () => {
    useStore.getState().previewLayer("no-such-effect");
    expect(useStore.getState().layers).toHaveLength(0);
    expect(useStore.getState().previewLayerId).toBeNull();
  });

  it("is a no-op to commit or discard with nothing in flight", () => {
    useStore.getState().addLayer("datamosh");
    const snapshot = useStore.getState().layers;
    useStore.getState().commitPreview();
    useStore.getState().discardPreview();
    expect(useStore.getState().layers).toBe(snapshot);
  });
});
