import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { compactCanvasNode, sanitizeCanvasState } from '../canvas-context';
import { getCanvasNodeMap } from '../canvas-state';
import {
  ECOMMERCE_PLATFORMS,
  type EcommercePlatform,
} from '../ecommerce-platforms';

export type VisionFailureType =
  | 'none'
  | 'identity'
  | 'copy'
  | 'composition'
  | 'technical'
  | 'artifact'
  | 'prompt_fidelity'
  | 'style'
  | 'anatomy';

export type VisionRepairStrategy =
  | 'none'
  | 'edit'
  | 'regenerate'
  | 'retry'
  | 'manual';

export interface VisionAnalysisResult {
  meetsRequirements: boolean;
  score: number;
  identityFidelityScore?: number;
  failureType: VisionFailureType;
  repairStrategy: VisionRepairStrategy;
  critique: string;
  suggestions: string;
  repairInstruction: string;
  fixes: Array<Record<string, unknown>>;
}

const VISION_FAILURE_TYPES = new Set<VisionFailureType>([
  'none',
  'identity',
  'copy',
  'composition',
  'technical',
  'artifact',
  'prompt_fidelity',
  'style',
  'anatomy',
]);
const VISION_REPAIR_STRATEGIES = new Set<VisionRepairStrategy>([
  'none',
  'edit',
  'regenerate',
  'retry',
  'manual',
]);
const SAFE_VISION_FIX_PROPERTIES = new Set([
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'scaleX',
  'scaleY',
  'skewX',
  'skewY',
  'fill',
  'stroke',
  'strokeWidth',
  'opacity',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'zIndex',
  'cornerRadius',
  'shadow',
  'visible',
]);

