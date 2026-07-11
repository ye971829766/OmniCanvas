export type CanvasQueryScope =
  | "auto"
  | "summary"
  | "selection"
  | "frame"
  | "ids"
  | "search"
  | "all";

export type CanvasQueryDetail = "compact" | "standard";

export interface CanvasQueryInput {
  scope?: CanvasQueryScope;
  detail?: CanvasQueryDetail;
  frameId?: string;
  refIds?: string[];
  search?: string;
  cursor?: number;
  limit?: number;
}

export interface CanvasFrameSummary {
  width: number;
  height: number;
  background?: string;
}

const MAX_CANVAS_NODES = 20_000;
const MAX_QUERY_RESULT_CHARS = 24_000;
const DEFAULT_QUERY_LIMIT = 40;
const MAX_QUERY_LIMIT = 100;
const MAX_TEXT_LENGTH = 1_000;
const MAX_PROMPT_LENGTH = 600;
const MAX_URL_LENGTH = 512;
const MAX_NAME_LENGTH = 160;
const MAX_STRUCTURED_STRING_LENGTH = 256;

const ALLOWED_NODE_KEYS = new Set([
  "refId",
  "type",
  "tag",
  "__tag",
  "name",
  "parentId",
  "selected",
  "role",
  "source",
  "x",
  "y",
  "width",
  "height",
  "text",
  "fontSize",
  "fontFamily",
  "fill",
  "fontWeight",
  "textAlign",
  "lineHeight",
  "letterSpacing",
  "stroke",
  "strokeWidth",
  "cornerRadius",
  "shadow",
  "gradient",
  "prompt",
  "model",
  "size",
  "quality",
  "aspectRatio",
  "generationStatus",
  "status",
  "referenceImageCount",
  "hasEmbeddedReferences",
  "seconds",
  "inputReference",
  "hasEmbeddedReference",
  "url",
  "hasEmbeddedMedia",
  "videoUrl",
  "thumbnailUrl",
  "flow",
  "flowAlign",
  "flowWrap",
  "gap",
  "padding",
  "opacity",
  "rotation",
  "scaleX",
  "scaleY",
  "zIndex",
  "taskId",
  "errorMessage",
  "platform",
  "deliverable",
]);

const COMPACT_NODE_KEYS = new Set([
  "refId",
  "type",
  "tag",
  "name",
  "parentId",
  "selected",
  "role",
  "x",
  "y",
  "width",
  "height",
  "text",
  "fill",
  "fontSize",
  "generationStatus",
]);

function isEmbeddedMedia(value: string): boolean {
  return /^(?:data|blob):/i.test(value);
}

function compactString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function compactMediaReference(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string" || isEmbeddedMedia(value)) return undefined;
  return compactString(value, maxLength);
}

function compactStructuredValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    return compactMediaReference(value, MAX_STRUCTURED_STRING_LENGTH);
  }
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, 12)
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

function sanitizeNodeValue(key: string, value: unknown): unknown {
  if (key === "text") return compactString(value, MAX_TEXT_LENGTH);
  if (key === "prompt") return compactString(value, MAX_PROMPT_LENGTH);
  if (["url", "videoUrl", "thumbnailUrl", "inputReference"].includes(key)) {
    return compactMediaReference(value, MAX_URL_LENGTH);
  }
  if (["name", "fontFamily", "model", "taskId", "errorMessage"].includes(key)) {
    return compactString(value, MAX_NAME_LENGTH);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return compactString(value, MAX_STRUCTURED_STRING_LENGTH);
  return compactStructuredValue(value);
}

export function sanitizeCanvasNodeForAgent(
  node: unknown,
): Record<string, any> | null {
  if (!node || typeof node !== "object") return null;
  const source = node as Record<string, unknown>;
  const refId = compactString(source.refId, MAX_NAME_LENGTH);
  if (!refId) return null;

  const result: Record<string, any> = { refId };
  for (const [key, value] of Object.entries(source)) {
    if (key === "refId" || !ALLOWED_NODE_KEYS.has(key)) continue;
    const sanitized = sanitizeNodeValue(key, value);
    if (sanitized !== undefined) result[key] = sanitized;
  }

  if (Array.isArray(source.images)) {
    result.referenceImageCount = Math.max(
      Number(result.referenceImageCount || 0),
      source.images.length,
    );
    if (
      source.images.some(
        (item) => typeof item === "string" && isEmbeddedMedia(item),
      )
    ) {
      result.hasEmbeddedReferences = true;
    }
  }
  for (const key of ["url", "videoUrl", "thumbnailUrl", "inputReference"] as const) {
    const raw = source[key];
    if (typeof raw === "string" && isEmbeddedMedia(raw)) {
      if (key === "inputReference") result.hasEmbeddedReference = true;
      else result.hasEmbeddedMedia = true;
    }
  }

  return result;
}

export function sanitizeCanvasState(canvasState: unknown): Record<string, any>[] {
  if (!Array.isArray(canvasState)) return [];
  const result: Record<string, any>[] = [];
  for (const node of canvasState.slice(0, MAX_CANVAS_NODES)) {
    const sanitized = sanitizeCanvasNodeForAgent(node);
    if (sanitized) result.push(sanitized);
  }
  return result;
}

export function compactCanvasNode(
  node: Record<string, any>,
  detail: CanvasQueryDetail = "compact",
): Record<string, any> {
  const sanitized = sanitizeCanvasNodeForAgent(node) ?? { refId: node.refId };
  if (detail === "standard") return sanitized;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (COMPACT_NODE_KEYS.has(key)) result[key] = value;
  }
  if (typeof result.text === "string") {
    result.text = compactString(result.text, 300);
  }
  return result;
}

