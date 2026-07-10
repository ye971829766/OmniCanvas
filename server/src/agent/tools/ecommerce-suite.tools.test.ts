import { describe, expect, test } from 'bun:test';
import { planEcommerceSuiteTool } from './ecommerce-suite.tools';

function createContext() {
  const events: any[] = [];
  let savedPlan: any = null;
  return {
    events,
    getSavedPlan: () => savedPlan,
    ctx: {
      assets: [
        {
          id: 'asset_product',
          url: 'http://localhost:3000/files/product.png',
          name: 'product.png',
          createdAt: Date.now(),
        },
      ],
      sink: { emit: (event: any) => events.push(event) },
      memory: { setPlan: (_sessionId: string, plan: any) => { savedPlan = plan; } },
      sessionId: 'test-session',
    } as any,
  };
}

describe('planEcommerceSuiteTool', () => {
  test('emits a structured plan and exact frame ids', async () => {
    const { ctx, events, getSavedPlan } = createContext();
    const result = await planEcommerceSuiteTool.execute(
      {
        platforms: ['amazon', 'taobao'],
        sourceAssetId: 'asset_product',
        imagesPerPlatform: 1,
      },
      ctx,
    );
    const output = result.output as any;

    expect(events[0]?.type).toBe('plan');
    expect(getSavedPlan()?.id).toBe(output.planId);
    expect(output.plan.steps.length).toBeGreaterThan(2);
    expect(output.deliverables.map((item: any) => item.frameId)).toEqual([
      'commerce_amazon_main',
      'commerce_taobao_main',
    ]);
  });

  test('rejects unknown asset ids', async () => {
    const { ctx } = createContext();
    expect(
      planEcommerceSuiteTool.execute(
        { platforms: ['amazon'], sourceAssetId: 'missing' },
        ctx,
      ),
    ).rejects.toThrow('Unknown sourceAssetId');
  });
});
