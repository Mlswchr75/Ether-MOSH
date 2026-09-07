import { describe, expect, it } from "vitest";
import {
  KAOSS_DEAD_ZONE,
  inKaossDeadZone,
  kaossAngle,
  kaossAngleModeIndex,
  kaossDistance,
  kaossDistanceIntensity,
} from "./KaossSurface";

describe("Kaoss pad — center dead zone", () => {
  it("measures distance from center, 0 in the middle to 1 at the inscribed edge", () => {
    expect(kaossDistance(0.5, 0.5)).toBe(0);
    expect(kaossDistance(1, 0.5)).toBe(1);
    expect(kaossDistance(0.5, 0)).toBe(1);
    // Corners fall outside the inscribed circle — clamped, not >1.
    expect(kaossDistance(1, 1)).toBe(1);
  });

  it("keeps a reserved circle around center dead, sized by KAOSS_DEAD_ZONE", () => {
    expect(inKaossDeadZone(0.5, 0.5)).toBe(true);
    expect(inKaossDeadZone(0.5 + KAOSS_DEAD_ZONE * 0.4, 0.5)).toBe(true);
    expect(inKaossDeadZone(0.5 + KAOSS_DEAD_ZONE * 1.2, 0.5)).toBe(false);
    expect(inKaossDeadZone(0, 0)).toBe(false);
  });

  it("scales hit intensity from 0 at the dead-zone edge to 1 at the rim", () => {
    expect(kaossDistanceIntensity(KAOSS_DEAD_ZONE)).toBe(0);
    expect(kaossDistanceIntensity(1)).toBe(1);
    expect(kaossDistanceIntensity(0)).toBe(0); // clamped, never negative
    const mid = KAOSS_DEAD_ZONE + (1 - KAOSS_DEAD_ZONE) / 2;
    expect(kaossDistanceIntensity(mid)).toBeCloseTo(0.5, 5);
  });

  it("reads angle clockwise from 12 o'clock", () => {
    expect(kaossAngle(0.5, 0)).toBeCloseTo(0, 5);   // straight up
    expect(kaossAngle(1, 0.5)).toBeCloseTo(90, 5);  // right
    expect(kaossAngle(0.5, 1)).toBeCloseTo(180, 5); // down
    expect(kaossAngle(0, 0.5)).toBeCloseTo(270, 5); // left
  });

  it("splits the pad into as many wedges as there are vis modes", () => {
    expect(kaossAngleModeIndex(0, 7)).toBe(0);
    expect(kaossAngleModeIndex(359, 7)).toBe(6);
    expect(kaossAngleModeIndex(180, 4)).toBe(2);
    expect(kaossAngleModeIndex(90, 0)).toBe(0);
  });
});
