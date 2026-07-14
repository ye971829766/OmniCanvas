import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { startBilledAgentTask } from '../../billing/billing-task';
import type { CanvasImageGenerationType } from '../agent.protocol';
import { resolveCanvasContainerParentId, upsertCanvasNode } from '../canvas-state';
import { promotePlannedEcommerceSource } from '../ecommerce-plan';
import { resolveReferenceToBase64, resolveReferenceUrl } from './image-reference';

function getSourceNode(source: string, ctx: ToolContext): any | undefined {
  return ctx.canvasState.find((item: any) => item.refId === source);
}

function createProcessingTarget(
  input: any,
  ctx: ToolContext,
  sourceUrl: string,
  operation: string,
  options?: { scale?: number },
): string {
  const sourceNode = getSourceNode(input.source, ctx);
  const replaceOriginal = input.replaceOriginal === true && sourceNode?.refId;
  const refId = replaceOriginal ? sourceNode.refId : ctx.newRefId(operation);

  if (!replaceOriginal) {
    const parentId = resolveCanvasContainerParentId(
      ctx,
      input.parentId ?? sourceNode?.parentId,
    );
    const scale =
      operation === 'upscale'
        ? Math.max(1, Number(options?.scale) || Number(input.scale) || 2)
        : 1;
    const baseW = input.width ?? sourceNode?.width ?? 400;
    const baseH = input.height ?? sourceNode?.height ?? 400;
    const width = Math.max(1, Math.round(Number(baseW) * scale));
    const height = Math.max(1, Math.round(Number(baseH) * scale));
    const node = {
      refId,
      type: 'image' as const,
      parentId,
      url: sourceUrl,
      x: input.x ?? (typeof sourceNode?.x === 'number' ? sourceNode.x + (sourceNode.width || 400) + 24 : undefined),
      y: input.y ?? sourceNode?.y,
      width,
      height,
      ...(operation === 'upscale' ? { upscaleScale: scale } : {}),
    };
    ctx.sink.canvas({ op: 'add_node', node: node as any });
    upsertCanvasNode(ctx, refId, node);
  }

  return refId;
}

function startCanvasImageTask(
  refId: string,
  taskId: string,
  generationType: CanvasImageGenerationType,
  ctx: ToolContext,
): void {
  ctx.sink.canvas({
    op: 'generation_started',
    refId,
    kind: 'image',
    taskId,
    generationType,
  });
  upsertCanvasNode(ctx, refId, {
    taskId,
    status: 'generating',
    generationType,
  });
  const node = ctx.canvasState.find((item: any) => item.refId === refId);
  if (node) Object.assign(node, { taskId, status: 'generating', generationType });
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
    const billed = await startBilledAgentTask(
      ctx,
      'remove_background',
      { source: input.source },
      (billingContext) => ctx.files.removeBackground(sourceUrl, ctx.origin, billingContext),
    );
    const result = billed.result;
    startCanvasImageTask(refId, result.taskId, 'removeBg', ctx);
    const canonicalSource = promotePlannedEcommerceSource(input.source, refId, ctx);
    return { output: { refId, taskId: result.taskId, status: result.status, operation: 'remove_background', canonicalSource, billingOperationId: billed.billingOperationId } };
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
    const scale = input.scale || 4;
    const refId = createProcessingTarget(input, ctx, sourceUrl, 'upscale', {
      scale,
    });
    const billed = await startBilledAgentTask(
      ctx,
      'upscale_image',
      { source: input.source, scale },
      (billingContext) => ctx.files.upscaleImage(sourceUrl, scale, ctx.origin, billingContext),
    );
    const result = billed.result;
    startCanvasImageTask(refId, result.taskId, 'upscale', ctx);
    const canonicalSource = promotePlannedEcommerceSource(input.source, refId, ctx);
    return { output: { refId, taskId: result.taskId, status: result.status, operation: 'upscale_image', canonicalSource, billingOperationId: billed.billingOperationId } };
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
    const billed = await startBilledAgentTask(
      ctx,
      'inpaint_image',
      { source: input.source, rectangleCount: input.rectangles.length },
      (billingContext) => ctx.files.inpaintImage(sourceUrl, input.rectangles, ctx.origin, undefined, undefined, billingContext),
    );
    const result = billed.result;
    startCanvasImageTask(refId, result.taskId, 'inpaint', ctx);
    return { output: { refId, taskId: result.taskId, status: result.status, operation: 'inpaint_image', billingOperationId: billed.billingOperationId } };
  },
};

export const editImageTool: AgentTool = {
  name: 'edit_image',
  description:
    'Edit an existing image with a text instruction, optionally constrained by a PNG mask asset/ref. ' +
    'Use for adding, removing, or replacing pictured subjects (for example, adding a cat beside a dog inside the image), ' +
    'or for changing a product detail, background, lighting, material, or color while preserving the source identity.',
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
    const billed = await startBilledAgentTask(
      ctx,
      'image_edit',
      { prompt: input.prompt, model: input.model, size: input.size, quality: input.quality, source: input.source, localized: Boolean(mask) },
      (billingContext) => ctx.ai.generateImageFromJson(
        {
          prompt: input.prompt,
          model: input.model,
          size: input.size,
          quality: input.quality,
          images: [sourceBase64],
          mask: mask || undefined,
        },
        ctx.origin,
        billingContext,
      ),
    );
    const result = billed.result;
    if (!result.taskId) throw new Error('Image edit did not return a taskId.');
    startCanvasImageTask(refId, result.taskId, 'edit', ctx);
    const resolvedModel =
      (typeof (result as any)?.model === 'string' && (result as any).model) ||
      (typeof input.model === 'string' && input.model.trim()) ||
      undefined;

    return {
      output: {
        refId,
        taskId: result.taskId,
        status: result.status,
        model: resolvedModel,
        operation: 'edit_image',
        localized: Boolean(mask),
        billingOperationId: billed.billingOperationId,
        referenceAssetId: ctx.assets?.some((asset) => asset.id === input.source)
          ? input.source
          : undefined,
      },
    };
  },
};