function getNodeType(node: Record<string, any>): string {
  return String(node.type || node.tag || "unknown").toLowerCase();
}

function getCanvasBounds(nodes: Record<string, any>[]) {
  const positioned = nodes.filter(
    (node) =>
      [node.x, node.y, node.width, node.height].every(
        (value) => typeof value === "number" && Number.isFinite(value),
      ),
  );
  if (positioned.length === 0) return undefined;
  const minX = Math.min(...positioned.map((node) => node.x));
  const minY = Math.min(...positioned.map((node) => node.y));
  const maxX = Math.max(...positioned.map((node) => node.x + node.width));
  const maxY = Math.max(...positioned.map((node) => node.y + node.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function isDescendantOf(
  node: Record<string, any>,
  frameId: string,
  byId: Map<string, Record<string, any>>,
): boolean {
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (typeof parentId === "string" && parentId && !visited.has(parentId)) {
    if (parentId === frameId) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return false;
}

function matchesSearch(node: Record<string, any>, query: string): boolean {
  const haystack = [
    node.refId,
    node.name,
    node.text,
    node.type,
    node.tag,
    node.role,
  ]
    .filter((value) => typeof value === "string")
    .join("\n")
    .toLowerCase();
  return haystack.includes(query);
}

function uniqueNodes(nodes: Record<string, any>[]): Record<string, any>[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (!node.refId || seen.has(node.refId)) return false;
    seen.add(node.refId);
    return true;
  });
}

export function buildCanvasQueryResult(
  rawNodes: Record<string, any>[],
  frame: CanvasFrameSummary,
  input: CanvasQueryInput = {},
) {
  const nodes = sanitizeCanvasState(rawNodes);
  const selected = nodes.filter((node) => node.selected === true);
  const frames = nodes.filter((node) => getNodeType(node) === "frame");
  const countsByType = nodes.reduce<Record<string, number>>((counts, node) => {
    const type = getNodeType(node);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  const byId = new Map(nodes.map((node) => [node.refId, node]));
  const requestedScope = input.scope || "auto";
  let effectiveScope: CanvasQueryScope = requestedScope;
  if (requestedScope === "auto") {
    effectiveScope = selected.length > 0
      ? "selection"
      : nodes.length <= DEFAULT_QUERY_LIMIT
        ? "all"
        : "summary";
  }

  let candidates: Record<string, any>[];
  if (effectiveScope === "selection") {
    const parents = selected
      .map((node) => byId.get(node.parentId))
      .filter((node): node is Record<string, any> => !!node);
    candidates = uniqueNodes([...selected, ...parents]);
  } else if (effectiveScope === "frame") {
    const frameId = typeof input.frameId === "string" ? input.frameId : "";
    candidates = frameId
      ? nodes.filter(
          (node) => node.refId === frameId || isDescendantOf(node, frameId, byId),
        )
      : [];
  } else if (effectiveScope === "ids") {
    const ids = new Set(
      Array.isArray(input.refIds)
        ? input.refIds.filter((id): id is string => typeof id === "string")
        : [],
    );
    candidates = nodes.filter((node) => ids.has(node.refId));
  } else if (effectiveScope === "search") {
    const query = String(input.search || "").trim().toLowerCase();
    candidates = query ? nodes.filter((node) => matchesSearch(node, query)) : [];
  } else if (effectiveScope === "summary") {
    const topLevel = nodes.filter((node) => !node.parentId).slice(0, 12);
    candidates = uniqueNodes([...selected, ...frames.slice(0, 16), ...topLevel]);
  } else {
    candidates = nodes;
  }

  const detail = input.detail === "standard" ? "standard" : "compact";
  const cursor = Math.max(0, Math.floor(Number(input.cursor) || 0));
  const limit = Math.max(
    1,
    Math.min(MAX_QUERY_LIMIT, Math.floor(Number(input.limit) || DEFAULT_QUERY_LIMIT)),
  );
  const page = candidates
    .slice(cursor, cursor + limit)
    .map((node) => compactCanvasNode(node, detail));

  const result: Record<string, any> = {
    frame,
    scope: effectiveScope,
    nodeCount: nodes.length,
    matchedCount: candidates.length,
    returned: page.length,
    countsByType,
    bounds: getCanvasBounds(nodes.filter((node) => !node.parentId)),
    selectedRefIds: selected.map((node) => node.refId).slice(0, 100),
    nodes: page,
  };

  while (
    result.nodes.length > 1 &&
    JSON.stringify(result).length > MAX_QUERY_RESULT_CHARS - 64
  ) {
    result.nodes.pop();
    result.returned = result.nodes.length;
  }

  const nextCursor = cursor + result.nodes.length;
  if (nextCursor < candidates.length) result.nextCursor = nextCursor;
  result.truncated = nextCursor < candidates.length;
  result.resultChars = JSON.stringify(result).length;
  while (
    result.nodes.length > 1 &&
    JSON.stringify(result).length > MAX_QUERY_RESULT_CHARS
  ) {
    result.nodes.pop();
    result.returned = result.nodes.length;
    const adjustedNextCursor = cursor + result.nodes.length;
    result.nextCursor = adjustedNextCursor < candidates.length
      ? adjustedNextCursor
      : undefined;
    result.truncated = adjustedNextCursor < candidates.length;
    result.resultChars = JSON.stringify(result).length;
  }
  return result;
}
