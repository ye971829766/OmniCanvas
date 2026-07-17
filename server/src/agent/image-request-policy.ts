import {
  resolveEcommercePlatform,
  type EcommercePlatform,
} from './ecommerce-platforms';
import {
  IMAGE_REQUEST_POLICY_ERROR,
  buildImageSuitePlan,
  compileImageSuiteBatch,
  compileImageSuiteTask,
  getExplicitImageCount,
  isImageSuiteRequest,
} from './image-suite-plan';

const MODEL_MENTION = /@[^\[\r\n]{1,120}?\s*\[modelId:[^\]]+\]/gi;
const MACHINE_CONTEXT_TAG = /\[(?:modelId|refId):[^\]]+\]/gi;

export type FinalImagePromptMode = 'verbatim' | 'normalize' | 'optimize';
export type FinalImageSeriesStrategy = 'shared_variants' | 'role_suite';
export type EcommercePlatformHint = EcommercePlatform;

const EXPLICIT_PRESERVE_REQUEST =
  /(?:不要|无需|禁止).{0,8}(?:优化|改写|扩写|润色|翻译).{0,6}(?:提示词|描述)?|(?:原样|一字不改|逐字|照原提示词)|\b(?:verbatim|exact prompt|as written|do not (?:rewrite|expand|optimi[sz]e|translate))\b/i;
const EXPLICIT_OPTIMIZE_REQUEST =
  /(?:优化|改写|扩写|润色|完善).{0,8}(?:提示词|描述)|\b(?:optimi[sz]e|rewrite|expand|improve).{0,8}(?:the )?prompt\b/i;
const HIGH_LEVEL_DELIVERABLE =
  /(?:电商|淘宝|天猫|京东|亚马逊|amazon|商品|产品).{0,16}(?:主图|详情页|广告图|宣传图|海报|套图|a\+|a\s*plus|a-plus)|(?:主图|详情页|广告图|宣传图|海报|封面|banner|poster|listing image|product image|a\+|a\s*plus content)/i;
const EXPLICIT_WEB_RESEARCH =
  /(?:联网|网页|网上|全网).{0,8}(?:搜索|检索|调研|研究)|(?:搜索|检索|调研|研究).{0,12}(?:趋势|潮流|竞品|同行|案例|参考)|\b(?:web search|search (?:the )?web|research|current trends?|competitors?|benchmarks?)\b/i;
const EXPLICIT_NO_WEB_RESEARCH =
  /(?:不要|无需|禁止|别).{0,8}(?:联网|网页搜索|网上搜索|检索|调研)|(?:离线|不联网)|\b(?:offline|no web|without (?:web )?(?:search|research)|do not (?:browse|search|research))\b/i;
const EXPLICIT_SKIP_QUALITY_REVIEW =
  /(?:不用|无需|不要|跳过).{0,10}(?:质检|检查|审核|验证|返工)|(?:不用|无需|不要).{0,6}(?:看结果|检查结果)|\b(?:skip (?:quality |visual )?(?:review|check)|no (?:quality |visual )?(?:review|check)|do not (?:review|verify|iterate))\b/i;
const EXPLICIT_QUALITY_REVIEW =
  /(?:视觉质检|质量检查|检查结果|检查成图|验证成图|审核成图|评审设计)|\b(?:quality check|visual (?:review|check)|verify (?:the )?(?:image|result|design)|review (?:the )?(?:image|result|design))\b/i;
const DRAFT_IMAGE_REQUEST =
  /(?:草图|初稿|快速预览|先随便出|低质量预览)|\b(?:draft|quick preview|rough preview|low[- ]quality preview)\b/i;
const EXPLICIT_FINAL_QUALITY_REQUEST =
  /(?:高质量|精修|最终稿|成片|终稿)|\b(?:high quality|final render|production quality)\b/i;
const EXPLICIT_A_PLUS_MULTI_OUTPUT =
  /(?:桌面端?).{0,16}(?:移动端?)|(?:移动端?).{0,16}(?:桌面端?)|\bdesktop\b.{0,20}\bmobile\b|\bmobile\b.{0,20}\bdesktop\b|8\s*[+＋]\s*8|(?:多张|全套|完整套组|全部模块)|\b(?:multiple|full set|all modules)\b|(?:[2-9]|1\d|20)\s*(?:张|images?)/i;

