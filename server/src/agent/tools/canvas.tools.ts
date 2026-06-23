import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import {
  getCanvasNodeMap,
  getFrame,
  listCanvasNodes,
  removeCanvasNode,
  setFrame,
  upsertCanvasNode,
} from '../canvas-state';
import { exportRegistry } from '../export-registry';

export const setFrameTool: AgentTool = {
  name: 'set_frame',
  description:
    'Set the artboard dimensions and background. Call first when starting a ' +
    'new design so layout coordinates make sense. Common sizes: social 1080x1080, ' +
    'story 1080x1920, poster 1240x1754, banner 1920x1080.',
  parameters: {
    type: 'object',
    properties: {
      width: { type: 'number' },
      height: { type: 'number' },
      background: { type: 'string', description: 'CSS color' },
    },
    required: ['width', 'height'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const frame = {
      width: input.width,
      height: input.height,
      background: input.background,
    };
    setFrame(ctx, frame);
    ctx.sink.canvas({ op: 'set_frame', ...frame });
    return { output: { note: `Frame set to ${input.width}x${input.height}.` } };
  },
};

export const addTextTool: AgentTool = {
  name: 'add_text',
  description: 'Add a text layer (title, caption, body copy) to the canvas.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      x: { type: 'number', description: 'X position in pixels. Omit if the parentId points to an auto-layout container.' },
      y: { type: 'number', description: 'Y position in pixels. Omit if the parentId points to an auto-layout container.' },
      width: { type: 'number', description: 'wrap width (optional)' },
      fontSize: { type: 'number', description: 'default 32' },
      fontFamily: { type: 'string' },
      fill: { type: 'string', description: 'CSS color, e.g. "#111"' },
      fontWeight: { type: 'string', enum: ['normal', 'bold', 'light'] },
      textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
      lineHeight: { type: 'number', description: 'Plain number only, e.g. 1.2 or 44. Do not pass an object.' },
      letterSpacing: { type: 'number', description: 'Plain number only. Do not pass an object.' },
      opacity: { type: 'number', description: 'Plain number from 0 to 1.' },
      parentId: { type: 'string', description: 'Parent node refId, e.g. "agent_frame" to place the text inside the artboard.' },
    },
    required: ['text'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('txt');
    const node = {
      refId,
      type: 'text' as const,
      parentId: input.parentId,
      text: input.text,
      x: input.x ?? 0,
      y: input.y ?? 0,
      width: input.width,
      fontSize: input.fontSize ?? 32,
      fontFamily: input.fontFamily,
      fill: input.fill ?? '#111111',
      fontWeight: input.fontWeight,
      textAlign: input.textAlign,
      lineHeight: input.lineHeight,
      letterSpacing: input.letterSpacing,
      opacity: input.opacity,
    };
    ctx.sink.canvas({ op: 'add_node', node });
    upsertCanvasNode(ctx, refId, node);
    return { output: { refId, note: 'Text added.' } };
  },
};

export const addRectTool: AgentTool = {
  name: 'add_rect',
  description: 'Add a rectangle (background block, card, color panel, divider).',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'X position in pixels. Omit if the parentId points to an auto-layout container.' },
      y: { type: 'number', description: 'Y position in pixels. Omit if the parentId points to an auto-layout container.' },
      width: { type: 'number' },
      height: { type: 'number' },
      fill: { type: 'string' },
      cornerRadius: { type: 'number' },
      stroke: { type: 'string' },
      strokeWidth: { type: 'number' },
      opacity: { type: 'number', description: '0-1, default 1' },
      parentId: { type: 'string', description: 'Parent node refId, e.g. "agent_frame" to place the rect inside the artboard.' },
      gradient: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          direction: { type: 'number' },
        },
        required: ['from', 'to', 'direction'],
      },
    },
    required: ['width', 'height'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('rect');
    const node = {
      refId,
      type: 'rect' as const,
      ...input,
      x: input.x ?? 0,
      y: input.y ?? 0,
    };
    ctx.sink.canvas({ op: 'add_node', node });
    upsertCanvasNode(ctx, refId, node);
    return { output: { refId } };
  },
};

