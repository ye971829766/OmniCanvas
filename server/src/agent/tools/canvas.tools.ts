import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';

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
    ctx.sink.canvas({ op: 'set_frame', width: input.width, height: input.height, background: input.background });
    // Track frame dimensions in context for query_canvas
    (ctx as any).__frame = { width: input.width, height: input.height, background: input.background };
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
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number', description: 'wrap width (optional)' },
      fontSize: { type: 'number', description: 'default 32' },
      fontFamily: { type: 'string' },
      fill: { type: 'string', description: 'CSS color, e.g. "#111"' },
      fontWeight: { type: 'string', enum: ['normal', 'bold', 'light'] },
      textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
      lineHeight: { type: 'number' },
      letterSpacing: { type: 'number' },
      opacity: { type: 'number' },
    },
    required: ['text'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('txt');
    const node = {
      refId,
      type: 'text' as const,
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
    trackNode(ctx, refId, node);
    return { output: { refId, note: 'Text added.' } };
  },
};

export const addRectTool: AgentTool = {
  name: 'add_rect',
  description: 'Add a rectangle (background block, card, color panel, divider).',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
      fill: { type: 'string' },
      cornerRadius: { type: 'number' },
      stroke: { type: 'string' },
      strokeWidth: { type: 'number' },
      opacity: { type: 'number', description: '0-1, default 1' },
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
    required: ['x', 'y', 'width', 'height'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const refId = ctx.newRefId('rect');
    ctx.sink.canvas({ op: 'add_node', node: { refId, type: 'rect', ...input } });
    trackNode(ctx, refId, { type: 'rect', ...input });
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
      lineHeight: { type: 'number' },
      letterSpacing: { type: 'number' },
      opacity: { type: 'number' },
      cornerRadius: { type: 'number' },
      stroke: { type: 'string' },
      strokeWidth: { type: 'number' },
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
    ctx.sink.canvas({ op: 'update_node', refId, patch });
    // Update tracked node
    const nodes = getNodes(ctx);
    const existing = nodes.get(refId);
    if (existing) {
      nodes.set(refId, { ...existing, ...patch });
    }
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
    ctx.sink.canvas({ op: 'remove_node', refId: input.refId });
    getNodes(ctx).delete(input.refId);
    return { output: { note: 'Node removed.' } };
  },
};

/**
 * query_canvas — lets the agent "see" what's currently on the canvas.
 * This solves the "blind agent" problem: after adding nodes, the LLM can
 * query for current state before making modifications.
 */
export const queryCanvasTool: AgentTool = {
  name: 'query_canvas',
  description:
    'Get a summary of all nodes currently on the canvas in this session. ' +
    'Use this to check what exists before modifying, repositioning, or removing nodes. ' +
    'Returns a list of nodes with their refId, type, position, and key properties.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async execute(_input: any, ctx: ToolContext): Promise<ToolResult> {
    const nodes = getNodes(ctx);
    const frame = (ctx as any).__frame ?? null;
    const summary = [...nodes.entries()].map(([refId, props]) => ({
      refId,
      ...props,
    }));
    return {
      output: {
        frame,
        nodeCount: summary.length,
        nodes: summary,
      },
    };
  },
};

// ── Internal node tracking ───────────────────────────────────────────────────
// Stores a lightweight representation of what the agent has placed on the canvas
// in this turn's context, so query_canvas can return it.

function getNodes(ctx: ToolContext): Map<string, Record<string, any>> {
  if (!(ctx as any).__nodes) {
    (ctx as any).__nodes = new Map<string, Record<string, any>>();
  }
  return (ctx as any).__nodes;
}

function trackNode(ctx: ToolContext, refId: string, props: Record<string, any>): void {
  getNodes(ctx).set(refId, props);
}
