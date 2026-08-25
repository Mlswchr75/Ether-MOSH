import { describe, expect, it } from "vitest";
import { clampRadialPoint, defaultRadialPoint, nearestRadialId } from "./radialLayout";

describe("desktop radial layout", () => {
  it("places the first control at twelve o'clock", () => {
    expect(defaultRadialPoint(0, 8)).toEqual({ x: 0, y: -0.43 });
  });

  it("selects custom positions rather than their original slots", () => {
    expect(nearestRadialId({ x: 0.31, y: 0.22 }, ["mosh", "freeze"], {
      mosh: { x: -0.3, y: -0.2 },
      freeze: { x: 0.3, y: 0.2 },
    })).toBe("freeze");
  });

  it("keeps freely dragged controls inside the wheel", () => {
    expect(clampRadialPoint({ x: 2, y: -2 })).toEqual({ x: 0.46, y: -0.46 });
  });
});