export const updateNodeTool: AgentTool = {
  name: 'update_node',
  description:
    'Update an existing canvas node by refId: move, resize, restyle text, etc. ' +
    'Use the refId returned by a previous tool.',
  parameters: {
    type: 'object',
    properties: {
      refId: { type: 'string' },
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
      text: { type: 'string' },
      fill: { type: 'string' },
      fontSize: { type: 'number' },
      fontFamily: { type: 'string' },
      fontWeight: { type: 'string', enum: ['normal', 'bold', 'light'] },
      textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
      lineHeight: { type: 'number', description: 'Plain number only, e.g. 1.2 or 44. Do not pass an object.' },
      letterSpacing: { type: 'number', description: 'Plain number only. Do not pass an object.' },
      opacity: { type: 'number', description: 'Plain number from 0 to 1.' },
      cornerRadius: { type: 'number' },
      stroke: { type: 'string' },
      strokeWidth: { type: 'number' },
      flow: { type: 'string', enum: ['x', 'y'], description: 'Optional flow layout direction.' },
      flowAlign: { type: 'string', enum: ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'], description: 'Alignment of child elements inside the flow container.' },
      flowWrap: { type: 'boolean', description: 'Whether elements wrap to the next line/column.' },
      gap: { type: 'number', description: 'Gap spacing between elements in pixels.' },
      padding: { type: 'number', description: 'Padding spacing inside the frame container.' },
      gradient: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          direction: { type: 'number' },
        },
        required: ['from', 'to', 'direction'],
      },
    },
    required: ['refId'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const { refId, ...patch } = input;
    const nodes = getCanvasNodeMap(ctx);
    if (!nodes.has(refId)) {
      return {
        output: {
          refId,
          error: 'Node not found. Call query_canvas first and use one of the returned refIds.',
        },
      };
    }
    ctx.sink.canvas({ op: 'update_node', refId, patch });
    upsertCanvasNode(ctx, refId, patch);
    return { output: { refId, note: 'Node updated.' } };
  },
};

export const removeNodeTool: AgentTool = {
  name: 'remove_node',
  description: 'Remove a canvas node by refId.',
  parameters: {
    type: 'object',
    properties: { refId: { type: 'string' } },
    required: ['refId'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const exists = getCanvasNodeMap(ctx).has(input.refId);
    if (!exists) {
      return {
        output: {
          refId: input.refId,
          error: 'Node not found. Call query_canvas first and use one of the returned refIds.',
        },
      };
    }
    ctx.sink.canvas({ op: 'remove_node', refId: input.refId });
    removeCanvasNode(ctx, input.refId);
    return { output: { note: 'Node removed.' } };
  },
};

/**
 * query_canvas — lets the agent "see" what's currently on the canvas.
 * Merges the real canvas state from the frontend (ctx.canvasState) with
 * nodes added by the agent in the current session (ctx.__nodes).
 */
export const queryCanvasTool: AgentTool = {
  name: 'query_canvas',
  description:
    'Get a summary of all nodes currently on the canvas, including those added by the user manually. ' +
    'Use this to check what exists before modifying, repositioning, or removing nodes. ' +
    'Returns a list of nodes with their tag, position, size, and key properties.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute(_input: any, ctx: ToolContext): Promise<ToolResult> {
    const frame = getFrame(ctx);
    const allNodes = listCanvasNodes(ctx);

    return {
      output: {
        frame,
        nodeCount: allNodes.length,
        nodes: allNodes,
      },
    };
  },
};

