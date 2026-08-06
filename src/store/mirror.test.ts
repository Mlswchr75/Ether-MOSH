import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "./useStore";

/**
 * Mirroring belongs to the live front camera and nothing else.
 *
 * It shipped broken: `setImage` cleared the video element and stream but left
 * `cameraFacing` set, so after a single front-camera session every image loaded
 * afterwards stayed mirrored and any text in it read backwards. These guard
 * every path that leaves a camera, because the bug is a state leak rather than
 * a rendering mistake — the mirror code was correct, it was just being told the
 * wrong thing.
 */

vi.mock("@/engine/upscaler", () => ({ upscaleImage: () => Promise.resolve(null) }));
vi.mock("@/engine/imagePalette", () => ({
  extractPalette: () => Promise.resolve(null),
  BIOME_LABELS: {},
  biomeAccentHex: () => "#fff",
}));

const fakeImage = () => ({ naturalWidth: 100, naturalHeight: 100, width: 100, height: 100 }) as HTMLImageElement;

/**
 * A stream whose track honestly reports which way it faces.
 *
 * setVideoSource derives facing from the TRACK rather than the label it was
 * handed, deliberately — the label is what was asked for, the track is what the
 * browser actually returned. So a fake has to agree with itself or it is
 * testing nothing real.
 */
const fakeStream = (facingMode: "user" | "environment" = "user") => {
  const track = { stop: () => {}, getSettings: () => ({ facingMode }), label: `${facingMode} camera` };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
};

describe("camera mirror state", () => {
  beforeEach(() => {
    useStore.setState({
      cameraFacing: "user",
      imageElement: null, imageUrl: null,
      videoElement: null, videoStream: null,
    });
  });

  it("clears facing when an image replaces the camera", () => {
    useStore.getState().setImage("blob:x", fakeImage());
    expect(useStore.getState().cameraFacing).toBeNull();
  });

  it("clears facing when the video source is torn down", () => {
    useStore.getState().clearVideoSource();
    expect(useStore.getState().cameraFacing).toBeNull();
  });

  it("clears facing when everything is cleared", () => {
    useStore.getState().clearImage();
    expect(useStore.getState().cameraFacing).toBeNull();
  });

  it("still sets facing for a front camera", () => {
    useStore.setState({ cameraFacing: null });
    useStore.getState().setVideoSource(fakeStream("user"), "front camera");
    expect(useStore.getState().cameraFacing).toBe("user");
  });

  it("does not mirror the rear camera", () => {
    useStore.setState({ cameraFacing: null });
    useStore.getState().setVideoSource(fakeStream("environment"), "rear camera");
    expect(useStore.getState().cameraFacing).toBe("environment");
  });

  it("trusts the track over the label it was handed", () => {
    // The label records what was requested; the track records what the browser
    // actually gave back. They disagree in the wild, and believing the label
    // let facing drift out of sync with reality.
    useStore.setState({ cameraFacing: null });
    useStore.getState().setVideoSource(fakeStream("environment"), "front camera");
    expect(useStore.getState().cameraFacing).toBe("environment");
  });

  it("never leaves an image mirrored, whatever came before it", () => {
    // The end-to-end statement of the bug: any sequence that ends on an image
    // must end unmirrored.
    useStore.getState().setVideoSource(fakeStream("user"), "front camera");
    expect(useStore.getState().cameraFacing).toBe("user");
    useStore.getState().setImage("blob:y", fakeImage());
    expect(useStore.getState().cameraFacing).toBeNull();
    expect(useStore.getState().imageElement).toBeTruthy();
  });
});
