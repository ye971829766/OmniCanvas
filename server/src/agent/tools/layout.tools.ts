import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { computeLayout } from '../design-knowledge/layout-engine';
import { getCanvasNodeMap, getFrame, upsertCanvasNode } from '../canvas-state';

export const autoLayoutTool: AgentTool = {
  name: 'auto_layout',
  description:
    'Automatically rearrange all elements on the canvas using a layout strategy ' +
    '(hero, centered, split-horizontal, split-vertical, grid, hero-overlay). ' +
    'This recalculates x, y, width, and height for all elements for a premium layout.',
  parameters: {
    type: 'object',
    properties: {
      layoutHint: {
        type: 'string',
        enum: ['hero', 'centered', 'split-horizontal', 'split-vertical', 'grid', 'hero-overlay', 'columns'],
        description: 'The visual structure to apply. Choose "columns" for horizontal row layouts.',
      },
    },
    required: ['layoutHint'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const nodesMap = getCanvasNodeMap(ctx);
    if (nodesMap.size === 0) {
      return { output: { note: 'No nodes on canvas to layout.' } };
    }

    const frame = getFrame(ctx);
    const elements: any[] = [];

    // Map existing nodes to layout engine format, using heuristics for missing roles
    for (const [refId, node] of nodesMap.entries()) {
      let role = node.role;
      if (!role) {
        if (node.type === 'text') {
          const fontSize = node.fontSize ?? 32;
          const text = node.text ?? '';
          if (fontSize >= 48) role = 'title';
          else if (fontSize >= 28) {
            if (text.includes('立即') || text.includes('免费') || text.includes('CTA') || text.length < 8) {
              role = 'cta';
            } else {
              role = 'subtitle';
            }
          } else role = 'body';
        } else if (node.type === 'image_gen' || node.type === 'image' || node.type === 'video_gen') {
          role = 'hero';
        } else if (node.type === 'rect') {
          if ((node.width ?? 0) >= frame.width * 0.9 && (node.height ?? 0) >= frame.height * 0.9) {
            role = 'background';
          } else {
            role = 'decoration';
          }
        } else {
          role = 'accent';
        }
      }

      elements.push({
        id: refId,
        type: node.type === 'image_gen' || node.type === 'video_gen' ? 'image' : node.type,
        role,
        text: node.text,
        fontSize: node.fontSize,
      });
    }

    const computed = computeLayout(
      { width: frame.width, height: frame.height },
      input.layoutHint,
      elements,
    );

    const updated: string[] = [];
    for (const item of computed) {
      const existing = nodesMap.get(item.id);
      if (existing) {
        const patch = {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        };
        upsertCanvasNode(ctx, item.id, patch);
        ctx.sink.canvas({ op: 'update_node', refId: item.id, patch });
        updated.push(item.id);
      }
    }

    return {
      output: {
        note: `Applied auto-layout "${input.layoutHint}". Updated ${updated.length} nodes.`,
        updatedRefIds: updated,
      },
    };
  },
};

export const alignNodesTool: AgentTool = {
  name: 'align_nodes',
  description: 'Align multiple selected nodes (left, center, right, top, middle, bottom) relative to their bounding box.',
  parameters: {
    type: 'object',
    properties: {
      refIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'The refIds of the nodes to align.',
      },
      alignment: {
        type: 'string',
        enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'],
      },
    },
    required: ['refIds', 'alignment'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const nodesMap = getCanvasNodeMap(ctx);
    const targets = input.refIds.map((id: string) => ({ id, node: nodesMap.get(id) })).filter((t: any) => t.node);

    if (targets.length < 2) {
      return { output: { note: 'Need at least 2 valid nodes to align.' } };
    }

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const { node } of targets) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const w = node.width ?? 0;
      const h = node.height ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + w);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + h);
    }

    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    const updated: string[] = [];

    for (const { id, node } of targets) {
      const patch: Record<string, number> = {};
      const w = node.width ?? 0;
      const h = node.height ?? 0;

      switch (input.alignment) {
        case 'left':
          patch.x = minX;
          break;
        case 'center':
          patch.x = Math.round(centerX - w / 2);
          break;
        case 'right':
          patch.x = maxX - w;
          break;
        case 'top':
          patch.y = minY;
          break;
        case 'middle':
          patch.y = Math.round(centerY - h / 2);
          break;
        case 'bottom':
          patch.y = maxY - h;
          break;
      }

      if (Object.keys(patch).length > 0) {
        upsertCanvasNode(ctx, id, patch);
        ctx.sink.canvas({ op: 'update_node', refId: id, patch });
        updated.push(id);
      }
    }

    return {
      output: {
        note: `Aligned ${updated.length} nodes to the ${input.alignment}.`,
        updatedRefIds: updated,
      },
    };
  },
};

export const distributeNodesTool: AgentTool = {
  name: 'distribute_nodes',
  description: 'Distribute multiple selected nodes evenly in horizontal or vertical spacing.',
  parameters: {
    type: 'object',
    properties: {
      refIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'The refIds of the nodes to distribute.',
      },
      direction: {
        type: 'string',
        enum: ['horizontal', 'vertical'],
      },
    },
    required: ['refIds', 'direction'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const nodesMap = getCanvasNodeMap(ctx);
    const targets = input.refIds
      .map((id: string) => ({ id, node: nodesMap.get(id) }))
      .filter((t: any) => t.node && t.node.x !== undefined && t.node.y !== undefined);

    if (targets.length < 3) {
      return { output: { note: 'Need at least 3 valid nodes to distribute spacing.' } };
    }

    const direction = input.direction;
    const isHoriz = direction === 'horizontal';

    // Sort by coordinate
    targets.sort((a: any, b: any) => {
      const coordA = isHoriz ? a.node.x : a.node.y;
      const coordB = isHoriz ? b.node.x : b.node.y;
      return coordA - coordB;
    });

    const first = targets[0]!;
    const last = targets[targets.length - 1]!;

    const firstCoord = isHoriz ? first.node.x : first.node.y;
    const lastCoord = isHoriz ? last.node.x : last.node.y;
    const lastSize = isHoriz ? (last.node.width ?? 0) : (last.node.height ?? 0);

    const totalDistance = lastCoord - firstCoord;

    // Sum sizes of all except the last item
    let totalItemsSize = 0;
    for (let i = 0; i < targets.length - 1; i++) {
      const item = targets[i]!.node;
      totalItemsSize += isHoriz ? (item.width ?? 0) : (item.height ?? 0);
    }

    // Spacing between elements
    const totalSpacing = totalDistance - totalItemsSize;
    const spacing = totalSpacing / (targets.length - 1);

    let currentCoord = firstCoord;
    const updated: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const { id, node } = targets[i]!;
      const size = isHoriz ? (node.width ?? 0) : (node.height ?? 0);

      if (i > 0 && i < targets.length - 1) {
        const patch: Record<string, number> = {};
        if (isHoriz) {
          patch.x = Math.round(currentCoord);
        } else {
          patch.y = Math.round(currentCoord);
        }
        upsertCanvasNode(ctx, id, patch);
        ctx.sink.canvas({ op: 'update_node', refId: id, patch });
        updated.push(id);
      }

      currentCoord += size + spacing;
    }

    return {
      output: {
        note: `Distributed ${targets.length} nodes ${direction}ly.`,
        updatedRefIds: updated,
      },
    };
  },
};
