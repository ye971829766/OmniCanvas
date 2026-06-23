import type { ToolContext } from "./tool.interface";

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
  const refId = typeof node?.refId === "string" ? node.refId : "";
  if (!refId) return null;
  const normalized: AgentCanvasNode = {
    ...node,
    refId,
    type: normalizeNodeType(node),
    source: node.source || "canvas",
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
