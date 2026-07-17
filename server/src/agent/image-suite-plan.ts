import {
  ECOMMERCE_DELIVERABLES,
  getDefaultSuiteDeliverables,
  normalizeCustomDeliverableLabel,
  resolveEcommerceDeliverable,
  resolveEcommercePlatform,
  type EcommerceDeliverableDefinition,
  type EcommerceDeliverableId,
  type EcommercePlatformDefinition,
} from './ecommerce-platforms';

const MODEL_MENTION = /@[^\[\r\n]{1,120}?\s*\[modelId:[^\]]+\]/gi;
const MACHINE_CONTEXT_TAG = /\[(?:modelId|refId):[^\]]+\]/gi;

export const IMAGE_REQUEST_POLICY_ERROR = '__imageRequestPolicyError';

export interface ImageSuitePlan {
  platform: EcommercePlatformDefinition;
  deliverables: EcommerceDeliverableDefinition[];
  scopeSource: 'explicit' | 'platform_default' | 'agent';
  explicitCount?: number;
  /** Initial planning target. This is not a runtime generation ceiling. */
  plannedCount?: number;
  allowAdditionalDeliverables: boolean;
}

export interface CompiledImageSuiteTask {
  platform: string;
  deliverable: string;
  label: string;
  prompt: string;
  userConstraints: string[];
}

function cleanUserInput(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(MODEL_MENTION, '').replace(MACHINE_CONTEXT_TAG, '').trim()
    : '';
}

export function isImageSuiteRequest(value: unknown): boolean {
  const prompt = cleanUserInput(value);
  if (!prompt) return false;
  if (/(?:套图|全套(?:商品|产品|电商)?图|一套(?:商品|产品|电商)?图)/i.test(prompt)) {
    return true;
  }
  if (/\b(?:listing|ecommerce|product|marketplace|amazon|taobao|tmall|jd|shopee|lazada|temu|tiktok\s*shop|ebay|walmart|etsy)\s+(?:image\s+)?(?:suite|set)\b|\b(?:suite|set)\s+of\s+(?:listing|ecommerce|product)?\s*images?\b/i.test(prompt)) {
    return true;
  }
  if (
    (getExplicitImageCount(prompt) || 0) > 1 &&
    /(?:亚马逊|淘宝|天猫|京东|虾皮|电商).{0,24}(?:商品图|产品图|展示图)|\b(?:amazon|taobao|tmall|jd|shopee|lazada|temu|tiktok\s*shop|ebay|walmart|etsy)\b.{0,32}\b(?:listing|product|gallery)\s+images?\b/i.test(prompt)
  ) {
    return true;
  }
  return /(?:主图|main image|hero image).{0,20}(?:[+＋和与及、,，]|and).{0,20}(?:详情页?|a\+|detail page|gallery|功能图|卖点图|场景图|包装图)|(?:详情页?|a\+|detail page).{0,20}(?:[+＋和与及、,，]|and).{0,20}(?:主图|main image|hero image)/i.test(prompt);
}

export function getExplicitImageCount(value: unknown): number | undefined {
  const prompt = cleanUserInput(value);
  const digitMatch = prompt.match(/(?:生成|制作|创建|输出|做|create|generate|make)?\s*(\d{1,2})\s*(?:张|幅|个(?:图|图片)|images?|pictures?|renders?)/i);
  if (digitMatch) {
    const count = Number(digitMatch[1]);
    if (count > 0) return count;
  }
  const englishDigitMatch = prompt.match(
    /\b(\d{1,2})\s+(?:[a-z][a-z-]*\s+){0,3}(?:images?|pictures?|renders?)\b/i,
  );
  if (englishDigitMatch) {
    const count = Number(englishDigitMatch[1]);
    if (count > 0) return count;
  }
  const wordCounts: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const wordMatch = prompt.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[a-z][a-z-]*\s+){0,3}(?:images?|pictures?|renders?)\b/i,
  );
  if (wordMatch) return wordCounts[wordMatch[1]!.toLowerCase()];
  const chineseMatch = prompt.match(/([一二两三四五六七八九十])\s*张/);
  if (!chineseMatch) return undefined;
  const chineseCounts: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  return chineseCounts[chineseMatch[1]!];
}

function aliasPattern(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return /^[a-z0-9.+ _-]+$/i.test(alias)
    ? new RegExp(`(?:^|[^a-z0-9])(${escaped})(?:$|[^a-z0-9])`, 'ig')
    : new RegExp(`(${escaped})`, 'ig');
}

