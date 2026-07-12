export type EcommercePlatform = 'amazon' | 'taobao' | 'jd';

export type EcommerceCopyMode = 'none' | 'short_verified' | 'verified_labels';

export interface EcommercePlanInput {
  platforms: EcommercePlatform[];
  sourceAssetId: string;
  productName?: string;
  sellingPoints?: string[];
  brand?: string;
  language?: string;
  creativeDirection?: string;
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
  objective: string;
  composition: string[];
  copyMode: EcommerceCopyMode;
  rules: string[];
  promptSeed: string;
}

type EcommerceDeliverablePreset = Omit<
  EcommerceDeliverable,
  'id' | 'platform' | 'x' | 'y'
>;

const PLATFORM_DELIVERABLES: Record<EcommercePlatform, EcommerceDeliverablePreset[]> = {
  amazon: [
    {
      role: 'main',
      title: 'Amazon 主图',
      width: 2000,
      height: 2000,
      objective: '在缩略图和放大查看时都清楚、可信地展示实际销售商品。',
      composition: [
        'pure white RGB background',
        'single product centered and fully visible',
        'product occupies roughly 80-85% of the image without touching the edges',
        'clean soft commercial shadow only when physically plausible',
      ],
      copyMode: 'none',
      rules: ['纯白背景', '仅展示实际销售商品', '无促销文字、徽章、边框或装饰道具', '商品轮廓完整且身份准确'],
      promptSeed: 'high-end marketplace packshot, precise studio lighting, true material response, clean edge separation',
    },
    {
      role: 'lifestyle',
      title: 'Amazon 使用场景图',
      width: 2000,
      height: 2000,
      objective: '展示商品在真实目标场景中的用途和尺度，同时保持商品是第一视觉焦点。',
      composition: [
        'one believable use scenario matched to the product category',
        'product remains prominent and unobstructed',
        'natural premium lighting with editorial restraint',
        'clear depth and one decisive focal point',
      ],
      copyMode: 'none',
      rules: ['真实使用场景', '不改变商品结构、Logo、包装或颜色', '不添加无法验证的功能暗示'],
      promptSeed: 'premium editorial lifestyle photography, realistic scale and interaction, polished marketplace campaign quality',
    },
    {
      role: 'detail',
      title: 'Amazon 细节图',
      width: 2000,
      height: 2000,
      objective: '用一个清晰的微距视角证明参考图中真实可见的材质、做工或结构细节。',
      composition: [
        'one large macro detail plus enough context to identify the product',
        'sharp texture and controlled specular highlights',
        'no invented internal parts or unseen construction',
        'minimal neutral backdrop',
      ],
      copyMode: 'verified_labels',
      rules: ['只展示参考图中可见细节', '不得编造材料、参数或认证', '标签必须简短且来自用户提供事实'],
      promptSeed: 'luxury commercial macro photography with tactile material detail and disciplined information hierarchy',
    },
    {
      role: 'infographic',
      title: 'Amazon 卖点信息图',
      width: 2000,
      height: 2000,
      objective: '围绕一个已验证卖点建立一眼可懂的视觉证据，而不是堆砌小字。',
      composition: [
        'one hero product view and one supporting detail view at most',
        'one large headline zone integrated into the finished image',
        'clear reading path with generous safe margins',
        'restrained diagram marks only when they explain visible structure',
      ],
      copyMode: 'short_verified',
      rules: ['每张图只表达一个核心卖点', '不得编造性能数据', '避免细小正文和随机图标'],
      promptSeed: 'premium ecommerce infographic, bold mobile-readable hierarchy, sophisticated restrained graphic system',
    },
    {
      role: 'scale',
      title: 'Amazon 尺度与使用图',
      width: 2000,
      height: 2000,
      objective: '通过真实参照物或使用动作帮助买家理解商品尺寸与使用方式。',
      composition: [
        'believable human or environmental scale reference',
        'product proportions remain exact',
        'simple uncluttered setting',
        'no numeric dimensions unless supplied by the user',
      ],
      copyMode: 'verified_labels',
      rules: ['比例真实', '不得猜测尺寸', '商品完整可辨识'],
      promptSeed: 'clean scale-reference product photography, premium catalog styling, instantly understandable use context',
    },
    {
      role: 'secondary_angle',
      title: 'Amazon 补充视角图',
      width: 2000,
      height: 2000,
      objective: '补充参考素材能够可靠支持的第二视角，帮助买家理解外形。',
      composition: [
        'single three-quarter or alternate view supported by the reference',
        'neutral seamless background',
        'product large, complete, and evenly lit',
        'do not invent a rear, sole, or hidden side that is absent from references',
      ],
      copyMode: 'none',
      rules: ['仅生成参考素材支持的角度', '保持品牌标记和结构一致', '无装饰文字'],
      promptSeed: 'premium alternate-angle studio packshot, exact identity fidelity, crisp catalog finish',
    },
    {
      role: 'comparison',
      title: 'Amazon 对比图',
      width: 2000,
      height: 2000,
      objective: '仅使用用户提供的可验证差异做清晰比较。',
      composition: ['simple two-column comparison', 'large product views', 'few large labels', 'no competitor branding'],
      copyMode: 'verified_labels',
      rules: ['只比较已提供事实', '不得贬损竞品', '不使用价格或促销信息'],
      promptSeed: 'refined marketplace comparison module with clean hierarchy and professional product presentation',
    },
    {
      role: 'a_plus',
      title: 'Amazon A+ 品牌横幅',
      width: 1464,
      height: 600,
      objective: '用一张宽幅品牌模块连接产品、使用情境和简洁品牌叙事。',
      composition: ['wide cinematic crop', 'product hero on one side', 'large calm headline area', 'strong safe margins'],
      copyMode: 'short_verified',
      rules: ['品牌叙事简洁', '不写促销、价格或无法验证的绝对化表述', '移动端裁切后仍保留主体'],
      promptSeed: 'cinematic premium A+ brand module, editorial art direction, elegant restrained composition',
    },
  ],
  taobao: [
    {
      role: 'main',
      title: '淘宝主图',
      width: 1000,
      height: 1000,
      objective: '在手机缩略图中立即识别商品，并形成明确的品质和价格带感知。',
      composition: [
        'product occupies roughly 68-78% of the square',
        'one strong hero angle with complete silhouette',
        'mobile-first focal hierarchy and 64px safe margins',
        'no more than three dominant colors derived from the product or brand',
      ],
      copyMode: 'short_verified',
      rules: ['商品是唯一主角', '缩略图可识别', '最多一条短标题和一条短卖点', '不得编造促销或功效'],
      promptSeed: 'top-tier Taobao campaign hero, premium Chinese ecommerce art direction, bold product scale, polished studio realism',
    },
    {
      role: 'selling_point',
      title: '淘宝核心卖点图',
      width: 1000,
      height: 1000,
      objective: '围绕一个用户已提供的卖点，用商品视图和细节证据完成一次清晰说服。',
      composition: [
        'one dominant product view and one supporting macro detail at most',
        'large headline readable on a phone',
        'clear visual proof connected to the product',
        'balanced negative space without empty placeholder boxes',
      ],
      copyMode: 'short_verified',
      rules: ['一图一个卖点', '卖点必须来自用户输入', '不使用段落、小字、随机参数或虚假认证'],
      promptSeed: 'premium mobile ecommerce benefit visual, decisive hierarchy, refined typography, convincing product evidence',
    },
    {
      role: 'scenario',
      title: '淘宝场景图',
      width: 1000,
      height: 1000,
      objective: '把商品放进符合目标人群的真实生活场景，传达使用情绪而不牺牲商品保真。',
      composition: [
        'one aspirational but believable use scenario',
        'product remains clearly visible and correctly scaled',
        'natural movement and realistic contact with people or surfaces',
        'cinematic light with clean commercial color grading',
      ],
      copyMode: 'none',
      rules: ['场景真实并匹配商品类别', '不改变商品结构、Logo、颜色与纹理', '不添加无依据文案'],
      promptSeed: 'premium lifestyle campaign photography for Chinese ecommerce, authentic action, cinematic yet product-led',
    },
    {
      role: 'detail',
      title: '淘宝详情页核心模块',
      width: 750,
      height: 1000,
      objective: '按移动端阅读节奏完成一个可直接使用的详情页模块：问题、产品证据、结论。',
      composition: [
        'vertical three-beat story with one hero crop and up to two real details',
        'strong top-to-bottom rhythm and clear section separation',
        'large mobile-readable headline and very limited supporting labels',
        'visual continuity with the square gallery images',
      ],
      copyMode: 'verified_labels',
      rules: ['竖版移动端阅读', '文字短而大', '不得生成密集正文、占位文本或无法验证的规格'],
      promptSeed: 'high-end Taobao mobile detail-page module, editorial pacing, tactile close-ups, finished conversion design',
    },
    {
      role: 'specification',
      title: '淘宝规格与选购图',
      width: 1000,
      height: 1000,
      objective: '把用户提供的尺寸、适配或规格信息整理成易扫读的选购辅助图。',
      composition: ['one clean product view', 'simple measurement or fit structure', 'large labels', 'ample whitespace and alignment'],
      copyMode: 'verified_labels',
      rules: ['仅使用用户提供规格', '没有规格时改为无文字结构展示', '避免小字表格'],
      promptSeed: 'clean premium ecommerce specification visual, disciplined grid, mobile-readable labels, trustworthy presentation',
    },
    {
      role: 'trust',
      title: '淘宝品牌与信任图',
      width: 1000,
      height: 1000,
      objective: '用品牌、包装、护理或服务信息消除购买顾虑，作为套图收束。',
      composition: ['calm brand-led closing image', 'product or packaging hero', 'one concise trust message', 'premium restrained finish'],
      copyMode: 'short_verified',
      rules: ['只使用真实品牌、服务、包装或护理信息', '不得捏造保障、认证、销量或评价'],
      promptSeed: 'premium brand trust module for Chinese ecommerce, calm confidence, clean product storytelling',
    },
  ],
  jd: [
    {
      role: 'main',
      title: '京东主图',
      width: 1000,
      height: 1000,
      objective: '用清晰、可信、偏理性的商品英雄图建立第一印象。',
      composition: ['product occupies 68-78% of the square', 'complete crisp silhouette', 'clean technical-premium background', '64px safe margins'],
      copyMode: 'short_verified',
      rules: ['商品轮廓清晰', '缩略图可识别', '最多一条事实卖点', '不改变商品信息'],
      promptSeed: 'premium JD ecommerce hero, precise commercial lighting, trustworthy technical polish, strong product focus',
    },
    {
      role: 'selling_point',
      title: '京东核心卖点图',
      width: 1000,
      height: 1000,
      objective: '用一个事实卖点和对应商品证据建立专业可信感。',
      composition: ['one hero view', 'one detail proof', 'large concise headline', 'structured technical graphic accents'],
      copyMode: 'short_verified',
      rules: ['参数和功效必须来自用户输入', '避免装饰性数据、密集小字和虚假认证'],
      promptSeed: 'structured premium ecommerce benefit visual, technical clarity, strong hierarchy, refined restraint',
    },
    {
      role: 'scenario',
      title: '京东使用场景图',
      width: 1000,
      height: 1000,
      objective: '展示真实使用方式和可靠性能氛围，不暗示未提供的功能。',
      composition: ['believable real-world use', 'natural lighting', 'product remains prominent', 'clean commercial color grade'],
      copyMode: 'none',
      rules: ['场景真实', '商品比例、结构和包装准确', '无无依据卖点'],
      promptSeed: 'realistic premium product-in-use campaign, trustworthy styling, natural action, product-led composition',
    },
    {
      role: 'detail',
      title: '京东详情页核心模块',
      width: 750,
      height: 1000,
      objective: '用竖版模块解释真实可见细节和用户已提供的关键信息。',
      composition: ['vertical three-beat structure', 'one hero crop and up to two details', 'large labels', 'clear top-to-bottom reading order'],
      copyMode: 'verified_labels',
      rules: ['突出真实规格和细节', '不得生成无依据参数', '避免小字正文'],
      promptSeed: 'premium JD mobile detail module, precise product close-ups, organized technical hierarchy, finished production design',
    },
    {
      role: 'specification',
      title: '京东规格参数图',
      width: 1000,
      height: 1000,
      objective: '把用户提供的规格信息转化成可扫读的购买依据。',
      composition: ['clean product view', 'simple specification grid', 'few large labels', 'strong alignment and whitespace'],
      copyMode: 'verified_labels',
      rules: ['仅使用用户提供参数', '没有参数时不生成虚构表格', '移动端可读'],
      promptSeed: 'precise premium specification graphic, disciplined grid, trustworthy catalog presentation',
    },
    {
      role: 'trust',
      title: '京东品牌与服务图',
      width: 1000,
      height: 1000,
      objective: '用真实品牌、包装、售后或护理信息完成可信收束。',
      composition: ['brand-led closing frame', 'product or packaging hero', 'one concise trust line', 'quiet premium background'],
      copyMode: 'short_verified',
      rules: ['不得捏造服务承诺、认证、销量或评价', '信息简洁可核验'],
      promptSeed: 'premium ecommerce trust module, confident brand finish, calm professional art direction',
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

function findDeliverable(
  platform: EcommercePlatform,
  role: string,
): EcommerceDeliverablePreset | undefined {
  return PLATFORM_DELIVERABLES[platform]?.find((item) => item.role === role);
}

export function getEcommerceDeliverableRules(
  platform: EcommercePlatform,
  role: string,
): string[] {
  return findDeliverable(platform, role)?.rules ?? [];
}

export function getEcommerceDeliverablePromptSeed(
  platform: EcommercePlatform,
  role: string,
): string {
  return findDeliverable(platform, role)?.promptSeed ?? '';
}

export function getEcommerceDeliverableBrief(
  platform: EcommercePlatform,
  role: string,
): Pick<EcommerceDeliverable, 'objective' | 'composition' | 'copyMode'> {
  const item = findDeliverable(platform, role);
  return {
    objective: item?.objective ?? 'Create a polished, production-ready ecommerce image.',
    composition: item?.composition ?? [],
    copyMode: item?.copyMode ?? 'none',
  };
}
