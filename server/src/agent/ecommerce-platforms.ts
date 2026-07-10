export type EcommercePlatform = 'amazon' | 'taobao' | 'jd';

export interface EcommercePlanInput {
  platforms: EcommercePlatform[];
  sourceAssetId: string;
  productName?: string;
  sellingPoints?: string[];
  brand?: string;
  language?: string;
  imagesPerPlatform?: number;
}

export interface EcommerceDeliverable {
  id: string;
  frameId: string;
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
  Omit<EcommerceDeliverable, 'id' | 'frameId' | 'platform' | 'x' | 'y'>[]
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
  const perPlatform = Math.max(1, Math.min(4, input.imagesPerPlatform || 3));
  return input.platforms.flatMap((platform, platformIndex) =>
    PLATFORM_DELIVERABLES[platform].slice(0, perPlatform).map((item, itemIndex) => ({
      ...item,
      platform,
      id: `${platform}_${item.role}`,
      frameId: `commerce_${platform}_${item.role}`,
      x: itemIndex * 2200,
      y: platformIndex * 2200,
    })),
  );
}

export function getEcommerceDeliverableRules(
  platform: EcommercePlatform,
  role: string,
): string[] {
  return PLATFORM_DELIVERABLES[platform]?.find((item) => item.role === role)?.rules ?? [];
}
