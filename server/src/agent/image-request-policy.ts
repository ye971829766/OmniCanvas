const MODEL_MENTION = /@[^\[\r\n]{1,120}?\s*\[modelId:[^\]]+\]/gi;
const MACHINE_CONTEXT_TAG = /\[(?:modelId|refId):[^\]]+\]/gi;

export type FinalImagePromptMode = 'verbatim' | 'normalize' | 'optimize';
export type FinalImageSeriesStrategy = 'shared_variants' | 'role_suite';
export type EcommercePlatformHint = 'amazon' | 'taobao' | 'jd' | 'generic';

export interface FinalImageSeriesSlot {
  role: string;
  title: string;
  aspectRatio: '1:1' | '2:3' | '3:4';
  size: '1024x1024' | '1024x1536' | '1152x1536';
}

const EXPLICIT_PRESERVE_REQUEST =
  /(?:不要|无需|禁止).{0,8}(?:优化|改写|扩写|润色|翻译).{0,6}(?:提示词|描述)?|(?:原样|一字不改|逐字|照原提示词)|\b(?:verbatim|exact prompt|as written|do not (?:rewrite|expand|optimi[sz]e|translate))\b/i;
const EXPLICIT_OPTIMIZE_REQUEST =
  /(?:优化|改写|扩写|润色|完善).{0,8}(?:提示词|描述)|(?:帮我|请).{0,8}(?:设计|发挥|补全).{0,8}(?:画面|视觉|提示词)?|\b(?:optimi[sz]e|rewrite|expand|improve).{0,8}(?:the )?prompt\b/i;
const HIGH_LEVEL_DELIVERABLE =
  /(?:电商|淘宝|天猫|京东|亚马逊|amazon|商品|产品).{0,16}(?:主图|详情页|广告图|宣传图|海报|套图|a\+|a\s*plus|a-plus)|(?:主图|详情页|广告图|宣传图|海报|封面|banner|poster|listing image|product image|a\+|a\s*plus content)/i;
const ROLE_STRUCTURED_SUITE =
  /(?:淘宝|天猫|京东|亚马逊|amazon|电商)?套图|(?:主图|main image).{0,16}(?:[+＋和与及、,，]|and).{0,16}(?:详情页?|细节图|场景图|卖点图|detail|lifestyle|infographic)|(?:详情页?|detail).{0,16}(?:[+＋和与及、,，]|and).{0,16}(?:主图|main image)|\b(?:listing|ecommerce)\s+(?:suite|set)\b/i;
const EXPLICIT_WEB_RESEARCH =
  /(?:联网|网页|网上|全网).{0,8}(?:搜索|检索|调研|研究)|(?:搜索|检索|调研|研究).{0,12}(?:趋势|潮流|竞品|同行|案例|参考)|\b(?:web search|search (?:the )?web|research|current trends?|competitors?|benchmarks?)\b/i;
const EXPLICIT_NO_WEB_RESEARCH =
  /(?:不要|无需|禁止|别).{0,8}(?:联网|网页搜索|网上搜索|检索|调研)|(?:离线|不联网)|\b(?:offline|no web|without (?:web )?(?:search|research)|do not (?:browse|search|research))\b/i;

/** Amazon A+ Content / Enhanced Brand Content — not a mobile shopping PDP. */
const AMAZON_A_PLUS_REQUEST =
  /(?:亚马逊|amazon).{0,20}(?:a\+|a\s*plus|a-plus|高级|品牌故事|增强品牌|enhanced brand)|(?:a\+|a\s*plus|a-plus).{0,16}(?:详情|content|page|模块|页面)|(?:亚马逊|amazon).{0,12}(?:详情页|详情|detail page)/i;

const CONCRETE_VISUAL_SIGNALS = [
  /(?:背景|场景|环境|室内|户外|桌面|天空|森林|城市|海边|纯白|渐变|色调|配色|黑色|白色|红色|蓝色|绿色|金色|银色|材质|纹理)|\b(?:background|scene|environment|indoor|outdoor|palette|color|gradient|texture|material)\b/i,
  /(?:光线|灯光|逆光|侧光|柔光|硬光|霓虹|阴影|高光|氛围|清晨|黄昏|夜晚|雾)|\b(?:lighting|backlit|rim light|soft light|hard light|neon|shadow|atmosphere|morning|sunset|night|fog)\b/i,
  /(?:构图|居中|对称|留白|特写|近景|远景|俯视|仰视|正面|侧面|透视|镜头|焦段|景深|视角)|\b(?:composition|centered|symmetr|negative space|close-up|wide shot|top-down|low angle|front view|side view|lens|depth of field|camera)\b/i,
  /(?:极简|复古|未来|科技|赛博朋克|水墨|油画|插画|手绘|摄影|写实|超现实|卡通|黏土|三维|3d|电影感|杂志风)|\b(?:minimal|retro|futur|cyberpunk|ink wash|oil paint|illustration|hand-drawn|photograph|photoreal|surreal|cartoon|clay|3d render|cinematic|editorial)\b/i,
  /(?:标题|文案|字体|排版|logo|标语|不要文字|无文字|禁止|不要|必须|保留|不改变)|\b(?:headline|copy|typography|font|logo|slogan|no text|without text|must|preserve|do not)\b/i,
];

