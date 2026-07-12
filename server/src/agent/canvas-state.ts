import type { ToolContext } from "./tool.interface";
import { sanitizeCanvasNodeForAgent } from "./canvas-context";

export type AgentCanvasNode = Record<string, any> & {
  refId: string;
  type: string;
  source?: "canvas" | "agent_session";
};

export interface AgentFrameState {
  width: number;
  height: number;
  background?: string;
}

const NODE_MAP_KEY = "__agentCanvasNodes";
const FRAME_KEY = "__agentFrame";
const ROOT_GRID_LAYOUT_KEY = "__agentRootGridLayout";
const CONTAINER_NODE_TYPES = new Set(["frame", "group"]);

interface RootGridLayoutState {
  originX: number;
  nextX: number;
  nextY: number;
  rowHeight: number;
  column: number;
  columns: number;
  gap: number;
  reserved: RootGridRect[];
}

interface RootGridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function alignToCanvasGrid(value: number): number {
  return Math.round(value / 8) * 8;
}

function getRootNodeBounds(ctx: ToolContext): RootGridRect[] {
  return [...getCanvasNodeMap(ctx).values()].flatMap((node) => {
    if (node.parentId) return [];
    const x = Number(node.x);
    const y = Number(node.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{
      x,
      y,
      width: Math.max(0, Number(node.width) || 0),
      height: Math.max(0, Number(node.height) || 0),
    }];
  });
}

