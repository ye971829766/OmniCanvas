import { onBeforeUnmount, ref, watch, type Ref, reactive } from "vue";
import { Text, Rect, Frame, Group, MoveEvent, ZoomEvent } from "leafer-ui";
import { ImageGen } from "@/components/canvas/nodes/ImageGen";
import { VideoGen } from "@/components/canvas/nodes/VideoGen";
import { getRandomCoordinates, getNonOverlappingCoordinates } from "@/utils/utils";
import {
  getAgentHistory,
  getAgentPlan,
  deleteAgentSession,
  stopAgent,
  uploadImage,
} from "@/utils/api";
import type {
  AgentAssetPayload,
  AgentAttachmentInput,
  AgentPlan,
  AgentPlanStep,
} from "@/types/agent";
import { dataUrlToFile } from "@/utils/agentAttachments";
import { updateAgentPlanFromTool } from "@/utils/agentPlan";
import {
  createHiddenReasoningStreamFilter,
  stripHiddenReasoning,
} from "@/utils/agentText";
import { serializeCanvasForAgent } from "@/utils/agentCanvasContext";
import { createFitImage } from "@/utils/leaferImage";
import {
  deriveTerminalMediaNodeState,
} from "@/utils/agentMediaState";
import { resolveAgentCanvasParent } from "@/utils/agentCanvasParent";
import type { CanvasImageGenerationType } from "@/utils/imageTask";
import { safeRandomId } from "@/utils/safeId";

/**
 * useAgent — drives the Lovart-style chat panel.
 *
 * Opens an SSE stream to the agent backend (POST /agent/:sessionId/chat) and
 * maps each `canvas_op` onto your existing leafer canvas. For images/videos it
 * REUSES your ImageGen/VideoGen nodes + the `task-start` polling pipeline in
 * useCanvas, so the agent's generations behave exactly like manual ones.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const AGENT_BASE_URL = `${API_BASE_URL}`;

export interface ToolCallItem {
  id: string;
  name: string;
  done: boolean;
  input?: any;
  output?: any;
}

export type MessageBlock =
  | { id: string; type: "update"; text: string }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "tools"; tools: ToolCallItem[] }
  | { id: string; type: "plan"; plan: AgentPlan };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** streamed reasoning / final text */
  text: string;
  /** tool calls shown as chips under the bubble */
  tools: ToolCallItem[];
  /** chronological stream blocks */
  blocks?: MessageBlock[];
  /** current streamed step text before it becomes an update or final answer */
  liveText?: string;
  streaming: boolean;
  images?: string[];
  /** Optional error text when message encountered error */
  error?: string;
  /** Optional timestamp string e.g. Jun 15, 2026 */
  timestamp?: string;
  progress?: { tool?: string; message: string; percent?: number };
  /** Structured task plan shown separately from conversational text. */
  plan?: AgentPlan;
  /** Duration reported by the backend usage event. */
  elapsedMs?: number;
  runStatus?: "running" | "completed" | "failed" | "stopped";
}

interface AgentHistoryControls {
  begin?: () => void;
  commit?: () => boolean;
  rollback?: () => boolean;
  undo?: () => void;
}

type CanvasNodeSpec = {
  refId: string;
  type:
    | "image_gen"
    | "video_gen"
    | "text"
    | "rect"
    | "frame"
    | "group"
    | "image";
  parentId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  preserveLayout?: boolean;
  prompt?: string;
  model?: string;
  size?: string;
  quality?: string;
  seconds?: string;
  aspectRatio?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  fontWeight?: string;
  textAlign?: string;
  lineHeight?: number;
  letterSpacing?: number;
  opacity?: number;
  cornerRadius?: number;
  stroke?: string;
  strokeWidth?: number;
  gradient?: { from: string; to: string; direction: number };
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  zIndex?: number;
  url?: string;
  /** Requested upscale factor; used so canvas display size can grow after HD finishes. */
  upscaleScale?: number;
};


type CanvasOp =
  | { op: "add_node"; node: CanvasNodeSpec }
  | { op: "update_node"; refId: string; patch: Partial<CanvasNodeSpec> }
  | { op: "remove_node"; refId: string }
  | { op: "set_frame"; width: number; height: number; background?: string }
  | {
      op: "generation_started";
      refId: string;
      kind: "image" | "video";
      taskId: string;
      generationType?: CanvasImageGenerationType;
    }
  | { op: "focus_node"; refId: string }
  | { op: "export_node"; refId: string; requestId: string };

export interface NodeState {
  refId: string;
  type: "image" | "video" | "text" | "rect" | string;
  status: "generating" | "done" | "error";
  url?: string;
  thumbnailUrl?: string;
  error?: string;
}

function isInternalToolError(message: unknown) {
  const text = String(message ?? "");
  return (
    /^[a-z_]+:\s+Parameter\s+"[^"]+"/.test(text) ||
    /^[a-z_]+:\s+Missing required parameter/.test(text) ||
    /^[a-z_]+:\s+Tool\s+[a-z_]+\s+timed out/.test(text)
  );
}

