import { describe, expect, it } from "bun:test";
import { countMultimodalParts, estimatePromptTokenReserve } from "./token-estimate";

describe("token estimate", () => {
  it("counts nested image parts once", () => {
    expect(countMultimodalParts([
      { role: "user", content: [{ type: "text", text: "hi" }, { type: "image", image: "https://cdn/x.png" }] },
      { role: "user", content: [{ type: "image_url", image_url: { url: "https://cdn/y.png" } }] },
    ])).toBe(2);
  });

  it("adds a vision surcharge so URL-only images are not reserved as tiny text", () => {
    const messages = [
      { role: "user", content: [{ type: "image", image: "https://cdn.example/ref.png" }] },
    ];
    const reserved = estimatePromptTokenReserve(messages);
    expect(reserved).toBeGreaterThan(2_500);
    expect(reserved).toBeLessThan(8_000);
  });
});
