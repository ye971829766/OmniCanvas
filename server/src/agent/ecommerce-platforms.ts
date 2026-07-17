import { AMAZON_ROLE_PROMPT_SEEDS } from './amazon-listing-standard';

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

/**
 * Amazon listing suite presets — quality floor distilled from a production-
 * qualified 11-image Amazon apparel suite (see amazon-listing-standard.ts and
 * repo `amazon-demo/`). Default suites take the first 6 roles; max 8.
 */
const PLATFORM_DELIVERABLES: Record<EcommercePlatform, EcommerceDeliverablePreset[]> = {
  amazon: [
    {
      role: 'main',
      title: 'Amazon 主图（合规英雄图）',
      width: 2000,
      height: 2000,
      objective:
        '在缩略图和放大查看时都清楚、可信地展示实际销售商品，达到合格 Amazon 主图标准：纯白棚拍、商品主导、零促销文字。',
      composition: [
        'pure white RGB seamless studio background',
        'single product or worn product centered and fully visible',
        'product occupies roughly 80-85% of the image without touching the edges',
        'soft even commercial lighting, true material color, clean edge separation',
        'for apparel: natural front model pose preferred; product-only / ghost mannequin also valid',
        'clean soft commercial shadow only when physically plausible',
      ],
      copyMode: 'none',
      rules: [
        '纯白背景',
        '仅展示实际销售商品',
        '无促销文字、徽章、边框、水印或装饰道具',
        '商品轮廓完整且身份与参考图一致',
        'quality high · 2000×2000 方形',
      ],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.main,
    },
    {
      role: 'lifestyle',
      title: 'Amazon 使用/质感动作图',
      width: 2000,
      height: 2000,
      objective:
        '用自然互动动作证明版型、垂感、弹性或使用方式（如拉衣角、握持、穿戴动作），保持与主图同一棚拍体系与商品身份。',
      composition: [
        'same soft white / cool studio family as the main image',
        'model or hand naturally interacting with the product (pull, open, hold, wear-in-motion)',
        'product remains the dominant hero and fully identifiable',
        'soft commercial light, natural expression, no stiff catalog stiffness',
        'no promotional text, badges, or cart chrome',
      ],
      copyMode: 'none',
      rules: [
        '真实可信的互动动作',
        '不改变商品结构、Logo、包装或颜色',
        '不添加无法验证的功能暗示或促销文案',
        '与主图共享光影与色调体系',
      ],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.lifestyle,
    },
    {
      role: 'secondary_angle',
      title: 'Amazon 补充视角图',
      width: 2000,
      height: 2000,
      objective: '补充参考素材能够可靠支持的第二视角（背面、3/4、人台/平铺），帮助买家理解外形。',
      composition: [
        'single back, three-quarter, or ghost-mannequin / flat product view supported by the reference',
        'pure white or soft cool seamless background',
        'product large, complete, and evenly lit',
        'do not invent a rear, sole, or hidden side that is absent from references',
      ],
      copyMode: 'none',
      rules: ['仅生成参考素材支持的角度', '保持品牌标记和结构一致', '无装饰文字'],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.secondary_angle,
    },
    {
      role: 'infographic',
      title: 'Amazon 单卖点信息图',
      width: 2000,
      height: 2000,
      objective:
        '围绕一个已验证卖点建立一眼可懂的视觉证据：场景证明 + 深色底栏大标题，而不是堆砌小字。',
      composition: [
        'product-led scene that visually proves ONE benefit (studio or clean outdoor as needed)',
        'semi-transparent dark bottom banner with bold English TITLE + one short subtitle',
        'optional large verified number/percentage only when user-supplied',
        'clear reading path, generous safe margins, mobile-thumbnail readable type',
        'no cart UI, stars, prices, or BEST SELLER stickers',
      ],
      copyMode: 'short_verified',
      rules: [
        '每张图只表达一个核心卖点',
        '不得编造性能数据、百分比或认证',
        '标题短大清晰，避免细小正文和随机图标',
        '英文编辑型层级（除非用户指定其他语言）',
      ],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.infographic,
    },
    {
      role: 'material',
      title: 'Amazon 材质微距信息图',
      width: 2000,
      height: 2000,
      objective:
        '用满幅真实材质微距证明触感与工艺，配合中心标题与底部 ≤4 个线性图标利益点（仅可见或用户已提供事实）。',
      composition: [
        'full-bleed macro of real product material / surface from references',
        'centered bold English title and optional small fact chip (e.g. fiber content only if user-supplied)',
        'bottom row of up to four equal thin white line icons with short labels',
        'restrained light accent or ray only if it clarifies texture',
        'no invented specs, dense body copy, or random emoji icons',
      ],
      copyMode: 'short_verified',
      rules: [
        '微距必须来自真实可见材质',
        '图标利益点 ≤4 且可验证',
        '不得编造材料配方或认证',
      ],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.material,
    },
    {
      role: 'detail',
      title: 'Amazon 做工细节拼图',
      width: 2000,
      height: 2000,
      objective:
        '用 2–3 宫格证明真实做工细节（标签、缝线、五金、弹力动作等），每格 TITLE + 短副标题，克制专业。',
      composition: [
        'two or three equal panels with clean white gutters',
        'each panel: real close-up from reference-supported details + bold TITLE + one short subtitle',
        'calm commercial lighting and consistent product identity across panels',
        'no more than three panels; no invented internal construction',
      ],
      copyMode: 'verified_labels',
      rules: [
        '只展示参考图中可见细节',
        '不得编造材料、参数或认证',
        '标签必须简短且来自用户提供事实或可见特征',
      ],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.detail,
    },
    {
      role: 'multi_scenario',
      title: 'Amazon 多场景对比图',
      width: 2000,
      height: 2000,
      objective: '用两个清晰的真实使用场合展示商品适配场景，商品在两格中都保持可识别与身份一致。',
      composition: [
        'dual-panel or split lifestyle occasions matched to product category',
        'product clearly visible and correctly scaled in each panel',
        'optional large low-opacity ambient typography for atmosphere only',
        'model size / height notes only if the user supplied measurements',
        'clean commercial color grade shared with the rest of the suite',
      ],
      copyMode: 'verified_labels',
      rules: [
        '场景真实并匹配品类',
        '不改变商品结构与颜色',
        '尺寸文案仅限用户提供数据',
      ],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.multi_scenario,
    },
    {
      role: 'specification',
      title: 'Amazon 尺码/规格图',
      width: 2000,
      height: 2000,
      objective:
        '把用户提供的尺码、测量或属性整理成可扫读的规格图（平铺/人台 + 标注线 + 属性条 + 表格），无数据时不编造数字。',
      composition: [
        'flat or worn product with clear measurement guide lines when sizes are supplied',
        'attribute sliders (thickness / stretch / softness style) only for user-supplied traits',
        'size table only from user-provided data; omit table entirely if none supplied',
        'optional care icons as simple line icons',
        'clean white catalog layout, large readable labels, no invented numbers',
      ],
      copyMode: 'verified_labels',
      rules: [
        '仅使用用户提供规格与尺码',
        '没有规格时改为无数字的结构展示，不生成虚构表格',
        '移动端可读，避免密集小字',
      ],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.specification,
    },
    // Findable for A+ requests; suite builder caps at 8 so this is not in the default 6–8 listing set.
    {
      role: 'a_plus',
      title: 'Amazon A+ 多模块详情内容页',
      width: 1464,
      height: 2200,
      objective:
        '生成一张可上传的 Amazon Enhanced Brand Content / A+ 多模块内容长图：品牌故事、功能证据、细节与场景，而不是带加购按钮的移动端商品详情页。',
      composition: [
        'tall multi-section catalog page with clear horizontal module bands',
        'brand-story hero with large product presentation and calm English headline',
        'feature evidence grid with short benefit labels only for visible traits',
        'material / multi-angle close-ups with captions',
        'lifestyle / occasion strip with 3-4 real-use scenes',
        'generous whitespace, aligned columns, premium catalog finish on white or soft-neutral panels',
      ],
      copyMode: 'short_verified',
      rules: [
        '英文编辑型标题层级（除非用户指定其他语言）',
        '禁止 Add to Cart / 购买按钮 / 评分星级 / 价格 / 购物车 UI',
        '禁止套用淘宝/京东移动端转化详情页样式',
        '品牌叙事简洁，不写促销、价格或无法验证的绝对化表述',
        '商品身份与参考图一致',
      ],
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.a_plus,
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
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.comparison,
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
      promptSeed: AMAZON_ROLE_PROMPT_SEEDS.scale,
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
