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
  test('passes the agent-authored prompt through without system suite scaffolds', () => {
    const agentPrompt =
      '青花盖碗淘宝主图：暖金光影，大号中文标题，手机可读卖点层级，保留产品釉色与亭台纹样';
    const prompt = buildEcommerceImagePrompt(
      agentPrompt,
      placement({
        productName: '山水雅韵盖碗',
        sellingPoints: ['白瓷青花'],
        language: 'zh-CN',
      }),
    );

    expect(prompt).toBe(agentPrompt);
    expect(prompt).not.toContain('premium benefit visual');
    expect(prompt).not.toContain('Composition:');
    expect(prompt).not.toContain('Quality bar');
    expect(prompt).not.toContain('Identity lock');
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