function roleOccurrences(prompt: string): Array<{
  definition: EcommerceDeliverableDefinition;
  index: number;
  end: number;
  negated: boolean;
}> {
  const occurrences: Array<{
    definition: EcommerceDeliverableDefinition;
    index: number;
    end: number;
    negated: boolean;
  }> = [];
  for (const definition of Object.values(ECOMMERCE_DELIVERABLES)) {
    for (const alias of [...definition.aliases].sort((a, b) => b.length - a.length)) {
      for (const match of prompt.matchAll(aliasPattern(alias))) {
        const full = match[0] || '';
        const captured = match[1] || alias;
        const localOffset = full.toLocaleLowerCase().indexOf(captured.toLocaleLowerCase());
        const index = (match.index || 0) + Math.max(0, localOffset);
        const before = prompt.slice(Math.max(0, index - 16), index);
        const negated = /(?:不要|不做|不生成|无需|排除|不含|去掉|除外|without|exclude|except|no)\s*$/i.test(before);
        occurrences.push({
          definition,
          index,
          end: index + captured.length,
          negated,
        });
      }
    }
  }
  const selectedRanges: Array<{ index: number; end: number }> = [];
  const nonOverlapping = occurrences
    .sort((a, b) => (b.end - b.index) - (a.end - a.index) || a.index - b.index)
    .filter((item) => {
      const overlaps = selectedRanges.some((range) =>
        item.index < range.end && item.end > range.index
      );
      if (!overlaps) selectedRanges.push({ index: item.index, end: item.end });
      return !overlaps;
    });
  const seen = new Set<string>();
  return nonOverlapping
    .sort((a, b) => a.index - b.index)
    .filter((item) => {
      const key = `${item.definition.id}:${item.negated}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildImageSuitePlan(value: unknown): ImageSuitePlan | undefined {
  const prompt = cleanUserInput(value);
  if (!isImageSuiteRequest(prompt)) return undefined;
  const platform = resolveEcommercePlatform(prompt);
  const occurrences = roleOccurrences(prompt);
  const excluded = new Set<EcommerceDeliverableId>(
    occurrences.filter((item) => item.negated).map((item) => item.definition.id),
  );
  const explicit = occurrences
    .filter((item) => !item.negated && !excluded.has(item.definition.id))
    .map((item) => item.definition);
  const explicitCount = getExplicitImageCount(prompt);
  const listingOnlyScope = platform.id === 'amazon' &&
    /\b(?:listing|gallery)\s+images?\b/i.test(prompt) &&
    !/(?:a\+|a\s*plus|a-plus)/i.test(prompt);
  const defaults = (listingOnlyScope ? [] : getDefaultSuiteDeliverables(platform))
    .filter((item) => !excluded.has(item.id));
  const scopedDeliverables = explicit.length ? explicit : defaults;
  const deliverables = explicitCount && explicitCount < scopedDeliverables.length
    ? scopedDeliverables.slice(0, explicitCount)
    : scopedDeliverables;
  const scopeSource: ImageSuitePlan['scopeSource'] = explicit.length
    ? 'explicit'
    : defaults.length
      ? 'platform_default'
      : 'agent';
  const plannedCount = explicitCount || (deliverables.length || undefined);
  return {
    platform,
    deliverables,
    scopeSource,
    ...(explicitCount ? { explicitCount } : {}),
    ...(plannedCount ? { plannedCount } : {}),
    allowAdditionalDeliverables:
      scopeSource !== 'explicit' && explicitCount === undefined
        ? true
        : Boolean(explicitCount && explicitCount > deliverables.length),
  };
}

function verifiedConstraintSnippets(value: unknown, userInput: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : [];
  if (!values.length) return [];
  const source = cleanUserInput(userInput);
  const foldedSource = source.toLocaleLowerCase();
  const verified: string[] = [];
  for (const item of values) {
    if (typeof item !== 'string') continue;
    const snippet = item.trim();
    if (!snippet || snippet.length > 100) continue;
    if (!foldedSource.includes(snippet.toLocaleLowerCase())) continue;
    if (isImageSuiteRequest(snippet)) continue;
    if (!verified.includes(snippet)) verified.push(snippet);
    if (verified.length >= 6) break;
  }
  return verified;
}

function agentSelectedDeliverable(input: any): {
  definition?: EcommerceDeliverableDefinition;
  customLabel?: string;
} {
  for (const candidate of [input?.deliverable, input?.seriesRole, input?.prompt]) {
    const definition = resolveEcommerceDeliverable(candidate);
    if (definition) return { definition };
  }
  const customLabel = normalizeCustomDeliverableLabel(
    input?.deliverable || input?.seriesRole || input?.prompt,
  );
  return customLabel ? { customLabel } : {};
}

export function compileImageSuiteTask(
  input: any,
  userInput: unknown,
  index = 0,
  suppliedPlan?: ImageSuitePlan,
): { task?: CompiledImageSuiteTask; error?: string } {
  const plan = suppliedPlan || buildImageSuitePlan(userInput);
  if (!plan) return {};
  const planned = index >= 0 ? plan.deliverables[index] : undefined;
  const selected = agentSelectedDeliverable(input);
  const definition = planned || selected.definition;
  const label = definition?.promptLabel || selected.customLabel;
  if (!label) {
    return {
      error:
        'Suite image calls require a short structured deliverable name, such as main, a_plus, 主图, or 详情页. Do not submit a creative prompt as the deliverable.',
    };
  }
  const userConstraints = verifiedConstraintSnippets(input?.userConstraints, userInput);
  const prompt = `生成${label}${userConstraints.length ? `，${userConstraints.join('，')}` : ''}`;
  return {
    task: {
      platform: plan.platform.id,
      deliverable: definition?.id || label,
      label,
      prompt,
      userConstraints,
    },
  };
}

export function compileImageSuiteBatch(
  calls: Array<{ name: string; input: any }>,
  userInput: unknown,
  startIndex = 0,
): ImageSuitePlan | undefined {
  const plan = buildImageSuitePlan(userInput);
  if (!plan) return undefined;
  let imageIndex = Math.max(0, Math.floor(startIndex));
  for (const call of calls) {
    if (call.name !== 'generate_image' || !call.input || typeof call.input !== 'object') {
      continue;
    }
    const compiled = compileImageSuiteTask(call.input, userInput, imageIndex, plan);
    imageIndex++;
    if (compiled.error) {
      call.input[IMAGE_REQUEST_POLICY_ERROR] = compiled.error;
      delete call.input.prompt;
      continue;
    }
    const task = compiled.task!;
    call.input.prompt = task.prompt;
    call.input.platform = task.platform;
    call.input.deliverable = task.deliverable;
    call.input.seriesRole = task.deliverable;
    call.input.userConstraints = task.userConstraints;
    delete call.input[IMAGE_REQUEST_POLICY_ERROR];
  }
  return plan;
}