export const focusNodeTool: AgentTool = {
  name: 'focus_node',
  description: 'Focus the canvas viewport on a specific node by its refId (zooms in and centers on it). Use this to inspect elements clearly or direct user attention to a node.',
  parameters: {
    type: 'object',
    properties: {
      refId: { type: 'string', description: 'The refId of the element to focus on.' },
    },
    required: ['refId'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    ctx.sink.canvas({ op: 'focus_node', refId: input.refId });
    return { output: { note: `Focused viewport on node "${input.refId}".` } };
  },
};

export const exportNodeImageTool: AgentTool = {
  name: 'export_node_image',
  description: 'Export a specific element or container by its refId as a PNG image. Returns the image as a base64 Data URI, allowing you to "see" what it looks like.',
  parameters: {
    type: 'object',
    properties: {
      refId: { type: 'string', description: 'The refId of the element or container to capture.' },
      waitForGeneration: { type: 'boolean', description: 'Whether to wait for pending image/video generation to finish. Default is true.' }
    },
    required: ['refId'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const waitForGeneration = input.waitForGeneration !== false;

    // Check if target or any child is currently generating images/videos
    const allNodes = listCanvasNodes(ctx);
    const targetNode = allNodes.find((n: any) => n.refId === input.refId);
    
    if (targetNode && waitForGeneration) {
      const generatingNodes = allNodes.filter((node: any) => {
        const isGenerating = ['image_gen', 'video_gen'].includes(node.type);
        if (!isGenerating) return false;
        if (node.refId === input.refId) return true;
        
        let parentId = node.parentId;
        while (parentId) {
          if (parentId === input.refId) return true;
          const parentNode = allNodes.find((n: any) => n.refId === parentId);
          parentId = parentNode?.parentId;
        }
        return false;
      });

      if (generatingNodes.length > 0) {
        const maxWaitMs = 30_000;
        const checkIntervalMs = 2_000;
        const startTime = Date.now();
        const agentService = (ctx as any).agentService;

        if (agentService) {
          ctx.sink.emit({ type: 'thinking', text: `⌛ 正在等待图片生成完成以导出截图...\n` });
          while ((Date.now() - startTime) < maxWaitMs) {
            let allDone = true;
            for (const node of generatingNodes) {
              const state = agentService.getGenerationState(node.refId);
              if (!state || state.status === 'generating') {
                allDone = false;
                break;
              }
            }
            if (allDone) {
              // Wait an extra 1000ms to allow the frontend to render the image
              await new Promise(resolve => setTimeout(resolve, 1000));
              break;
            }
            await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
          }
        }
      }
    }

    const requestId = `export_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
    ctx.sink.canvas({ op: 'export_node', refId: input.refId, requestId });

    // Poll the registry for the result
    const timeoutMs = 15000; // Increase to 15 seconds to allow frontend rendering
    const checkIntervalMs = 200;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (exportRegistry.has(requestId)) {
        const imageBase64 = exportRegistry.get(requestId)!;
        exportRegistry.delete(requestId); // Clean up
        
        // Cache the exported image in session memory
        ctx.memory.setLastExportedNodeImage(ctx.sessionId, imageBase64);

        return {
          output: {
            refId: input.refId,
            image: imageBase64, // This will be the base64 data URL
            note: 'Successfully exported element image.',
          },
        };
      }
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }

    return {
      output: {
        refId: input.refId,
        error: 'Export timed out. Make sure the element exists and the client is responsive.',
      },
    };
  },
};

export const addFrameTool: AgentTool = {
  name: 'add_frame',
  description: 'Add a new artboard/frame container to the canvas to start a new composition or layout. Returns a refId to be used as parentId for child elements.',
  parameters: {
    type: 'object',
    properties: {
      width: { type: 'number' },
      height: { type: 'number' },
      background: { type: 'string', description: 'CSS color, e.g. "#ffffff"' },
      x: { type: 'number' },
      y: { type: 'number' },
      flow: { type: 'string', enum: ['x', 'y'], description: 'Optional flow layout direction. Set to "x" for horizontal or "y" for vertical automatic layout.' },
      flowAlign: { type: 'string', enum: ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'], description: 'Alignment of child elements inside the flow container.' },
      flowWrap: { type: 'boolean', description: 'Whether elements wrap to the next line/column when they exceed container bounds.' },
      gap: { type: 'number', description: 'Gap spacing between elements in pixels.' },
      padding: { type: 'number', description: 'Padding spacing inside the frame container.' },
    },
    required: ['width', 'height'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('frame');
    const node = {
      refId,
      type: 'frame' as const,
      width: input.width,
      height: input.height,
      fill: input.background ?? '#ffffff',
      x: input.x,
      y: input.y,
      flow: input.flow,
      flowAlign: input.flowAlign,
      flowWrap: input.flowWrap,
      gap: input.gap,
      padding: input.padding,
    };
    ctx.sink.canvas({ op: 'add_node', node });
    upsertCanvasNode(ctx, refId, node);
    return { output: { refId, note: 'New frame artboard created.' } };
  },
};
