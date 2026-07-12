import { describe, expect, test } from "bun:test";
import {
  reserveRootGridPlacement,
  resolveCanvasContainerParentId,
  resolveNewCanvasRefId,
  upsertCanvasNode,
} from "./canvas-state";

describe("canvas ref ids", () => {
  test("accepts safe explicit ids and rejects collisions or invalid values", () => {
    let sequence = 0;
    const ctx = {
      canvasState: [{ refId: "existing", type: "rect" }],
      newRefId: (prefix: string) => `${prefix}_${++sequence}`,
    } as any;

    expect(resolveNewCanvasRefId(ctx, "hero_group", "grp")).toBe("hero_group");
    expect(resolveNewCanvasRefId(ctx, "existing", "grp")).toBe("grp_1");
    expect(resolveNewCanvasRefId(ctx, "invalid id", "grp")).toBe("grp_2");
  });
});

describe("canvas parent ids", () => {
  test("accepts frame and group parents", () => {
    const ctx = {
      canvasState: [
        { refId: "frame_1", type: "frame" },
        { refId: "group_1", type: "group" },
      ],
    } as any;

    expect(resolveCanvasContainerParentId(ctx, "frame_1")).toBe("frame_1");
    expect(resolveCanvasContainerParentId(ctx, "group_1")).toBe("group_1");
    expect(resolveCanvasContainerParentId(ctx, undefined)).toBeUndefined();
  });

  test("rejects image and missing parents", () => {
    const ctx = {
      canvasState: [{ refId: "image_1", type: "image" }],
    } as any;

    expect(() => resolveCanvasContainerParentId(ctx, "image_1")).toThrow(
      "not a frame or group",
    );
    expect(() => resolveCanvasContainerParentId(ctx, "missing")).toThrow(
      "Unknown parentId",
    );
  });
});

describe("root grid placement", () => {
  test("places different-sized items in deterministic three-column rows", () => {
    const ctx = { canvasState: [] } as any;

    expect(reserveRootGridPlacement(ctx, 320, 480)).toEqual({ x: 0, y: 0 });
    expect(reserveRootGridPlacement(ctx, 640, 360)).toEqual({ x: 368, y: 0 });
    expect(reserveRootGridPlacement(ctx, 280, 700)).toEqual({ x: 1056, y: 0 });
    expect(reserveRootGridPlacement(ctx, 400, 300)).toEqual({ x: 0, y: 752 });
  });

  test("starts below existing root content and ignores child coordinates", () => {
    const ctx = {
      canvasState: [
        { refId: "root_a", type: "image", x: 100, y: 50, width: 600, height: 400 },
        { refId: "root_b", type: "rect", x: -80, y: 20, width: 80, height: 100 },
        {
          refId: "child_far_away",
          parentId: "frame_1",
          type: "image",
          x: 0,
          y: 5000,
          width: 1000,
          height: 1000,
        },
      ],
    } as any;

    expect(reserveRootGridPlacement(ctx, 400, 400)).toEqual({ x: -80, y: 568 });
  });

  test("returns the same placements for identical fresh contexts", () => {
    const place = () => {
      const ctx = { canvasState: [] } as any;
      return [
        reserveRootGridPlacement(ctx, 480, 320),
        reserveRootGridPlacement(ctx, 320, 480),
      ];
    };

    expect(place()).toEqual(place());
  });

  test("skips a newly occupied slot after the layout session starts", () => {
    const ctx = { canvasState: [] } as any;

    expect(reserveRootGridPlacement(ctx, 400, 300)).toEqual({ x: 0, y: 0 });
    upsertCanvasNode(ctx, "manual_blocker", {
      type: "rect",
      x: 448,
      y: 0,
      width: 400,
      height: 300,
    });

    expect(reserveRootGridPlacement(ctx, 400, 300)).toEqual({ x: 896, y: 0 });
  });
});
