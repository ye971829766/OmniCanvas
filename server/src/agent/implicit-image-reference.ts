export interface ImplicitImageReference {
  source: string;
  refId: string;
  url?: string;
  reason: "selected" | "recent_result" | "only_image";
}

export interface NormalizedImageToolCall {
  toolName: string;
  input: any;
}

export interface NormalizeImageToolCallOptions {
  userInput?: string;
  selectedImageWasInspected?: boolean;
  /** When only an uploaded asset exists (no canvas selection), inject this id. */
  fallbackSourceId?: string;
  /** Prefer binding generate_image.refImages / edit_image.source to the source photo. */
  preferSourceImageBinding?: boolean;
}

const MEDIA_TOOL_NAMES = new Set([
  "generate_image",
  "edit_image",
  "remove_background",
  "inpaint_image",
  "upscale_image",
]);

function isImageNode(node: any): boolean {
  const type = String(node?.type || node?.tag || node?.__tag || "").toLowerCase();
  return type === "image" || type === "imagegen" || type === "image_gen";
}

export function hasCanvasImages(canvasState: any[]): boolean {
  return canvasState.some(isImageNode);
}

function unwrapOutput(output: any): any {
  if (
    output &&
    typeof output === "object" &&
    (output.type === "json" || output.type === "text") &&
    "value" in output
  ) {
    return output.value;
  }
  return output;
}

function readRecentMediaResults(history: any[]): Map<string, { url?: string }> {
  const results = new Map<string, { url?: string }>();
  for (let messageIndex = history.length - 1; messageIndex >= 0; messageIndex--) {
    const message = history[messageIndex];
    if (message?.role !== "tool" || !Array.isArray(message.content)) continue;
    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex--) {
      const part = message.content[partIndex];
      if (part?.type !== "tool-result" || !MEDIA_TOOL_NAMES.has(part.toolName)) {
        continue;
      }
      const value = unwrapOutput(part.output);
      if (!value || typeof value !== "object") continue;
      if (value.status === "error" || value.status === "failed") continue;
      const refId = typeof value.refId === "string" ? value.refId : "";
      if (!refId || results.has(refId)) continue;
      results.set(refId, {
        url: typeof value.url === "string" && value.url ? value.url : undefined,
      });
    }
  }
  return results;
}

export function resolveImplicitImageReference(
  canvasState: any[],
  history: any[],
): ImplicitImageReference | undefined {
  const imageNodes = canvasState.filter(
    (node) => isImageNode(node) && typeof node.refId === "string" && node.refId,
  );
  if (imageNodes.length === 0) return undefined;

  const recentResults = readRecentMediaResults(history);
  const createReference = (
    node: any,
    reason: ImplicitImageReference["reason"],
  ): ImplicitImageReference => ({
    source: node.refId,
    refId: node.refId,
    reason,
    url:
      typeof node.url === "string" && node.url
        ? node.url
        : recentResults.get(node.refId)?.url,
  });

  const selected = imageNodes.filter((node) => node.selected === true);
  if (selected.length === 1) return createReference(selected[0], "selected");

  for (const refId of recentResults.keys()) {
    const node = imageNodes.find((candidate) => candidate.refId === refId);
    if (node) return createReference(node, "recent_result");
  }

  if (imageNodes.length === 1) return createReference(imageNodes[0], "only_image");
  return undefined;
}

function isDeicticReference(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^(?:it|this|that|this image|that image|the image|这张图|这张图片|那张图|那张图片|它|刚才那张(?:图|图片)?)$/i.test(
    value.trim(),
  );
}

export function injectImplicitImageReference(
  toolName: string,
  rawInput: any,
  reference: ImplicitImageReference | undefined,
  options: {
    fallbackSourceId?: string;
    preferSourceImageBinding?: boolean;
  } = {},
): any {
  if (!rawInput || typeof rawInput !== "object") return rawInput;
  const sourceId = reference?.source || options.fallbackSourceId;
  if (!sourceId) return rawInput;
  const input = { ...rawInput };

  if (
    toolName === "edit_image" &&
    (!input.source || isDeicticReference(input.source))
  ) {
    input.source = sourceId;
  }

  if (toolName === "generate_image") {
    const explicitlySetReferences = Object.prototype.hasOwnProperty.call(
      input,
      "refImages",
    );
    const refs = Array.isArray(input.refImages)
      ? input.refImages.filter((item: unknown) => typeof item === "string" && item)
      : [];
    if (refs.length > 0 && refs.every(isDeicticReference)) {
      input.refImages = [sourceId];
    } else if (
      !explicitlySetReferences &&
      (reference?.reason === "selected" || options.preferSourceImageBinding)
    ) {
      // Canvas selection, or product-photo bitmap turn with an uploaded asset.
      // Preserve [] as an intentional opt-out for an unrelated fresh generation.
      input.refImages = [sourceId];
    }
  }

  return input;
}

function buildSelectedImageEditPrompt(
  userInput: string | undefined,
  modelPrompt: unknown,
): string {
  const request = userInput?.trim();
  const guidance = typeof modelPrompt === "string" ? modelPrompt.trim() : "";
  const parts = [
    "Edit the selected reference image as the base image.",
    request
      ? `Apply this request inside the image: ${request}`
      : "Apply the requested change inside the image.",
    "Treat spatial relations to a pictured subject as positions within the image, not as separate canvas placement.",
    "Preserve every unmentioned subject, the composition, identity, style, lighting, colors, and image proportions.",
  ];
  if (guidance && guidance !== request) {
    parts.push(`Appearance guidance for the requested addition only: ${guidance}`);
  }
  return parts.join("\n");
}

/**
 * Normalize a model-selected image tool without classifying the user's prose.
 * A model that inspected the explicit image selection and then emitted a
 * reference-free generation call has already demonstrated edit context, so the
 * call is promoted to edit_image. An explicit refImages field, including [],
 * remains the model's opt-in or opt-out decision.
 */
export function normalizeImageToolCallForSelection(
  toolName: string,
  rawInput: any,
  reference: ImplicitImageReference | undefined,
  options: NormalizeImageToolCallOptions = {},
): NormalizedImageToolCall {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return { toolName, input: rawInput };
  }

  const explicitlySetReferences = Object.prototype.hasOwnProperty.call(
    rawInput,
    "refImages",
  );
  if (
    toolName === "generate_image" &&
    reference?.reason === "selected" &&
    options.selectedImageWasInspected === true &&
    !explicitlySetReferences
  ) {
    const {
      deliverable: _deliverable,
      platform: _platform,
      refImages: _refImages,
      ...compatibleInput
    } = rawInput;
    return {
      toolName: "edit_image",
      input: {
        ...compatibleInput,
        source: reference.source,
        prompt: buildSelectedImageEditPrompt(
          options.userInput,
          rawInput.prompt,
        ),
      },
    };
  }

  return {
    toolName,
    input: injectImplicitImageReference(toolName, rawInput, reference, {
      fallbackSourceId: options.fallbackSourceId,
      preferSourceImageBinding: options.preferSourceImageBinding,
    }),
  };
}
