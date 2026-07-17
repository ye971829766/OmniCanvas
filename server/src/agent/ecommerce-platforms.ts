/**
 * Single source of truth for ecommerce platform names and deliverable names.
 *
 * This registry intentionally contains no sizes, layouts, styles, copy, or
 * production prompts. The control agent may decide *which* deliverables are
 * needed; the image model decides how to render each minimally named task.
 */

export type EcommercePlatform =
  | 'amazon'
  | 'taobao'
  | 'tmall'
  | 'jd'
  | 'shopee'
  | 'lazada'
  | 'temu'
  | 'tiktok_shop'
  | 'ebay'
  | 'walmart'
  | 'etsy'
  | 'generic';

export type EcommerceDeliverableId =
  | 'main'
  | 'a_plus'
  | 'detail_page'
  | 'gallery'
  | 'feature'
  | 'lifestyle'
  | 'packaging'
  | 'specification'
  | 'comparison';

export interface EcommerceDeliverableDefinition {
  id: EcommerceDeliverableId;
  promptLabel: string;
  aliases: readonly string[];
}

export interface EcommercePlatformDefinition {
  id: EcommercePlatform;
  label: string;
  aliases: readonly string[];
  /** Empty means the control agent selects the smallest conventional set. */
  defaultSuite: readonly EcommerceDeliverableId[];
}

export const ECOMMERCE_DELIVERABLES: Readonly<
  Record<EcommerceDeliverableId, EcommerceDeliverableDefinition>
> = Object.freeze({
  main: {
    id: 'main',
    promptLabel: '主图',
    aliases: ['main', 'main_image', 'main image', 'hero', 'hero_image', 'hero image', '主图', '首图'],
  },
  a_plus: {
    id: 'a_plus',
    promptLabel: '亚马逊A+详情页',
    aliases: ['a_plus', 'a+ 详情页', 'a+详情页', 'a plus detail page', 'a+', 'a plus', 'a-plus', 'a+页面', '亚马逊a+详情页', '亚马逊详情页'],
  },
  detail_page: {
    id: 'detail_page',
    promptLabel: '详情页',
    aliases: ['detail_page', 'detail page', 'product detail page', '详情页', '商品详情页'],
  },
  gallery: {
    id: 'gallery',
    promptLabel: '商品展示图',
    aliases: ['gallery', 'gallery_image', 'gallery image', 'listing_image', 'listing image', '商品展示图', '展示图'],
  },
  feature: {
    id: 'feature',
    promptLabel: '功能图',
    aliases: ['feature', 'feature_image', 'feature image', 'infographic', '功能图', '卖点图'],
  },
  lifestyle: {
    id: 'lifestyle',
    promptLabel: '使用场景图',
    aliases: ['lifestyle', 'lifestyle_image', 'lifestyle image', 'scene', 'scenario', '场景图', '使用场景图'],
  },
  packaging: {
    id: 'packaging',
    promptLabel: '包装图',
    aliases: ['packaging', 'packaging_image', 'packaging image', 'package image', '包装图'],
  },
  specification: {
    id: 'specification',
    promptLabel: '规格图',
    aliases: ['specification', 'specification_image', 'specification image', 'size chart', '规格图', '尺寸图', '尺码图'],
  },
  comparison: {
    id: 'comparison',
    promptLabel: '对比图',
    aliases: ['comparison', 'comparison_image', 'comparison image', '对比图'],
  },
});

