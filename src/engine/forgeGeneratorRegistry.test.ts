import { describe, expect, it } from "vitest";
import { GENERATORS, GENERATORS_BY_ID } from "./forgeGeneratorRegistry";

describe("forge generator registry", () => {
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
