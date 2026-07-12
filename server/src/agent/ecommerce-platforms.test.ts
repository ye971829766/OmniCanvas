import { describe, expect, test } from 'bun:test';
import { buildEcommerceDeliverables } from './ecommerce-platforms';

describe('buildEcommerceDeliverables', () => {
  test('creates stable platform-specific root-image positions and dimensions', () => {
    const deliverables = buildEcommerceDeliverables({
      platforms: ['amazon', 'taobao', 'jd'],
      sourceAssetId: 'asset_product',
      imagesPerPlatform: 2,
    });

    expect(deliverables).toHaveLength(6);
    expect(new Set(deliverables.map((item) => item.id)).size).toBe(6);
    expect(deliverables.find((item) => item.id === 'amazon_main')).toMatchObject({
      width: 2000,
      height: 2000,
      x: 0,
      y: 0,
    });
    expect(deliverables.find((item) => item.id === 'taobao_main')).toMatchObject({
      width: 1000,
      height: 1000,
      x: 0,
      y: 2360,
    });
  });

  test('defaults Amazon suites to six images and caps explicit output at eight', () => {
    const defaults = buildEcommerceDeliverables({
      platforms: ['amazon'],
      sourceAssetId: 'asset_product',
    });
    const deliverables = buildEcommerceDeliverables({
      platforms: ['amazon'],
      sourceAssetId: 'asset_product',
      imagesPerPlatform: 99,
    });
    expect(defaults).toHaveLength(6);
    expect(deliverables).toHaveLength(8);
  });

  test('defaults Chinese marketplace suites to a six-image purchase narrative', () => {
    const deliverables = buildEcommerceDeliverables({
      platforms: ['taobao'],
      sourceAssetId: 'asset_product',
    });

    expect(deliverables.map((item) => item.role)).toEqual([
      'main',
      'selling_point',
      'scenario',
      'detail',
      'specification',
      'trust',
    ]);
    expect(deliverables.find((item) => item.role === 'detail')).toMatchObject({
      width: 750,
      height: 1000,
      copyMode: 'verified_labels',
    });
  });

  test('offsets the full grid from a supplied root-canvas origin', () => {
    const deliverables = buildEcommerceDeliverables({
      platforms: ['amazon'],
      sourceAssetId: 'asset_product',
      imagesPerPlatform: 3,
      originX: -400,
      originY: 2240,
    });

    expect(deliverables.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: -400, y: 2240 },
      { x: 1720, y: 2240 },
      { x: 3840, y: 2240 },
    ]);
  });
});