export function stripInternalToolErrors(text: string) {
  if (!text) return "";
  return stripHiddenReasoning(text)
    .replace(
      /\n{0,2}\s*⚠️\s+[a-z_]+:\s+(?:Parameter\s+"[^"]+"\s+must be[^\n]*|Missing required parameter[^\n]*|Tool\s+[a-z_]+\s+timed out[^\n]*)/g,
      "",
    )
    .replace(
      /\n?\s*(?:\*{1,3}|#{1,6}\s*)?Visual\s+observation[^\n]*/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

function unwrapToolOutput(value: any) {
  if (
    value &&
    typeof value === "object" &&
    (value.type === "json" || value.type === "text") &&
    "value" in value
  ) {
    return value.value;
  }
  return value;
}

export function parseHistoryMessage(
  msg: any,
  index: number,
  allMessages: any[]
): ChatMessage | null {
  if (msg.role === "system" || msg.role === "tool") {
    return null;
  }

  const id = `hist-${index}-${Math.random().toString(36).slice(2, 6)}`;
  if (msg.role === "user") {
    let text = "";
    const images: string[] = [];
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          text = String(part.text || "")
            .replace(/\n*<attached_assets>[\s\S]*?<\/attached_assets>[\s\S]*$/i, "")
            .trimEnd();
        } else if (part.type === "image_url" && part.image_url?.url) {
          images.push(part.image_url.url);
        } else if (part.type === "image" && part.image) {
          images.push(part.image);
        }
      }
    }
    return {
      id,
      role: "user",
      text,
      tools: [],
      streaming: false,
      images: images.length > 0 ? images : undefined,
    };
  }

  if (msg.role === "assistant") {
    let rawText = "";
    const tools: { id: string; name: string; done: boolean; input?: any; output?: any }[] = [];

    if (typeof msg.content === "string") {
      rawText = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          rawText += part.text || "";
        } else if (part.type === "tool-call") {
          const toolCallId = part.toolCallId;
          const toolResult = allMessages.find((m) => {
            if (m.role !== "tool") return false;
            if (Array.isArray(m.content)) {
              return m.content.some((p: any) => p.type === "tool-result" && p.toolCallId === toolCallId);
            }
            return m.tool_call_id === toolCallId;
          });

          let input = part.args;
          let output: any;
          if (toolResult) {
            if (Array.isArray(toolResult.content)) {
              const resPart = toolResult.content.find((p: any) => p.type === "tool-result" && p.toolCallId === toolCallId);
              output = unwrapToolOutput(resPart?.result ?? resPart?.output);
            } else {
              try {
                output = typeof toolResult.content === "string" ? JSON.parse(toolResult.content) : toolResult.content;
              } catch {
                output = toolResult.content;
              }
            }
          }

          tools.push({
            id: toolCallId,
            name: part.toolName || "",
            done: !!toolResult,
            input,
            output,
          });
        }
      }
    }

    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const toolCallId = tc.id;
        const toolResult = allMessages.find(
          (m) => m.role === "tool" && m.tool_call_id === toolCallId
        );
        let input: any;
        let output: any;
        try {
          input = tc.function?.arguments ? JSON.parse(tc.function.arguments) : undefined;
        } catch {}
        try {
          output = typeof toolResult?.content === "string" ? JSON.parse(toolResult.content) : undefined;
        } catch {
          output = toolResult?.content;
        }
        tools.push({
          id: toolCallId,
          name: tc.function?.name || "",
          done: !!toolResult,
          input,
          output,
        });
      }
    }

    const historicalPlan = tools
      .map((tool) => tool.output?.plan)
      .find((plan) => plan && Array.isArray(plan.steps));
    const visibleText = stripInternalToolErrors(rawText);
    const isToolStep = tools.length > 0;
    const blocks: MessageBlock[] = [];
    if (isToolStep && visibleText) {
      blocks.push({ id: `${id}-update`, type: "update", text: visibleText });
    }
    if (isToolStep) {
      blocks.push({ id: `${id}-tools`, type: "tools", tools });
    }
    if (historicalPlan) {
      blocks.push({ id: `${id}-plan`, type: "plan", plan: historicalPlan });
    }
    if (!isToolStep && visibleText) {
      blocks.push({ id: `${id}-final`, type: "text", text: visibleText });
    }

    return {
      id,
      role: "assistant",
      text: isToolStep ? "" : visibleText,
      tools,
      blocks,
      streaming: false,
      plan: historicalPlan,
      runStatus: "completed",
    };
  }

  return null;
}

export function buildChatMessagesFromHistory(
  rawHistory: any[],
  savedPlan: AgentPlan | null = null,
): ChatMessage[] {
  const parsed: ChatMessage[] = [];
  rawHistory.forEach((msg, index) => {
    const parsedMessage = parseHistoryMessage(msg, index, rawHistory);
    if (!parsedMessage) return;

    const previous = parsed[parsed.length - 1];
    if (parsedMessage.role === "assistant" && previous?.role === "assistant") {
      if (parsedMessage.text) previous.text = parsedMessage.text;
      if (parsedMessage.tools.length) previous.tools.push(...parsedMessage.tools);
      if (parsedMessage.blocks?.length) {
        previous.blocks ||= [];
        previous.blocks.push(...parsedMessage.blocks);
      }
      if (parsedMessage.plan) previous.plan = parsedMessage.plan;
      return;
    }
    parsed.push(parsedMessage);
  });

  if (!savedPlan) return parsed;
  const planOwner = [...parsed].reverse().find(
    (message) =>
      message.role === "assistant" &&
      (message.plan?.id === savedPlan.id ||
        message.tools.some(
          (tool) =>
            tool.output?.plan?.id === savedPlan.id ||
            tool.name === "plan_ecommerce_suite" ||
            tool.name === "plan_design",
        )),
  );
  if (planOwner) {
    planOwner.plan = savedPlan;
    planOwner.blocks ||= [];
    const planBlock = planOwner.blocks.find(
      (block) => block.type === "plan" && block.plan.id === savedPlan.id,
    );
    if (planBlock?.type === "plan") planBlock.plan = savedPlan;
    else {
      planOwner.blocks.push({
        id: `${planOwner.id}-plan-${savedPlan.id}`,
        type: "plan",
        plan: savedPlan,
      });
    }
    return parsed;
  }

  parsed.push({
    id: `plan-${savedPlan.id}`,
    role: "assistant",
    text: "",
    tools: [],
    blocks: [
      {
        id: `plan-${savedPlan.id}-block`,
        type: "plan",
        plan: savedPlan,
      },
    ],
    streaming: false,
    plan: savedPlan,
    runStatus: "completed",
  });
  return parsed;
}

