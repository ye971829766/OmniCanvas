import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import {
  buildEcommerceDeliverables,
  type EcommercePlanInput,
  type EcommercePlatform,
} from '../ecommerce-platforms';
import type { AgentPlanStep } from '../agent.protocol';

const PLATFORM_LABELS: Record<EcommercePlatform, string> = {
  amazon: 'Amazon',
  taobao: '淘宝',
  jd: '京东',
};

export const planEcommerceSuiteTool: AgentTool = {
  name: 'plan_ecommerce_suite',
  description:
    'Create a production-oriented multi-platform ecommerce image plan from one product asset. ' +
    'Use this before creating Amazon, Taobao, or JD listing image suites. Returns exact frame IDs, sizes, roles, and platform rules.',
  parameters: {
    type: 'object',
    properties: {
      platforms: {
        type: 'array',
        items: { type: 'string', enum: ['amazon', 'taobao', 'jd'] },
      },
      sourceAssetId: {
        type: 'string',
        description: 'Stable assetId from the attached_assets list. Use it as a reference for every generated product visual.',
      },
      productName: { type: 'string' },
      sellingPoints: { type: 'array', items: { type: 'string' } },
      brand: { type: 'string' },
      language: { type: 'string' },
      imagesPerPlatform: { type: 'number', minimum: 1, maximum: 4 },
    },
    required: ['platforms', 'sourceAssetId'],
  },
  async execute(input: EcommercePlanInput, ctx: ToolContext): Promise<ToolResult> {
    const platforms = [...new Set(input.platforms || [])].filter(
      (platform): platform is EcommercePlatform => ['amazon', 'taobao', 'jd'].includes(platform),
    );
    if (platforms.length === 0) throw new Error('At least one supported ecommerce platform is required.');

    const asset = ctx.assets?.find((item) => item.id === input.sourceAssetId);
    if (!asset) throw new Error(`Unknown sourceAssetId: ${input.sourceAssetId}`);

    const deliverables = buildEcommerceDeliverables({ ...input, platforms });
    const planId = `plan_${crypto.randomUUID()}`;
    const steps: AgentPlanStep[] = [
      {
        id: `${planId}_prepare`,
        title: '解析并准备产品资产',
        description: `保留原始商品身份，必要时先去背景或放大。素材：${asset.name || asset.id}`,
        status: 'pending' as const,
        tools: ['plan_ecommerce_suite', 'remove_background', 'upscale_image'],
        completionTool: 'plan_ecommerce_suite',
      },
      ...deliverables.map((item) => ({
        id: `${planId}_${item.id}`,
        title: item.title,
        description: `${item.width}x${item.height} · ${item.rules.join('；')}`,
        status: 'pending' as const,
        platform: item.platform,
        deliverable: item.role,
        tools: ['add_frame', 'generate_image', 'add_text', 'verify_design'],
        completionTool: 'verify_design',
      })),
      {
        id: `${planId}_review`,
        title: '整套一致性检查',
        description: '检查产品身份、Logo/包装文字、卖点真实性、平台尺寸和品牌一致性。',
        status: 'pending' as const,
        tools: ['query_canvas'],
        completionTool: 'query_canvas',
      },
    ];
    const plan = {
      id: planId,
      title: `${platforms.map((platform) => PLATFORM_LABELS[platform]).join(' / ')} 电商套图`,
      sourceAssetId: input.sourceAssetId,
      steps,
    };
    ctx.memory.setPlan(ctx.sessionId, plan);

    ctx.sink.emit({
      type: 'plan',
      plan,
    });

    return {
      output: {
        planId,
        plan,
        sourceAssetId: input.sourceAssetId,
        sourceUrl: asset.url,
        deliverables,
        instruction:
          'Create every frame using its exact frameId and x/y via add_frame(refId). Use sourceAssetId in refImages for every generated product image. ' +
          'Keep product packaging, logo, proportions, and visible text faithful. Add claims as editable text nodes only, then verify each frame.',
        note: 'Platform presets are production defaults and should be rechecked against the seller console before final publishing.',
      },
    };
  },
};
