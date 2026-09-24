import { describe, expect, it } from "vitest";

import { placeChip } from "../src/chip/place";

describe("placeChip", () => {
  it("sits 16 px from the right and 80 px from the bottom when not zoomed", () => {
    expect(placeChip({ offsetLeft: 0, offsetTop: 0, width: 400, height: 800, scale: 1 })).toEqual({
      right: 384,
      bottom: 720,
      size: 1,
    });
  });

  it("follows the visible area and keeps its size on screen when zoomed out and scrolled", () => {
    expect(placeChip({ offsetLeft: 100, offsetTop: 200, width: 800, height: 1600, scale: 0.5 })).toEqual({
      right: 868,
      bottom: 1640,
      size: 2,
    });
  });
});
