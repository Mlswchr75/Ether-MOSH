import { describe, expect, it } from "vitest";
import { generateSwarmInstances, MAX_LOTTIE_SWARM_INSTANCES, MAX_SWARM_INSTANCES } from "./swarm";
import type { OverlaySwarm } from "./types";

const base: OverlaySwarm = { enabled: true, count: 10, spread: 1, chaos: 0.5, seed: 42 };

describe("generateSwarmInstances", () => {
  it("is deterministic", () => {
    expect(generateSwarmInstances(base)).toEqual(generateSwarmInstances(base));
  });

  it("honors hard caps", () => {
    expect(generateSwarmInstances({ ...base, count: 999 })).toHaveLength(MAX_SWARM_INSTANCES);
    expect(generateSwarmInstances({ ...base, count: 999 }, true)).toHaveLength(MAX_LOTTIE_SWARM_INSTANCES);
  });

  it("returns no clones when disabled", () => {
    expect(generateSwarmInstances({ ...base, enabled: false })).toEqual([]);
  });
});