function overlapsWithGap(a: RootGridRect, b: RootGridRect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function advanceRootGridCursor(
  state: RootGridLayoutState,
  itemWidth: number,
  itemHeight: number,
): void {
  state.rowHeight = Math.max(state.rowHeight, itemHeight);
  state.column += 1;
  if (state.column >= state.columns) {
    state.column = 0;
    state.nextX = state.originX;
    state.nextY = alignToCanvasGrid(state.nextY + state.rowHeight + state.gap);
    state.rowHeight = 0;
  } else {
    state.nextX = alignToCanvasGrid(state.nextX + itemWidth + state.gap);
  }
}

function normalizeNodeType(node: any): string {
  const raw = String(node?.type || node?.tag || node?.__tag || "").toLowerCase();
  if (raw === "text") return "text";
  if (raw === "rect" || raw === "rectangle") return "rect";
  if (raw === "imagegen" || raw === "image_gen") return "image_gen";
  if (raw === "videogen" || raw === "video_gen") return "video_gen";
  if (raw === "videonode" || raw === "video") return "video";
  if (raw === "image") return "image";
  if (raw === "frame") return "frame";
  if (raw === "ellipse" || raw === "polygon" || raw === "star" || raw === "line") {
    return raw;
  }
  return raw || "unknown";
}

function inferRole(node: AgentCanvasNode, frame: AgentFrameState): string {
  if (node.role) return String(node.role);
  if (node.type === "text") {
    const fontSize = Number(node.fontSize ?? 32);
    const text = String(node.text ?? "");
    if (fontSize >= 48) return "title";
    if (
      fontSize >= 28 &&
      (text.includes("立即") ||
        text.includes("免费") ||
        text.toLowerCase().includes("cta") ||
        text.length < 10)
    ) {
      return "cta";
    }
    if (fontSize >= 28) return "subtitle";
    return "body";
  }
  if (node.type === "image" || node.type === "image_gen" || node.type === "video" || node.type === "video_gen") {
    return "hero";
  }
  if (node.type === "rect" || node.type === "frame") {
    const width = Number(node.width ?? 0);
    const height = Number(node.height ?? 0);
    if (width >= frame.width * 0.85 && height >= frame.height * 0.85) {
      return "background";
    }
    return "decoration";
  }
  return "accent";
}

function normalizeCanvasNode(node: any, frame: AgentFrameState): AgentCanvasNode | null {
  const sanitized = sanitizeCanvasNodeForAgent(node);
  if (!sanitized || typeof sanitized.refId !== "string") return null;
  const refId = sanitized.refId;
  const normalized: AgentCanvasNode = {
    ...sanitized,
    refId,
    type: normalizeNodeType(sanitized),
    source: sanitized.source || "canvas",
  };
  normalized.role = inferRole(normalized, frame);
  return normalized;
}

export function getFrame(ctx: ToolContext): AgentFrameState {
  if (!(ctx as any)[FRAME_KEY]) {
    const frameNode = (ctx.canvasState ?? []).find((node: any) => {
      const type = normalizeNodeType(node);
      return type === "frame";
    });
    (ctx as any)[FRAME_KEY] = {
      width: Number(frameNode?.width ?? 1080),
      height: Number(frameNode?.height ?? 1080),
      background: frameNode?.fill || frameNode?.background,
    };
  }
  return (ctx as any)[FRAME_KEY];
}

export function setFrame(ctx: ToolContext, frame: AgentFrameState): void {
  (ctx as any)[FRAME_KEY] = frame;
}

export function getCanvasNodeMap(ctx: ToolContext): Map<string, AgentCanvasNode> {
  if (!(ctx as any)[NODE_MAP_KEY]) {
    const frame = getFrame(ctx);
    const map = new Map<string, AgentCanvasNode>();
    for (const node of ctx.canvasState ?? []) {
      const normalized = normalizeCanvasNode(node, frame);
      if (normalized) map.set(normalized.refId, normalized);
    }
    (ctx as any)[NODE_MAP_KEY] = map;
  }
  return (ctx as any)[NODE_MAP_KEY];
}

export function reserveRootGridPlacement(
  ctx: ToolContext,
  width: number,
  height: number,
  options: { columns?: number; gap?: number; sectionGap?: number } = {},
): { x: number; y: number } {
  const record = ctx as any;
  if (!record[ROOT_GRID_LAYOUT_KEY]) {
    const rootBounds = getRootNodeBounds(ctx);
    const originX = rootBounds.length > 0
      ? Math.min(...rootBounds.map((bounds) => bounds.x))
      : 0;
    const maxY = rootBounds.length > 0
      ? Math.max(...rootBounds.map((bounds) => bounds.y + bounds.height))
      : 0;
    const sectionGap = options.sectionGap ?? 120;
    record[ROOT_GRID_LAYOUT_KEY] = {
      originX: alignToCanvasGrid(originX),
      nextX: alignToCanvasGrid(originX),
      nextY: rootBounds.length > 0
        ? alignToCanvasGrid(maxY + sectionGap)
        : 0,
      rowHeight: 0,
      column: 0,
      columns: Math.max(1, Math.floor(options.columns ?? 3)),
      gap: Math.max(0, options.gap ?? 48),
      reserved: [],
    } satisfies RootGridLayoutState;
  }

  const state = record[ROOT_GRID_LAYOUT_KEY] as RootGridLayoutState;
  const itemWidth = Math.max(1, Number(width) || 1);
  const itemHeight = Math.max(1, Number(height) || 1);
  const occupied = [...getRootNodeBounds(ctx), ...state.reserved];

  for (;;) {
    const placement = { x: state.nextX, y: state.nextY };
    const candidate = { ...placement, width: itemWidth, height: itemHeight };
    advanceRootGridCursor(state, itemWidth, itemHeight);
    if (occupied.some((bounds) => overlapsWithGap(candidate, bounds, state.gap))) {
      continue;
    }
    state.reserved.push(candidate);
    return placement;
  }
}

export function resolveNewCanvasRefId(
  ctx: ToolContext,
  requestedRefId: unknown,
  prefix: string,
): string {
  const candidate =
    typeof requestedRefId === "string" &&
    /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(requestedRefId)
      ? requestedRefId
      : "";
  if (candidate && !getCanvasNodeMap(ctx).has(candidate)) return candidate;
  return ctx.newRefId(prefix);
}

export function resolveCanvasContainerParentId(
  ctx: ToolContext,
  requestedParentId: unknown,
): string | undefined {
  if (requestedParentId === undefined || requestedParentId === null || requestedParentId === "") {
    return undefined;
  }
  if (typeof requestedParentId !== "string") {
    throw new Error("parentId must be a frame or group refId.");
  }

  const parent = getCanvasNodeMap(ctx).get(requestedParentId);
  if (!parent) {
    throw new Error(`Unknown parentId: ${requestedParentId}. Use an existing frame or group refId.`);
  }
  if (!CONTAINER_NODE_TYPES.has(parent.type)) {
    throw new Error(
      `Invalid parentId: ${requestedParentId} points to ${parent.type}, not a frame or group.`,
    );
  }
  return parent.refId;
}

export function upsertCanvasNode(
  ctx: ToolContext,
  refId: string,
  props: Record<string, any>,
): AgentCanvasNode {
  const map = getCanvasNodeMap(ctx);
  const frame = getFrame(ctx);
  const existing = map.get(refId);
  const node = normalizeCanvasNode(
    {
      ...(existing ?? {}),
      ...props,
      refId,
      source: existing?.source ?? "agent_session",
    },
    frame,
  )!;
  map.set(refId, node);
  return node;
}

export function removeCanvasNode(ctx: ToolContext, refId: string): boolean {
  return getCanvasNodeMap(ctx).delete(refId);
}

export function listCanvasNodes(ctx: ToolContext): AgentCanvasNode[] {
  return [...getCanvasNodeMap(ctx).values()];
}
