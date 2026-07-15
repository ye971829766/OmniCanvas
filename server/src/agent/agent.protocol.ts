/**
 * Agent protocol v2 — the contract between the agent backend and your leafer.js
 * canvas (board/src). The agent never touches leafer; it streams CanvasOp /
 * AgentEvent objects over SSE, and your frontend (see integration example)
 * maps them onto your existing ImageGen / VideoGen / Image / Text nodes.
 *
 * Field names mirror your real nodes (prompt, model, size, aspectRatio for
 * ImageGen/VideoGen) so the frontend reducer stays thin.
 */

/** Protocol version. Bump on breaking changes. */
export const AGENT_PROTOCOL_VERSION = 2;

export type CanvasNodeType = 'image_gen' | 'video_gen' | 'text' | 'rect' | 'frame' | 'group' | 'image';
export type CanvasImageGenerationType = 'edit' | 'removeBg' | 'inpaint' | 'upscale';

/** A node the agent asks the canvas to create. */
export interface CanvasNodeSpec {
  /** agent-side id, echoed back so later ops can target this node */
  refId: string;
  type: CanvasNodeType;

  // placement (leafer coords). If omitted, frontend may auto-place.
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Keep the authored canvas bounds when generated media replaces its placeholder. */
  preserveLayout?: boolean;

  parentId?: string;
  flow?: 'x' | 'y';
  flowAlign?: string;
  flowWrap?: boolean;
  gap?: number;
  padding?: number;

  // image_gen / video_gen — drives your ImageGen/VideoGen node + generation
  prompt?: string;
  model?: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  /** reference image urls/refIds for image-to-image or image-to-video */
  refImages?: string[];

  // text
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  fontWeight?: string;
  textAlign?: string;
  lineHeight?: number;
  letterSpacing?: number;

  // rect
  cornerRadius?: number;
  stroke?: string;
  strokeWidth?: number;
  gradient?: {
    from: string;
    to: string;
    direction: number;
  };

  // common visual properties
  opacity?: number;
  rotation?: number;
}

export type CanvasOp =
  | { op: 'add_node'; node: CanvasNodeSpec }
  | { op: 'update_node'; refId: string; patch: Partial<CanvasNodeSpec> }
  | { op: 'remove_node'; refId: string }
  | { op: 'set_frame'; width: number; height: number; background?: string }
  | {
      op: 'generation_started';
      refId: string;
      kind: 'image' | 'video';
      taskId: string;
      generationType?: CanvasImageGenerationType;
    }
  | {
      /** Terminal media result so chat gallery + canvas stay in sync without a second poll race. */
      op: 'media_ready';
      refId: string;
      kind: 'image' | 'video';
      url: string;
      thumbnailUrl?: string;
      taskId?: string;
      error?: string;
    }
  | { op: 'focus_node'; refId: string }
  | { op: 'export_node'; refId: string; requestId: string };

/** Unified SSE event stream sent to the frontend. */
export type AgentEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; id: string; tool: string; input: unknown }
  | { type: 'tool_result'; id: string; tool: string; output: unknown }
  | { type: 'canvas_op'; op: CanvasOp }
  | { type: 'progress'; tool: string; message: string; percent?: number }
  | { type: 'plan'; plan: AgentPlan }
  | { type: 'usage'; promptTokens: number; completionTokens: number; steps: number; toolCalls: number; modelCalls: number; peakPromptTokens: number; lastPromptTokens: number; elapsedMs: number }
  | { type: 'final'; text: string }
  | { type: 'error'; message: string }
  | { type: 'keepalive' }
  | { type: 'done' };

export interface AgentPlanStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'error';
  platform?: string;
  deliverable?: string;
  frameId?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  tools?: string[];
  completionTool?: string;
}

export interface AgentPlan {
  id: string;
  title: string;
  sourceAssetId?: string;
  preferredSourceRefId?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  productName?: string;
  sellingPoints?: string[];
  brand?: string;
  language?: string;
  creativeDirection?: string;
  steps: AgentPlanStep[];
}
