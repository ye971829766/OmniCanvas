import { describe, expect, test, vi } from "vitest";
import {
  isAgentCanvasContainer,
  resolveAgentCanvasParent,
} from "@/utils/agentCanvasParent";

describe("agent canvas parent resolution", () => {
  test("accepts only Leafer frame and group containers", () => {
    expect(isAgentCanvasContainer({ tag: "Frame", add: vi.fn() })).toBe(true);
    expect(isAgentCanvasContainer({ __tag: "Group", add: vi.fn() })).toBe(true);
    expect(isAgentCanvasContainer({ tag: "Image", add: vi.fn() })).toBe(false);
    expect(isAgentCanvasContainer({ tag: "Frame" })).toBe(false);
  });

  test("does not attach a child to an image parent", () => {
    const imageParent = { tag: "Image" };
    const fallbackFrame = { tag: "Frame", add: vi.fn() };

    expect(
      resolveAgentCanvasParent("product_image", imageParent, fallbackFrame),
    ).toBeNull();
  });

  test("uses a valid fallback frame only when the requested parent is missing", () => {
    const fallbackFrame = { tag: "Frame", add: vi.fn() };

    expect(
      resolveAgentCanvasParent("missing_frame", undefined, fallbackFrame),
    ).toBe(fallbackFrame);
    expect(resolveAgentCanvasParent(undefined, undefined, fallbackFrame)).toBeNull();
  });
});
