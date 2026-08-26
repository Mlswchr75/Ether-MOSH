import { describe, expect, it } from "vitest";
import { filterVaultRecords } from "./vaultSearch";

const records = [
  { id: "1", name: "Neon Eye", tags: ["eye", "neon"], favorite: true, savedAt: 2 },
  { id: "2", name: "Skull Flame", tags: ["fire"], favorite: false, savedAt: 3 },
] as any;

describe("filterVaultRecords", () => {
  it("matches names and tags case-insensitively", () => {
    expect(filterVaultRecords(records, "NEON", false).map(r => r.id)).toEqual(["1"]);
    expect(filterVaultRecords(records, "fire", false).map(r => r.id)).toEqual(["2"]);
  });

  it("can show favorites only", () => {
    expect(filterVaultRecords(records, "", true).map(r => r.id)).toEqual(["1"]);
  });
});
