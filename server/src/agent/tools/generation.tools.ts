import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';

/**
 * generate_image — creates an ImageGen node on the canvas and kicks off the
 * REAL image generation via AiService. Returns a taskId; the frontend reuses
 * its existing getTaskStatus polling to swap the placeholder for the result.
 */
export const generateImageTool: AgentTool = {
  name: 'generate_image',
  description:
    'Generate an image from a text prompt and place it on the canvas. Use for ' +
    'illustrations, photos, backgrounds, icons, concept art. Prompt should be ' +
    'descriptive; English usually yields the best quality.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed description of the image' },
      aspectRatio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
      size: { type: 'string', description: 'e.g. "1024x1024" (optional)' },
      style: { type: 'string', description: 'optional style hint' },
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
    },
    required: ['prompt'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('img');

    const nodeSpec = {
      refId,
      type: 'image_gen' as const,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      size: input.size,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    };

    // 1. tell the canvas to create an ImageGen placeholder node
    ctx.sink.canvas({ op: 'add_node', node: nodeSpec });

    // Track for query_canvas
    if (!(ctx as any).__nodes) (ctx as any).__nodes = new Map();
    (ctx as any).__nodes.set(refId, { type: 'image_gen', prompt: input.prompt, x: input.x, y: input.y, width: input.width, height: input.height, status: 'generating' });

    // 2. kick off the REAL generation through the existing AiService
    const res = await ctx.ai.generateImageFromJson(
      {
        prompt: input.prompt,
        style: input.style,
        size: input.size,
        aspectRatio: input.aspectRatio,
      },
      ctx.origin,
    );

    // 3. hand the taskId to the frontend so it polls via its existing pipeline
    ctx.sink.canvas({
      op: 'generation_started',
      refId,
      kind: 'image',
      taskId: (res as any).taskId,
    });

    return {
      output: {
        refId,
        taskId: (res as any).taskId,
        status: (res as any).status,
        note: 'ImageGen node created and generation started. The canvas will poll for the result.',
      },
    };
  },
};

/**
 * generate_video — same flow as generate_image but via generateVideoFromJson.
 */
export const generateVideoTool: AgentTool = {
  name: 'generate_video',
  description:
    'Generate a short video from a text prompt (optionally from a reference ' +
    'image) and place it on the canvas. Use for animated banners, motion ' +
    'backgrounds, short clips.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
      size: { type: 'string' },
      seconds: { type: 'string', description: 'clip length, e.g. "5"' },
      x: { type: 'number' },
      y: { type: 'number' },
    },
    required: ['prompt'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('vid');

    const nodeSpec = {
      refId,
      type: 'video_gen' as const,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      size: input.size,
      x: input.x,
      y: input.y,
    };

    ctx.sink.canvas({ op: 'add_node', node: nodeSpec });

    // Track for query_canvas
    if (!(ctx as any).__nodes) (ctx as any).__nodes = new Map();
    (ctx as any).__nodes.set(refId, { type: 'video_gen', prompt: input.prompt, x: input.x, y: input.y, status: 'generating' });

    const res = await ctx.ai.generateVideoFromJson(
      {
        prompt: input.prompt,
        size: input.size,
        seconds: input.seconds,
      },
      ctx.origin,
    );

    ctx.sink.canvas({
      op: 'generation_started',
      refId,
      kind: 'video',
      taskId: (res as any).taskId,
    });

    return {
      output: {
        refId,
        taskId: (res as any).taskId,
        status: (res as any).status,
        note: 'VideoGen node created and generation started.',
      },
    };
  },
};
