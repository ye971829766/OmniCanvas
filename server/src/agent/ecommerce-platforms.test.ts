import { describe, expect, test } from 'bun:test';
import {
  getDefaultSuiteDeliverables,
  normalizeCustomDeliverableLabel,
  resolveEcommerceDeliverable,
  resolveEcommercePlatform,
} from './ecommerce-platforms';

describe('minimal ecommerce platform registry', () => {
  test('keeps the bare Amazon default in one authoritative registry', () => {
    const platform = resolveEcommercePlatform('帮我生成亚马逊套图');
    expect(platform.id).toBe('amazon');
    expect(getDefaultSuiteDeliverables(platform).map((item) => item.id)).toEqual([
      'main',
      'a_plus',
    ]);
    expect(getDefaultSuiteDeliverables(platform).map((item) => item.promptLabel)).toEqual([
      '主图',
      '亚马逊A+详情页',
    ]);
  });

  test('recognizes common and newer marketplaces without giving them hidden art direction', () => {
    expect(resolveEcommercePlatform('Shopee商品套图').id).toBe('shopee');
    expect(resolveEcommercePlatform('TikTok Shop image suite').id).toBe('tiktok_shop');
    expect(resolveEcommercePlatform('未知平台套图').id).toBe('generic');
    expect(resolveEcommercePlatform('淘宝套图').defaultSuite).toEqual([]);
  });

  test('normalizes canonical deliverables while allowing safe new names', () => {
    expect(resolveEcommerceDeliverable('生成亚马逊A+详情页')?.id).toBe('a_plus');
    expect(resolveEcommerceDeliverable('hero_image')?.id).toBe('main');
    expect(normalizeCustomDeliverableLabel('生成店铺横幅图')).toBe('店铺横幅图');
    expect(normalizeCustomDeliverableLabel('生成专业高端主图，采用电影级灯光')).toBeUndefined();
  });
});
