import { describe, expect, it } from "vitest";
import { defineGenerator, GENERATORS, GENERATORS_BY_ID } from "./forgeGenerators";

describe("forge generator registry", () => {
  it("defineGenerator returns the object unchanged, widened to ForgeGeneratorDescriptor", () => {
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

  it("GENERATORS_BY_ID indexes every entry in GENERATORS by id", () => {
    expect(GENERATORS.length).toBeGreaterThan(0);
    for (const g of GENERATORS) {
      expect(GENERATORS_BY_ID[g.id]).toBe(g);
    }
  });

  it("every registered id is unique", () => {
    const ids = GENERATORS.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