export function useAgent(
  canvasApp: Ref<any>,
  recordHistory?: () => void,
  activeWorkspaceIdRef?: Ref<string | number | null>,
  /** Called after each agent-placed node so the background can show a ripple */
  onAgentPlace?: (worldX: number, worldY: number) => void,
  historyControls?: AgentHistoryControls,
) {
  const messages = ref<ChatMessage[]>([]);
  const running = ref(false);
  const loadingHistory = ref(false);
  const canUndoLastRun = ref(false);
  // Use a fixed sessionId stored in localStorage, independent of workspaceId
  const getOrCreateSessionId = () => {
    const stored = localStorage.getItem('agent_session_id');
    if (stored) return stored;
    const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('agent_session_id', newId);
    return newId;
  };
  const sessionId = ref("");
  watch(
    () => activeWorkspaceIdRef?.value,
    (newWorkspaceId) => {
      if (newWorkspaceId) {
        sessionId.value = String(newWorkspaceId);
      } else {
        sessionId.value = getOrCreateSessionId();
      }
    },
    { immediate: true }
  );

  // refId -> leafer node, so update_node / generation_started can find nodes
  const nodeMap = new Map<string, any>();
  const nodeStates = ref<Record<string, NodeState>>({});
  const settledGenerationTaskIds = new Set<string>();
  let abort: AbortController | null = null;
  let localRefSeq = 1;
  let applyingCanvasOp = false;
  let runCanvasChanged = false;
  let lastAgentRippleAt = 0;
  let lastUserViewportInteractionAt = 0;
  let attachedApp: any = null;

  const ensureNodeRefId = (node: any) => {
    if (!node) return "";
    if (!node.refId) {
      const tag = String(node.__tag || node.tag || "node").toLowerCase();
      node.refId = `${tag}_${Date.now().toString(36)}_${localRefSeq++}`;
    }
    return node.refId;
  };

  const trackNode = (node: any) => {
    const refId = ensureNodeRefId(node);
    if (!refId) return;
    nodeMap.set(refId, node);
    const tag = node.tag || node.__tag;
    if (tag === "Image") {
      nodeStates.value[refId] = {
        refId,
        type: "image",
        status: "done",
        url: node.url,
      };
    } else if (tag === "VideoNode") {
      nodeStates.value[refId] = {
        refId,
        type: "video",
        status: "done",
        url: node.videoUrl,
        thumbnailUrl: node.thumbnailUrl,
      };
    } else if (tag === "ImageGen") {
      nodeStates.value[refId] = {
        refId,
        type: "image",
        status: node.generationStatus === "error" ? "error" : "generating",
        error: node.errorMessage,
      };
    } else if (tag === "VideoGen") {
      nodeStates.value[refId] = {
        refId,
        type: "video",
        status: node.generationStatus === "error" ? "error" : "generating",
        error: node.errorMessage,
      };
    }
  };

  const scanTreeAndPopulateNodeMap = (node: any) => {
    trackNode(node);
    if (node.children) {
      node.children.forEach(scanTreeAndPopulateNodeMap);
    }
  };

  // Load history once on mount
  const loadHistory = async () => {
    if (!sessionId.value) return;
    loadingHistory.value = true;
    try {
      messages.value = []; // Clear current history before loading the new one
      const [rawHistory, savedPlan] = await Promise.all([
        getAgentHistory(sessionId.value),
        getAgentPlan(sessionId.value).catch(() => null),
      ]);
      if (Array.isArray(rawHistory)) {
        messages.value = buildChatMessagesFromHistory(rawHistory, savedPlan);
      }
    } catch (err) {
      console.error("Failed to load agent chat history:", err);
    } finally {
      loadingHistory.value = false;
    }
  };

  watch(sessionId, () => {
    loadHistory();
  }, { immediate: true });

  // Sync nodeMap when workspace changes
  watch(
    () => activeWorkspaceIdRef?.value,
    () => {
      const app = canvasApp.value;
      if (app?.tree?.children) {
        nodeMap.clear();
        nodeStates.value = {};
        settledGenerationTaskIds.clear();
        app.tree.children.forEach(scanTreeAndPopulateNodeMap);
      }
    },
    { immediate: true },
  );

  const markUserViewportInteraction = () => {
    lastUserViewportInteractionAt = Date.now();
    attachedApp?.tree?.zoomLayer?.killAnimate?.();
  };

  const invalidateUndoAfterExternalChange = () => {
    if (!running.value && !applyingCanvasOp && canUndoLastRun.value) {
      canUndoLastRun.value = false;
    }
  };

  const detachCanvasListeners = () => {
    if (!attachedApp?.tree) return;
    attachedApp.tree.off("child.add", handleChildAdd);
    attachedApp.tree.off("child.remove", invalidateUndoAfterExternalChange);
    attachedApp.tree.off(MoveEvent.MOVE, markUserViewportInteraction);
    attachedApp.tree.off(ZoomEvent.ZOOM, markUserViewportInteraction);
    attachedApp.off?.("property.change", invalidateUndoAfterExternalChange);
    attachedApp = null;
  };

  const handleChildAdd = (e: any) => {
    trackNode(e.child);
    invalidateUndoAfterExternalChange();
  };

  watch(
    () => canvasApp.value,
    (app) => {
      detachCanvasListeners();
      if (!app?.tree) return;
      attachedApp = app;
      app.tree.on("child.add", handleChildAdd);
      app.tree.on("child.remove", invalidateUndoAfterExternalChange);
      app.tree.on(MoveEvent.MOVE, markUserViewportInteraction);
      app.tree.on(ZoomEvent.ZOOM, markUserViewportInteraction);
      app.on?.("property.change", invalidateUndoAfterExternalChange);
    },
    { immediate: true },
  );

  onBeforeUnmount(detachCanvasListeners);

  const uid = () => Math.random().toString(36).slice(2, 10);

  /** place a node somewhere sensible if the agent didn't give coordinates */
  function resolveXY(node: CanvasNodeSpec, usesParentCoordinates = false) {
    if (typeof node.x === "number" && typeof node.y === "number") {
      return { x: node.x, y: node.y };
    }

    if (usesParentCoordinates) {
      return {
        x: typeof node.x === "number" ? node.x : 0,
        y: typeof node.y === "number" ? node.y : 0,
      };
    }

    // 获取画布上所有元素的边界框
    const app = canvasApp.value;
    if (!app?.tree) {
      return getRandomCoordinates({ range: 1600 });
    }

    const existingBounds = Array.from(app.tree.children || [])
      .filter((child: any) => child.x !== undefined && child.y !== undefined)
      .map((child: any) => ({
        x: child.x,
        y: child.y,
        width: child.width || 400,
        height: child.height || 300,
      }));

    return getNonOverlappingCoordinates({
      range: 1600,
      existingBounds,
      newWidth: 400,
      newHeight: 300,
      margin: 50,
    });
  }

  function normalizeFill(value: any) {
    if (value && typeof value === "object" && "from" in value && "to" in value) {
      return {
        type: "linear",
        from: { type: "percent", x: 0, y: 0 },
        to: { type: "percent", x: 1, y: 1 },
        stops: [value.from, value.to],
      };
    }
    return value;
  }

  function buildNodePatch(rawPatch: Record<string, any>) {
    const patch: Record<string, any> = { ...rawPatch };
    delete patch.refId;
    delete patch.type;
    const gradient = patch.gradient;
    delete patch.gradient;
    if (gradient) {
      patch.fill = normalizeFill(gradient);
    } else if (patch.fill !== undefined) {
      patch.fill = normalizeFill(patch.fill);
    }
    return patch;
  }

  function findAgentFrame() {
    const app = canvasApp.value;
    if (!app?.tree?.children) return null;
    return Array.from(app.tree.children).find((child: any) => child.refId === "agent_frame");
  }

  /** Map one CanvasOp onto the leafer canvas. */
  function applyCanvasOp(op: CanvasOp) {
    const app = canvasApp.value;
    if (!app?.tree) return;

    applyingCanvasOp = true;
    try {
      switch (op.op) {
      case "set_frame": {
        runCanvasChanged = true;
        const existing = findAgentFrame() as any;
        const frameData = {
          x: existing?.x ?? 0,
          y: existing?.y ?? 0,
          width: op.width,
          height: op.height,
          fill: op.background ?? existing?.fill ?? "#ffffff",
          editable: true,
        };
        if (existing) {
          existing.set(frameData);
          trackNode(existing);
        } else {
          const frame = new Frame(frameData);
          (frame as any).refId = "agent_frame";
          app.tree.addAt(frame, 0);
          trackNode(frame);
        }
        recordHistory?.();
        break;
      }


      case "add_node": {
        runCanvasChanged = true;
        const n = op.node;
        const requestedParent = n.parentId ? nodeMap.get(n.parentId) : null;
        const fallbackParent = n.parentId && !requestedParent ? findAgentFrame() : null;
        const parent = resolveAgentCanvasParent(
          n.parentId,
          requestedParent,
          fallbackParent,
        );
        const { x, y } = resolveXY(n, Boolean(parent));
        let leaferNode: any = null;

        if (n.type === "image_gen") {
          leaferNode = new ImageGen({
            x,
            y,
            // Placeholder only — finished image uses naturalWidth/Height unless preserveLayout.
            width: n.width ?? 1024,
            height: n.height ?? 1024,
            prompt: n.prompt ?? "",
            model: n.model,
            size: n.size,
            quality: n.quality,
            aspectRatio: n.aspectRatio,
            generationStatus: "generating", // placeholder shows spinner immediately
            editable: true,
            images: (n as any).images || [],
            preserveGeneratedLayout: n.preserveLayout === true,
          });
          nodeStates.value[n.refId] = {
            refId: n.refId,
            type: "image",
            status: "generating",
          };
          leaferNode.on("property.change", () => {
            if (leaferNode.generationStatus === "error") {
              nodeStates.value[n.refId] = {
                refId: n.refId,
                type: "image",
                status: "error",
                error: leaferNode.errorMessage || "生成失败",
              };
            }
          });
        } else if (n.type === "video_gen") {
          leaferNode = new VideoGen({
            x,
            y,
            width: n.width ?? 480,
            height: n.height ?? 270,
            prompt: n.prompt ?? "",
            model: n.model,
            seconds: n.seconds,
            size: n.size,
            generationStatus: "generating",
            editable: true,
            inputReference: (n as any).inputReference || "",
          });
          nodeStates.value[n.refId] = {
            refId: n.refId,
            type: "video",
            status: "generating",
          };
          leaferNode.on("property.change", () => {
            if (leaferNode.generationStatus === "error") {
              nodeStates.value[n.refId] = {
                refId: n.refId,
                type: "video",
                status: "error",
                error: leaferNode.errorMessage || "生成失败",
              };
            }
          });
        } else if (n.type === "text") {
          leaferNode = new Text({
            x,
            y,
            width: n.width,
            text: n.text ?? "",
            fontSize: n.fontSize ?? 32,
            fontFamily: n.fontFamily,
            fill: normalizeFill(n.fill ?? "#111111"),
            fontWeight: n.fontWeight,
            textAlign: n.textAlign,
            lineHeight: n.lineHeight,
            letterSpacing: n.letterSpacing,
            opacity: n.opacity,
            editable: true,
          });
          nodeStates.value[n.refId] = {
            refId: n.refId,
            type: "text",
            status: "done",
          };
        } else if (n.type === "rect") {
          leaferNode = new Rect({
            x,
            y,
            width: n.width ?? 200,
            height: n.height ?? 200,
            fill: n.gradient ? normalizeFill(n.gradient) : normalizeFill(n.fill ?? "#cccccc"),
            opacity: n.opacity,
            cornerRadius: n.cornerRadius,
            stroke: n.stroke,
            strokeWidth: n.strokeWidth,
            editable: true,
          });
          nodeStates.value[n.refId] = {
            refId: n.refId,
            type: "rect",
            status: "done",
          };
        } else if (n.type === "frame") {
          leaferNode = new Frame({
            x,
            y,
            width: n.width ?? 800,
            height: n.height ?? 600,
            fill: n.fill ?? "#ffffff",
            flow: (n as any).flow,
            flowAlign: (n as any).flowAlign,
            flowWrap: (n as any).flowWrap,
            gap: (n as any).gap,
            padding: (n as any).padding,
            editable: true,
          });
          nodeStates.value[n.refId] = { refId: n.refId, type: "frame", status: "done" };

        } else if (n.type === "group") {
          // Group: a transparent container — no fill, auto-sizes to children
          leaferNode = new Group({
            x,
            y,
            rotation: n.rotation,
            scaleX: n.scaleX,
            scaleY: n.scaleY,
            opacity: n.opacity,
            zIndex: n.zIndex,
            editable: true,
          });
          nodeStates.value[n.refId] = { refId: n.refId, type: "group", status: "done" };

        } else if (n.type === "image") {
          // Static image from URL (also used as agent edit/upscale placeholder)
          leaferNode = createFitImage({
            x,
            y,
            width: n.width ?? 1024,
            height: n.height ?? 1024,
            url: n.url ?? "",
            cornerRadius: n.cornerRadius,
            opacity: n.opacity,
            rotation: n.rotation,
            zIndex: n.zIndex,
            editable: true,
          });
          // Agent edit/generate results should snap to natural pixels when ready.
          if (n.preserveLayout === true) {
            leaferNode.preserveGeneratedLayout = true;
          }
          if (typeof n.upscaleScale === "number" && n.upscaleScale > 1) {
            leaferNode.set({ upscaleScale: n.upscaleScale });
          }
          nodeStates.value[n.refId] = { refId: n.refId, type: "image", status: "done", url: n.url };
          leaferNode.on("property.change", () => {
            if (leaferNode.generationStatus === "generating") {
              nodeStates.value[n.refId] = {
                refId: n.refId,
                type: "image",
                status: "generating",
                url: leaferNode.url,
              };
            } else if (leaferNode.url) {
              nodeStates.value[n.refId] = {
                refId: n.refId,
                type: "image",
                status: "done",
                url: leaferNode.url,
              };
            }
          });
        }

        if (leaferNode) {
          (leaferNode as any).refId = n.refId;
          trackNode(leaferNode);

          if (parent) {
            parent.add(leaferNode);
          } else {
            app.tree.add(leaferNode);
          }

          const now = Date.now();
          if (now - lastAgentRippleAt > 500) {
            onAgentPlace?.(x, y);
            lastAgentRippleAt = now;
          }

          recordHistory?.();
        }
        break;
      }

      case "generation_started": {
        // The agent backend already kicked off generation and owns the taskId.
        // Attach it to the placeholder node and fire `task-start` so useCanvas
        // picks up its EXISTING polling pipeline (poll -> swap to Image/VideoNode).
        if (settledGenerationTaskIds.has(op.taskId)) break;
        const node = nodeMap.get(op.refId);
        if (node) {
          node.set({
            taskId: op.taskId,
            generationStatus: "generating",
            ...(op.generationType ? { generationType: op.generationType } : {}),
          });
          node.emit("task-start", { bubbles: true });
        }
        if (nodeStates.value[op.refId]) {
          nodeStates.value[op.refId].status = "generating";
        } else {
          nodeStates.value[op.refId] = {
            refId: op.refId,
            type: op.kind,
            status: "generating",
          };
        }
        break;
      }

      case "update_node": {
        const node = nodeMap.get(op.refId);
        if (node) {
          runCanvasChanged = true;
          const patch = buildNodePatch((op.patch ?? {}) as any);
          node.set(patch);
          trackNode(node);
          recordHistory?.();
        }
        break;
      }


      case "remove_node": {
        const node = nodeMap.get(op.refId);
        if (node) {
          runCanvasChanged = true;
          node.remove();
          nodeMap.delete(op.refId);
          delete nodeStates.value[op.refId];
          recordHistory?.();
        }
        break;
      }

      case "focus_node": {
        // Agent operations never take over the camera. Users can focus the
        // referenced result explicitly from the conversation UI.
        break;
      }

      case "export_node": {
        const node = nodeMap.get(op.refId);
        if (node) {
          if (typeof node.export === "function") {
            node.export("png").then((res: any) => {
              if (res && res.data) {
                fetch(`${AGENT_BASE_URL}/agent/export-result`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  signal: AbortSignal.timeout(10000),
                  body: JSON.stringify({
                    requestId: op.requestId,
                    imageBase64: res.data,
                  }),
                }).catch((err) => {
                  console.error("Failed to upload export-result:", err);
                });
              } else {
                console.error("Node export returned empty data:", res);
              }
            }).catch((err: any) => {
              console.error("Failed to export node:", err);
            });
          } else {
            console.error("Node export is not a function", node);
          }
        } else {
          console.error("export_node node not found for refId:", op.refId);
        }
        break;
      }
    }
    } finally {
      applyingCanvasOp = false;
    }
  }

  const assistantTextFilters = new WeakMap<
    object,
    ReturnType<typeof createHiddenReasoningStreamFilter>
  >();

  const filterAssistantChunk = (assistant: ChatMessage, chunk: string) => {
    let filter = assistantTextFilters.get(assistant);
    if (!filter) {
      filter = createHiddenReasoningStreamFilter();
      assistantTextFilters.set(assistant, filter);
    }
    return filter.push(chunk);
  };

  const flushAssistantFilter = (assistant: ChatMessage) => {
    const filter = assistantTextFilters.get(assistant);
    if (!filter) return "";
    assistantTextFilters.delete(assistant);
    return filter.flush();
  };

  const appendLiveText = (assistant: ChatMessage, chunk: string) => {
    if (!chunk) return;
    assistant.liveText = `${assistant.liveText || ""}${chunk}`;
  };

  const flushLiveUpdate = (assistant: ChatMessage) => {
    const text = stripInternalToolErrors(assistant.liveText || "").trim();
    assistant.liveText = "";
    if (!text) return;
    assistant.blocks ||= [];
    const lastBlock = assistant.blocks[assistant.blocks.length - 1];
    if (lastBlock?.type === "update" && lastBlock.text.trim() === text) return;
    assistant.blocks.push({
      id: `blk_update_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "update",
      text,
    });
  };

  const setFinalText = (assistant: ChatMessage, text: string) => {
    const finalText = stripInternalToolErrors(text).trim();
    if (!finalText) return;
    assistant.text = finalText;
    assistant.liveText = "";
    assistant.blocks ||= [];
    assistant.blocks.push({
      id: `blk_final_${Date.now()}`,
      type: "text",
      text: finalText,
    });
  };

  function updatePlanFromTool(
    assistant: ChatMessage,
    tool: string,
    input: any,
    completed: boolean,
    failed = false,
  ) {
    updateAgentPlanFromTool(assistant.plan, tool, input, completed, failed);
  }

  /** Handle one decoded AgentEvent from the SSE stream. */
  function handleEvent(ev: any, assistant: ChatMessage) {
    if (!assistant.blocks) {
      assistant.blocks = [];
    }
    const blocks = assistant.blocks;

    switch (ev.type) {
      case "thinking": {
        const chunk = filterAssistantChunk(assistant, ev.text || "");
        if (!chunk) break;
        appendLiveText(assistant, chunk);
        break;
      }
      case "progress":
        assistant.progress = {
          tool: ev.tool,
          message: stripHiddenReasoning(String(ev.message || "正在处理…")),
          percent: typeof ev.percent === "number" ? ev.percent : undefined,
        };
        break;
      case "plan": {
        const nextPlan: AgentPlan = {
          ...ev.plan,
          steps: Array.isArray(ev.plan?.steps)
            ? ev.plan.steps.map((step: AgentPlanStep) => ({ ...step }))
            : [],
        };
        assistant.plan = nextPlan;
        blocks.push({
          id: `blk_plan_${nextPlan.id}_${Date.now()}`,
          type: "plan",
          plan: nextPlan,
        });
        break;
      }
      case "tool_call": {
        flushLiveUpdate(assistant);
        const toolItem: ToolCallItem = {
          id: ev.id,
          name: ev.tool,
          done: false,
          input: ev.input,
        };
        assistant.tools.push(toolItem);
        updatePlanFromTool(assistant, ev.tool, ev.input, false);

        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock && lastBlock.type === "tools") {
          lastBlock.tools.push(toolItem);
        } else {
          blocks.push({
            id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: "tools",
            tools: [toolItem],
          });
        }
        break;
      }
      case "tool_result": {
        const billingError = String(ev.output?.error || "");
        if (billingError.includes("积分不足") || billingError.includes("INSUFFICIENT_CREDITS")) {
          window.dispatchEvent(new CustomEvent("omnicanvas:payment-required", {
            detail: ev.output,
          }));
        }
        const failed = Boolean(
          ev.output?.error ||
            ev.output?.status === "error" ||
            ev.output?.status === "failed",
        );
        const chip = assistant.tools.find((t) => t.id === ev.id);
        if (chip) {
          chip.done = true;
          chip.output = ev.output;
          updatePlanFromTool(assistant, ev.tool, chip.input, true, failed);
        }
        for (const blk of blocks) {
          if (blk.type === "tools") {
            const item = blk.tools.find((t) => t.id === ev.id);
            if (item) {
              item.done = true;
              item.output = ev.output;
            }
          }
        }
        const rawOutput = unwrapToolOutput(ev.output);
        const refId = typeof rawOutput?.refId === "string" ? rawOutput.refId : "";
        const terminalState = deriveTerminalMediaNodeState(
          ev.tool,
          ev.output,
          refId ? nodeStates.value[refId] : undefined,
        );
        if (terminalState) {
          if (typeof rawOutput?.taskId === "string") {
            settledGenerationTaskIds.add(rawOutput.taskId);
          }
          nodeStates.value[terminalState.refId] = terminalState;
        }
        break;
      }
      case "canvas_op":
        applyCanvasOp(ev.op as CanvasOp);
        break;
      case "final": {
        const tail = flushAssistantFilter(assistant);
        appendLiveText(assistant, tail);
        setFinalText(assistant, ev.text || assistant.liveText || "");
        assistant.progress = undefined;
        assistant.runStatus = "completed";
        break;
      }
      case "usage":
        if (Number.isFinite(ev.elapsedMs)) assistant.elapsedMs = ev.elapsedMs;
        break;
      case "error": {
        if (!isInternalToolError(ev.message)) {
          const raw = String(ev.message ?? "");
          if (raw.includes("积分不足") || raw.includes("INSUFFICIENT_CREDITS")) {
            window.dispatchEvent(new CustomEvent("omnicanvas:payment-required", {
              detail: { error: raw },
            }));
          }
          const friendly =
            raw.includes("insufficient_quota") || raw.includes("insufficient quota")
              ? "渠道额度不足，请在管理后台充值或更换渠道"
              : raw.includes("AI_NoOutputGenerated") || raw.includes("No output generated")
                ? "模型未返回内容，请检查渠道配置或稍后重试"
                : raw.includes("API_KEY") || raw.includes("Unauthorized") || raw.includes("401")
                  ? "API Key 无效，请检查渠道配置"
                  : raw || "服务发生异常，请稍后再试。";
          assistant.error = friendly;
        }
        assistant.runStatus = "failed";
        break;
      }
    }
  }

  async function materializeAgentAssets(
    attachments: Array<AgentAttachmentInput | string>,
  ): Promise<AgentAssetPayload[]> {
    return Promise.all(
      attachments.map(async (attachment, index) => {
        if (typeof attachment === "string") {
          if (/^https?:\/\//i.test(attachment)) {
            return {
              id: `asset_retry_${Date.now()}_${index}`,
              url: attachment,
              name: `reference-${index + 1}`,
              mimeType: "image/png",
            };
          }
          const file = await dataUrlToFile(attachment, `reference-${index + 1}.png`);
          const uploaded = await uploadImage(file);
          return {
            id: `asset_retry_${Date.now()}_${index}`,
            url: uploaded.imageUrl,
            name: file.name,
            mimeType: file.type,
            size: file.size,
          };
        }

        let url = attachment.url;
        if (!url) {
          const file = attachment.file;
          if (!file) throw new Error(`素材 ${attachment.name} 缺少原始文件`);
          const uploaded = await uploadImage(file);
          url = uploaded.imageUrl;
        }

        return {
          id: attachment.id,
          url,
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          width: attachment.width,
          height: attachment.height,
        };
      }),
    );
  }

  /** Send a message and stream the agent's response. */
  async function send(
    input: string,
    attachments?: Array<AgentAttachmentInput | string>,
  ) {
    const text = input.trim();
    if ((!text && (!attachments || attachments.length === 0)) || running.value) return;

    canUndoLastRun.value = false;
    runCanvasChanged = false;
    historyControls?.begin?.();

    const userMessage: ChatMessage = {
      id: uid(),
      role: "user",
      text,
      tools: [],
      streaming: false,
      images: attachments?.map((attachment) =>
        typeof attachment === "string" ? attachment : attachment.previewUrl,
      ),
    };
    messages.value.push(userMessage);
    const runStartedAt = Date.now();
    const assistant = reactive<ChatMessage>({
      id: uid(),
      role: "assistant",
      text: "",
      tools: [],
      blocks: [],
      liveText: "",
      streaming: true,
      runStatus: "running",
    });
    messages.value.push(assistant);
    running.value = true;
    abort = new AbortController();



    try {
      if (attachments?.length) {
        assistant.progress = { message: "正在上传原始素材" };
      }
      const assets = await materializeAgentAssets(attachments || []);
      if (assets.length > 0) userMessage.images = assets.map((asset) => asset.url);
      assistant.progress = { message: "正在思考" };
      const token = localStorage.getItem("omnicanvas_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Idempotency-Key": safeRandomId(),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(
        `${AGENT_BASE_URL}/agent/${sessionId.value}/chat`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: text,
            assets,
            canvasState: serializeCanvasForAgent(canvasApp.value, {
              ensureRefId: ensureNodeRefId,
            }),
          }),
          signal: abort.signal,
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        if (res.status === 402) {
          window.dispatchEvent(new CustomEvent("omnicanvas:payment-required", {
            detail: payload,
          }));
        }
        throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("Agent response stream is unavailable");

      // parse the SSE stream (data: {...}\n\n)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      streamLoop: while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const cleanBuffer = buffer.replace(/\r/g, "");
        const lines = cleanBuffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete line
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const json = trimmed.slice(5).trim();
          if (!json) continue;
          let ev: any;
          try {
            ev = JSON.parse(json);
          } catch {
            continue;
          }
          if (ev.type === "done") {
            const tail = flushAssistantFilter(assistant);
            appendLiveText(assistant, tail);
            if (!assistant.text.trim() && assistant.liveText?.trim()) {
              setFinalText(assistant, assistant.liveText);
            }
            assistant.streaming = false;
            if (assistant.runStatus === "running") {
              assistant.runStatus = assistant.error ? "failed" : "completed";
            }
            break streamLoop;
          }
          handleEvent(ev, assistant);
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        assistant.error = e?.message ?? "连接失败，请稍后重试";
        assistant.runStatus = "failed";
      } else {
        assistant.runStatus = "stopped";
      }
    } finally {
      const committed = historyControls?.commit?.() ?? runCanvasChanged;
      canUndoLastRun.value =
        runCanvasChanged && committed !== false && !!historyControls?.undo;
      assistant.elapsedMs ??= Date.now() - runStartedAt;
      assistant.streaming = false;
      running.value = false;
      abort = null;
    }
  }

  function stop() {
    abort?.abort();
    if (sessionId.value) {
      stopAgent(sessionId.value).catch(() => {});
    }
    const assistant = messages.value[messages.value.length - 1];
    if (assistant && assistant.role === "assistant" && assistant.streaming) {
      assistant.streaming = false;
      assistant.runStatus = "stopped";
    }
  }

  function undoLastRun() {
    if (!canUndoLastRun.value) return;
    historyControls?.undo?.();
    canUndoLastRun.value = false;
  }

  function reset() {
    stop();
    messages.value = [];
    nodeMap.clear();
    nodeStates.value = {};
    settledGenerationTaskIds.clear();
    const app = canvasApp.value;
    if (app?.tree?.children) {
      app.tree.children.forEach(scanTreeAndPopulateNodeMap);
    }
    // best-effort clear server-side history
    deleteAgentSession(sessionId.value).catch(() => {});
  }

  function zoomToNode(
    refId?: string,
    options: { force?: boolean; select?: boolean } = {},
  ) {
    const app = canvasApp.value;
    if (!app?.tree) return;
    if (
      !options.force &&
      Date.now() - lastUserViewportInteractionAt < 2500
    ) {
      return;
    }

    let node: any = null;
    if (refId) {
      node = nodeMap.get(refId);
      if (!node) {
        app.tree.find((child: any) => {
          if (child.refId === refId || child.id === refId) {
            node = child;
            return true;
          }
          return false;
        });
      }
    } else {
      node = findAgentFrame();
    }

    if (node) {
      try {
        const agentFrame = findAgentFrame();
        if (options.select !== false && app.editor && node !== agentFrame) {
          app.editor.select(node);
        }

        const canvasRect = (app.view as HTMLElement)?.getBoundingClientRect?.();
        const panelRect = (
          document.querySelector(".agent-panel") as HTMLElement | null
        )?.getBoundingClientRect();
        const panelOverlapsCanvas =
          !!canvasRect &&
          !!panelRect &&
          panelRect.width > 0 &&
          panelRect.left < canvasRect.right &&
          panelRect.right > canvasRect.left;
        const rightPadding = panelOverlapsCanvas
          ? Math.min(panelRect!.width + 24, Math.max(64, canvasRect!.width * 0.42))
          : 64;

        (app.tree as any).zoom(
          node,
          [64, rightPadding, 64, 64],
          undefined,
          0.45,
        );
      } catch (err) {
        console.warn("Failed to zoom to node:", err);
      }
    }
  }


  function retryLastMessage() {
    if (running.value) return;
    // Find the last user message
    const lastUserMsgIndex = [...messages.value].reverse().findIndex((m) => m.role === "user");
    if (lastUserMsgIndex !== -1) {
      const realIndex = messages.value.length - 1 - lastUserMsgIndex;
      const lastUserMsg = messages.value[realIndex];
      // Remove any assistant message following it
      if (messages.value.length > realIndex + 1) {
        messages.value.splice(realIndex + 1);
      }
      const textToSend = lastUserMsg.text;
      const imagesToSend = lastUserMsg.images;
      // Remove user message so send() can re-append cleanly
      messages.value.splice(realIndex, 1);
      send(textToSend, imagesToSend);
    }
  }

  return {
    messages,
    running,
    canUndoLastRun,
    loadingHistory,
    send,
    retryLastMessage,
    stop,
    undoLastRun,
    reset,
    sessionId,
    nodeStates,
    zoomToNode,
  };
}
