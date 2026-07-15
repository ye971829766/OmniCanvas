import type { AiService } from '../ai/ai.service';
import type { EventSink } from './event-sink';
import type { AgentMemory } from './agent.memory';
import type { FilesService } from '../files/files.service';
import type { AgentAsset } from './agent-assets';
import type { BillingService } from '../billing/billing.service';

/** Context handed to every tool execution. */
export interface ToolContext {
  sessionId: string;
  /** push canvas ops / progress events to the live SSE stream */
  sink: EventSink;
  /** the existing AiService — tools reuse generate-image/video, channels, etc. */
  ai: AiService;
  /** existing file/image processing service */
  files: FilesService;
  /** origin url for building absolute file urls (same as AiController.getOrigin) */
  origin: string;
  /** generate ref ids */
  newRefId: (prefix?: string) => string;
  /** session memory access */
  memory: AgentMemory;
  /** real-time canvas state sent from the frontend (all nodes currently on the canvas) */
  canvasState: any[];
  /** stable uploaded assets available across conversation turns */
  assets: AgentAsset[];
  /** abort signal for the current agent turn */
  abortSignal?: AbortSignal;
  /** current user brief, used for request policy and factual grounding */
  userInput?: string;
  /** true when this turn is a direct final-image request rather than a canvas composition */
  directImageRequest?: boolean;
  /** one unambiguous image reference for the current turn, when available */
  defaultImageReferenceIds?: string[];
  /** Authenticated owner. Never accepted from tool input or request bodies. */
  userId: string;
  /** Shared billing engine used by every cost-bearing tool. */
  billing: BillingService;
  /** Stable namespace for tool-call idempotency within this Agent request. */
  billingNamespace: string;
  /** Set by AgentService immediately around a single tool execution. */
  billingToolCallId?: string;
}

export interface ToolResult {
  /** value fed back to the LLM as the tool result content */
  output: unknown;
}

/** A JSON-schema described design capability the LLM can call. */
export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
  execute(input: any, ctx: ToolContext): Promise<ToolResult>;
}
