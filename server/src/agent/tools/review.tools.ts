import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { listCanvasNodes, getFrame } from '../canvas-state';

/**
 * review_and_adjust - 分析当前画布布局，返回诊断报告
 * 现在支持轮询等待生成完成（通过 AgentService 的状态缓存）
 */
export const reviewAndAdjustTool: AgentTool = {
  name: 'review_and_adjust',
  description:
    'Analyze the layout geometry, alignment, and spacing metrics of elements on the canvas (heuristic check). ' +
    'Does not use vision AI tokens. Automatically waits up to 30 seconds for image/video generation to complete. ' +
    'Returns element positions and sizing coordinates for adjustment.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input: any, ctx: ToolContext): Promise<ToolResult> {
    const allNodes = listCanvasNodes(ctx);

    // 检查是否有正在生成的节点
    const generatingNodes = allNodes.filter((node: any) =>
      ['image_gen', 'video_gen'].includes(node.type) &&
      node.refId
    );

    // 如果有生成中的节点，轮询等待（最多30秒）
    if (generatingNodes.length > 0) {
      const maxWaitMs = 30_000;
      const checkIntervalMs = 2_500;
      const startTime = Date.now();
      const aiService = ctx.ai;

      while ((Date.now() - startTime) < maxWaitMs) {
        // 检查所有生成节点的状态
        let allDone = true;
        for (const node of generatingNodes) {
          const taskId = node.taskId;
          if (taskId && aiService) {
            try {
              const state = aiService.getTaskStatus(taskId);
              if (!state || state.status === 'generating') {
                allDone = false;
                break;
              }
            } catch (e) {
              allDone = false;
              break;
            }
          } else {
            allDone = false;
            break;
          }
        }

        if (allDone) break;

        // 等待后继续检查
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      }

      const elapsed = Date.now() - startTime;
      // 如果等待超时，返回提示
      if (elapsed >= maxWaitMs) {
        return {
          output: {
            status: 'still_generating',
            note: `已等待 ${(elapsed / 1000).toFixed(1)} 秒，部分图片可能仍在生成中。`,
          },
        };
      }
    }

    // 继续正常的布局分析
    const frame = getFrame(ctx);
    const updatedNodes = listCanvasNodes(ctx);
    const frameWidth = frame.width;
    const frameHeight = frame.height;

    const children = updatedNodes.filter((node: any) =>
      node.parentId && node.source === 'agent_session'
    );

    const report: any = {
      frame: {
        width: frameWidth,
        height: frameHeight,
      },
      elements: [],
    };

    for (const node of children) {
      const elem: any = {
        refId: node.refId,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      };

      if (node.type === 'text') {
        elem.text = node.text;
        elem.fontSize = node.fontSize;
      }

      if (node.height) {
        elem.heightRatio = ((node.height / frameHeight) * 100).toFixed(1) + '%';
      }
      elem.marginTop = node.y || 0;
      elem.marginLeft = node.x || 0;

      report.elements.push(elem);
    }

    return {
      output: {
        report,
        note:
          '布局分析完成。请根据设计美学规则检查：\n' +
          '1. 图片高度应在 50-60% frame 高度\n' +
          '2. 所有元素距边缘至少 40px\n' +
          '3. 标题字号应≥48px，清晰可读\n' +
          '4. 元素间距应合理，避免拥挤\n' +
          '如发现问题，使用 update_node 调整。',
      },
    };
  },
};
