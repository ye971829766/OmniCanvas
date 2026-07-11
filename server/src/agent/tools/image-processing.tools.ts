import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { upsertCanvasNode } from '../canvas-state';
import { resolveReferenceToBase64, resolveReferenceUrl } from './image-reference';

function getSourceNode(source: string, ctx: ToolContext): any | undefined {
  return ctx.canvasState.find((item: any) => item.refId === source);
}

function createProcessingTarget(
  input: any,
  ctx: ToolContext,
  sourceUrl: string,
  operation: string,
): string {
  const sourceNode = getSourceNode(input.source, ctx);
  const replaceOriginal = input.replaceOriginal === true && sourceNode?.refId;
  const refId = replaceOriginal ? sourceNode.refId : ctx.newRefId(operation);

  if (!replaceOriginal) {
    const node = {
      refId,
      type: 'image' as const,
      parentId: input.parentId ?? sourceNode?.parentId,
      url: sourceUrl,
      x: input.x ?? (typeof sourceNode?.x === 'number' ? sourceNode.x + (sourceNode.width || 400) + 24 : undefined),
      y: input.y ?? sourceNode?.y,
      width: input.width ?? sourceNode?.width ?? 400,
      height: input.height ?? sourceNode?.height ?? 400,
    };
    ctx.sink.canvas({ op: 'add_node', node: node as any });
    upsertCanvasNode(ctx, refId, node);
  }

  return refId;
}

function startCanvasImageTask(refId: string, taskId: string, ctx: ToolContext): void {
  ctx.sink.canvas({ op: 'generation_started', refId, kind: 'image', taskId });
  const node = ctx.canvasState.find((item: any) => item.refId === refId);
  if (node) Object.assign(node, { taskId, status: 'generating' });
}

const placementProperties = {
  x: { type: 'number' },
  y: { type: 'number' },
  width: { type: 'number' },
  height: { type: 'number' },
  parentId: { type: 'string' },
  replaceOriginal: {
    type: 'boolean',
    description: 'Replace the referenced canvas image in place. Defaults to false so the original remains preserved.',
  },
};

export const removeBackgroundTool: AgentTool = {
  name: 'remove_background',
  description: 'Remove an image background while preserving the original by default. Accepts an assetId, canvas refId, or image URL.',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'assetId, canvas refId, or image URL' },
      ...placementProperties,
    },
    required: ['source'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const sourceUrl = await resolveReferenceUrl(input.source, ctx);
    if (!sourceUrl) throw new Error(`Unable to resolve source image: ${input.source}`);
    const refId = createProcessingTarget(input, ctx, sourceUrl, 'cutout');
    const result = await ctx.files.removeBackground(sourceUrl, ctx.origin);
    startCanvasImageTask(refId, result.taskId, ctx);
    return { output: { refId, taskId: result.taskId, status: result.status, operation: 'remove_background' } };
  },
};

export const upscaleImageTool: AgentTool = {
  name: 'upscale_image',
  description: 'Upscale a product or design image using the existing super-resolution pipeline. Preserves the original by default.',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'assetId, canvas refId, or image URL' },
      scale: { type: 'number', enum: [2, 4] },
      ...placementProperties,
    },
    required: ['source'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const sourceUrl = await resolveReferenceUrl(input.source, ctx);
    if (!sourceUrl) throw new Error(`Unable to resolve source image: ${input.source}`);
    const refId = createProcessingTarget(input, ctx, sourceUrl, 'upscale');
    const result = await ctx.files.upscaleImage(sourceUrl, input.scale || 4, ctx.origin);
    startCanvasImageTask(refId, result.taskId, ctx);
    return { output: { refId, taskId: result.taskId, status: result.status, operation: 'upscale_image' } };
  },
};

export const inpaintImageTool: AgentTool = {
  name: 'inpaint_image',
  description:
    'Remove or repair one or more rectangular regions in an image. Coordinates are in source-image pixels. ' +
    'Use when the user explicitly identifies an unwanted local detail and coordinates are known.',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'assetId, canvas refId, or image URL' },
      rectangles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            left: { type: 'number' },
            top: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['left', 'top', 'width', 'height'],
        },
      },
      ...placementProperties,
    },
    required: ['source', 'rectangles'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const sourceUrl = await resolveReferenceUrl(input.source, ctx);
    if (!sourceUrl) throw new Error(`Unable to resolve source image: ${input.source}`);
    const refId = createProcessingTarget(input, ctx, sourceUrl, 'inpaint');
    const result = await ctx.files.inpaintImage(sourceUrl, input.rectangles, ctx.origin);
    startCanvasImageTask(refId, result.taskId, ctx);
    return { output: { refId, taskId: result.taskId, status: result.status, operation: 'inpaint_image' } };
  },
};

export const editImageTool: AgentTool = {
  name: 'edit_image',
  description:
    'Edit an existing image with a text instruction, optionally constrained by a PNG mask asset/ref. ' +
    'Use for changing a product detail, background, lighting, material, or color while preserving the source identity.',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'assetId, canvas refId, or image URL' },
      prompt: { type: 'string', description: 'Precise edit instruction. State what must remain unchanged.' },
      maskRef: { type: 'string', description: 'Optional PNG mask assetId, canvas refId, URL, or data URL for localized edits.' },
      model: { type: 'string' },
      size: { type: 'string' },
      quality: { type: 'string' },
      ...placementProperties,
    },
    required: ['source', 'prompt'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const resolvedSourceUrl = await resolveReferenceUrl(input.source, ctx);
    const sourceBase64 = await resolveReferenceToBase64(input.source, ctx);
    const sourceUrl = resolvedSourceUrl || sourceBase64;
    if (!sourceUrl || !sourceBase64) throw new Error(`Unable to resolve source image: ${input.source}`);

    const mask = input.maskRef ? await resolveReferenceToBase64(input.maskRef, ctx) : undefined;
    const refId = createProcessingTarget(input, ctx, sourceUrl, 'edit');
    const result = await ctx.ai.generateImageFromJson(
      {
        prompt: input.prompt,
        model: input.model,
        size: input.size,
        quality: input.quality,
        images: [sourceBase64],
        mask: mask || undefined,
      },
      ctx.origin,
    );
    if (!result.taskId) throw new Error('Image edit did not return a taskId.');
    startCanvasImageTask(refId, result.taskId, ctx);
    return {
      output: {
        refId,
        taskId: result.taskId,
        status: result.status,
        operation: 'edit_image',
        localized: Boolean(mask),
        referenceAssetId: ctx.assets?.some((asset) => asset.id === input.source)
          ? input.source
          : undefined,
      },
    };
  },
};