/** Amazon A+ Content / Enhanced Brand Content — not a mobile shopping PDP. */
const AMAZON_A_PLUS_REQUEST =
  /(?:亚马逊|amazon).{0,20}(?:a\+|a\s*plus|a-plus|高级|品牌故事|增强品牌|enhanced brand)|(?:a\+|a\s*plus|a-plus).{0,16}(?:详情|content|page|模块|页面)|(?:亚马逊|amazon).{0,12}(?:详情页|详情|detail page)/i;

/** Strip editor-only mention metadata; never rewrite visual language here. */
export function finalImagePromptFromUserInput(userInput: unknown): string {
  if (typeof userInput !== 'string') return '';
  return userInput
    .replace(MODEL_MENTION, '')
    .replace(MACHINE_CONTEXT_TAG, '')
    .trim();
}

export function getEcommercePlatformHint(userInput: unknown): EcommercePlatformHint {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (/(?:a\+|a\s*plus|a-plus)/i.test(prompt)) return 'amazon';
  return resolveEcommercePlatform(prompt).id;
}

export function isAmazonAPlusRequest(userInput: unknown): boolean {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (!prompt) return false;
  if (/(?:不要|不需要|无需|排除|不含|仅?不做).{0,8}(?:a\+|a\s*plus|a-plus)/i.test(prompt)) {
    return false;
  }
  const explicitAPlus =
    /(?:a\+|a\s*plus|a-plus)|(?:亚马逊|amazon).{0,20}(?:品牌故事|增强品牌|enhanced brand)/i;
  if (explicitAPlus.test(prompt)) return true;
  if (isImageSuiteRequest(prompt)) return false;
  if (AMAZON_A_PLUS_REQUEST.test(prompt)) return true;
  // "亚马逊详情页" without A+ still maps to Enhanced Brand Content style pages.
  return getEcommercePlatformHint(prompt) === 'amazon' &&
    /详情|detail|content|模块|页面/i.test(prompt);
}

export function isAmazonListingAndAPlusRequest(userInput: unknown): boolean {
  const prompt = finalImagePromptFromUserInput(userInput);
  return /(?:a\+|a\s*plus|a-plus|亚马逊详情页)/i.test(prompt) &&
    /(?:主图|功能图|卖点图|包装图|main image|hero image|feature image|packaging image)/i.test(prompt);
}

export function isCommercialHighLevelRequest(userInput: unknown): boolean {
  const prompt = finalImagePromptFromUserInput(userInput);
  return Boolean(prompt) && HIGH_LEVEL_DELIVERABLE.test(prompt);
}

export function getFinalImageSeriesStrategy(
  userInput: unknown,
): FinalImageSeriesStrategy {
  const prompt = finalImagePromptFromUserInput(userInput);
  return isImageSuiteRequest(prompt) ||
    (isAmazonAPlusRequest(prompt) && EXPLICIT_A_PLUS_MULTI_OUTPUT.test(prompt))
    ? 'role_suite'
    : 'shared_variants';
}

/**
 * Hard ceiling for new final images only when the user explicitly supplies a
 * numeric image count. Platform defaults are planning hints, never runtime
 * limits: a suite may require additional distinct deliverables in later
 * model steps. Repair calls remain outside this count.
 */
export function getFinalImageOutputLimit(userInput: unknown): number | undefined {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (!prompt) return undefined;
  return getExplicitImageCount(prompt);
}

export function getFinalImagePromptMode(
  userInput: unknown,
): FinalImagePromptMode {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (EXPLICIT_PRESERVE_REQUEST.test(prompt)) return 'verbatim';
  if (EXPLICIT_OPTIMIZE_REQUEST.test(prompt)) return 'optimize';
  return 'normalize';
}

export function shouldResearchFinalImageRequest(userInput: unknown): boolean {
  const prompt = finalImagePromptFromUserInput(userInput);
  if (!prompt || EXPLICIT_NO_WEB_RESEARCH.test(prompt)) return false;
  if (EXPLICIT_WEB_RESEARCH.test(prompt)) return true;
  return HIGH_LEVEL_DELIVERABLE.test(prompt) &&
    getFinalImagePromptMode(prompt) === 'optimize';
}

