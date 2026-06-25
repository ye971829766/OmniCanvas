import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';

interface DesignStep {
  step: number;
  title: string;
  action: string;
  tools: string[];
  artboard?: string;
}

interface DesignPlan {
  goal: string;
  totalSteps: number;
  steps: DesignStep[];
  brand?: Record<string, string>;
}

/**
 * plan_design — Decompose a complex multi-artboard design task into ordered steps.
 * The LLM calls this first, gets a structured plan, then executes step-by-step.
 */
export const planDesignTool: AgentTool = {
  name: 'plan_design',
  description:
    'Decompose a complex design task into an ordered execution plan with individual steps. ' +
    'Call this FIRST when the user requests multi-piece deliverables (campaigns, brand kits, ' +
    'multiple artboards, story series). Returns a step-by-step plan you must follow exactly. ' +
    'For simple single-image requests, skip this and go directly to generate_image.',
  parameters: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: 'The full user design request to decompose.',
      },
      deliverables: {
        type: 'array',
        items: { type: 'string' },
        description:
          'List of distinct design pieces to produce, e.g. ["1:1 Instagram post", "9:16 story", "1920x1080 banner"]. ' +
          'Infer from context if not explicit.',
      },
      brandHints: {
        type: 'object',
        description:
          'Optional brand constraints from user (colors, fonts, style keywords).',
        properties: {
          primary: { type: 'string' },
          secondary: { type: 'string' },
          accent: { type: 'string' },
          fontFamily: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['request', 'deliverables'],
  },
  async execute(
    input: { request: string; deliverables: string[]; brandHints?: any },
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const { request, deliverables, brandHints } = input;

    const ARTBOARD_PRESETS: Record<string, { w: number; h: number }> = {
      '1:1': { w: 1080, h: 1080 },
      'instagram post': { w: 1080, h: 1080 },
      'story': { w: 1080, h: 1920 },
      '9:16': { w: 1080, h: 1920 },
      'banner': { w: 1920, h: 1080 },
      '16:9': { w: 1920, h: 1080 },
      'poster': { w: 1240, h: 1754 },
      'a4': { w: 1240, h: 1754 },
      'square': { w: 1080, h: 1080 },
    };

    const steps: DesignStep[] = [];
    let stepNum = 0;

    // Step 0: Inspiration (if > 2 deliverables or if user didn't specify style)
    if (deliverables.length >= 2 && !brandHints?.keywords?.length) {
      steps.push({
        step: ++stepNum,
        title: '收集灵感参考',
        action: `调用 collect_inspiration("${request}") 获取视觉参考图`,
        tools: ['collect_inspiration'],
      });
    }

    // Step 1: Brand setup
    if (brandHints?.primary || deliverables.length >= 2) {
      steps.push({
        step: ++stepNum,
        title: '建立品牌系统',
        action: brandHints?.primary
          ? `调用 set_brand 注册品牌色彩（primary: ${brandHints.primary}）和字体`
          : `根据主题选择合适的调色板，调用 set_brand 或 apply_palette 统一风格`,
        tools: ['set_brand', 'apply_palette'],
      });
    }

    // Steps for each deliverable
    for (const deliverable of deliverables) {
      const key = deliverable.toLowerCase();
      const preset = Object.entries(ARTBOARD_PRESETS).find(([k]) => key.includes(k));
      const dims = preset ? `${preset[1].w}x${preset[1].h}` : '1080x1080';
      const artboardId = `frame_${deliverable.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

      steps.push({
        step: ++stepNum,
        title: `制作：${deliverable}`,
        action:
          `1. add_frame(${dims.replace('x', ', ')}, x: ${(stepNum - 1) * 1400}) ` +
          `2. generate_image("${request}", parentId: "${artboardId}") ` +
          `3. add_text(标题, parentId: "${artboardId}") ` +
          `4. auto_layout("hero") ` +
          `5. verify_design("${artboardId}", "${request}")`,
        tools: ['add_frame', 'generate_image', 'add_text', 'auto_layout', 'verify_design'],
        artboard: artboardId,
      });
    }

    // Final step: review all
    if (deliverables.length >= 2) {
      steps.push({
        step: ++stepNum,
        title: '整体品牌一致性检查',
        action: '检查所有画板风格是否统一，字体/颜色/间距是否一致',
        tools: ['query_canvas'],
      });
    }

    const plan: DesignPlan = {
      goal: request,
      totalSteps: steps.length,
      steps,
      brand: brandHints,
    };

    // Emit plan to UI as thinking
    ctx.sink.emit({
      type: 'thinking',
      text: `📋 设计规划（共 ${steps.length} 步）：\n${steps.map(s => `  ${s.step}. ${s.title}`).join('\n')}\n`,
    });

    return {
      output: {
        plan,
        note: `已生成 ${steps.length} 步执行计划，涵盖 ${deliverables.length} 个设计稿件。请按顺序执行每一步。`,
        instruction: '现在开始按计划逐步执行。每完成一个 deliverable 后调用 verify_design 验证质量，再继续下一步。',
      },
    };
  },
};
