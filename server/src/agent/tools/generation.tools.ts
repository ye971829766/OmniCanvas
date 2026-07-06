import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { upsertCanvasNode } from '../canvas-state';
import { exportNodeImageTool } from './canvas.tools';
import * as fs from 'fs';
import * as path from 'path';

/** Helper to resolve tool-input refImages (refIds or URLs) to base64 Data URLs */
async function resolveRefImagesToBase64(refImages: string[] | undefined, ctx: ToolContext): Promise<string[]> {
  if (!refImages || refImages.length === 0) return [];
  const base64List: string[] = [];

  for (const ref of refImages) {
    if (!ref) continue;
    // 1. Check if it's already a base64 Data URL
    if (ref.startsWith('data:image/')) {
      base64List.push(ref);
      continue;
    }

    // 2. Search canvasState for a node with matching refId
    const node = ctx.canvasState.find((n: any) => n.refId === ref);

    // Enhancement 1: If canvas node exists but has no image URL (e.g. Rect, Frame, Text, Group),
    // dynamically export it as a base64 image using exportNodeImageTool
    if (node && !node.url) {
      try {
        console.log(`Node ${ref} has no image URL. Exporting dynamically...`);
        const exportResult = await exportNodeImageTool.execute({ refId: ref, waitForGeneration: false }, ctx);
        const output = exportResult.output as any;
        if (output && output.image) {
          base64List.push(output.image);
          continue;
        }
      } catch (exportErr) {
        console.error(`Failed to export non-image reference node ${ref}:`, exportErr);
      }
    }

    let imageUrl = ref; // fallback: treat ref as URL itself
    if (node) {
      if (node.tag === 'Image' && node.url) {
        imageUrl = node.url;
      } else if (node.url) {
        imageUrl = node.url;
      }
    }

    // 3. Resolve the image URL to base64
    if (imageUrl.startsWith('data:image/')) {
      base64List.push(imageUrl);
      continue;
    }

    // Enhancement 2: Check if we can resolve it locally on the filesystem first,
    // avoiding HTTP request mismatches or self-fetching routing errors.
    let resolvedLocally = false;
    let localPath: string | null = null;
    
    const isLocalUrl = imageUrl.startsWith(ctx.origin) || 
                       imageUrl.startsWith('http://localhost') || 
                       imageUrl.startsWith('http://127.0.0.1');

    if (isLocalUrl) {
      const match = imageUrl.match(/\/files\/([^/]+)$/);
      if (match && match[1]) {
        localPath = path.join(process.cwd(), 'files', match[1]);
      }
    } else if (imageUrl.startsWith('files/')) {
      localPath = path.join(process.cwd(), imageUrl);
    } else if (imageUrl.startsWith('/files/')) {
      localPath = path.join(process.cwd(), imageUrl.slice(1));
    }

    if (localPath) {
      try {
        let finalPath = localPath;
        let exists = fs.existsSync(finalPath);
        
        if (!exists) {
          // Fallback check if process.cwd() is the project root instead of the server directory
          const altPath = localPath.replace(/[\\/]files[\\/]/, '/server/files/');
          if (fs.existsSync(altPath)) {
            finalPath = altPath;
            exists = true;
          }
        }
        
        if (exists) {
          const buffer = fs.readFileSync(finalPath);
          const ext = path.extname(finalPath).slice(1) || 'png';
          const contentType = ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          const base64Str = buffer.toString('base64');
          base64List.push(`data:${contentType};base64,${base64Str}`);
          resolvedLocally = true;
          console.log(`Successfully resolved image locally: ${finalPath}`);
        }
      } catch (localErr) {
        console.error(`Error reading local image file ${localPath}:`, localErr);
      }
    }

    if (resolvedLocally) continue;

    // Fallback: fetch over HTTP
    try {
      let finalUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        finalUrl = `${ctx.origin}${imageUrl}`;
      } else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        finalUrl = `${ctx.origin}/${imageUrl}`;
      }

      console.log(`Fetching reference image from URL: ${finalUrl}`);
      const res = await fetch(finalUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch image: HTTP ${res.status}`);
      }
      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || 'image/png';
      const base64Str = Buffer.from(buffer).toString('base64');
      base64List.push(`data:${contentType};base64,${base64Str}`);
    } catch (err: any) {
      console.error(`Failed to resolve reference image ${ref} via fetch:`, err);
    }
  }

  return base64List;
}

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
      aspectRatio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
      size: { type: 'string', description: 'e.g. "1024x1024" (optional)' },
      quality: { type: 'string', description: 'Optional provider quality such as auto, low, medium, high, standard, hd, 1K, 2K.' },
      style: { type: 'string', description: 'optional style hint' },
      refImages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of refIds of existing canvas elements or absolute URLs to use as visual reference for image-to-image/edit generation.',
      },
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
    const base64Images = await resolveRefImagesToBase64(input.refImages, ctx);

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
    const base64Images = await resolveRefImagesToBase64(input.refImages, ctx);
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