/** Visual verification is opt-in because it adds another slow model call. */
export function shouldAutoReviewFinalImageRequest(userInput: unknown): boolean {
  const prompt = finalImagePromptFromUserInput(userInput);
  return Boolean(prompt) &&
    !DRAFT_IMAGE_REQUEST.test(prompt) &&
    !EXPLICIT_SKIP_QUALITY_REVIEW.test(prompt) &&
    EXPLICIT_QUALITY_REVIEW.test(prompt);
}

function ratioFromPixelSize(width: number, height: number): string {
  let a = Math.round(width);
  let b = Math.round(height);
  const originalWidth = a;
  const originalHeight = b;
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  const divisor = Math.max(1, a);
  return `${originalWidth / divisor}:${originalHeight / divisor}`;
}

function geometryContext(prompt: string, index: number, length: number): {
  before: string;
  after: string;
} {
  return {
    before: prompt.slice(Math.max(0, index - 48), index),
    after: prompt.slice(index + length, index + length + 32),
  };
}

function isPhysicalOrSubjectMeasurement(before: string, after: string): boolean {
  return (
    /(?:实际|物理|桌面|机身|包装|屏幕|显示器|铭牌|物体|商品(?:实际)?尺寸|产品(?:实际)?尺寸|长度|宽度|高度|规格|型号|measurements?|physical size|product dimensions?|screen resolution).{0,8}(?:为|是|:|：|=)?\s*$/i.test(before) ||
    /^\s*(?:mm|cm|in(?:ch(?:es)?)?|毫米|厘米|英寸)(?:\b|\s|[，,。])/i.test(after) ||
    /^\s*(?:的)?(?:桌面|机身|包装|屏幕|显示器|铭牌|产品|商品|物体|tabletop|screen|display|product)(?:\s|$|[，,。的])/i.test(after)
  );
}

function hasOutputSizeContext(before: string, after: string): boolean {
  return (
    /(?:输出|导出|画布|成图|图像尺寸|图片尺寸|画面尺寸|分辨率|像素|宽高|海报尺寸|主图尺寸|详情页尺寸|output|export|canvas|image size|output size|resolution).{0,12}$/i.test(before) ||
    /(?:生成|制作|绘制|做|输出|create|generate|render)\s*$/i.test(before) ||
    /(?:生成|制作|绘制|做|输出|create|generate|render).{0,28}(?:图|图片|图像|插画|照片|海报|封面|主图|详情页|image|illustration|photo|poster|banner|cover)[^\d]{0,8}$/i.test(before) ||
    /^\s*(?:px|像素)(?:\s|$|[，,。])/i.test(after) ||
    /^\s*(?:的)?(?:画布|成图|图片|图像|插画|照片|海报|封面|主图|详情页|输出|canvas|image|illustration|photo|poster|banner|cover)/i.test(after)
  );
}

function hasOutputRatioContext(before: string, after: string): boolean {
  return (
    /(?:比例|宽高比|纵横比|画幅|画布|成图|输出|aspect\s*ratio|ratio|canvas|output).{0,12}$/i.test(before) ||
    /(?:生成|制作|绘制|做|输出|create|generate|render).{0,28}(?:图|图片|图像|插画|照片|海报|封面|主图|详情页|image|illustration|photo|poster|banner|cover)[^\d]{0,8}$/i.test(before) ||
    /^\s*(?:的)?(?:比例|宽高比|纵横比|画幅|画布|成图|图片|图像|插画|照片|海报|封面|主图|详情页|aspect\s*ratio|canvas|image|illustration|photo|poster|banner|cover)/i.test(after)
  );
}

function isStandaloneImageGeometry(
  prompt: string,
  index: number,
  length: number,
): boolean {
  const before = prompt.slice(0, index).trim();
  const after = prompt.slice(index + length).trim();
  if (!before && !after) return true;
  const imageArtifact =
    /(?:图|图片|图像|插画|照片|海报|封面|主图|详情页|横版|竖版|画幅|image|illustration|photo|poster|banner|cover|landscape|portrait)/i;
  return (!before || !after) && imageArtifact.test(`${before} ${after}`);
}

