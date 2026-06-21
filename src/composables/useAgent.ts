import { ref, shallowRef, watch, type Ref, reactive } from "vue";
import { Text, Rect } from "leafer-ui";
import { ImageGen } from "@/components/canvas/nodes/ImageGen";
import { VideoGen } from "@/components/canvas/nodes/VideoGen";
import { getRandomCoordinates, getNonOverlappingCoordinates } from "@/utils/utils";

/**
 * useAgent — drives the Lovart-style chat panel.
 *
 * Opens an SSE stream to the agent backend (POST /agent/:sessionId/chat) and
 * maps each `canvas_op` onto your existing leafer canvas. For images/videos it
 * REUSES your ImageGen/VideoGen nodes + the `task-start` polling pipeline in
 * useCanvas, so the agent's generations behave exactly like manual ones.
 */

import { API_BASE_URL as AGENT_BASE_URL } from "@/config";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** streamed reasoning / final text */
  text: string;
  /** tool calls shown as chips under the bubble */
  tools: { id: string; name: string; done: boolean }[];
  streaming: boolean;
  images?: string[];
}

type CanvasNodeSpec = {
  refId: string;
  type: "image_gen" | "video_gen" | "text" | "rect";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  prompt?: string;
  model?: string;
  size?: string;
  aspectRatio?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  cornerRadius?: number;
  stroke?: string;
  strokeWidth?: number;
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
    };

export interface NodeState {
  refId: string;
  type: "image" | "video" | "text" | "rect" | string;
  status: "generating" | "done" | "error";
  url?: string;
  thumbnailUrl?: string;
  error?: string;
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
    const text = msg.content || "";
    const tools: { id: string; name: string; done: boolean }[] = [];
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        const toolCallId = tc.id;
        const isDone = allMessages.some(
          (m) => m.role === "tool" && m.tool_call_id === toolCallId
        );
        tools.push({
          id: toolCallId,
          name: tc.function?.name || "",
          done: isDone,
        });
      }
    }
    return {
      id,
      role: "assistant",
      text,
      tools,
      streaming: false,
    };
  }

  return null;
}

