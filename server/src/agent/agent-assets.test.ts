import { describe, expect, test } from "bun:test";
import {
  formatAgentAssetForPrompt,
  normalizeAgentAssets,
} from "./agent-assets";

describe("agent assets", () => {
  test("never exposes asset URLs in model-facing metadata", () => {
    const [asset] = normalizeAgentAssets([
      {
        id: "asset_product",
        name: "Product\nphoto",
        mimeType: "image/png",
        width: 1200,
        height: 1200,
        url: "data:image/png;base64," + "a".repeat(50_000),
      },
    ]);
    if (!asset) throw new Error("asset normalization failed");

    const promptLine = formatAgentAssetForPrompt(asset, true);
    expect(promptLine).toContain('assetId: "asset_product"');
    expect(promptLine).toContain("dimensions: 1200x1200");
    expect(promptLine).not.toContain("data:image");
    expect(promptLine).not.toContain("base64");
  });
});
