import { describe, expect, it, vi } from "vitest";

vi.mock("leafer-ui", () => ({
  Image: class {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
}));

import { applyImagePaintMode } from "../leaferImage";

describe("applyImagePaintMode", () => {
  it("uses fit mode so fixed image bounds do not stretch the bitmap", () => {
    const node: any = { url: "https://example.com/product.png" };

    applyImagePaintMode(node);

    expect(node.fill).toEqual({
      type: "image",
      url: "https://example.com/product.png",
      mode: "fit",
    });
  });

  it("reapplies fit after an async task swaps the source URL", () => {
    const node: any = { url: "https://example.com/placeholder.png" };

    applyImagePaintMode(node, "fit", "https://example.com/generated.png");

    expect(node.url).toBe("https://example.com/generated.png");
    expect(node.fill.mode).toBe("fit");
    expect(node.fill.url).toBe("https://example.com/generated.png");
  });
});
