import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';
import { compactCanvasNode, sanitizeCanvasState } from '../canvas-context';
import {
  getEcommerceDeliverableBrief,
  getEcommerceDeliverableRules,
  type EcommercePlatform,
} from '../ecommerce-platforms';

/**
 * Parses a JSON string robustly, handling markdown blocks, leading/trailing text,
 * and falling back to JavaScript evaluation if keys are unquoted or single-quoted.
 */
function parseFlexibleJson(str: string): any {
  if (!str) return {};
  let cleaned = str.trim();
  
  // Remove markdown code block markers
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/, '');
  cleaned = cleaned.replace(/\s*```$/, '');
  cleaned = cleaned.trim();
  
  // Extract JSON object if there's leading/trailing text
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    try {
      const fn = new Function(`return (${cleaned});`);
      const val = fn();
      if (val && typeof val === 'object') {
        return val;
      }
    } catch (fnError) {
      // Ignore evaluation errors and throw the original JSON parse error
    }
    throw e;
  }
}

/**
 * analyze_design - 视觉分析设计图片（MCoT 核心工具）
 * 让 Agent "看到"设计结果并提供反馈
 */
export const analyzeDesignTool: AgentTool = {
  name: 'analyze_design',
  description:
    'Analyze a design screenshot using vision AI to evaluate layout, spacing, colors, and typography. ' +
    'Returns critique and suggestions for improvement. Use after generating images to verify quality.',
  parameters: {
    type: 'object',
    properties: {
      imageBase64: {
        type: 'string',
        description: 'Base64 encoded image to analyze (from export_node_image)',
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
      platform: { type: 'string', enum: ['amazon', 'taobao', 'jd'] },
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

    if (!imageBase64 || isPlaceholder || typeof imageBase64 !== 'string' || (!imageBase64.startsWith('data:image/') && imageBase64.length < 100)) {
      // Fallback to cached image in memory
      const cachedImage = ctx.memory.getLastExportedNodeImage(ctx.sessionId);
      if (cachedImage) {
        imageBase64 = cachedImage;
      }
    }

    if (!imageBase64 || typeof imageBase64 !== 'string' || (!imageBase64.startsWith('data:image/') && imageBase64.length < 100)) {
      ctx.sink.emit({ type: 'error', message: 'Vision analysis failed: Invalid or missing base64 image data.' });
      return {
        output: {
          meetsRequirements: false,
          score: 5,
          critique: '导出的图像数据无效或为空，这可能是因为截图超时或该元素不存在。',
          suggestions: '请再次尝试导出截图或手动调整设计。',
        },
      };
    }

    let canvasLayoutInfo = '';
    if (targetRefId) {
      const allNodes = sanitizeCanvasState(ctx.canvasState || []);
      const targetNode = allNodes.find((n: any) => n.refId === targetRefId);
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

    const platformRules =
      input.platform && input.deliverable
        ? getEcommerceDeliverableRules(input.platform, input.deliverable)
        : [];
    const ecommerceBrief =
      input.platform && input.deliverable
        ? getEcommerceDeliverableBrief(input.platform, input.deliverable)
        : undefined;
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
    const ecommerceContext = referenceAsset
      ? `
5. **Product Identity Fidelity (hard gate)**: Compare the target against the source. Silhouette, construction, material pattern, stitching, hardware, color placement, logo, label text, proportions, and included parts must remain faithful. Approval requires identityFidelityScore >= 9.
6. **Claim Accuracy (hard gate)**: Reject invented measurements, materials, certifications, ingredients, service promises, performance numbers, benefits, badges, prices, or placeholder text.
${platformRules.length ? `7. **Platform Rules (${input.platform}/${input.deliverable})**: ${platformRules.join('; ')}` : ''}
${lowResolutionIdentitySource ? `8. **Low-resolution source restriction**: The original is only ${referenceDimensionSource?.width}x${referenceDimensionSource?.height}. A plausible product of the same category or color is not an identity match. Reject extreme macros, hidden angles, new perforation/stitching patterns, altered logo shape or color, and invented sole geometry unless those exact features are visible in the source. Do not award identityFidelityScore >= 9 when such details cannot be mapped to the source.` : ''}
Return identityFidelityScore (1-10), failureType, and list every identity mismatch in critique.`
      : '';

    const evaluationCriteria = ecommerceBrief
      ? `Evaluate this as a finished ${input.platform}/${input.deliverable} ecommerce bitmap:
1. **Role Fitness**: ${ecommerceBrief.objective}
2. **Composition**: ${ecommerceBrief.composition.join('; ')}.
3. **Mobile Readability**: The focal point and any permitted copy must read immediately at phone size. Reject micro-text, dense paragraphs, blank copy boxes, accidental crops, or weak empty layouts.
4. **Commercial Finish**: Assess hierarchy, safe margins, material realism, lighting, edge quality, restrained color system, and whether it reaches premium marketplace campaign quality.
${ecommerceContext}`
      : `Evaluate these design aspects:
1. **Layout & Spacing**: Are margins adequate (min 40px)? Is spacing between elements balanced?
2. **Visual Hierarchy**: Does the design have clear focal points?
3. **Color Harmony**: Are colors harmonious? Is there sufficient contrast?
4. **Typography**: When text is present, is it readable and appropriately sized?
5. **Image Sizing**: Is imagery sized appropriately for the requested composition?`;

    const reflectionPrompt = `Analyze the TARGET design image against the requirements: "${requirements}"
${canvasLayoutInfo}
${evaluationCriteria}

Respond in JSON format:
{
  "meetsRequirements": boolean,
  "score": 1-10,
  "identityFidelityScore": 1-10, // Include when a source product image is provided
  "failureType": "none | identity | copy | composition | technical",
  "critique": "Specific issues found (be concise)",
  "suggestions": "Concrete adjustments needed (e.g., 'Increase title fontSize to 56px', 'Add 50px top margin')",
  "fixes": [] // Optional list of suggested direct updates to node properties, e.g. [{"refId": "txt_abc", "fontSize": 48}]
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
        maxTokens: 800,
      });

      const responseContent = (response.choices[0] as any).message.content;
      const analysis = parseFlexibleJson(responseContent);

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
          critique: `无法进行视觉分析 (${errMsg})`,
          suggestions: '请检查您的模型渠道配置，或手动检查设计质量。',
        },
      };
    }
  },
};