function looksLikeTime(before: string, after: string): boolean {
  return (
    /(?:时间|时刻|上午|下午|晚上|凌晨|早上|中午|从|at|from).{0,6}$/i.test(before) ||
    /^\s*(?:点|分|开始|结束|开会|am\b|pm\b)/i.test(after)
  );
}

export function extractExplicitUserGeometry(userInput: unknown): {
  aspectRatio?: string;
  size?: string;
} {
  const prompt = finalImagePromptFromUserInput(userInput);
  let size: string | undefined;
  let derivedAspectRatio: string | undefined;
  const sizePattern = /(?:^|[^\d])(\d{2,5})\s*(?:x|×)\s*(\d{2,5})(?!\d)/gi;
  for (const match of prompt.matchAll(sizePattern)) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    const valueOffset = match[0].indexOf(match[1]!);
    const index = (match.index ?? 0) + valueOffset;
    const valueLength = match[0].length - valueOffset;
    const { before, after } = geometryContext(prompt, index, valueLength);
    if (
      isPhysicalOrSubjectMeasurement(before, after) ||
      (!hasOutputSizeContext(before, after) &&
        !isStandaloneImageGeometry(prompt, index, valueLength))
    ) continue;
    size = `${width}x${height}`;
    derivedAspectRatio = ratioFromPixelSize(width, height);
    break;
  }

  let aspectRatio: string | undefined;
  const ratioPattern = /(?:^|[^\d])(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)(?!\d)/gi;
  for (const match of prompt.matchAll(ratioPattern)) {
    const widthRatio = Number(match[1]);
    const heightRatio = Number(match[2]);
    if (!widthRatio || !heightRatio) continue;
    const ratio = widthRatio / heightRatio;
    if (ratio > 8 || ratio < 1 / 8) continue;
    const valueOffset = match[0].indexOf(match[1]!);
    const index = (match.index ?? 0) + valueOffset;
    const valueLength = match[0].length - valueOffset;
    const { before, after } = geometryContext(prompt, index, valueLength);
    if (
      looksLikeTime(before, after) ||
      isPhysicalOrSubjectMeasurement(before, after) ||
      (!hasOutputRatioContext(before, after) &&
        !isStandaloneImageGeometry(prompt, index, valueLength))
    ) continue;
    aspectRatio = `${widthRatio}:${heightRatio}`;
    break;
  }

  return {
    ...(aspectRatio || derivedAspectRatio
      ? { aspectRatio: aspectRatio || derivedAspectRatio }
      : {}),
    ...(size ? { size } : {}),
  };
}

function qualityMissing(input: any): boolean {
  return (
    input.quality == null ||
    (typeof input.quality === 'string' && !input.quality.trim())
  );
}

function stripLeadingRequestWrapper(prompt: string): string {
  const chineseRelay = prompt.replace(
    /^(?:(?:请|麻烦)\s*)?(?:(?:帮|替|为)我\s*)?(?=(?:生成|制作|创建|画|绘制|设计|把|将|用|给|做|修改|编辑|替换|移除|删除|添加))/,
    '',
  );
  return chineseRelay.replace(
    /^(?:please\s+)?(?:help\s+me\s+)?(?=(?:generate|create|make|draw|design|edit|change|replace|remove|add)\b)/i,
    '',
  );
}

function normalizedPromptWithAuthoritativeRequest(
  userPrompt: string,
  _candidate: string,
): string {
  return stripLeadingRequestWrapper(userPrompt);
}

