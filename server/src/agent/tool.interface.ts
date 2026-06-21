import type { AiService } from '../ai/ai.service';
import type { EventSink } from './event-sink';
import type { AgentMemory } from './agent.memory';

/** Context handed to every tool execution. */
export interface ToolContext {
  sessionId: string;
  /** push canvas ops / progress events to the live SSE stream */
  sink: EventSink;
  /** the existing AiService — tools reuse generate-image/video, channels, etc. */
  ai: AiService;
  /** origin url for building absolute file urls (same as AiController.getOrigin) */
  origin: string;
  /** generate ref ids */
  newRefId: (prefix?: string) => string;
  /** session memory access */
  memory: AgentMemory;
  /** real-time canvas state sent from the frontend (all nodes currently on the canvas) */
  canvasState: any[];
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
  };
  execute(input: any, ctx: ToolContext): Promise<ToolResult>;
}
