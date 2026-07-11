export type EcommercePlatform = 'amazon' | 'taobao' | 'jd';

export interface EcommercePlanInput {
  platforms: EcommercePlatform[];
  sourceAssetId: string;
  productName?: string;
  sellingPoints?: string[];
  brand?: string;
  language?: string;
  imagesPerPlatform?: number;
  originX?: number;
  originY?: number;
}

export interface EcommerceDeliverable {
  id: string;
  platform: EcommercePlatform;
  role: string;
  title: string;
  width: number;
  height: number;
  x: number;
  y: number;
  rules: string[];
  promptSeed: string;
}

const PLATFORM_DELIVERABLES: Record<
  EcommercePlatform,
  Omit<EcommerceDeliverable, 'id' | 'platform' | 'x' | 'y'>[]
> = {
  amazon: [
    {
      role: 'main',
      title: 'Amazon 主图',
      width: 2000,
      height: 2000,
      rules: ['纯白背景', '仅展示实际销售商品', '不要加入促销文字或装饰图形', '商品主体清晰且占据主要画面'],
      promptSeed: 'premium marketplace product photography on a pure white background, faithful product identity',
    },
    {
      role: 'front',
      title: 'Amazon Front View',
      width: 2000,
      height: 2000,
      rules: ['single product only', 'straight-on front view', 'pure white background', 'preserve exact product identity'],
      promptSeed: 'straight-on front view product photography on pure white, centered and evenly lit',
    },
    {
      role: 'side',
      title: 'Amazon Side View',
      width: 2000,
      height: 2000,
      rules: ['single product only', 'clean side profile', 'pure white background', 'preserve exact product identity'],
      promptSeed: 'clean side profile product photography on pure white, centered and evenly lit',
    },
    {
      role: 'rear',
      title: 'Amazon Rear View',
      width: 2000,
      height: 2000,
      rules: ['single product only', 'straight-on rear view', 'pure white background', 'preserve exact product identity'],
      promptSeed: 'straight-on rear view product photography on pure white, centered and evenly lit',
    },
    {
      role: 'top',
      title: 'Amazon Top View',
      width: 2000,
      height: 2000,
      rules: ['single product only', 'top-down view', 'pure white background', 'preserve exact product identity'],
      promptSeed: 'top-down product photography on pure white, centered and evenly lit',
    },
    {
      role: 'detail',
      title: 'Amazon Detail View',
      width: 2000,
      height: 2000,
      rules: ['show a real visible product detail', 'no invented components or claims', 'preserve material and color'],
      promptSeed: 'sharp commercial close-up of a distinctive real product detail, faithful materials and color',
    },
    {
      role: 'lifestyle',
      title: 'Amazon 场景图',
      width: 2000,
      height: 2000,
      rules: ['真实使用场景', '商品仍是唯一视觉焦点', '不得改变包装、Logo 或结构'],
      promptSeed: 'realistic lifestyle product scene, commercial photography, faithful product identity',
    },
    {
      role: 'infographic',
      title: 'Amazon 卖点图',
      width: 2000,
      height: 2000,
      rules: ['卖点文字使用独立可编辑图层', '不得编造参数或认证', '保持商品外观准确'],
      promptSeed: 'clean product infographic background with negative space for editable benefit callouts',
    },
    {
      role: 'a_plus',
      title: 'Amazon A+ 横幅',
      width: 1464,
      height: 600,
      rules: ['横向品牌叙事', '保留安全边距', '重要文字使用独立可编辑图层'],
      promptSeed: 'wide premium ecommerce brand banner with product hero and generous copy space',
    },
  ],
  taobao: [
    {
      role: 'main',
      title: '淘宝主图',
      width: 1000,
      height: 1000,
      rules: ['商品主体突出', '移动端缩略图可识别', '避免细小文字', '保持商品外观准确'],
      promptSeed: 'high-conversion Chinese ecommerce hero image, strong product focus, clean premium composition',
    },
    {
      role: 'selling_point',
      title: '淘宝核心卖点图',
      width: 1000,
      height: 1000,
      rules: ['一个画面只表达一个核心卖点', '文字使用独立可编辑图层', '不得编造功效'],
      promptSeed: 'ecommerce product feature visual with clear focal point and copy-safe area',
    },
    {
      role: 'scenario',
      title: '淘宝场景图',
      width: 1000,
      height: 1000,
      rules: ['使用场景与目标用户匹配', '不改变商品结构与包装文字'],
      promptSeed: 'aspirational ecommerce lifestyle scene, realistic lighting, faithful product identity',
    },
    {
      role: 'detail',
      title: '淘宝详情页模块',
      width: 750,
      height: 1000,
      rules: ['竖版移动端阅读', '层级清晰', '正文和卖点使用独立可编辑图层'],
      promptSeed: 'vertical mobile ecommerce detail module with product close-up and structured copy space',
    },
  ],
  jd: [
    {
      role: 'main',
      title: '京东主图',
      width: 1000,
      height: 1000,
      rules: ['商品轮廓清楚', '背景简洁', '缩略图状态下仍可识别', '不得改变商品信息'],
      promptSeed: 'clean trustworthy ecommerce product hero, precise commercial lighting, faithful product identity',
    },
    {
      role: 'selling_point',
      title: '京东卖点图',
      width: 1000,
      height: 1000,
      rules: ['突出可靠性和关键参数', '参数必须来自用户输入', '文字使用独立可编辑图层'],
      promptSeed: 'structured ecommerce benefit visual with technical clarity and editable copy space',
    },
    {
      role: 'scenario',
      title: '京东场景图',
      width: 1000,
      height: 1000,
      rules: ['真实场景', '光线自然', '商品比例和包装保持准确'],
      promptSeed: 'realistic product-in-use commercial scene with trustworthy premium styling',
    },
    {
      role: 'detail',
      title: '京东详情页模块',
      width: 750,
      height: 1000,
      rules: ['竖版信息模块', '突出规格和细节', '不得生成无法验证的参数'],
      promptSeed: 'vertical ecommerce detail module with macro product detail and organized information space',
    },
  ],
};

