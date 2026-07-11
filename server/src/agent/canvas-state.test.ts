import { describe, expect, test } from "bun:test";
import { resolveNewCanvasRefId } from "./canvas-state";

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
