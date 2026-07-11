export interface AgentCanvasSerializationOptions {
  ensureRefId: (node: any) => string;
}

const MAX_NAME_LENGTH = 160;
const MAX_TEXT_LENGTH = 2_000;
const MAX_PROMPT_LENGTH = 1_000;
const MAX_URL_LENGTH = 512;
const MAX_STRUCTURED_STRING_LENGTH = 256;
const MAX_STRUCTURED_ARRAY_LENGTH = 12;

function compactString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function compactNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isEmbeddedMedia(value: string): boolean {
  return /^(?:data|blob):/i.test(value);
}

function compactUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || isEmbeddedMedia(value)) {
    return undefined;
  }
  return compactString(value, MAX_URL_LENGTH);
}

function compactReference(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || isEmbeddedMedia(value)) {
    return undefined;
  }
  return compactString(value, MAX_URL_LENGTH);
}

function compactStructuredValue(
  value: unknown,
  depth = 0,
): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    if (isEmbeddedMedia(value)) return undefined;
    return compactString(value, MAX_STRUCTURED_STRING_LENGTH);
  }
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_STRUCTURED_ARRAY_LENGTH)
      .map((item) => compactStructuredValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const compacted = compactStructuredValue(item, depth + 1);
      if (compacted !== undefined) result[key] = compacted;
    }
    return result;
  }
  return undefined;
}

function assignDefined(
  target: Record<string, unknown>,
  values: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) target[key] = value;
  }
}

/**
 * Build the semantic canvas index sent to the agent. Binary media stays on the
 * canvas and is referenced by refId; it is never copied into the model context.
 */
export function serializeCanvasForAgent(
  app: any,
  options: AgentCanvasSerializationOptions,
): any[] {
  if (!app?.tree) return [];

  const serializedList: any[] = [];

  const serializeNode = (node: any, parentNode?: any): void => {
    if (!node) return;
    if (node === app.tree) {
      node.children?.forEach((child: any) => serializeNode(child, node));
      return;
    }

    const tag = String(node.__tag || node.tag || "");
    if (!tag || tag === "SimulateElement") return;

    const base: Record<string, unknown> = {
      refId: options.ensureRefId(node),
      tag,
      selected: !!app.editor?.hasItem?.(node),
    };
    assignDefined(base, {
      name: compactString(node.name, MAX_NAME_LENGTH),
      x: compactNumber(node.x),
      y: compactNumber(node.y),
      width: compactNumber(node.width),
      height: compactNumber(node.height),
      parentId:
        parentNode && parentNode !== app.tree
          ? options.ensureRefId(parentNode)
          : undefined,
    });

    if (tag === "Text") {
      assignDefined(base, {
        text: compactString(node.text, MAX_TEXT_LENGTH),
        fontSize: compactNumber(node.fontSize),
        fontFamily: compactString(node.fontFamily, MAX_NAME_LENGTH),
        fill: compactStructuredValue(node.fill),
        fontWeight: compactString(node.fontWeight, 64),
        textAlign: compactString(node.textAlign, 32),
        lineHeight: compactNumber(node.lineHeight),
        letterSpacing: compactNumber(node.letterSpacing),
        stroke: compactStructuredValue(node.stroke),
        strokeWidth: compactNumber(node.strokeWidth),
      });
    } else if (tag === "Image") {
      assignDefined(base, {
        url: compactUrl(node.url),
        hasEmbeddedMedia:
          typeof node.url === "string" && isEmbeddedMedia(node.url)
            ? true
            : undefined,
        cornerRadius: compactStructuredValue(node.cornerRadius),
      });
    } else if (tag === "ImageGen") {
      const references = Array.isArray(node.images) ? node.images : [];
      assignDefined(base, {
        prompt: compactString(node.prompt, MAX_PROMPT_LENGTH),
        model: compactString(node.model, MAX_NAME_LENGTH),
        size: compactString(node.size, 64),
        quality: compactString(node.quality, 64),
        aspectRatio: compactString(node.aspectRatio, 32),
        generationStatus: compactString(node.generationStatus, 32),
        referenceImageCount: references.length || undefined,
        hasEmbeddedReferences:
          references.some(
            (item: unknown) =>
              typeof item === "string" && isEmbeddedMedia(item),
          ) || undefined,
      });
    } else if (tag === "VideoGen") {
      assignDefined(base, {
        prompt: compactString(node.prompt, MAX_PROMPT_LENGTH),
        model: compactString(node.model, MAX_NAME_LENGTH),
        seconds: compactString(node.seconds, 32),
        size: compactString(node.size, 64),
        generationStatus: compactString(node.generationStatus, 32),
        inputReference: compactReference(node.inputReference),
        hasEmbeddedReference:
          typeof node.inputReference === "string" &&
          isEmbeddedMedia(node.inputReference)
            ? true
            : undefined,
      });
    } else if (tag === "VideoNode") {
      assignDefined(base, {
        videoUrl: compactUrl(node.videoUrl),
        thumbnailUrl: compactUrl(node.thumbnailUrl),
        hasEmbeddedMedia:
          [node.videoUrl, node.thumbnailUrl].some(
            (item) => typeof item === "string" && isEmbeddedMedia(item),
          ) || undefined,
      });
    } else if (tag === "Rect") {
      assignDefined(base, {
        fill: compactStructuredValue(node.fill),
        cornerRadius: compactStructuredValue(node.cornerRadius),
        stroke: compactStructuredValue(node.stroke),
        strokeWidth: compactNumber(node.strokeWidth),
        shadow: compactStructuredValue(node.shadow),
      });
    } else if (["Ellipse", "Polygon", "Star", "Line"].includes(tag)) {
      assignDefined(base, {
        fill: compactStructuredValue(node.fill),
        stroke: compactStructuredValue(node.stroke),
        strokeWidth: compactNumber(node.strokeWidth),
      });
    } else if (tag === "Frame") {
      assignDefined(base, {
        type: "frame",
        fill: compactStructuredValue(node.fill),
        flow: compactString(node.flow, 16),
        flowAlign: compactString(node.flowAlign, 64),
        flowWrap:
          typeof node.flowWrap === "boolean" ? node.flowWrap : undefined,
        gap: compactNumber(node.gap),
        padding: compactStructuredValue(node.padding),
      });
    } else if (tag === "Group") {
      base.type = "group";
    }

    assignDefined(base, {
      opacity:
        node.opacity !== undefined && node.opacity !== 1
          ? compactNumber(node.opacity)
          : undefined,
      rotation: node.rotation ? compactNumber(node.rotation) : undefined,
      scaleX:
        node.scaleX !== undefined && node.scaleX !== 1
          ? compactNumber(node.scaleX)
          : undefined,
      scaleY:
        node.scaleY !== undefined && node.scaleY !== 1
          ? compactNumber(node.scaleY)
          : undefined,
      zIndex: node.zIndex ? compactNumber(node.zIndex) : undefined,
      shadow: tag !== "Rect" ? compactStructuredValue(node.shadow) : undefined,
    });

    serializedList.push(base);

    if ((tag === "Frame" || tag === "Group") && node.children) {
      node.children.forEach((child: any) => serializeNode(child, node));
    }
  };

  serializeNode(app.tree);
  return serializedList;
}
