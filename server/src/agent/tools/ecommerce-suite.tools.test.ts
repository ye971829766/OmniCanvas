import { describe, expect, test } from 'bun:test';
import { planEcommerceSuiteTool } from './ecommerce-suite.tools';

function createContext(canvasState: any[] = [], assetOverrides: Record<string, any> = {}) {
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
          ...assetOverrides,
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
    expect(output.instruction).toContain('amazon_listing_gold_standard');
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

  test('requires low-resolution assets to be prepared and persists factual suite context', async () => {
    const { ctx, getSavedPlan } = createContext([], { width: 224, height: 224 });
    ctx.assets.push({
      id: 'asset_product_alias',
      url: ctx.assets[0].url,
      name: 'reference-1',
      createdAt: Date.now(),
    });
    const result = await planEcommerceSuiteTool.execute(
      {
        platforms: ['taobao'],
        sourceAssetId: 'asset_product_alias',
        productName: '城市跑鞋',
        brand: 'Example',
        sellingPoints: ['用户提供的透气鞋面'],
        language: 'zh-CN',
        creativeDirection: '都市夜跑，高端运动科技感',
      },
      ctx,
    );

    const output = result.output as any;
    const plan = getSavedPlan();
    expect(output.needsUpscale).toBe(true);
    expect(output.sourceDimensions).toEqual({ width: 224, height: 224 });
    expect(plan).toMatchObject({
      sourceWidth: 224,
      sourceHeight: 224,
      productName: '城市跑鞋',
      brand: 'Example',
      sellingPoints: ['用户提供的透气鞋面'],
      language: 'zh-CN',
      creativeDirection: '都市夜跑，高端运动科技感',
    });
    expect(plan.steps[0]).toMatchObject({
      status: 'pending',
      completionTool: 'upscale_image',
    });
    expect(output.instruction).toContain('Upscale the source first');
    expect(output.deliverables).toHaveLength(6);
  });

  test('drops product facts invented by the control model', async () => {
    const { ctx, getSavedPlan } = createContext();
    ctx.userInput = '基于这双鞋生成淘宝主图，不要编造品牌、材质或功效。';

    await planEcommerceSuiteTool.execute(
      {
        platforms: ['taobao'],
        sourceAssetId: 'asset_product',
        productName: 'Nike Air Zoom 跑鞋',
        brand: 'Nike',
        sellingPoints: ['高弹 EVA 中底', '耐磨防滑'],
        creativeDirection: '高端城市运动风格',
        imagesPerPlatform: 1,
      },
      ctx,
    );

    expect(getSavedPlan()).toMatchObject({
      sellingPoints: [],
      creativeDirection: '高端城市运动风格',
    });
    expect(getSavedPlan().productName).toBeUndefined();
    expect(getSavedPlan().brand).toBeUndefined();
  });
});
