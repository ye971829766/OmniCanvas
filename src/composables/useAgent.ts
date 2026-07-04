import { ref, watch, type Ref, reactive } from "vue";
import { Text, Rect, Frame, Group, Image } from "leafer-ui";
import { ImageGen } from "@/components/canvas/nodes/ImageGen";
import { VideoGen } from "@/components/canvas/nodes/VideoGen";
import { getRandomCoordinates, getNonOverlappingCoordinates } from "@/utils/utils";
import { getAgentHistory, deleteAgentSession, stopAgent } from "@/utils/api";

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
  | { id: string; type: "text"; text: string }
  | { id: string; type: "tools"; tools: ToolCallItem[] };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** streamed reasoning / final text */
  text: string;
  /** tool calls shown as chips under the bubble */
  tools: ToolCallItem[];
  /** chronological stream blocks */
  blocks?: MessageBlock[];
  streaming: boolean;
  images?: string[];
  /** Optional error text when message encountered error */
  error?: string;
  /** Optional timestamp string e.g. Jun 15, 2026 */
  timestamp?: string;
}

type CanvasNodeSpec = {
  refId: string;
  type: "image_gen" | "video_gen" | "text" | "rect" | "frame";
  parentId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
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
  return text
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

function parseHistoryMessage(
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
          text = part.text || "";
        } else if (part.type === "image_url" && part.image_url?.url) {
          images.push(part.image_url.url);
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
    const text = stripInternalToolErrors(msg.content || "");
    const tools: { id: string; name: string; done: boolean; input?: any; output?: any }[] = [];
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
    const blocks: MessageBlock[] = [];
    if (tools.length > 0) {
      if (text) blocks.push({ id: `${id}-txt`, type: "text", text });
      blocks.push({ id: `${id}-tls`, type: "tools", tools });
    } else if (text) {
      blocks.push({ id: `${id}-txt`, type: "text", text });
    }

    return {
      id,
      role: "assistant",
      text,
      tools,
      blocks,
      streaming: false,
    };
  }

  return null;
}

