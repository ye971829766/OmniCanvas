import type { AgentTool } from './tool.interface';
import { generateImageTool, generateVideoTool } from './tools/generation.tools';
import {
  addRectTool,
  addTextTool,
  queryCanvasTool,
  removeNodeTool,
  setFrameTool,
  updateNodeTool,
  focusNodeTool,
  exportNodeImageTool,
  addFrameTool,
} from './tools/canvas.tools';
import { autoLayoutTool, alignNodesTool, distributeNodesTool } from './tools/layout.tools';
import { setBrandTool, applyPaletteTool } from './tools/style.tools';
import { collectInspirationTool } from './tools/inspiration.tools';
import { reviewAndAdjustTool } from './tools/review.tools';
import { analyzeDesignTool } from './tools/vision-analysis.tools';
import { verifyDesignTool } from './tools/verify-design.tools';
import { planDesignTool } from './tools/plan-design.tools';

/** All design tools the agent can call. */
export const ALL_TOOLS: AgentTool[] = [
  setFrameTool,
  generateImageTool,
  generateVideoTool,
  addTextTool,
  addRectTool,
  updateNodeTool,
  removeNodeTool,
  queryCanvasTool,
  autoLayoutTool,
  alignNodesTool,
  distributeNodesTool,
  setBrandTool,
  applyPaletteTool,
  collectInspirationTool,
  focusNodeTool,
  exportNodeImageTool,
  addFrameTool,
  reviewAndAdjustTool,
  analyzeDesignTool,
  verifyDesignTool,
  planDesignTool,
];

export const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.name, t]));

/** OpenAI-compatible tools array for the chat completion request. */
export function toOpenAiTools() {
  return ALL_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
