import { getCanvasNodeMap } from './canvas-state';
import {
  getEcommerceDeliverableBrief,
  getEcommerceDeliverablePromptSeed,
  getEcommerceDeliverableRules,
  type EcommerceCopyMode,
  type EcommercePlatform,
} from './ecommerce-platforms';
import type { ToolContext } from './tool.interface';

export interface PlannedEcommercePlacement {
  platform: string;
  deliverable: string;
  width: number;
  height: number;
  x: number;
  y: number;
  sourceAssetId?: string;
  preferredSourceRefId?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  productName?: string;
  sellingPoints: string[];
  brand?: string;
  language?: string;
  creativeDirection?: string;
  objective: string;
  composition: string[];
  copyMode: EcommerceCopyMode;
  promptSeed: string;
  rules: string[];
}

const IMAGE_RESERVATIONS_KEY = '__ecommerceImageReservations';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function placementKey(placement: PlannedEcommercePlacement): string {
  return `${placement.platform}:${placement.deliverable}`;
}

export function getPlannedEcommercePlacements(
  ctx: ToolContext,
): PlannedEcommercePlacement[] {
  const plan = ctx.memory.getPlan(ctx.sessionId);
  if (!plan) return [];

  return plan.steps.flatMap((step: any) => {
    if (
      typeof step.platform !== 'string' ||
      typeof step.deliverable !== 'string' ||
      !isFiniteNumber(step.width) ||
      !isFiniteNumber(step.height) ||
      !isFiniteNumber(step.x) ||
      !isFiniteNumber(step.y)
    ) {
      return [];
    }
    const brief = getEcommerceDeliverableBrief(
      step.platform as EcommercePlatform,
      step.deliverable,
    );
    return [{
      platform: step.platform,
      deliverable: step.deliverable,
      width: step.width,
      height: step.height,
      x: step.x,
      y: step.y,
      sourceAssetId: plan.sourceAssetId,
      preferredSourceRefId: plan.preferredSourceRefId,
      sourceWidth: plan.sourceWidth,
      sourceHeight: plan.sourceHeight,
      productName: plan.productName,
      sellingPoints: plan.sellingPoints ?? [],
      brand: plan.brand,
      language: plan.language,
      creativeDirection: plan.creativeDirection,
      ...brief,
      promptSeed: getEcommerceDeliverablePromptSeed(
        step.platform as EcommercePlatform,
        step.deliverable,
      ),
      rules: getEcommerceDeliverableRules(
        step.platform as EcommercePlatform,
        step.deliverable,
      ),
    }];
  });
}

export function promotePlannedEcommerceSource(
  source: unknown,
  refId: string,
  ctx: ToolContext,
): boolean {
  if (typeof source !== 'string' || !refId) return false;
  const plan = ctx.memory.getPlan(ctx.sessionId);
  if (!plan?.sourceAssetId) return false;
  if (source !== plan.sourceAssetId && source !== plan.preferredSourceRefId) return false;

  plan.preferredSourceRefId = refId;
  ctx.memory.setPlan(ctx.sessionId, plan);
  return true;
}

export function assertPlannedEcommerceSourceReady(ctx: ToolContext): void {
  const plan = ctx.memory.getPlan(ctx.sessionId);
  if (!plan) return;
  const hasActiveDeliverable = plan.steps.some(
    (step) => step.platform && step.deliverable && step.status !== 'completed',
  );
  if (!hasActiveDeliverable) return;
  const prepareStep = plan.steps.find((step) =>
    step.completionTool === 'upscale_image' && !step.platform && !step.deliverable,
  );
  if (prepareStep && prepareStep.status !== 'completed') {
    throw new Error(
      'The ecommerce source is low resolution. Complete upscale_image and use its canonical refId before starting paid image generation.',
    );
  }
}

function getReservationCounts(ctx: ToolContext): Map<string, number> {
  const record = ctx as any;
  if (!record[IMAGE_RESERVATIONS_KEY]) {
    record[IMAGE_RESERVATIONS_KEY] = new Map<string, number>();
  }
  return record[IMAGE_RESERVATIONS_KEY];
}

