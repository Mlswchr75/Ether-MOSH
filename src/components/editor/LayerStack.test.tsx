import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelLayerCrossfade, crossfadeLayers, getLayerCrossfadeLayers } from "@/engine/layerCrossfade";
import { makeLayer, useStore } from "@/store/useStore";
import { LayerStack } from "./LayerStack";

describe("LayerStack during a mosh crossfade", () => {
  beforeEach(() => {
    cancelLayerCrossfade();
    useStore.setState({
      layers: [
        makeLayer("filmicTone", { id: "old-grade" }),
        makeLayer("melt", { id: "old-form" }),
        makeLayer("bloom", { id: "old-finish" }),
      ],
      selectedLayerId: "old-grade",
      past: [],
      future: [],
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cancelLayerCrossfade();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows only the new editable effects while old effects still render out", () => {
    render(<LayerStack />);

    act(() => {
      crossfadeLayers(() => useStore.getState().setLayersRaw([
        makeLayer("posterize", { id: "new-grade" }),
        makeLayer("pixelSort", { id: "new-form" }),
        makeLayer("oilSlick", { id: "new-finish" }),
      ]), 680);
    });

    expect(screen.queryByText("Filmic Tone")).toBeNull();
    expect(screen.queryByText("Melt")).toBeNull();
    expect(screen.queryByText("Bloom")).toBeNull();
    expect(screen.queryByText("Posterize")).not.toBeNull();
    expect(screen.queryByText("Pixel Sort")).not.toBeNull();
    expect(screen.queryByText("Oil Slick")).not.toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(getLayerCrossfadeLayers()).toHaveLength(7);
  });
});