export function useAgent(
  canvasApp: Ref<any>,
  recordHistory?: () => void,
  activeWorkspaceIdRef?: Ref<string | number | null>,
) {
  const messages = ref<ChatMessage[]>([]);
  const running = ref(false);
  const sessionId = shallowRef("");

  // refId -> leafer node, so update_node / generation_started can find nodes
  const nodeMap = new Map<string, any>();
  const nodeStates = ref<Record<string, NodeState>>({});
  let abort: AbortController | null = null;

  const scanTreeAndPopulateNodeMap = (node: any) => {
    if (node && node.refId) {
      nodeMap.set(node.refId, node);
      const tag = node.tag || node.__tag;
      if (tag === "Image") {
        nodeStates.value[node.refId] = {
          refId: node.refId,
          type: "image",
          status: "done",
          url: node.url,
        };
      } else if (tag === "VideoNode") {
        nodeStates.value[node.refId] = {
          refId: node.refId,
          type: "video",
          status: "done",
          url: node.videoUrl,
          thumbnailUrl: node.thumbnailUrl,
        };
      }
    }
    if (node.children) {
      node.children.forEach(scanTreeAndPopulateNodeMap);
    }
  };

  // Watch active workspace ID to reload history and sessionId
  watch(
    () => activeWorkspaceIdRef?.value,
    async (newId) => {
      if (newId) {
        sessionId.value = String(newId);
        messages.value = [];
        nodeMap.clear();
        nodeStates.value = {};

        // Sync nodeMap with current tree
        const app = canvasApp.value;
        if (app?.tree?.children) {
          app.tree.children.forEach(scanTreeAndPopulateNodeMap);
        }

        try {
          const res = await fetch(`${AGENT_BASE_URL}/agent/${sessionId.value}/history`);
          if (res.ok) {
            const rawHistory = await res.json();
            if (Array.isArray(rawHistory)) {
              const parsed: ChatMessage[] = [];
              rawHistory.forEach((msg, idx) => {
                const parsedMsg = parseHistoryMessage(msg, idx, rawHistory);
                if (parsedMsg) {
                  parsed.push(parsedMsg);
                }
              });
              messages.value = parsed;
            }
          }
        } catch (err) {
          console.error("Failed to load agent chat history:", err);
        }
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
          if (child && child.refId) {
            nodeMap.set(child.refId, child);
            const tag = child.tag || child.__tag;
            if (tag === "Image") {
              nodeStates.value[child.refId] = {
                refId: child.refId,
                type: "image",
                status: "done",
                url: child.url,
              };
            } else if (tag === "VideoNode") {
              nodeStates.value[child.refId] = {
                refId: child.refId,
                type: "video",
                status: "done",
                url: child.videoUrl,
                thumbnailUrl: child.thumbnailUrl,
              };
            }
          }
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

  /** Map one CanvasOp onto the leafer canvas. */
  function applyCanvasOp(op: CanvasOp) {
    const app = canvasApp.value;
    if (!app?.tree) return;

    switch (op.op) {
      case "set_frame": {
        // we don't force an artboard; just remember intent for placement.
        // (Your canvas is infinite; a Frame node could be added here if desired.)
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
            size: n.size,
            aspectRatio: n.aspectRatio,
            generationStatus: "generating", // placeholder shows spinner immediately
            editable: true,
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
            size: n.size,
            generationStatus: "generating",
            editable: true,
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
            fill: n.fill ?? "#111111",
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
            fill: n.fill ?? "#cccccc",
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
        }

        if (leaferNode) {
          (leaferNode as any).refId = n.refId;
          nodeMap.set(n.refId, leaferNode);
          app.tree.add(leaferNode);
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
          const { refId, type, ...patch } = op.patch as any;
          node.set(patch);
          recordHistory?.();
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
    }
  }

  /** Handle one decoded AgentEvent from the SSE stream. */
  function handleEvent(ev: any, assistant: ChatMessage) {
    switch (ev.type) {
      case "thinking":
        assistant.text += ev.text;
        break;
      case "tool_call":
        assistant.tools.push({ id: ev.id, name: ev.tool, done: false });
        break;
      case "tool_result": {
        const chip = assistant.tools.find((t) => t.id === ev.id);
        if (chip) chip.done = true;
        break;
      }
      case "canvas_op":
        applyCanvasOp(ev.op as CanvasOp);
        break;
      case "final":
        // backend sends the full final text; prefer it if we streamed nothing
        if (!assistant.text.trim()) assistant.text = ev.text ?? "";
        break;
      case "error":
        assistant.text += `\n\n⚠️ ${ev.message}`;
        break;
    }
  }

  /** 序列化当前画布状态，供 Agent 感知画布全貌 */
  function serializeCanvasForAgent(): any[] {
    const app = canvasApp.value;
    if (!app?.tree?.children) return [];
    return Array.from(app.tree.children)
      .filter((child: any) =>
        child.tag !== "SimulateElement" && child.__tag !== "SimulateElement",
      )
      .map((child: any) => {
        const tag = child.__tag || child.tag;
        const base: any = {
          tag,
          x: child.x,
          y: child.y,
          width: child.width,
          height: child.height,
        };
        // 保留 refId 供 Agent 引用
        if (child.refId) base.refId = child.refId;
        // 按类型附加关键属性
        if (tag === "Text") {
          base.text = child.text;
          base.fontSize = child.fontSize;
          base.fontFamily = child.fontFamily;
          base.fill = child.fill;
        } else if (tag === "Image") {
          base.url = child.url;
        } else if (tag === "ImageGen") {
          base.prompt = child.prompt;
          base.generationStatus = child.generationStatus;
        } else if (tag === "VideoGen") {
          base.prompt = child.prompt;
          base.generationStatus = child.generationStatus;
        } else if (tag === "VideoNode") {
          base.videoUrl = child.videoUrl;
          base.thumbnailUrl = child.thumbnailUrl;
        } else if (tag === "Rect") {
          base.fill = child.fill;
          base.cornerRadius = child.cornerRadius;
          base.stroke = child.stroke;
        } else if (tag === "Ellipse" || tag === "Polygon" || tag === "Star") {
          base.fill = child.fill;
        } else if (tag === "Frame") {
          base.fill = child.fill;
        }
        if (child.opacity !== undefined && child.opacity !== 1) {
          base.opacity = child.opacity;
        }
        if (child.rotation) base.rotation = child.rotation;
        return base;
      });
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
    fetch(`${AGENT_BASE_URL}/agent/${sessionId.value}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  function zoomToNode(refId: string) {
    const app = canvasApp.value;
    if (!app?.tree) return;
    const node = nodeMap.get(refId);
    if (node) {
      try {
        if (app.editor) {
          app.editor.select(node);
        }
        (app.tree as any).zoom(node, 100, undefined, 0.8);
      } catch (err) {
        console.warn("Failed to zoom to node:", err);
      }
    }
  }

  return {
    messages,
    running,
    send,
    stop,
    reset,
    sessionId,
    nodeStates,
    zoomToNode,
  };
}
