import { describe, expect, it } from "vitest";
import { defineGenerator } from "./forgeGenerators";

describe("defineGenerator", () => {
  it("returns the object unchanged, widened to ForgeGeneratorDescriptor", () => {
    const g = defineGenerator({
      id: "testGen",
      name: "Test Gen",
      category: "field",
      blurb: "A generator used only in tests.",
      costTier: "cheap",
      kind: "canvas2d",
      createState: () => ({ n: 1 }),
      render: () => {},
    });
    expect(g.id).toBe("testGen");
    expect(g.kind).toBe("canvas2d");
  });
});