export function useAgent(
  canvasApp: Ref<any>,
  recordHistory?: () => void,
  activeWorkspaceIdRef?: Ref<string | number | null>,
  /** Called after each agent-placed node so the background can show a ripple */
  onAgentPlace?: (worldX: number, worldY: number) => void,
) {
  const messages = ref<ChatMessage[]>([]);
  const running = ref(false);
  const loadingHistory = ref(false);
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
  let abort: AbortController | null = null;
  let localRefSeq = 1;

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
      const rawHistory = await getAgentHistory(sessionId.value);
      if (Array.isArray(rawHistory)) {
        const parsed: ChatMessage[] = [];
        rawHistory.forEach((msg, idx) => {
          const parsedMsg = parseHistoryMessage(msg, idx, rawHistory);
          if (parsedMsg) {
            if (parsedMsg.role === "assistant" && parsed.length > 0 && parsed[parsed.length - 1].role === "assistant") {
              const last = parsed[parsed.length - 1];
              if (parsedMsg.text) {
                if (last.text) {
                  last.text += "\n\n" + parsedMsg.text;
                } else {
                  last.text = parsedMsg.text;
                }
              }
              if (parsedMsg.tools && parsedMsg.tools.length > 0) {
                last.tools.push(...parsedMsg.tools);
              }
              // Rebuild blocks from merged state so rendering stays consistent
              const rebuiltBlocks: typeof last.blocks = [];
              if (last.tools.length > 0) {
                if (last.text) rebuiltBlocks.push({ id: `${last.id}-txt`, type: "text", text: last.text });
                rebuiltBlocks.push({ id: `${last.id}-tls`, type: "tools", tools: last.tools });
              } else if (last.text) {
                rebuiltBlocks.push({ id: `${last.id}-txt`, type: "text", text: last.text });
              }
              last.blocks = rebuiltBlocks;
            } else {
              parsed.push(parsedMsg);
            }
          }
        });
        messages.value = parsed;
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
        app.tree.children.forEach(scanTreeAndPopulateNodeMap);
      }
    },
    { immediate: true },
  );

  // Listen to child.add on app.tree globally to update nodeMap and nodeStates
  watch(
    () => canvasApp.value,
    (app) => {
      if (app?.tree) {
        app.tree.on("child.add", (e: any) => {
          const child = e.child;
          trackNode(child);
        });
      }
    },
    { immediate: true },
  );

  const uid = () => Math.random().toString(36).slice(2, 10);

  /** place a node somewhere sensible if the agent didn't give coordinates */
  function resolveXY(node: CanvasNodeSpec) {
    if (typeof node.x === "number" && typeof node.y === "number") {
      return { x: node.x, y: node.y };
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

    switch (op.op) {
      case "set_frame": {
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
        setTimeout(() => {
          zoomToNode("agent_frame");
        }, 80);
        break;
      }


      case "add_node": {
        const n = op.node;
        const { x, y } = resolveXY(n);
        let leaferNode: any = null;

        if (n.type === "image_gen") {
          leaferNode = new ImageGen({
            x,
            y,
            width: n.width ?? 400,
            height: n.height ?? 400,
            prompt: n.prompt ?? "",
            model: n.model,
            size: n.size,
            quality: n.quality,
            aspectRatio: n.aspectRatio,
            generationStatus: "generating", // placeholder shows spinner immediately
            editable: true,
            images: (n as any).images || [],
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
          // Static image from URL
          leaferNode = new Image({
            x,
            y,
            width: n.width ?? 400,
            height: n.height ?? 300,
            url: n.url ?? "",
            cornerRadius: n.cornerRadius,
            opacity: n.opacity,
            rotation: n.rotation,
            zIndex: n.zIndex,
            editable: true,
          });
          nodeStates.value[n.refId] = { refId: n.refId, type: "image", status: "done", url: n.url };
        }

        if (leaferNode) {
          (leaferNode as any).refId = n.refId;
          trackNode(leaferNode);

          let parent: any = null;
          if (n.parentId) {
            parent = nodeMap.get(n.parentId);
            // 如果 agent 明确指定了 parentId 但没找到，回退到 agent_frame
            if (!parent) {
              parent = findAgentFrame();
            }
          }
          // 如果 agent 没有传 parentId，表示想放在根画布，不要自动查找 frame

          if (parent) {
            parent.add(leaferNode);
          } else {
            app.tree.add(leaferNode);
          }

          // Notify caller so it can play a background ripple at the drop point
          onAgentPlace?.(x, y);

          setTimeout(() => {
            zoomToNode(n.refId);
          }, 80);

          recordHistory?.();
        }
        break;
      }

      case "generation_started": {
        // The agent backend already kicked off generation and owns the taskId.
        // Attach it to the placeholder node and fire `task-start` so useCanvas
        // picks up its EXISTING polling pipeline (poll -> swap to Image/VideoNode).
        const node = nodeMap.get(op.refId);
        if (node) {
          node.set({ taskId: op.taskId, generationStatus: "generating" });
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
          const patch = buildNodePatch((op.patch ?? {}) as any);
          node.set(patch);
          trackNode(node);
          recordHistory?.();
          setTimeout(() => {
            zoomToNode(op.refId);
          }, 80);
        }
        break;
      }


      case "remove_node": {
        const node = nodeMap.get(op.refId);
        if (node) {
          node.remove();
          nodeMap.delete(op.refId);
          delete nodeStates.value[op.refId];
          recordHistory?.();
        }
        break;
      }

      case "focus_node": {
        zoomToNode(op.refId);
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
  }

  /** Handle one decoded AgentEvent from the SSE stream. */
  function handleEvent(ev: any, assistant: ChatMessage) {
    if (!assistant.blocks) {
      assistant.blocks = [];
    }
    const blocks = assistant.blocks;

    switch (ev.type) {
      case "thinking": {
        const chunk = ev.text || "";
        assistant.text += chunk;

        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock && lastBlock.type === "text") {
          lastBlock.text += chunk;
        } else {
          blocks.push({
            id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: "text",
            text: chunk,
          });
        }
        break;
      }
      case "progress":
        break;
      case "tool_call": {
        const toolItem: ToolCallItem = {
          id: ev.id,
          name: ev.tool,
          done: false,
          input: ev.input,
        };
        assistant.tools.push(toolItem);

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
        const chip = assistant.tools.find((t) => t.id === ev.id);
        if (chip) {
          chip.done = true;
          chip.output = ev.output;
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
        break;
      }
      case "canvas_op":
        applyCanvasOp(ev.op as CanvasOp);
        break;
      case "final": {
        const finalText = stripInternalToolErrors(ev.text ?? "");
        if (!assistant.text.trim()) {
          assistant.text = finalText;
        }
        if (!blocks.some((b) => b.type === "text" && b.text.trim())) {
          blocks.unshift({
            id: `blk_final_${Date.now()}`,
            type: "text",
            text: finalText,
          });
        }
        break;
      }
      case "error": {
        if (!isInternalToolError(ev.message)) {
          const raw = String(ev.message ?? "");
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
        break;
      }
    }
  }

  /** 序列化当前画布状态，供 Agent 感知画布全貌 */
  function serializeCanvasForAgent(): any[] {
    const app = canvasApp.value;
    if (!app?.tree) return [];
    
    if (app.tree.children) {
      app.tree.children.forEach(scanTreeAndPopulateNodeMap);
    }

    const serializedList: any[] = [];

    function serializeNode(node: any, parentNode?: any) {
      if (!node) return;
      if (node === app.tree) {
        if (node.children) {
          node.children.forEach((child: any) => serializeNode(child, node));
        }
        return;
      }

      const tag = node.__tag || node.tag;
      if (tag === "SimulateElement") return;

      const base: any = {
        tag,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      };
      base.refId = ensureNodeRefId(node);
      
      if (parentNode && parentNode !== app.tree) {
        base.parentId = parentNode.refId;
      }

      // Serialize all relevant Leafer properties per node type
      if (tag === "Text") {
        base.text = node.text;
        base.fontSize = node.fontSize;
        base.fontFamily = node.fontFamily;
        base.fill = node.fill;
        base.fontWeight = node.fontWeight;
        base.textAlign = node.textAlign;
        base.lineHeight = node.lineHeight;
        base.letterSpacing = node.letterSpacing;
        base.stroke = node.stroke;
        base.strokeWidth = node.strokeWidth;
      } else if (tag === "Image") {
        base.url = node.url;
        base.cornerRadius = node.cornerRadius;
      } else if (tag === "ImageGen") {
        base.prompt = node.prompt;
        base.model = node.model;
        base.size = node.size;
        base.quality = node.quality;
        base.aspectRatio = node.aspectRatio;
        base.generationStatus = node.generationStatus;
        base.images = node.images;
      } else if (tag === "VideoGen") {
        base.prompt = node.prompt;
        base.model = node.model;
        base.seconds = node.seconds;
        base.size = node.size;
        base.generationStatus = node.generationStatus;
        base.inputReference = node.inputReference;
      } else if (tag === "VideoNode") {
        base.videoUrl = node.videoUrl;
        base.thumbnailUrl = node.thumbnailUrl;
      } else if (tag === "Rect") {
        base.fill = node.fill;
        base.cornerRadius = node.cornerRadius;
        base.stroke = node.stroke;
        base.strokeWidth = node.strokeWidth;
        if (node.shadow) base.shadow = node.shadow;
      } else if (tag === "Ellipse" || tag === "Polygon" || tag === "Star") {
        base.fill = node.fill;
        base.stroke = node.stroke;
      } else if (tag === "Frame") {
        base.fill = node.fill;
        base.flow = node.flow;
        base.flowAlign = node.flowAlign;
        base.flowWrap = node.flowWrap;
        base.gap = node.gap;
        base.padding = node.padding;
        base.type = "frame";
      } else if (tag === "Group") {
        base.type = "group";
      }

      // Common visual props — always include when non-default
      if (node.opacity !== undefined && node.opacity !== 1) base.opacity = node.opacity;
      if (node.rotation) base.rotation = node.rotation;
      if (node.scaleX !== undefined && node.scaleX !== 1) base.scaleX = node.scaleX;
      if (node.scaleY !== undefined && node.scaleY !== 1) base.scaleY = node.scaleY;
      if (node.zIndex) base.zIndex = node.zIndex;
      if (node.shadow && tag !== "Rect") base.shadow = node.shadow; // Rect handled above

      serializedList.push(base);

      const isContainer = tag === "Frame" || tag === "Group";
      if (isContainer && node.children) {
        node.children.forEach((child: any) => serializeNode(child, node));
      }
    }

    serializeNode(app.tree);
    return serializedList;
  }

  /** Send a message and stream the agent's response. */
  async function send(input: string, attachments?: string[]) {
    const text = input.trim();
    if ((!text && (!attachments || attachments.length === 0)) || running.value) return;

    messages.value.push({
      id: uid(),
      role: "user",
      text,
      tools: [],
      streaming: false,
      images: attachments ? [...attachments] : undefined,
    });
    const assistant = reactive<ChatMessage>({
      id: uid(),
      role: "assistant",
      text: "",
      tools: [],
      streaming: true,
    });
    messages.value.push(assistant);
    running.value = true;
    abort = new AbortController();



    try {

      const res = await fetch(
        `${AGENT_BASE_URL}/agent/${sessionId.value}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            images: attachments,
            canvasState: serializeCanvasForAgent(),
          }),
          signal: abort.signal,
        },
      );
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      // parse the SSE stream (data: {...}\n\n)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
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
            assistant.streaming = false;
            return;
          }
          handleEvent(ev, assistant);
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        assistant.text += `\n\n⚠️ 连接失败: ${e?.message ?? e}`;
      }
    } finally {
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
    }
    running.value = false;
  }

  function reset() {
    stop();
    messages.value = [];
    nodeMap.clear();
    nodeStates.value = {};
    const app = canvasApp.value;
    if (app?.tree?.children) {
      app.tree.children.forEach(scanTreeAndPopulateNodeMap);
    }
    // best-effort clear server-side history
    deleteAgentSession(sessionId.value).catch(() => {});
  }

  function zoomToNode(refId?: string) {
    const app = canvasApp.value;
    if (!app?.tree) return;
    let node: any = null;
    if (refId) {
      node = nodeMap.get(refId);
    }
    if (!node) {
      node = findAgentFrame();
    }
    if (!node && refId) {
      app.tree.find((child: any) => {
        if (child.refId === refId || child.id === refId) {
          node = child;
          return true;
        }
        return false;
      });
    }

    if (node) {
      try {
        const agentFrame = findAgentFrame();
        if (app.editor && node !== agentFrame) {
          app.editor.select(node);
        }
        // [top, right, bottom, left] padding: 420px on right leaves room for 380px Agent Panel
        (app.tree as any).zoom(node, [80, 420, 80, 80], undefined, 0.85);
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
    loadingHistory,
    send,
    retryLastMessage,
    stop,
    reset,
    sessionId,
    nodeStates,
    zoomToNode,
  };
}