/** Parse only JSON. Vision-model output must never be evaluated as JavaScript. */
function parseJsonObject(str: string): Record<string, unknown> {
  if (!str) throw new Error('Vision model returned an empty response');
  let cleaned = str.trim();

  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/, '');
  cleaned = cleaned.replace(/\s*```$/, '');
  cleaned = cleaned.trim();

  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Vision model response must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function boundedText(value: unknown, maxLength = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function scoreValue(value: unknown, field: string, optional = false): number | undefined {
  if (optional && (value === undefined || value === null || value === '')) return undefined;
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(score) || score < 1 || score > 10) {
    throw new Error(`Vision model returned invalid ${field}`);
  }
  return Math.round(score * 10) / 10;
}

function normalizeFailureType(value: unknown, meetsRequirements: boolean): VisionFailureType {
  const normalized = boundedText(value, 64).toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, VisionFailureType> = {
    layout: 'composition',
    fidelity: 'prompt_fidelity',
    prompt: 'prompt_fidelity',
    artifacts: 'artifact',
  };
  const candidate = aliases[normalized] || normalized;
  if (!candidate) return meetsRequirements ? 'none' : 'technical';
  if (!VISION_FAILURE_TYPES.has(candidate as VisionFailureType)) {
    throw new Error(`Vision model returned unsupported failureType: ${candidate}`);
  }
  return candidate as VisionFailureType;
}

function defaultRepairStrategy(failureType: VisionFailureType): VisionRepairStrategy {
  if (failureType === 'none') return 'none';
  if (failureType === 'technical') return 'retry';
  if (failureType === 'copy' || failureType === 'artifact') return 'edit';
  if (
    failureType === 'identity' ||
    failureType === 'composition' ||
    failureType === 'prompt_fidelity' ||
    failureType === 'style' ||
    failureType === 'anatomy'
  ) return 'regenerate';
  return 'manual';
}

function safeVisionFixes(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const source = candidate as Record<string, unknown>;
    const fix: Record<string, unknown> = {};
    if (typeof source.refId === 'string' && source.refId.trim()) {
      fix.refId = source.refId.trim().slice(0, 80);
    }
    for (const [key, propertyValue] of Object.entries(source)) {
      if (SAFE_VISION_FIX_PROPERTIES.has(key)) fix[key] = propertyValue;
    }
    return Object.keys(fix).some((key) => key !== 'refId') ? [fix] : [];
  });
}

export function parseVisionAnalysisResponse(str: string): VisionAnalysisResult {
  const raw = parseJsonObject(str);
  if (typeof raw.meetsRequirements !== 'boolean') {
    throw new Error('Vision model response is missing boolean meetsRequirements');
  }
  const score = scoreValue(raw.score, 'score')!;
  const reportedFailureType = normalizeFailureType(
    raw.failureType,
    raw.meetsRequirements,
  );
  const consistentPass =
    raw.meetsRequirements && score >= 8 && reportedFailureType === 'none';
  const failureType = consistentPass
    ? 'none'
    : reportedFailureType === 'none'
      ? 'technical'
      : reportedFailureType;
  const requestedStrategy = boundedText(raw.repairStrategy, 64).toLowerCase();
  if (requestedStrategy && !VISION_REPAIR_STRATEGIES.has(requestedStrategy as VisionRepairStrategy)) {
    throw new Error(`Vision model returned unsupported repairStrategy: ${requestedStrategy}`);
  }
  const actionableRequestedStrategy = requestedStrategy === 'none'
    ? ''
    : requestedStrategy;
  const repairStrategy = consistentPass
    ? 'none'
    : (actionableRequestedStrategy as VisionRepairStrategy) ||
      defaultRepairStrategy(failureType);

  return {
    meetsRequirements: consistentPass,
    score,
    identityFidelityScore: scoreValue(
      raw.identityFidelityScore,
      'identityFidelityScore',
      true,
    ),
    failureType,
    repairStrategy,
    critique: boundedText(raw.critique),
    suggestions: boundedText(raw.suggestions),
    repairInstruction: boundedText(raw.repairInstruction),
    fixes: safeVisionFixes(raw.fixes),
  };
}

function isUsableImageSource(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  return (
    value.startsWith('data:image/') ||
    /^https?:\/\//i.test(value) ||
    value.length >= 100
  );
}

/**
 * analyze_design - 视觉分析设计图片（MCoT 核心工具）
 * 让 Agent "看到"设计结果并提供反馈
 */
export const analyzeDesignTool: AgentTool = {
  name: 'analyze_design',
  description:
    'Analyze a generated bitmap or design screenshot using vision AI. Evaluate prompt fidelity, subject integrity, artifacts, composition, style, text, and layout as appropriate. ' +
    'Returns a validated score, failure type, repair strategy, and one bounded repair instruction.',
  parameters: {
    type: 'object',
    properties: {
      imageBase64: {
        type: 'string',
        description: 'Image data URL or server image URL to analyze.',
      },
      requirements: {
        type: 'string',
        description: 'The original design requirements/prompt to evaluate against',
      },
      targetRefId: {
        type: 'string',
        description: 'Optional refId of the target element under review (to gather layout coordinates and sibling node context)',
      },
      referenceAssetId: {
        type: 'string',
        description: 'Optional source product assetId. When provided, compare product identity, packaging, logo, proportions, and visible text.',
      },
      platform: {
        type: 'string',
        enum: ECOMMERCE_PLATFORMS.map((platform) => platform.id),
      },
      deliverable: { type: 'string' },
    },
    required: ['imageBase64', 'requirements'],
  },
  async execute(input: {
    imageBase64: string;
    requirements: string;
    targetRefId?: string;
    referenceAssetId?: string;
    platform?: EcommercePlatform;
    deliverable?: string;
  }, ctx: ToolContext): Promise<ToolResult> {
    let { imageBase64, requirements, targetRefId } = input;

    const isPlaceholder = imageBase64 && typeof imageBase64 === 'string' && (
      imageBase64.startsWith('[Base64 Image') || 
      imageBase64.includes('sent as image_url part')
    );

    if (!isUsableImageSource(imageBase64) || isPlaceholder) {
      // Fallback to cached image in memory
      const cachedImage = ctx.memory.getLastExportedNodeImage(ctx.sessionId);
      if (cachedImage) {
        imageBase64 = cachedImage;
      }
    }

    if (!isUsableImageSource(imageBase64)) {
      ctx.sink.emit({ type: 'error', message: 'Vision analysis failed: Invalid or missing base64 image data.' });
      return {
        output: {
          meetsRequirements: false,
          score: 5,
          failureType: 'technical',
          repairStrategy: 'retry',
          critique: '导出的图像数据无效或为空，这可能是因为截图超时或该元素不存在。',
          suggestions: '请再次尝试导出截图或手动调整设计。',
          repairInstruction: '',
          fixes: [],
        },
      };
    }

    let canvasLayoutInfo = '';
    let targetNode: any;
    if (targetRefId) {
      const allNodes = sanitizeCanvasState(ctx.canvasState || []);
      targetNode =
        getCanvasNodeMap(ctx).get(targetRefId) ||
        allNodes.find((n: any) => n.refId === targetRefId);
      const siblingNodes = allNodes
        .filter((n: any) => {
          if (n.refId === targetRefId || n.refId === 'agent_frame') return false;
          if (!targetNode?.parentId) return !n.parentId;
          return n.parentId === targetNode.parentId;
        })
        .slice(0, 40);
      const omittedSiblingCount = Math.max(
        0,
        allNodes.length - siblingNodes.length - (targetNode ? 1 : 0),
      );
      
      canvasLayoutInfo = `
### Current Layout Data from Canvas:
- Target element under review: ${targetNode ? JSON.stringify(compactCanvasNode(targetNode, 'standard')) : `[refId: ${targetRefId}]`}
- Sibling elements on canvas:
${siblingNodes.map((n: any) => `  * [${n.refId}] Tag: ${n.tag || n.type}, Pos: (${n.x},${n.y}), Size: ${n.width}x${n.height}${n.text ? `, Text: "${n.text}"` : ''}${n.fill ? `, Color: ${n.fill}` : ''}`).join('\n')}
${omittedSiblingCount > 0 ? `- ${omittedSiblingCount} additional non-local nodes omitted from context.` : ''}
`;
    }

    const referenceAsset = input.referenceAssetId
      ? ctx.assets?.find((asset) => asset.id === input.referenceAssetId)
      : undefined;
    const referenceDimensionSource = referenceAsset?.width && referenceAsset?.height
      ? referenceAsset
      : ctx.assets?.find((asset) =>
          asset.id !== referenceAsset?.id &&
          Boolean(asset.width && asset.height) &&
          (asset.url === referenceAsset?.url ||
            (asset.publicUrl && asset.publicUrl === referenceAsset?.publicUrl)),
        );
    const lowResolutionIdentitySource = Boolean(
      referenceDimensionSource?.width &&
      referenceDimensionSource?.height &&
      Math.min(referenceDimensionSource.width, referenceDimensionSource.height) < 512,
    );
    const identityContext = referenceAsset
      ? `
**Product Identity Fidelity (hard gate)**: Compare the target against the source. Silhouette, construction, material pattern, stitching, hardware, color placement, logo, label text, proportions, and included parts must remain faithful. Approval requires identityFidelityScore >= 9.
**Claim Accuracy (hard gate)**: Reject invented measurements, materials, certifications, ingredients, service promises, performance numbers, benefits, badges, prices, or placeholder text.
${lowResolutionIdentitySource ? `**Low-resolution source restriction**: The original is only ${referenceDimensionSource?.width}x${referenceDimensionSource?.height}. A plausible product of the same category or color is not an identity match. Reject extreme macros, hidden angles, new perforation/stitching patterns, altered logo shape or color, and invented sole geometry unless those exact features are visible in the source. Do not award identityFidelityScore >= 9 when such details cannot be mapped to the source.` : ''}
Return identityFidelityScore (1-10), failureType, and list every identity mismatch in critique.`
      : '';

    const targetType = String(targetNode?.type || targetNode?.tag || '').toLowerCase();
    const generatedBitmap = ['image_gen', 'imagegen', 'image'].includes(targetType);
    const inferredAssetType = /(?:照片|摄影|photo|photograph|photoreal)/i.test(requirements)
      ? 'photograph'
      : /(?:海报|广告|主图|banner|poster|campaign|cover)/i.test(requirements)
        ? 'marketing image'
        : /(?:插画|绘画|illustration|painting|concept art)/i.test(requirements)
          ? 'illustration'
          : 'generated bitmap';

    const evaluationCriteria = generatedBitmap
        ? `Evaluate this as a finished ${inferredAssetType}:
1. **Prompt Fidelity**: Verify every explicit subject, action, scene, composition, style, palette, text, must-have, and avoid constraint. Reject missing or invented major content.
2. **Subject Integrity**: Reject malformed anatomy, extra or missing limbs/fingers, fused objects, broken perspective, implausible contact, altered identity, incomplete subjects, and accidental crops.
3. **Composition**: Assess focal hierarchy, framing, balance, usable negative space when requested, scale, and whether the image fits its intended asset type.
4. **Rendering Quality**: Assess lighting, materials, texture, edge quality, coherent style, realism where requested, and consistency across the whole image.
5. **Text Accuracy**: If exact text was requested, reject misspellings, extra characters, placeholder copy, illegibility, or unrequested text.
6. **Technical Cleanliness**: Reject watermarks, duplicated details, seams, halos, blur in the focal subject, compression damage, or obvious generation artifacts.
${identityContext}`
        : `Evaluate this as an editable canvas design:
1. **Requirement Fidelity**: Verify the requested content, hierarchy, copy, and constraints.
2. **Layout & Spacing**: Assess alignment, balance, safe margins appropriate to the canvas, and accidental overlaps or crops.
3. **Visual Hierarchy**: Confirm an immediate focal point and a clear reading order.
4. **Color & Contrast**: Check harmony, accessibility, and background separation.
5. **Typography**: Check exact copy, readability, sizing, line length, and consistent type roles.
6. **Technical Finish**: Reject placeholders, broken assets, overflow, or visibly unfinished states.
${identityContext}`;

    const reflectionPrompt = `Analyze the TARGET design image against the requirements: "${requirements}"
${canvasLayoutInfo}
${evaluationCriteria}

Respond with one strict JSON object and no markdown or comments:
{
  "meetsRequirements": boolean,
  "score": 1-10,
  "identityFidelityScore": 1-10 or null,
  "failureType": "none | identity | copy | composition | technical | artifact | prompt_fidelity | style | anatomy",
  "repairStrategy": "none | edit | regenerate | retry | manual",
  "critique": "Specific issues found (be concise)",
  "suggestions": "Concrete adjustments needed (e.g., 'Increase title fontSize to 56px', 'Add 50px top margin')",
  "repairInstruction": "If the image fails, give one concise instruction for the selected repairStrategy while preserving all correct content; otherwise use an empty string",
  "fixes": []
}`;

    try {
      const config = await ctx.ai.getAgentConfig();
      const visionModel = config.agentConfig?.visionModel || 'gpt-4o';

      // Remote vision models need publicly reachable URLs (not localhost / data:).
      const uploadedUrl = await ctx.ai.ensurePublicImageUrl(imageBase64);
      if (!uploadedUrl) {
        throw new Error(
          'Unable to publish design screenshot to a public image host for vision analysis',
        );
      }

      const requestContent: any[] = [];
      if (referenceAsset?.url) {
        const referenceUrl =
          (referenceAsset.publicUrl &&
          ctx.ai.isModelSafeImageUrl?.(referenceAsset.publicUrl)
            ? referenceAsset.publicUrl
            : null) ||
          (await ctx.ai.ensurePublicImageUrl(
            referenceAsset.publicUrl || referenceAsset.url,
          ));
        if (referenceUrl) {
          requestContent.push(
            { type: 'text', text: 'SOURCE PRODUCT IMAGE — use only for identity comparison:' },
            {
              type: 'image_url',
              image_url: { url: referenceUrl },
            },
            { type: 'text', text: 'TARGET DESIGN IMAGE — evaluate this design:' },
          );
        }
      }
      requestContent.push(
        { type: 'image_url', image_url: { url: uploadedUrl } },
        { type: 'text', text: reflectionPrompt },
      );

      const response = await ctx.ai.chatWithYunwu({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: requestContent,
          },
        ],
        response_format: { type: 'json_object' },
        maxTokens: 1_000,
      });

      const responseContent = (response.choices[0] as any).message.content;
      const analysis = parseVisionAnalysisResponse(responseContent);

      return {
        output: {
          ...analysis,
          note: analysis.meetsRequirements
            ? '✅ 设计符合要求！'
            : `⚠️ 发现问题：${analysis.critique}\n建议：${analysis.suggestions}`,
        },
      };
    } catch (error: any) {
      let errMsg = error.message || 'unknown error';
      if (error && typeof error.getResponse === 'function') {
        const resp: any = error.getResponse();
        if (resp && typeof resp === 'object') {
          if (Array.isArray(resp.providerErrors) && resp.providerErrors.length > 0) {
            errMsg = resp.providerErrors.join('; ');
          } else if (resp.error) {
            errMsg = resp.error;
          }
        }
      }
      ctx.sink.emit({ type: 'error', message: `Vision analysis failed: ${errMsg}` });
      return {
        output: {
          meetsRequirements: false,
          score: 5,
          failureType: 'technical',
          repairStrategy: 'retry',
          critique: `无法进行视觉分析 (${errMsg})`,
          suggestions: '请检查您的模型渠道配置，或手动检查设计质量。',
          repairInstruction: '',
          fixes: [],
        },
      };
    }
  },
};
