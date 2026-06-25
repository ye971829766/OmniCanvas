import type { ToolContext } from './tool.interface';
import { TOOL_MAP } from './tool.registry';

/**
 * MCoT (Multi-Chain of Thought) Graph - Enforces the design feedback loop:
 * generate → export → analyze → fix → verify
 */

interface GraphState {
  refId: string;
  attempt: number;
  maxAttempts: number;
  lastImage?: string;
  fixed: boolean;
}

export async function runMCotLoop(
  ctx: ToolContext,
  refId: string,
  requirements: string,
  maxAttempts = 2
): Promise<{ success: boolean; image?: string; attempts: number; analysis?: any }> {
  const state: GraphState = { refId, attempt: 0, maxAttempts, fixed: false };
  let lastAnalysis: any;

  while (state.attempt < state.maxAttempts && !state.fixed) {
    state.attempt++;

    // Step 1: Export node image
    const exportTool = TOOL_MAP.get('export_node_image');
    if (!exportTool) break;

    const exportResult = await exportTool.execute({ refId, waitForGeneration: true }, ctx);
    const output = exportResult.output as any;
    if (output?.error) {
      ctx.sink.emit({ type: 'progress', tool: 'export_node_image', message: `导出失败: ${output.error}` });
      break;
    }

    state.lastImage = output?.image;
    if (!state.lastImage) break;

    // Step 2: Analyze design with vision model
    const analyzeTool = TOOL_MAP.get('analyze_design');
    if (!analyzeTool) break;

    const analyzeResult = await analyzeTool.execute(
      { imageBase64: state.lastImage, requirements, targetRefId: refId },
      ctx
    );

    lastAnalysis = analyzeResult.output;

    // Step 3: Check if design meets requirements
    if (lastAnalysis?.meetsRequirements || (lastAnalysis?.score ?? 0) >= 8) {
      state.fixed = true;
      ctx.sink.emit({ type: 'progress', tool: 'analyze_design', message: `质检通过（评分 ${lastAnalysis?.score}/10）` });
    } else if (state.attempt < state.maxAttempts) {
      ctx.sink.emit({ type: 'progress', tool: 'analyze_design', message: `第${state.attempt}次检查评分 ${lastAnalysis?.score}/10，正在修复...` });

      // Step 4: Apply fixes from analyze_design output
      const fixes: Array<Record<string, any>> = lastAnalysis?.fixes ?? [];
      const updateTool = TOOL_MAP.get('update_node');

      if (updateTool && fixes.length > 0) {
        for (const fix of fixes) {
          const { refId: fixRefId, ...patch } = fix;
          const targetId = fixRefId || refId;
          if (Object.keys(patch).length > 0) {
            await updateTool.execute({ refId: targetId, patch }, ctx);
          }
        }
      } else if (updateTool && lastAnalysis?.suggestions) {
        // Fallback: no structured fixes, but we can at least log and try heuristics
        ctx.sink.emit({ type: 'progress', tool: 'analyze_design', message: lastAnalysis.suggestions });
      }
    }
  }

  return {
    success: state.fixed,
    image: state.lastImage,
    attempts: state.attempt,
    analysis: lastAnalysis,
  };
}
