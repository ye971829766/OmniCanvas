import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { runMCotLoop } from '../mcot-graph';

/**
 * verify_design — bounded visual quality gate.
 */
export const verifyDesignTool: AgentTool = {
  name: 'verify_design',
  description:
    'Visually verify a finished canvas element or generated bitmap against the original requirements. ' +
    'For editable canvas nodes it can apply safe property fixes and re-check. For a flattened bitmap it returns one actionable repairInstruction; ' +
    'the agent may call edit_image once and then verify that repaired refId once. Do not repeatedly re-check an unchanged bitmap.',
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
        refId: input.refId,
        success: result.success,
        attempts: result.attempts,
        score: result.analysis?.score,
        failureType: result.analysis?.failureType,
        repairStrategy: result.analysis?.repairStrategy,
        critique: result.analysis?.critique,
        suggestions: result.analysis?.suggestions,
        repairInstruction: result.analysis?.repairInstruction,
        repairRecommended: Boolean(
          !result.success &&
          result.analysis?.repairInstruction &&
          ['edit', 'regenerate'].includes(result.analysis?.repairStrategy),
        ),
        platform: input.platform,
        deliverable: input.deliverable,
        referenceAssetId: input.referenceAssetId,
        identityFidelityScore: result.analysis?.identityFidelityScore,
        note: result.success
          ? `✅ 设计已通过质检（评分 ${result.analysis?.score}/10，共检查 ${result.attempts} 次）`
          : `⚠️ 质检未通过（共检查 ${result.attempts} 次）：${result.analysis?.critique ?? '请手动检查'}`,
      },
    };
  },
};
