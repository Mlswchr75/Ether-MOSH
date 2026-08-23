import { describe, expect, it } from "vitest";
import { selectBeforeFxEntities } from "./beforeFx";
import { makeOverlayEntity, type OverlayAsset } from "./types";

const asset: OverlayAsset = {
  id: "a",
  name: "test",
  kind: "raster",
  url: "blob:test",
  mimeType: "image/png",
  animated: false,
  createdAt: 1,
};

describe("selectBeforeFxEntities", () => {
  it("returns only visible entities routed before the global FX stack", () => {
    const before = makeOverlayEntity(asset, { id: "before", compositing: "before-fx" });
    const after = makeOverlayEntity(asset, { id: "after", compositing: "after-fx" });
    const hidden = makeOverlayEntity(asset, { id: "hidden", compositing: "before-fx", hidden: true });

    expect(selectBeforeFxEntities([after, hidden, before]).map(entity => entity.id)).toEqual(["before"]);
  });
});
