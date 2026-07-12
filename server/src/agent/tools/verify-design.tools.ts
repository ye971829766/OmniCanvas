import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { runMCotLoop } from '../mcot-graph';

/**
 * verify_design — One-step MCoT quality gate:
 * export → vision-analyze → auto-fix → re-verify (up to 2 rounds)
 */
export const verifyDesignTool: AgentTool = {
  name: 'verify_design',
  description:
    'Visually verify and auto-fix a canvas element. Takes a screenshot, runs AI vision critique, ' +
    'applies fixes, and repeats up to 2 rounds until the design scores ≥8/10 or no fixable issues remain. ' +
    'Call this ONCE after finishing a design composition instead of calling export_node_image + analyze_design separately.',
  parameters: {
    type: 'object',
    properties: {
      refId: {
        type: 'string',
        description: 'The refId of the element or artboard to verify (e.g. "agent_frame").',
      },
      requirements: {
        type: 'string',
        description: 'Original design requirements/brief to evaluate against.',
      },
      platform: {
        type: 'string',
        enum: ['amazon', 'taobao', 'jd'],
        description: 'Optional ecommerce platform tag used for task plan tracking.',
      },
      deliverable: {
        type: 'string',
        description: 'Optional ecommerce deliverable role used for task plan tracking.',
      },
      referenceAssetId: {
        type: 'string',
        description: 'Optional source product assetId for identity-fidelity comparison.',
      },
    },
    required: ['refId', 'requirements'],
  },
  async execute(input: {
    refId: string;
    requirements: string;
    platform?: string;
    deliverable?: string;
    referenceAssetId?: string;
  }, ctx: ToolContext): Promise<ToolResult> {
    ctx.sink.emit({ type: 'progress', tool: 'verify_design', message: `正在视觉质检：${input.refId}` });

    const result = await runMCotLoop(ctx, input.refId, input.requirements, 2, {
      referenceAssetId: input.referenceAssetId,
      platform: input.platform,
      deliverable: input.deliverable,
    });

    return {
      output: {
        success: result.success,
        attempts: result.attempts,
        score: result.analysis?.score,
        failureType: result.analysis?.failureType,
        critique: result.analysis?.critique,
        suggestions: result.analysis?.suggestions,
        platform: input.platform,
        deliverable: input.deliverable,
        referenceAssetId: input.referenceAssetId,
        identityFidelityScore: result.analysis?.identityFidelityScore,
        note: result.success
          ? `✅ 设计已通过质检（评分 ${result.analysis?.score}/10，共检查 ${result.attempts} 次）`
          : `⚠️ 经 ${result.attempts} 次优化仍有待改进：${result.analysis?.critique ?? '请手动检查'}`,
      },
    };
  },
};
