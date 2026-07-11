import { describe, expect, test } from 'bun:test';
import { planEcommerceSuiteTool } from './ecommerce-suite.tools';

function createContext(canvasState: any[] = []) {
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
      canvasState,
    } as any,
  };
}

describe('planEcommerceSuiteTool', () => {
  test('emits a structured root-image plan without artboards', async () => {
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
    expect(output.deliverables.every((item: any) => item.frameId === undefined)).toBe(true);
    expect(output.plan.steps.find((step: any) => step.deliverable === 'main')).toMatchObject({
      width: 2000,
      height: 2000,
      x: 0,
      y: 0,
    });
    expect(output.plan.steps.some((step: any) => step.tools?.includes('add_frame'))).toBe(false);
    expect(output.instruction).toContain('Do not create frames');
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

  test('accepts a single platform string from weaker tool callers', async () => {
    const { ctx } = createContext();
    const result = await planEcommerceSuiteTool.execute(
      {
        platforms: 'amazon',
        sourceAssetId: 'asset_product',
        imagesPerPlatform: 1,
      } as any,
      ctx,
    );

    expect((result.output as any).deliverables[0].platform).toBe('amazon');
  });

  test('places a new suite below existing root-canvas content', async () => {
    const { ctx } = createContext([
      {
        refId: 'old_frame',
        type: 'frame',
        x: -100,
        y: 50,
        width: 1200,
        height: 2000,
      },
    ]);
    const result = await planEcommerceSuiteTool.execute(
      {
        platforms: ['amazon'],
        sourceAssetId: 'asset_product',
        imagesPerPlatform: 3,
      },
      ctx,
    );

    expect((result.output as any).deliverables.map((item: any) => ({
      x: item.x,
      y: item.y,
    }))).toEqual([
      { x: -100, y: 2290 },
      { x: 2020, y: 2290 },
      { x: 4140, y: 2290 },
    ]);
  });
});
