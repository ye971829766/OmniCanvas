import { describe, expect, test } from 'bun:test';
import { buildEcommerceDeliverables } from './ecommerce-platforms';

describe('buildEcommerceDeliverables', () => {
  test('creates stable platform-specific frame ids and dimensions', () => {
    const deliverables = buildEcommerceDeliverables({
      platforms: ['amazon', 'taobao', 'jd'],
      sourceAssetId: 'asset_product',
      imagesPerPlatform: 2,
    });

    expect(deliverables).toHaveLength(6);
    expect(new Set(deliverables.map((item) => item.frameId)).size).toBe(6);
    expect(deliverables.find((item) => item.id === 'amazon_main')).toMatchObject({
      width: 2000,
      height: 2000,
      frameId: 'commerce_amazon_main',
    });
    expect(deliverables.find((item) => item.id === 'taobao_main')).toMatchObject({
      width: 1000,
      height: 1000,
      y: 2200,
    });
  });

  test('caps output at four images per platform', () => {
    const deliverables = buildEcommerceDeliverables({
      platforms: ['amazon'],
      sourceAssetId: 'asset_product',
      imagesPerPlatform: 99,
    });
    expect(deliverables).toHaveLength(4);
  });
});
