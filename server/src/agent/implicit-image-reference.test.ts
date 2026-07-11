import { describe, expect, test } from "bun:test";
import {
  injectImplicitImageReference,
  resolveImplicitImageReference,
} from "./implicit-image-reference";

function mediaResult(refId: string, url: string) {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: `call_${refId}`,
        toolName: "generate_image",
        output: {
          type: "json",
          value: { refId, url, status: "success" },
        },
      },
    ],
  };
}

describe("implicit image reference routing", () => {
  test("prefers the single selected canvas image", () => {
    const reference = resolveImplicitImageReference(
      [
        { refId: "older", tag: "Image", url: "https://example.com/old.png" },
        {
          refId: "selected",
          tag: "Image",
          selected: true,
          url: "https://example.com/selected.png",
        },
      ],
      [mediaResult("older", "https://example.com/old.png")],
    );

    expect(reference?.source).toBe("selected");
  });

  test("falls back to the latest successful generated image still on canvas", () => {
    const reference = resolveImplicitImageReference(
      [
        { refId: "older", tag: "Image", url: "https://example.com/old.png" },
        { refId: "latest", tag: "ImageGen", generationStatus: "success" },
      ],
      [
        mediaResult("older", "https://example.com/old.png"),
        mediaResult("latest", "https://example.com/latest.png"),
      ],
    );

    expect(reference).toEqual({
      source: "latest",
      refId: "latest",
      url: "https://example.com/latest.png",
    });
  });

  test("does not guess between multiple unrelated canvas images", () => {
    expect(
      resolveImplicitImageReference(
        [
          { refId: "one", tag: "Image", url: "https://example.com/one.png" },
          { refId: "two", tag: "Image", url: "https://example.com/two.png" },
        ],
        [],
      ),
    ).toBeUndefined();
  });

  test("fills edit sources and repairs only explicitly deictic generation references", () => {
    const reference = { source: "latest", refId: "latest" };

    expect(
      injectImplicitImageReference("edit_image", { prompt: "add a cat" }, reference),
    ).toMatchObject({ source: "latest", prompt: "add a cat" });
    expect(
      injectImplicitImageReference(
        "generate_image",
        { prompt: "add a cat", refImages: [] },
        reference,
      ).refImages,
    ).toEqual([]);
    expect(
      injectImplicitImageReference(
        "generate_image",
        { prompt: "add a cat", refImages: ["this image"] },
        reference,
      ).refImages,
    ).toEqual(["latest"]);
    expect(
      injectImplicitImageReference(
        "generate_image",
        { refImages: ["asset_explicit"] },
        reference,
      ).refImages,
    ).toEqual(["asset_explicit"]);
  });
});
