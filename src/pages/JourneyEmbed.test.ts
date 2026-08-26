import { describe, expect, it } from "vitest";
import { parseJourneyEmbedConfig } from "./JourneyEmbed";

describe("Journey embed query configuration", () => {
  it("parses a customized public portal", () => {
    const portal = parseJourneyEmbedConfig("?shape=slash&seed=42&palette=3&intensity=.7&cadence=6400&label=false");
    expect(portal).toEqual({
      shape: "slash",
      label: false,
      clipPath: undefined,
      config: { seed: 42, palette: 3, intensity: .7, cadenceMs: 6_400 },
    });
  });

  it("supports a caller-supplied organic clip path", () => {
    expect(parseJourneyEmbedConfig("?clip=polygon(0%200,100%200,50%20100)").clipPath).toContain("polygon");
  });
});
