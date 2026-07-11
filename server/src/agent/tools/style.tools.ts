import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { PALETTES, ensureReadable } from '../design-knowledge/color-system';
import { matchFontCombination, getFontSizeForRole } from '../design-knowledge/typography';
import { getCanvasNodeMap, getFrame, upsertCanvasNode } from '../canvas-state';

export const setBrandTool: AgentTool = {
  name: 'set_brand',
  description:
    'Define the brand design system for this session. The planner and style tools ' +
    'will prioritize these choices (primary/secondary/accent/text/background colors, fonts, and keywords).',
  parameters: {
    type: 'object',
    properties: {
      primary: { type: 'string', description: 'Primary brand color (HEX)' },
      secondary: { type: 'string', description: 'Secondary color (HEX)' },
      accent: { type: 'string', description: 'Accent highlight color (HEX)' },
      text: { type: 'string', description: 'Main text color (HEX)' },
      background: { type: 'string', description: 'Canvas background color (HEX)' },
      fontFamily: { type: 'string', description: 'Preferred font family' },
      styleKeywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Style mood keywords, e.g. ["vintage", "tech"]',
      },
    },
    required: ['primary', 'secondary', 'accent', 'text', 'background'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const brand = {
      palette: {
        primary: input.primary,
        secondary: input.secondary,
        accent: input.accent,
        text: input.text,
        background: input.background,
      },
      fontFamily: input.fontFamily,
      styleKeywords: input.styleKeywords,
    };

    // Store in session memory
    ctx.memory.setBrand(ctx.sessionId, brand);

    return {
      output: {
        note: 'Brand styling rules registered successfully.',
        brand,
      },
    };
  },
};

export const applyPaletteTool: AgentTool = {
  name: 'apply_palette',
  description:
    'Instantly update the color theme of all elements on the canvas to match a specific palette ID ' +
    '(warm-cafe, tech-blue, nature-green, sunset-warm, luxury-dark, pastel-soft, minimal-mono, vibrant-pop, ocean-calm, earth-tone).',
  parameters: {
    type: 'object',
    properties: {
      paletteId: {
        type: 'string',
        enum: [
          'warm-cafe',
          'tech-blue',
          'nature-green',
          'sunset-warm',
          'luxury-dark',
          'pastel-soft',
          'minimal-mono',
          'vibrant-pop',
          'ocean-calm',
          'earth-tone',
        ],
        description: 'The ID of the color palette to apply.',
      },
    },
    required: ['paletteId'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const palette = PALETTES.find((p) => p.id === input.paletteId);
    if (!palette) {
      return { output: { error: `Palette with ID "${input.paletteId}" not found.` } };
    }

    const fontCombo = matchFontCombination(palette.keywords.join(' '));
    ctx.memory.setBrand(ctx.sessionId, {
      palette: {
        primary: palette.primary,
        secondary: palette.secondary,
        accent: palette.accent,
        text: palette.text,
        background: palette.background,
      },
      fontFamily: fontCombo.bodyFont,
      styleKeywords: palette.keywords,
    });

    const nodesMap = getCanvasNodeMap(ctx);
    if (nodesMap.size === 0) {
      return {
        output: {
          note: `Registered palette "${palette.label}" for subsequent canvas elements. No frame was created.`,
        },
      };
    }

    const frame = getFrame(ctx);

    const updated: string[] = [];
    for (const [refId, node] of nodesMap.entries()) {
      const patch: Record<string, any> = {};

      if (node.type === 'text') {
        // Apply font family based on role
        const role = node.role || 'body';
        patch.fontFamily = (role === 'title' || role === 'subtitle') ? fontCombo.titleFont : fontCombo.bodyFont;

        // Ensure readable contrast
        patch.fill = ensureReadable(palette.text, palette.background);

        // Apply proper font size if missing
        if (!node.fontSize) {
          patch.fontSize = getFontSizeForRole(role, frame.height);
        }
      } else if (node.type === 'rect' || node.type === 'frame') {
        if (node.role === 'background') {
          patch.fill = palette.background;
        } else if (node.role === 'cta') {
          patch.fill = palette.accent;
        } else {
          patch.fill = palette.primary;
        }
      }

      if (Object.keys(patch).length > 0) {
        upsertCanvasNode(ctx, refId, patch);
        ctx.sink.canvas({ op: 'update_node', refId, patch });
        updated.push(refId);
      }
    }

    return {
      output: {
        note: `Applied palette "${palette.label}" to ${updated.length} existing canvas elements without creating a frame.`,
        updatedRefIds: updated,
      },
    };
  },
};
