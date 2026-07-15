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
  addGroupTool,
  addImageTool,
} from './tools/canvas.tools';
import { autoLayoutTool, alignNodesTool, distributeNodesTool } from './tools/layout.tools';
import { setBrandTool, applyPaletteTool } from './tools/style.tools';
import { collectInspirationTool } from './tools/inspiration.tools';
import { reviewAndAdjustTool } from './tools/review.tools';
import { analyzeDesignTool } from './tools/vision-analysis.tools';
import { verifyDesignTool } from './tools/verify-design.tools';
import { planDesignTool } from './tools/plan-design.tools';
import { webSearchTool, webExtractTool } from './tools/web-search.tools';
import {
  editImageTool,
  inpaintImageTool,
  removeBackgroundTool,
  upscaleImageTool,
} from './tools/image-processing.tools';

/** All design tools the agent can call. */
export const ALL_TOOLS: AgentTool[] = [
  // Canvas structure
  setFrameTool,
  addFrameTool,
  addGroupTool,
  // Primitives
  addTextTool,
  addRectTool,
  addImageTool,
  // Generation
  generateImageTool,
  generateVideoTool,
  editImageTool,
  removeBackgroundTool,
  inpaintImageTool,
  upscaleImageTool,
  // Mutation
  updateNodeTool,
  removeNodeTool,
  // Layout
  autoLayoutTool,
  alignNodesTool,
  distributeNodesTool,
  // Query & navigation
  queryCanvasTool,
  focusNodeTool,
  exportNodeImageTool,
  // Style
  setBrandTool,
  applyPaletteTool,
  collectInspirationTool,
  // Review & QA
  reviewAndAdjustTool,
  analyzeDesignTool,
  verifyDesignTool,
  planDesignTool,
  // Web (internet access)
  webSearchTool,
  webExtractTool,
];

export const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.name, t]));

/** OpenAI-compatible tools array for the chat completion request. */
export function toOpenAiTools() {
  return ALL_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
