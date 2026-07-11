import { describe, expect, test } from "bun:test";
import {
  buildCanvasQueryResult,
  sanitizeCanvasNodeForAgent,
} from "./canvas-context";

describe("canvas agent context", () => {
  test("removes embedded media and keeps reference metadata", () => {
    const node = sanitizeCanvasNodeForAgent({
      refId: "gen_1",
      tag: "ImageGen",
      prompt: "p".repeat(2_000),
      images: ["data:image/png;base64," + "a".repeat(20_000)],
      url: "blob:http://localhost/1",
    });

    expect(node).toMatchObject({
      refId: "gen_1",
      referenceImageCount: 1,
      hasEmbeddedReferences: true,
      hasEmbeddedMedia: true,
    });
    expect(node?.prompt.length).toBe(600);
    expect(node?.images).toBeUndefined();
    expect(node?.url).toBeUndefined();
    expect(JSON.stringify(node)).not.toContain("base64");
  });

  test("preserves ordinary text that starts with Data", () => {
    const node = sanitizeCanvasNodeForAgent({
      refId: "text_1",
      type: "text",
      text: "Data: Q3 revenue increased by 18%",
    });

    expect(node?.text).toBe("Data: Q3 revenue increased by 18%");
  });

  test("returns a bounded summary for a large canvas", () => {
    const nodes = Array.from({ length: 500 }, (_, index) => ({
      refId: `node_${index}`,
      tag: index === 0 ? "Frame" : "Text",
      type: index === 0 ? "frame" : "text",
      parentId: index === 0 ? undefined : "node_0",
      selected: index === 499,
      text: `Layer ${index} ${"x".repeat(500)}`,
      x: index,
      y: index,
      width: 100,
      height: 40,
    }));

    const result = buildCanvasQueryResult(
      nodes,
      { width: 1080, height: 1080 },
      { scope: "summary" },
    );

    expect(result.nodeCount).toBe(500);
    expect(result.selectedRefIds).toEqual(["node_499"]);
    expect(result.nodes.some((node: any) => node.refId === "node_0")).toBe(true);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(24_000);
  });

  test("supports frame pagination and exact id queries", () => {
    const nodes = [
      { refId: "frame", type: "frame" },
      ...Array.from({ length: 8 }, (_, index) => ({
        refId: `child_${index}`,
        type: "rect",
        parentId: "frame",
      })),
      { refId: "outside", type: "text" },
    ];

    const firstPage = buildCanvasQueryResult(
      nodes,
      { width: 100, height: 100 },
      { scope: "frame", frameId: "frame", limit: 3 },
    );
    const exact = buildCanvasQueryResult(
      nodes,
      { width: 100, height: 100 },
      { scope: "ids", refIds: ["outside", "child_5"] },
    );

    expect(firstPage.returned).toBe(3);
    expect(firstPage.nextCursor).toBe(3);
    expect(firstPage.matchedCount).toBe(9);
    expect(exact.nodes.map((node: any) => node.refId)).toEqual([
      "child_5",
      "outside",
    ]);
  });
});
