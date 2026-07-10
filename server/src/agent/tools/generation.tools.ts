import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { upsertCanvasNode } from '../canvas-state';
import { resolveReferencesToBase64 } from './image-reference';

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
      model: { type: 'string', description: 'Optional image model id. Usually omit unless the user selected one.' },
      aspectRatio: { type: 'string', description: 'Optional aspect ratio such as 1:1, 16:9, 3:4, or a provider-supported custom ratio.' },
      size: { type: 'string', description: 'e.g. "1024x1024" (optional)' },
      quality: { type: 'string', description: 'Optional provider quality such as auto, low, medium, high, standard, hd, 1K, 2K.' },
      style: { type: 'string', description: 'optional style hint' },
      refImages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of stable assetIds, canvas refIds, or absolute URLs to use as visual references.',
      },
      platform: { type: 'string', enum: ['amazon', 'taobao', 'jd'], description: 'Optional ecommerce platform tag for plan tracking.' },
      deliverable: { type: 'string', description: 'Optional deliverable role such as main, lifestyle, selling_point, or detail.' },
      x: { type: 'number', description: 'X position in pixels. Omit if the parentId points to an auto-layout container.' },
      y: { type: 'number', description: 'Y position in pixels. Omit if the parentId points to an auto-layout container.' },
      width: { type: 'number' },
      height: { type: 'number' },
      parentId: { type: 'string', description: 'Parent node refId, e.g. "agent_frame" to place the image inside the artboard.' },
    },
    required: ['prompt'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('img');
    const base64Images = await resolveReferencesToBase64(input.refImages, ctx);
    const referenceAssetId = input.refImages?.find((ref: string) =>
      ctx.assets?.some((asset) => asset.id === ref),
    );

    const nodeSpec = {
      refId,
      type: 'image_gen' as const,
      parentId: input.parentId,
      prompt: input.prompt,
      model: input.model,
      aspectRatio: input.aspectRatio,
      size: input.size,
      quality: input.quality,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      images: base64Images,
      platform: input.platform,
      deliverable: input.deliverable,
    };

    // 1. tell the canvas to create an ImageGen placeholder node
    ctx.sink.canvas({ op: 'add_node', node: nodeSpec });

    // 2. kick off the REAL generation through the existing AiService
    const res = await ctx.ai.generateImageFromJson(
      {
        prompt: input.prompt,
        model: input.model,
        style: input.style,
        size: input.size,
        aspectRatio: input.aspectRatio,
        quality: input.quality,
        images: base64Images,
      },
      ctx.origin,
    );

    upsertCanvasNode(ctx, refId, {
      ...nodeSpec,
      taskId: (res as any).taskId,
      status: 'generating',
    });


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
        platform: input.platform,
        deliverable: input.deliverable,
        referenceAssetId,
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
      model: { type: 'string', description: 'Optional video model id. Usually omit unless the user selected one.' },
      aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
      size: { type: 'string' },
      seconds: { type: 'string', description: 'clip length, e.g. "5"' },
      refImages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array containing the refId of the reference image on the canvas to use as input reference for video generation.',
      },
      x: { type: 'number' },
      y: { type: 'number' },
      parentId: { type: 'string', description: 'Parent node refId, e.g. "agent_frame" to place the video inside the artboard.' },
    },
    required: ['prompt'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('vid');
    const base64Images = await resolveReferencesToBase64(input.refImages, ctx);
    const inputReference = base64Images[0] || '';

    const nodeSpec = {
      refId,
      type: 'video_gen' as const,
      parentId: input.parentId,
      prompt: input.prompt,
      model: input.model,
      aspectRatio: input.aspectRatio,
      size: input.size,
      seconds: input.seconds,
      x: input.x,
      y: input.y,
      inputReference,
    };

    ctx.sink.canvas({ op: 'add_node', node: nodeSpec });

    const res = await ctx.ai.generateVideoFromJson(
      {
        prompt: input.prompt,
        model: input.model,
        size: input.size,
        seconds: input.seconds,
        input_reference: inputReference,
      },
      ctx.origin,
    );

    upsertCanvasNode(ctx, refId, {
      ...nodeSpec,
      taskId: (res as any).taskId,
      status: 'generating',
    });


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
