import { describe, expect, test } from "bun:test";
import { applyPaletteTool } from "./style.tools";

function createContext(canvasState: any[]) {
  const operations: any[] = [];
  let brand: any = null;
  return {
    operations,
    get brand() {
      return brand;
    },
    ctx: {
      sessionId: "session_test",
      canvasState,
      newRefId: () => "generated",
      sink: {
        canvas: (operation: any) => operations.push(operation),
      },
      memory: {
        setBrand: (_sessionId: string, value: any) => {
          brand = value;
        },
      },
    } as any,
  };
}

describe("applyPaletteTool", () => {
  test("registers a palette on an empty canvas without creating a frame", async () => {
    const state = createContext([]);
    const result = await applyPaletteTool.execute(
      { paletteId: "minimal-mono" },
      state.ctx,
    );

    expect(state.operations).toEqual([]);
    expect(state.brand?.palette.background).toBe("#FFFFFF");
    expect(result.output).toMatchObject({
      note: expect.stringContaining("No frame was created"),
    });
  });

  test("updates root elements without emitting set_frame", async () => {
    const state = createContext([
      {
        refId: "title",
        type: "text",
        text: "Title",
        fontSize: 48,
        x: 100,
        y: 100,
        width: 300,
        height: 80,
      },
    ]);

    await applyPaletteTool.execute(
      { paletteId: "minimal-mono" },
      state.ctx,
    );

    expect(state.operations.some((operation) => operation.op === "set_frame")).toBe(false);
    expect(state.operations).toContainEqual(
      expect.objectContaining({ op: "update_node", refId: "title" }),
    );
  });
});
