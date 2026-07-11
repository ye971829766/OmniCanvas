import { describe, expect, test } from "bun:test";
import {
  injectImplicitImageReference,
  normalizeImageToolCallForSelection,
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
      reason: "recent_result",
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
    const reference = {
      source: "latest",
      refId: "latest",
      reason: "recent_result" as const,
    };

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

  test("inherits an explicitly selected image unless the model opts out", () => {
    const reference = {
      source: "selected",
      refId: "selected",
      reason: "selected" as const,
    };

    expect(
      injectImplicitImageReference(
        "generate_image",
        { prompt: "make a matching cat" },
        reference,
      ).refImages,
    ).toEqual(["selected"]);
    expect(
      injectImplicitImageReference(
        "generate_image",
        { prompt: "make an unrelated poster", refImages: [] },
        reference,
      ).refImages,
    ).toEqual([]);
  });

  test("promotes a reference-free generation after the selected image was inspected", () => {
    const normalized = normalizeImageToolCallForSelection(
      "generate_image",
      {
        prompt: "a fluffy kitten portrait",
        width: 1029,
        height: 1536,
        x: -2432,
        y: 858,
      },
      {
        source: "image_mrg8wdpu_1",
        refId: "image_mrg8wdpu_1",
        reason: "selected",
      },
      {
        selectedImageWasInspected: true,
        userInput: "Add a kitten beside the puppy in the selected image",
      },
    );

    expect(normalized.toolName).toBe("edit_image");
    expect(normalized.input).toMatchObject({
      source: "image_mrg8wdpu_1",
      width: 1029,
      height: 1536,
      x: -2432,
      y: 858,
    });
    expect(normalized.input.prompt).toContain(
      "Add a kitten beside the puppy in the selected image",
    );
    expect(normalized.input.prompt).toContain("inside the image");
  });

  test("keeps explicit fresh-generation opt-out after selection inspection", () => {
    const normalized = normalizeImageToolCallForSelection(
      "generate_image",
      { prompt: "a completely unrelated poster", refImages: [] },
      {
        source: "selected",
        refId: "selected",
        reason: "selected",
      },
      { selectedImageWasInspected: true },
    );

    expect(normalized).toEqual({
      toolName: "generate_image",
      input: { prompt: "a completely unrelated poster", refImages: [] },
    });
  });
});
