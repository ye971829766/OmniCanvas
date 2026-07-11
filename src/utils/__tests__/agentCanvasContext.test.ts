import { describe, expect, it } from "vitest";
import { serializeCanvasForAgent } from "@/utils/agentCanvasContext";

function linkChildren(node: any): any {
  node.children?.forEach((child: any) => {
    child.parent = node;
    linkChildren(child);
  });
  return node;
}

describe("agent canvas context", () => {
  it("keeps semantic node data while removing embedded media", () => {
    const imageGen = {
      tag: "ImageGen",
      refId: "gen_1",
      prompt: "p".repeat(2_000),
      images: ["data:image/png;base64," + "a".repeat(50_000)],
      width: 512,
      height: 512,
    };
    const frame = linkChildren({
      tag: "Frame",
      refId: "frame_1",
      width: 1080,
      height: 1080,
      children: [imageGen],
    });
    const app = {
      tree: linkChildren({ tag: "Leafer", children: [frame] }),
      editor: { hasItem: (node: any) => node === imageGen },
    };

    const result = serializeCanvasForAgent(app, {
      ensureRefId: (node) => node.refId,
    });
    const serialized = JSON.stringify(result);

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      refId: "gen_1",
      parentId: "frame_1",
      selected: true,
      referenceImageCount: 1,
      hasEmbeddedReferences: true,
    });
    expect(result[1].prompt.length).toBe(1_000);
    expect(serialized).not.toContain("data:image");
    expect(serialized.length).toBeLessThan(3_000);
  });

  it("keeps short server URLs but omits data and blob URLs", () => {
    const root = linkChildren({
      tag: "Leafer",
      children: [
        { tag: "Image", refId: "remote", url: "/files/product.png" },
        { tag: "Image", refId: "data", url: "data:image/png;base64,abc" },
        { tag: "VideoNode", refId: "blob", videoUrl: "blob:http://local/1" },
      ],
    });

    const result = serializeCanvasForAgent(
      { tree: root },
      { ensureRefId: (node) => node.refId },
    );

    expect(result[0].url).toBe("/files/product.png");
    expect(result[1]).toMatchObject({ hasEmbeddedMedia: true });
    expect(result[1].url).toBeUndefined();
    expect(result[2]).toMatchObject({ hasEmbeddedMedia: true });
    expect(result[2].videoUrl).toBeUndefined();
  });
});
