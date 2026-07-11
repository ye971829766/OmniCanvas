export interface ImplicitImageReference {
  source: string;
  refId: string;
  url?: string;
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
  const createReference = (node: any): ImplicitImageReference => ({
    source: node.refId,
    refId: node.refId,
    url:
      typeof node.url === "string" && node.url
        ? node.url
        : recentResults.get(node.refId)?.url,
  });

  const selected = imageNodes.filter((node) => node.selected === true);
  if (selected.length === 1) return createReference(selected[0]);

  for (const refId of recentResults.keys()) {
    const node = imageNodes.find((candidate) => candidate.refId === refId);
    if (node) return createReference(node);
  }

  if (imageNodes.length === 1) return createReference(imageNodes[0]);
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
): any {
  if (!reference || !rawInput || typeof rawInput !== "object") return rawInput;
  const input = { ...rawInput };

  if (
    toolName === "edit_image" &&
    (!input.source || isDeicticReference(input.source))
  ) {
    input.source = reference.source;
  }

  if (toolName === "generate_image") {
    const refs = Array.isArray(input.refImages)
      ? input.refImages.filter((item: unknown) => typeof item === "string" && item)
      : [];
    if (refs.length > 0 && refs.every(isDeicticReference)) {
      input.refImages = [reference.source];
    }
  }

  return input;
}