export function reservePlannedEcommercePlacement(
  input: any,
  ctx: ToolContext,
): PlannedEcommercePlacement | null {
  const placements = getPlannedEcommercePlacements(ctx);
  if (placements.length === 0) return null;

  const plan = ctx.memory.getPlan(ctx.sessionId);
  const map = getCanvasNodeMap(ctx);
  const hasActiveDeliverable = plan?.steps.some((step: any) =>
    step.platform && step.deliverable && step.status !== 'completed',
  );

  if (!hasActiveDeliverable) return null;

  const reservations = getReservationCounts(ctx);
  const load = new Map(placements.map((placement) => [
    placementKey(placement),
    reservations.get(placementKey(placement)) ?? 0,
  ]));
  for (const node of map.values()) {
    if (node.parentId || (node.type !== 'image_gen' && node.type !== 'image')) continue;
    const key = `${node.platform || ''}:${node.deliverable || ''}`;
    if (!load.has(key)) continue;
    load.set(key, (load.get(key) ?? 0) + 1);
  }

  const pickLeastLoaded = (candidates: PlannedEcommercePlacement[]) =>
    candidates.reduce((best, placement) =>
      (load.get(placementKey(placement)) ?? 0) < (load.get(placementKey(best)) ?? 0)
        ? placement
        : best,
    );

  // Agents often stamp every call as deliverable:"main". Prefer a still-empty
  // plan role so selling_point / scenario / detail scaffolding actually runs.
  const unfilled = placements.filter(
    (placement) => (load.get(placementKey(placement)) ?? 0) === 0,
  );
  const explicit =
    typeof input.platform === 'string' && typeof input.deliverable === 'string'
      ? placements.find(
          (placement) =>
            placement.platform === input.platform &&
            placement.deliverable === input.deliverable,
        )
      : undefined;
  const explicitLoad = explicit ? (load.get(placementKey(explicit)) ?? 0) : Infinity;
  const selected =
    // Honor an explicit empty role first.
    (explicit && explicitLoad === 0 ? explicit : undefined) ||
    // Otherwise fill the next empty role in plan order.
    (unfilled.length > 0 ? unfilled[0] : undefined) ||
    // Explicit role only if nothing better is empty.
    explicit ||
    pickLeastLoaded(placements);

  const key = placementKey(selected);
  reservations.set(key, (reservations.get(key) ?? 0) + 1);
  return selected;
}

const GENERATION_RATIOS = [
  ['1:1', 1],
  ['1:4', 1 / 4],
  ['1:8', 1 / 8],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['3:4', 3 / 4],
  ['4:1', 4],
  ['4:3', 4 / 3],
  ['4:5', 4 / 5],
  ['5:4', 5 / 4],
  ['8:1', 8],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
  ['21:9', 21 / 9],
] as const;

export function getGenerationAspectRatio(width: number, height: number): string {
  const target = width / height;
  return GENERATION_RATIOS.reduce((best, candidate) =>
    Math.abs(Math.log(candidate[1] / target)) < Math.abs(Math.log(best[1] / target))
      ? candidate
      : best,
  )[0];
}

/**
 * Provider generation size for a planned ecommerce slot.
 * Platform listing boxes (e.g. Taobao 1000²) stay as canvas layout sizes, but
 * the image model is asked for a higher-res render so quality is not capped
 * at mobile thumbnail dimensions.
 */
export function getGptImageGenerationSize(width: number, height: number): string {
  const minLongEdge = 1536;
  const longEdge = Math.max(width, height);
  const scale = longEdge > 0 && longEdge < minLongEdge ? minLongEdge / longEdge : 1;
  const align = (value: number) => Math.max(16, Math.round((value * scale) / 16) * 16);
  return `${align(width)}x${align(height)}`;
}

/**
 * Suite prompt scaffolds are retired. Always pass the agent-authored prompt
 * through unchanged so the image model is not constrained by system templates.
 */
export function buildEcommerceImagePrompt(
  basePrompt: string,
  _placement: PlannedEcommercePlacement,
): string {
  return basePrompt.trim();
}
