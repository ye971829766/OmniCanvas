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

const ROOT_CANVAS_GAP = 240;

function getOpenRootCanvasOrigin(canvasState: any[]): { x: number; y: number } {
  const rootBounds = canvasState.flatMap((node) => {
    if (
      node?.parentId ||
      !Number.isFinite(node?.x) ||
      !Number.isFinite(node?.y) ||
      !Number.isFinite(node?.width) ||
      !Number.isFinite(node?.height)
    ) {
      return [];
    }
    return [{
      x: Number(node.x),
      bottom: Number(node.y) + Math.max(0, Number(node.height)),
    }];
  });
  if (rootBounds.length === 0) return { x: 0, y: 0 };
  return {
    x: Math.min(0, ...rootBounds.map((bound) => bound.x)),
    y: Math.max(0, ...rootBounds.map((bound) => bound.bottom)) + ROOT_CANVAS_GAP,
  };
}

export const planEcommerceSuiteTool: AgentTool = {
  name: 'plan_ecommerce_suite',
  description:
    'Create a production-oriented multi-platform ecommerce image plan from one product asset. ' +
    'Use this before creating Amazon, Taobao, or JD listing image suites. Returns exact image sizes, root-canvas positions, roles, and platform rules.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      platforms: {
        type: 'array',
        items: { type: 'string', enum: ['amazon', 'taobao', 'jd'] },
        minItems: 1,
        uniqueItems: true,
        description: 'Target marketplaces. Example: ["amazon"].',
      },
      sourceAssetId: {
        type: 'string',
        description:
          'Stable assetId from the attached_assets list. Use it as a reference for every generated product visual.',
      },
      productName: {
        type: 'string',
        description: 'Optional product display name.',
      },
      sellingPoints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only factual selling points supplied by the user.',
      },
      brand: { type: 'string', description: 'Optional brand name.' },
      language: {
        type: 'string',
        description: 'Copy language, such as zh-CN or en-US.',
      },
      imagesPerPlatform: {
        type: 'integer',
        minimum: 1,
        maximum: 8,
        description:
          'Number of deliverables per platform. Defaults to the platform preset.',
      },
    },
    required: ['platforms', 'sourceAssetId'],
  },
  async execute(input: EcommercePlanInput, ctx: ToolContext): Promise<ToolResult> {
    const rawPlatforms = (input as any).platforms;
    const requestedPlatforms: unknown[] = Array.isArray(rawPlatforms)
      ? rawPlatforms
      : rawPlatforms
        ? [rawPlatforms]
        : [];
    const platforms = [...new Set(requestedPlatforms)].filter(
      (platform): platform is EcommercePlatform =>
        typeof platform === 'string' &&
        ['amazon', 'taobao', 'jd'].includes(platform),
    );
    if (platforms.length === 0) {
      throw new Error('At least one supported ecommerce platform is required.');
    }

    const asset = ctx.assets?.find((item) => item.id === input.sourceAssetId);
    if (!asset) throw new Error(`Unknown sourceAssetId: ${input.sourceAssetId}`);

    const origin = getOpenRootCanvasOrigin(ctx.canvasState ?? []);
    const deliverables = buildEcommerceDeliverables({
      ...input,
      platforms,
      originX: origin.x,
      originY: origin.y,
    });
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
        width: item.width,
        height: item.height,
        x: item.x,
        y: item.y,
        tools: ['generate_image', 'verify_design'],
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
          'Generate every deliverable as one finished image at its exact root-canvas x/y and size. Do not create frames, groups, text nodes, or shape nodes. ' +
          'Use sourceAssetId in refImages for every image, keep product packaging, logo, proportions, and visible text faithful, then verify each image.',
        note: 'Platform presets are production defaults and should be rechecked against the seller console before final publishing.',
      },
    };
  },
};
