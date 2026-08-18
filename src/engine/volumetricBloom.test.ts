import { describe, expect, it } from "vitest";
import { VolumetricBloomRenderer } from "./volumetricBloom";

describe("VolumetricBloomRenderer", () => {
  it("throws on construction rather than silently producing a broken instance when WebGL is unavailable", () => {
    // jsdom's canvas has no real WebGL support, so THREE.WebGLRenderer's
    // constructor throws here exactly as it would on a device with a dead or
    // unsupported GPU context. forgeSource.ts's fallback path (Task 10)
    // depends on this being a thrown error it can catch, not a half-working
    // instance it would have to detect some other way.
    const canvas = document.createElement("canvas");
    expect(() => new VolumetricBloomRenderer(canvas)).toThrow();
  });
});
