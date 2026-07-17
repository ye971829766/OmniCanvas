import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { startBilledAgentTask } from '../../billing/billing-task';
import type { CanvasImageGenerationType } from '../agent.protocol';
import { resolveCanvasContainerParentId, upsertCanvasNode } from '../canvas-state';
import { applyFinalImageRequestPolicy } from '../image-request-policy';
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
  const sourceAsset = ctx.assets?.find((asset) => asset.id === input.source);
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
    // Prefer source photo / canvas node dimensions over a hard-coded 400×400 box.
    // Final size is corrected to natural pixels when generation finishes.
    const baseW =
      input.width ??
      sourceNode?.width ??
      sourceAsset?.width ??
      1024;
    const baseH =
      input.height ??
      sourceNode?.height ??
      sourceAsset?.height ??
      1024;
    const width = Math.max(1, Math.round(Number(baseW) * scale));
    const height = Math.max(1, Math.round(Number(baseH) * scale));
    const node = {
      refId,
      type: 'image' as const,
      parentId,
      url: sourceUrl,
      x: input.x ?? (typeof sourceNode?.x === 'number' ? sourceNode.x + (sourceNode.width || width) + 24 : undefined),
      y: input.y ?? sourceNode?.y,
      width,
      height,
      // Allow frontend poll to replace box with result naturalWidth/Height.
      preserveLayout: false,
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
    return { output: { refId, taskId: result.taskId, status: result.status, operation: 'remove_background', billingOperationId: billed.billingOperationId } };
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
    return { output: { refId, taskId: result.taskId, status: result.status, operation: 'upscale_image', billingOperationId: billed.billingOperationId } };
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
    'Edit an existing uploaded photo or canvas image with the image generation model (not canvas shapes/text). ' +
    'Preferred for promotional shots, cool/new backgrounds, scene changes, retouching, and any "edit this photo" request. ' +
    'Use for adding, removing, or replacing pictured subjects, or changing product detail, background, lighting, material, or color while preserving identity. ' +
    'Pass source as the exact assetId or canvas refId. Preserve every explicit edit constraint while normalizing concrete briefs; optimize high-level task briefs. ' +
    'Do not rebuild posters with add_text/add_rect when this tool applies.',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'assetId, canvas refId, or image URL' },
      prompt: {
        type: 'string',
        description:
          'Complete edit prompt. Keep every explicit change and invariant; normalize a concrete request into a focused edit spec, or author useful art direction for a high-level task. Exact wording is required only when the user asks for verbatim handling. Do not invent factual product attributes.',
      },
      maskRef: { type: 'string', description: 'Optional PNG mask assetId, canvas refId, URL, or data URL for localized edits.' },
      model: { type: 'string' },
      size: { type: 'string' },
      quality: { type: 'string' },
      aspectRatio: { type: 'string', description: 'Optional output aspect ratio such as 1:1, 16:9, or 2:3.' },
      style: { type: 'string', description: 'Optional style instruction appended to the edit prompt.' },
      seriesRole: { type: 'string', description: 'Optional semantic role when this edit belongs to a multi-image suite.' },
      ...placementProperties,
    },
    required: ['source', 'prompt'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    if (ctx.directImageRequest === true) {
      input = applyFinalImageRequestPolicy('edit_image', input, ctx.userInput);
    }
    const resolvedSourceUrl = await resolveReferenceUrl(input.source, ctx);
    const sourceBase64 = await resolveReferenceToBase64(input.source, ctx);
    const sourceUrl = resolvedSourceUrl || sourceBase64;
    if (!sourceUrl || !sourceBase64) throw new Error(`Unable to resolve source image: ${input.source}`);

    const mask = input.maskRef ? await resolveReferenceToBase64(input.maskRef, ctx) : undefined;
    const refId = createProcessingTarget(input, ctx, sourceUrl, 'edit');
    const billed = await startBilledAgentTask(
      ctx,
      'image_edit',
      {
        prompt: input.prompt,
        model: input.model,
        size: input.size,
        quality: input.quality,
        aspectRatio: input.aspectRatio,
        source: input.source,
        localized: Boolean(mask),
      },
      (billingContext) => ctx.ai.generateImageFromJson(
        {
          prompt: input.prompt,
          model: input.model,
          style: input.style,
          size: input.size,
          aspectRatio: input.aspectRatio,
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