export const ECOMMERCE_PLATFORMS: readonly EcommercePlatformDefinition[] = Object.freeze([
  {
    id: 'amazon',
    label: '亚马逊',
    aliases: ['amazon', '亚马逊'],
    // Initial required roles for a bare Amazon suite, not a runtime output cap.
    defaultSuite: ['main', 'a_plus'],
  },
  { id: 'taobao', label: '淘宝', aliases: ['taobao', '淘宝'], defaultSuite: [] },
  { id: 'tmall', label: '天猫', aliases: ['tmall', '天猫'], defaultSuite: [] },
  { id: 'jd', label: '京东', aliases: ['jd', 'jd.com', '京东'], defaultSuite: [] },
  { id: 'shopee', label: 'Shopee', aliases: ['shopee', '虾皮'], defaultSuite: [] },
  { id: 'lazada', label: 'Lazada', aliases: ['lazada'], defaultSuite: [] },
  { id: 'temu', label: 'Temu', aliases: ['temu'], defaultSuite: [] },
  { id: 'tiktok_shop', label: 'TikTok Shop', aliases: ['tiktok shop', 'tiktokshop', '抖音电商'], defaultSuite: [] },
  { id: 'ebay', label: 'eBay', aliases: ['ebay'], defaultSuite: [] },
  { id: 'walmart', label: 'Walmart', aliases: ['walmart'], defaultSuite: [] },
  { id: 'etsy', label: 'Etsy', aliases: ['etsy'], defaultSuite: [] },
  { id: 'generic', label: '电商平台', aliases: [], defaultSuite: [] },
]);

function normalized(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, ' ')
    : '';
}

function containsAlias(text: string, alias: string): boolean {
  const normalizedAlias = normalized(alias);
  if (!normalizedAlias) return false;
  if (/^[a-z0-9.+ ]+$/i.test(normalizedAlias)) {
    const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text);
  }
  return text.includes(normalizedAlias);
}

export function resolveEcommercePlatform(value: unknown): EcommercePlatformDefinition {
  const text = normalized(value);
  if (text) {
    for (const platform of ECOMMERCE_PLATFORMS) {
      if (platform.id === 'generic') continue;
      if (platform.aliases.some((alias) => containsAlias(text, alias))) return platform;
    }
  }
  return ECOMMERCE_PLATFORMS.find((platform) => platform.id === 'generic')!;
}

export function getEcommercePlatform(
  id: EcommercePlatform,
): EcommercePlatformDefinition {
  return ECOMMERCE_PLATFORMS.find((platform) => platform.id === id) ||
    resolveEcommercePlatform('');
}

export function resolveEcommerceDeliverable(
  value: unknown,
): EcommerceDeliverableDefinition | undefined {
  const text = normalized(value);
  if (!text) return undefined;
  const definitions = Object.values(ECOMMERCE_DELIVERABLES);
  const exact = definitions.find((item) =>
    normalized(item.id) === text ||
    item.aliases.some((alias) => normalized(alias) === text)
  );
  if (exact) return exact;
  return definitions
    .flatMap((item) => item.aliases.map((alias) => ({ item, alias: normalized(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length)
    .find(({ alias }) => alias && containsAlias(text, alias))
    ?.item;
}

export function getDefaultSuiteDeliverables(
  platform: EcommercePlatformDefinition,
): EcommerceDeliverableDefinition[] {
  return platform.defaultSuite.map((id) => ECOMMERCE_DELIVERABLES[id]);
}

/**
 * Free-form deliverables keep the architecture open to new marketplaces, but
 * only a short artifact name is allowed. Creative direction belongs to the
 * user's verified constraint snippets, not this field.
 */
export function normalizeCustomDeliverableLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value
    .replace(/^\s*(?:\d{1,2}[.、)]|[一二三四五六七八九十]+[、.)])\s*/, '')
    .replace(/^(?:请|帮我|please|help me)\s*/i, '')
    .replace(/^(?:生成|制作|创建|绘制|设计|做|generate|create|make|design)\s*/i, '')
    .trim();
  if (!label || label.length > 32) return undefined;
  if (/[\r\n,，;；:：。！？!?]/.test(label)) return undefined;
  if (/(?:套图|全套|一套|多张|\bsuite\b|\bset\b)/i.test(label)) return undefined;
  if (/(?:包含|包括|采用|使用|构图|布局|背景|光线|灯光|配色|风格|文案|专业|高端|高级|完美|精美|\bwith\b|\busing\b|\bstyle\b|\bpremium\b|\bprofessional\b|\bcinematic\b)/i.test(label)) {
    return undefined;
  }
  if (!/(?:图|页|海报|封面|横幅|模块|a\+|image|photo|page|banner|poster|content|module)/i.test(label)) {
    return undefined;
  }
  return label;
}