export function buildEcommerceDeliverables(input: EcommercePlanInput): EcommerceDeliverable[] {
  const deliverables: EcommerceDeliverable[] = [];
  const originX = Number.isFinite(input.originX) ? input.originX! : 0;
  const originY = Number.isFinite(input.originY) ? input.originY! : 0;
  let platformOffsetY = originY;

  for (const platform of input.platforms) {
    const presets = PLATFORM_DELIVERABLES[platform];
    const requestedCount = input.imagesPerPlatform ?? Math.min(6, presets.length);
    const selected = presets.slice(0, Math.max(1, Math.min(8, requestedCount)));
    const cellWidth = Math.max(...selected.map((item) => item.width)) + 120;
    const cellHeight = Math.max(...selected.map((item) => item.height)) + 120;
    const columns = Math.min(5, selected.length);

    selected.forEach((item, itemIndex) => {
      deliverables.push({
        ...item,
        platform,
        id: `${platform}_${item.role}`,
        x: originX + (itemIndex % columns) * cellWidth,
        y: platformOffsetY + Math.floor(itemIndex / columns) * cellHeight,
      });
    });

    platformOffsetY += Math.ceil(selected.length / columns) * cellHeight + 240;
  }

  return deliverables;
}

export function getEcommerceDeliverableRules(
  platform: EcommercePlatform,
  role: string,
): string[] {
  return PLATFORM_DELIVERABLES[platform]?.find((item) => item.role === role)?.rules ?? [];
}

export function getEcommerceDeliverablePromptSeed(
  platform: EcommercePlatform,
  role: string,
): string {
  return PLATFORM_DELIVERABLES[platform]?.find((item) => item.role === role)?.promptSeed ?? '';
}