/** Slot titles encode commercial intent for logs/UI; sizes stay provider-friendly. */
const SERIES_SLOTS_ZH: FinalImageSeriesSlot[] = [
  { role: 'main_hero', title: '主图1·首屏英雄图', aspectRatio: '1:1', size: '1024x1024' },
  { role: 'main_scene', title: '主图2·场景/氛围图', aspectRatio: '1:1', size: '1024x1024' },
  { role: 'main_detail', title: '主图3·卖点/细节证据图', aspectRatio: '1:1', size: '1024x1024' },
  { role: 'detail_overview', title: '详情页1·完整开屏长图模块', aspectRatio: '2:3', size: '1024x1536' },
  { role: 'detail_material', title: '详情页2·材质工艺证据模块', aspectRatio: '2:3', size: '1024x1536' },
  { role: 'detail_usage', title: '详情页3·上脚搭配/场景模块', aspectRatio: '2:3', size: '1024x1536' },
  { role: 'main_clean', title: '主图4·纯净目录图', aspectRatio: '1:1', size: '1024x1024' },
  { role: 'detail_closing', title: '详情页4·信任收束模块', aspectRatio: '2:3', size: '1024x1536' },
];

const SERIES_SLOTS_EN: FinalImageSeriesSlot[] = [
  { ...SERIES_SLOTS_ZH[0]!, title: 'main image 1 · listing hero' },
  { ...SERIES_SLOTS_ZH[1]!, title: 'main image 2 · scene hero' },
  { ...SERIES_SLOTS_ZH[2]!, title: 'main image 3 · benefit/detail proof' },
  { ...SERIES_SLOTS_ZH[3]!, title: 'detail page 1 · full opening module' },
  { ...SERIES_SLOTS_ZH[4]!, title: 'detail page 2 · material/craft module' },
  { ...SERIES_SLOTS_ZH[5]!, title: 'detail page 3 · lifestyle/match module' },
  { ...SERIES_SLOTS_ZH[6]!, title: 'main image 4 · clean catalog' },
  { ...SERIES_SLOTS_ZH[7]!, title: 'detail page 4 · trust closing module' },
];

