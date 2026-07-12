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

function normalizeEvidenceText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function isGroundedInCurrentBrief(value: string, ctx: ToolContext): boolean {
  if (typeof ctx.userInput !== 'string') return true;
  const candidate = normalizeEvidenceText(value);
  return Boolean(candidate) && normalizeEvidenceText(ctx.userInput).includes(candidate);
}

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
        description: 'Optional product display name explicitly supplied by the user. Do not infer a brand or model name from pixels.',
      },
      sellingPoints: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Verbatim factual selling points explicitly supplied by the user. Omit this field when none were supplied; never infer performance, materials, certifications, or specifications from the image.',
      },
      brand: { type: 'string', description: 'Optional brand name explicitly supplied by the user. Do not infer it from a logo.' },
      language: {
        type: 'string',
        description: 'Copy language, such as zh-CN or en-US.',
      },
      creativeDirection: {
        type: 'string',
        description:
          'Optional shared art direction for the entire suite, such as audience, price tier, mood, palette, and lighting. Do not include unverified product claims.',
      },
      imagesPerPlatform: {
        type: 'integer',
        minimum: 1,
        maximum: 8,
        description:
          'Number of deliverables per platform. Omit unless the user requested a count; the production default is six.',
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

    const sellingPoints = Array.isArray(input.sellingPoints)
      ? input.sellingPoints
          .filter((point): point is string => typeof point === 'string')
          .map((point) => point.trim())
          .filter((point) => Boolean(point) && isGroundedInCurrentBrief(point, ctx))
          .slice(0, 8)
      : [];
    const productName = input.productName?.trim() && isGroundedInCurrentBrief(input.productName.trim(), ctx)
      ? input.productName.trim()
      : undefined;
    const brand = input.brand?.trim() && isGroundedInCurrentBrief(input.brand.trim(), ctx)
      ? input.brand.trim()
      : undefined;
    const origin = getOpenRootCanvasOrigin(ctx.canvasState ?? []);
    const deliverables = buildEcommerceDeliverables({
      ...input,
      platforms,
      sellingPoints,
      originX: origin.x,
      originY: origin.y,
    });
    const dimensionSource =
      asset.width && asset.height
        ? asset
        : ctx.assets?.find((candidate) =>
            candidate.id !== asset.id &&
            Boolean(candidate.width && candidate.height) &&
            (candidate.url === asset.url ||
              (candidate.publicUrl && candidate.publicUrl === asset.publicUrl)),
          );
    const sourceWidth = Number(dimensionSource?.width || 0);
    const sourceHeight = Number(dimensionSource?.height || 0);
    const needsUpscale = sourceWidth > 0 && sourceHeight > 0 && Math.min(sourceWidth, sourceHeight) < 1000;
    const planId = `plan_${crypto.randomUUID()}`;
    const steps: AgentPlanStep[] = [
      {
        id: `${planId}_prepare`,
        title: '解析并准备产品资产',
        description: needsUpscale
          ? `源素材仅 ${sourceWidth}x${sourceHeight}，必须先放大并把返回的 refId 作为后续标准参考。`
          : `确认商品身份和可见角度，不生成参考素材未展示的结构。素材：${asset.name || asset.id}`,
        status: needsUpscale ? 'pending' as const : 'completed' as const,
        tools: ['plan_ecommerce_suite', 'remove_background', 'upscale_image'],
        completionTool: needsUpscale ? 'upscale_image' : 'plan_ecommerce_suite',
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
        tools: ['generate_image'],
        completionTool: 'generate_image',
      })),
    ];
    const plan = {
      id: planId,
      title: `${platforms.map((platform) => PLATFORM_LABELS[platform]).join(' / ')} 电商套图`,
      sourceAssetId: input.sourceAssetId,
      sourceWidth: sourceWidth || undefined,
      sourceHeight: sourceHeight || undefined,
      productName,
      sellingPoints,
      brand,
      language: input.language?.trim() || undefined,
      creativeDirection: input.creativeDirection?.trim() || undefined,
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
        sourceDimensions: sourceWidth && sourceHeight
          ? { width: sourceWidth, height: sourceHeight }
          : undefined,
        needsUpscale,
        deliverables: deliverables.map((item) => ({
          id: item.id,
          platform: item.platform,
          role: item.role,
          title: item.title,
          width: item.width,
          height: item.height,
          x: item.x,
          y: item.y,
        })),
        instruction:
          `${needsUpscale ? 'Upscale the source first; every generation will use the original identity reference plus the returned refId as a resolution aid. ' : ''}` +
          'Generate every deliverable as one finished flattened image at its exact root-canvas x/y and size. Do not create frames, groups, text nodes, or shape nodes. ' +
          'Use the original user brief for every generation and do not add an automatic verification or scoring step.',
        note: 'Platform presets are production defaults and should be rechecked against the seller console before final publishing.',
      },
    };
  },
};