/** Remove the user's meta instruction while preserving the actual visual prompt. */
function verbatimImagePrompt(userPrompt: string): string {
  const prefix = /^(?:请\s*)?(?:(?:不要|无需|禁止|别).{0,10}(?:优化|改写|扩写|润色|翻译).{0,8}(?:提示词|描述)?|(?:原样|一字不改|逐字|照原提示词)(?:使用|保留|生成|出图)?|(?:use\s+)?(?:the\s+)?(?:following\s+)?(?:prompt\s+)?(?:verbatim|as written)|do not (?:rewrite|expand|optimi[sz]e|translate)(?:\s+(?:this|the))?\s*(?:prompt|description)?)\s*[：:,，-]\s*/i;
  const suffix = /\s*[，,。.]?\s*(?:(?:不要|无需|禁止|别).{0,10}(?:优化|改写|扩写|润色|翻译).{0,8}(?:提示词|描述)?|(?:原样|一字不改|逐字|照原提示词)|do not (?:rewrite|expand|optimi[sz]e|translate)(?:\s+(?:this|the))?\s*(?:prompt|description)?)\s*$/i;
  const withoutPrefix = userPrompt.replace(prefix, '').trim();
  const payload = withoutPrefix.replace(suffix, '').trim();
  return payload || userPrompt;
}

/**
 * Verbatim mode is the sole hard prompt guarantee and is enabled only when the
 * user explicitly asks for exact wording. Normal production prompts may be
 * normalized by the control model without silently losing user constraints.
 * Final calls receive only non-creative defaults. User controls win, valid
 * agent controls are preserved, and provider adapters validate the result.
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
  let normalized: any;
  const suitePlan = toolName === 'generate_image' && promptMode === 'normalize'
    ? buildImageSuitePlan(userPrompt)
    : undefined;
  if (suitePlan) {
    const compiled = compileImageSuiteTask(input, userPrompt, -1, suitePlan);
    normalized = { ...input };
    if (compiled.error) {
      normalized[IMAGE_REQUEST_POLICY_ERROR] = compiled.error;
      delete normalized.prompt;
    } else {
      const task = compiled.task!;
      normalized.prompt = task.prompt;
      normalized.platform = task.platform;
      normalized.deliverable = task.deliverable;
      normalized.seriesRole = task.deliverable;
      normalized.userConstraints = task.userConstraints;
      delete normalized[IMAGE_REQUEST_POLICY_ERROR];
    }
  } else {
    normalized = {
      ...input,
      prompt: verbatim
        ? verbatimImagePrompt(userPrompt)
        : promptMode === 'normalize'
          ? normalizedPromptWithAuthoritativeRequest(userPrompt, candidate)
          : candidate || userPrompt,
    };
  }
  // `style` is appended to the provider prompt. Ordinary relay and explicit
  // verbatim modes must not acquire agent-authored prompt suffixes.
  if (
    promptMode !== 'optimize' &&
    typeof normalized.style === 'string' &&
    normalized.style.trim()
  ) delete normalized.style;

  const explicitGeometry = extractExplicitUserGeometry(userPrompt);
  if (qualityMissing(normalized)) {
    normalized.quality =
      !EXPLICIT_FINAL_QUALITY_REQUEST.test(userPrompt) &&
        DRAFT_IMAGE_REQUEST.test(userPrompt)
        ? 'low'
        : 'high';
  }

  // In relay mode only controls explicitly present in the user's own message
  // may alter geometry. Provider defaults handle an unspecified canvas.
  if (promptMode !== 'optimize') {
    if (!explicitGeometry.size) delete normalized.size;
    if (!explicitGeometry.aspectRatio) delete normalized.aspectRatio;
  }

  // Exact controls from the user's own words outrank the control model. This
  // is the only geometry path allowed to overwrite a tool value.
  if (explicitGeometry.size) {
    normalized.size = explicitGeometry.size;
  }
  if (explicitGeometry.aspectRatio) {
    normalized.aspectRatio = explicitGeometry.aspectRatio;
  }

  return normalized;
}

/**
 * Compile suite roles first, then apply the ordinary user-authority policy to
 * every image. `startIndex` keeps registered role order continuous when the
 * control model submits a suite over multiple turns.
 */
export function applyFinalImageBatchPolicy(
  calls: Array<{ name: string; input: any }>,
  userInput: unknown,
  startIndex = 0,
): void {
  if (getFinalImagePromptMode(userInput) === 'normalize') {
    compileImageSuiteBatch(calls, userInput, startIndex);
  }
  calls.forEach((call) => {
    if (
      (call.name !== 'generate_image' && call.name !== 'edit_image') ||
      !call.input ||
      typeof call.input !== 'object'
    ) return;
    call.input = applyFinalImageRequestPolicy(
      call.name,
      call.input,
      userInput,
    );
  });
}
