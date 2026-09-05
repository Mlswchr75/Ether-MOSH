import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getEffectRegistry } from "@/engine/effectRegistry";
import { EffectSpecimen } from "./EffectSpecimen";

afterEach(cleanup);

describe("EffectSpecimen", () => {
  it("gives every public effect a stable, distinct visual signature", () => {
    const registry = getEffectRegistry();
    const { container, rerender } = render(<>{registry.map(effect => <EffectSpecimen key={effect.id} effect={effect} />)}</>);
    const firstPass = [...container.querySelectorAll("svg")].map(svg => svg.getAttribute("data-specimen-signature"));

    expect(firstPass).toHaveLength(registry.length);
    expect(new Set(firstPass).size).toBe(registry.length);

    rerender(<>{registry.map(effect => <EffectSpecimen key={effect.id} effect={effect} />)}</>);
    const secondPass = [...container.querySelectorAll("svg")].map(svg => svg.getAttribute("data-specimen-signature"));
    expect(secondPass).toEqual(firstPass);
  });
});