/** Strip editor-only mention metadata; never rewrite visual language here. */
export function finalImagePromptFromUserInput(userInput: unknown): string {
  if (typeof userInput !== 'string') return '';
  return userInput
    .replace(MODEL_MENTION, '')
    .replace(MACHINE_CONTEXT_TAG, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function usesChinese(prompt: string): boolean {
  return (prompt.match(/[\u3400-\u9fff]/g)?.length ?? 0) >= 3;
}

function concreteVisualSignalCount(prompt: string): number {
  return CONCRETE_VISUAL_SIGNALS.reduce(
    (count, pattern) => count + Number(pattern.test(prompt)),
    0,
  );
}

export function getEcommercePlatformHint(userInput: unknown): EcommercePlatformHint {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (!prompt) return 'generic';
  if (/(?:亚马逊|amazon|\ba\+\b|a\s*plus|a-plus)/i.test(prompt)) return 'amazon';
  if (/(?:京东|\bjd\.com\b)/i.test(prompt)) return 'jd';
  if (/(?:淘宝|天猫|taobao|tmall)/i.test(prompt)) return 'taobao';
  return 'generic';
}

export function isAmazonAPlusRequest(userInput: unknown): boolean {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (!prompt) return false;
  if (AMAZON_A_PLUS_REQUEST.test(prompt)) return true;
  // "亚马逊详情页" without A+ still maps to Enhanced Brand Content style pages.
  return getEcommercePlatformHint(prompt) === 'amazon' &&
    /详情|detail|content|模块|页面/i.test(prompt);
}

export function isCommercialHighLevelRequest(userInput: unknown): boolean {
  const prompt = finalImagePromptFromUserInput(userInput);
  return Boolean(prompt) && HIGH_LEVEL_DELIVERABLE.test(prompt);
}

export function getFinalImageSeriesStrategy(
  userInput: unknown,
): FinalImageSeriesStrategy {
  const prompt = finalImagePromptFromUserInput(userInput);
  return ROLE_STRUCTURED_SUITE.test(prompt) ? 'role_suite' : 'shared_variants';
}

export function getFinalImagePromptMode(
  userInput: unknown,
): FinalImagePromptMode {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (EXPLICIT_PRESERVE_REQUEST.test(prompt)) return 'verbatim';
  if (EXPLICIT_OPTIMIZE_REQUEST.test(prompt)) return 'optimize';
  if (ROLE_STRUCTURED_SUITE.test(prompt)) return 'optimize';
  if (!prompt || concreteVisualSignalCount(prompt) < 2) return 'optimize';
  return 'normalize';
}

export function shouldResearchFinalImageRequest(userInput: unknown): boolean {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (!prompt || EXPLICIT_NO_WEB_RESEARCH.test(prompt)) return false;
  if (EXPLICIT_WEB_RESEARCH.test(prompt)) return true;
  return HIGH_LEVEL_DELIVERABLE.test(prompt) &&
    getFinalImagePromptMode(prompt) === 'optimize';
}

export function getFinalImageSeriesSlot(
  index: number,
  userInput: unknown,
  total = 6,
): FinalImageSeriesSlot {
  const slots = usesChinese(finalImagePromptFromUserInput(userInput))
    ? SERIES_SLOTS_ZH
    : SERIES_SLOTS_EN;
  const mainSlots = [slots[0]!, slots[1]!, slots[2]!, slots[6]!];
  const detailSlots = [slots[3]!, slots[4]!, slots[5]!, slots[7]!];
  const mainCount = Math.max(1, Math.ceil(Math.max(1, total) / 2));
  return index < mainCount
    ? mainSlots[index % mainSlots.length]!
    : detailSlots[(index - mainCount) % detailSlots.length]!;
}

function qualityMissing(input: any): boolean {
  return (
    input.quality == null ||
    (typeof input.quality === 'string' && !input.quality.trim())
  );
}

function normalizedPromptWithAuthoritativeRequest(
  userPrompt: string,
  candidate: string,
): string {
  if (!candidate || candidate === userPrompt || candidate.includes(userPrompt)) {
    return candidate || userPrompt;
  }
  return usesChinese(userPrompt)
    ? `用户原始要求（最高优先级，所有明确细节与限制必须保留）：\n${userPrompt}\n\nAgent 生产化渲染说明（仅作增强；如有冲突以上述原始要求为准）：\n${candidate}`
    : `Original user requirements (authoritative; preserve every explicit detail and constraint):\n${userPrompt}\n\nAgent production rendering notes (enhancement only; ignore any conflict with the requirements above):\n${candidate}`;
}

/**
 * Verbatim mode is the sole hard prompt guarantee and is enabled only when the
 * user explicitly asks for exact wording. Normal production prompts may be
 * normalized by the control model without silently losing user constraints.
 * All final image calls get the same high-quality floor as the manual ImageGen
 * UI; commercial high-level briefs also get safe layout defaults when omitted.
 */
export function applyFinalImageRequestPolicy(
  toolName: string,
  input: any,
  userInput: unknown,
): any {
  if (
    (toolName !== 'generate_image' && toolName !== 'edit_image') ||
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) return input;

  const userPrompt = finalImagePromptFromUserInput(userInput);
  if (!userPrompt) return input;
  const candidate = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const promptMode = getFinalImagePromptMode(userPrompt);
  const verbatim = promptMode === 'verbatim';
  const normalized = {
    ...input,
    prompt: verbatim
      ? userPrompt
      : promptMode === 'normalize'
        ? normalizedPromptWithAuthoritativeRequest(userPrompt, candidate)
        : candidate || userPrompt,
  };
  // `style` is appended to the provider prompt. In explicit verbatim mode it
  // would silently violate the user's exact wording; other modes keep it.
  if (
    verbatim &&
    typeof normalized.style === 'string' &&
    !userPrompt.toLowerCase().includes(normalized.style.trim().toLowerCase())
  ) delete normalized.style;

  // Manual ImageGen defaults to a final-quality render. Agent calls must not
  // silently fall back to provider `auto` merely because the router omitted a
  // control; explicit low/medium/draft choices remain untouched.
  if (qualityMissing(normalized)) normalized.quality = 'high';

  // Fill commercial layout controls the agent often omits.
  if (!verbatim && isCommercialHighLevelRequest(userPrompt)) {
    if (isAmazonAPlusRequest(userPrompt)) {
      if (
        normalized.aspectRatio == null ||
        (typeof normalized.aspectRatio === 'string' && !normalized.aspectRatio.trim())
      ) {
        normalized.aspectRatio = '2:3';
      }
      if (
        normalized.size == null ||
        (typeof normalized.size === 'string' && !normalized.size.trim())
      ) {
        normalized.size = '1024x1536';
      }
    }
  }

  return normalized;
}

/**
 * Add structural metadata for an explicit main+detail suite, and commercial
 * provider defaults for any remaining high-level ecommerce calls.
 * Prompts stay agent-authored; only missing layout/quality controls are filled.
 */
export function applyFinalImageSeriesLayout(
  calls: Array<{ name: string; input: any }>,
  userInput: unknown,
): void {
  const imageCalls = calls.filter((call) =>
    (call.name === 'generate_image' || call.name === 'edit_image') &&
    call.input && typeof call.input === 'object',
  );
  if (imageCalls.length === 0) return;

  const platform = getEcommercePlatformHint(userInput);
  const amazonAPlus = isAmazonAPlusRequest(userInput);
  const cleanedUserPrompt = finalImagePromptFromUserInput(userInput);
  const userSpecifiedGeometry =
    /\b\d{2,5}\s*(?:x|×)\s*\d{2,5}\b|\b\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?\b|尺寸|分辨率|横版|竖版|方形/i.test(
      cleanedUserPrompt,
    );

  if (getFinalImageSeriesStrategy(userInput) === 'role_suite') {
    if (platform === 'amazon' && !amazonAPlus) {
      const amazonRoles = [
        'main',
        'supporting_view',
        'lifestyle',
        'feature_evidence',
        'visible_detail',
        'use_or_scale',
      ];
      imageCalls.forEach((call, index) => {
        call.input.seriesRole ??= amazonRoles[index % amazonRoles.length];
        // A fresh Amazon listing suite is square by definition. Enforce the
        // provider controls for the batch so a router cannot accidentally mix
        // 1:1 metadata with portrait pixels. A one-call retry keeps its exact
        // previous controls.
        if (imageCalls.length > 1 && !userSpecifiedGeometry) {
          call.input.aspectRatio = '1:1';
          call.input.size = '2000x2000';
        } else {
          call.input.aspectRatio ??= '1:1';
          call.input.size ??= '2000x2000';
        }
        if (qualityMissing(call.input)) call.input.quality = 'high';
      });
    } else if (amazonAPlus) {
      imageCalls.forEach((call, index) => {
        call.input.seriesRole ??= index === 0 ? 'a_plus' : `a_plus_variant_${index + 1}`;
        call.input.aspectRatio ??= '2:3';
        call.input.size ??= '1024x1536';
        if (qualityMissing(call.input)) call.input.quality = 'high';
      });
    } else {
      const localizedSlots = usesChinese(finalImagePromptFromUserInput(userInput))
        ? SERIES_SLOTS_ZH
        : SERIES_SLOTS_EN;
      imageCalls.forEach((call, index) => {
        const slot = localizedSlots.find(
          (candidate) => candidate.role === call.input.seriesRole,
        ) || getFinalImageSeriesSlot(index, userInput, imageCalls.length);
        call.input.seriesRole ??= slot.role;
        call.input.aspectRatio ??= slot.aspectRatio;
        call.input.size ??= slot.size;
        if (qualityMissing(call.input)) call.input.quality = 'high';
      });
    }
  }

  // Single commercial briefs (e.g. 亚马逊 A+ 详情页) are shared_variants — still
  // need high quality + tall A+ layout when the agent omits controls.
  const commercial = isCommercialHighLevelRequest(userInput);
  const aPlus = amazonAPlus;
  if (!commercial && !aPlus) return;

  imageCalls.forEach((call) => {
    if (qualityMissing(call.input)) {
      call.input.quality = 'high';
    }
    if (aPlus) {
      if (
        call.input.aspectRatio == null ||
        (typeof call.input.aspectRatio === 'string' && !call.input.aspectRatio.trim())
      ) {
        call.input.aspectRatio = '2:3';
      }
      if (
        call.input.size == null ||
        (typeof call.input.size === 'string' && !call.input.size.trim())
      ) {
        call.input.size = '1024x1536';
      }
    }
  });
}
