import { describe, expect, it } from "vitest";
import { TimeController } from "./timefx";

describe("TimeController freeze", () => {
  it("can explicitly release a freeze before its timer expires", () => {
    const controller = new TimeController();
    controller.triggerFreeze(5_000);
    expect(controller.isFrozen).toBe(true);
    controller.cancelFreeze();
    expect(controller.isFrozen).toBe(false);
  });
});
