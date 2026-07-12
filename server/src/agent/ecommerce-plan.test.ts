import { describe, expect, test } from 'bun:test';
import {
  buildEcommerceImagePrompt,
  promotePlannedEcommerceSource,
  type PlannedEcommercePlacement,
} from './ecommerce-plan';

function placement(overrides: Partial<PlannedEcommercePlacement> = {}): PlannedEcommercePlacement {
  return {
    platform: 'taobao',
    deliverable: 'selling_point',
    width: 1000,
    height: 1000,
    x: 0,
    y: 0,
    sourceAssetId: 'asset-product',
    sellingPoints: [],
    objective: 'Explain one verified benefit.',
    composition: ['one hero product', 'one large headline'],
    copyMode: 'short_verified',
    promptSeed: 'premium benefit visual',
    rules: ['one benefit only'],
    ...overrides,
  };
}

describe('ecommerce image prompt', () => {
  test('does not wrap or expand the agent-authored prompt', () => {
    const agentPrompt = 'Create a concise Taobao detail page based on the referenced shoe.';
    const prompt = buildEcommerceImagePrompt(
      agentPrompt,
      placement({
        productName: '城市跑鞋',
        sellingPoints: ['透气织物鞋面'],
        language: 'zh-CN',
      }),
    );

    expect(prompt).toBe(agentPrompt);
    expect(prompt).not.toContain('premium');
    expect(prompt).not.toContain('Composition:');
    expect(prompt).not.toContain('Quality bar:');
  });

  test('does not add safeguards or inferred details to a sparse brief', () => {
    const prompt = buildEcommerceImagePrompt(
      'Create a premium layout',
      placement({ sourceWidth: 224, sourceHeight: 224 }),
    );

    expect(prompt).toBe('Create a premium layout');
  });
});

describe('ecommerce canonical source', () => {
  test('promotes an upscale derived from the current canonical source', () => {
    let plan: any = {
      id: 'plan',
      title: 'suite',
      sourceAssetId: 'asset-product',
      steps: [],
    };
    const ctx = {
      sessionId: 'session',
      memory: {
        getPlan: () => plan,
        setPlan: (_sessionId: string, nextPlan: any) => { plan = nextPlan; },
      },
    } as any;

    expect(promotePlannedEcommerceSource('asset-product', 'upscale-1', ctx)).toBe(true);
    expect(plan.preferredSourceRefId).toBe('upscale-1');
    expect(promotePlannedEcommerceSource('upscale-1', 'cutout-2', ctx)).toBe(true);
    expect(plan.preferredSourceRefId).toBe('cutout-2');
    expect(promotePlannedEcommerceSource('unrelated', 'bad', ctx)).toBe(false);
    expect(plan.preferredSourceRefId).toBe('cutout-2');
  });
});
