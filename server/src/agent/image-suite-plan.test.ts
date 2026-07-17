import { describe, expect, test } from 'bun:test';
import {
  IMAGE_REQUEST_POLICY_ERROR,
  buildImageSuitePlan,
  compileImageSuiteBatch,
  getExplicitImageCount,
  isImageSuiteRequest,
} from './image-suite-plan';

describe('structured image suite planning', () => {
  test('builds the bare Amazon plan from the platform registry', () => {
    const plan = buildImageSuitePlan('帮我生成这个产品的亚马逊套图');
    expect(plan).toMatchObject({
      platform: { id: 'amazon' },
      scopeSource: 'platform_default',
      plannedCount: 2,
      allowAdditionalDeliverables: true,
    });
    expect(plan?.deliverables.map((item) => item.id)).toEqual(['main', 'a_plus']);
  });

  test('lets explicit roles and counts override a platform default', () => {
    const explicit = buildImageSuitePlan('生成亚马逊主图、功能图和包装图套图');
    expect(explicit?.scopeSource).toBe('explicit');
    expect(explicit?.deliverables.map((item) => item.id)).toEqual([
      'main',
      'feature',
      'packaging',
    ]);
    expect(explicit?.plannedCount).toBe(3);
    expect(explicit?.allowAdditionalDeliverables).toBe(false);

    const counted = buildImageSuitePlan('生成 6 张亚马逊套图');
    expect(counted?.explicitCount).toBe(6);
    expect(counted?.plannedCount).toBe(6);
    expect(counted?.allowAdditionalDeliverables).toBe(true);

    const reduced = buildImageSuitePlan('只生成 1 张亚马逊套图');
    expect(reduced?.deliverables.map((item) => item.id)).toEqual(['main']);
    expect(reduced?.plannedCount).toBe(1);

    const englishListing = buildImageSuitePlan('Create six Amazon listing images');
    expect(englishListing?.explicitCount).toBe(6);
    expect(englishListing?.allowAdditionalDeliverables).toBe(true);
    expect(englishListing?.deliverables).toEqual([]);
    expect(englishListing?.scopeSource).toBe('agent');
  });

  test('leaves other platform role selection to the control agent', () => {
    expect(isImageSuiteRequest('生成Shopee套图')).toBe(true);
    const plan = buildImageSuitePlan('生成Shopee套图');
    expect(plan).toMatchObject({
      platform: { id: 'shopee' },
      deliverables: [],
      scopeSource: 'agent',
    });
    expect(plan?.plannedCount).toBeUndefined();
  });

  test('compiles structured roles and verified constraints into minimal prompts', () => {
    const userInput = '生成这个产品的亚马逊套图，黑色高端风，不要文字';
    const calls = [
      {
        name: 'generate_image',
        input: {
          deliverable: 'a_plus',
          prompt: '一大段会被忽略的专业构图描述',
          userConstraints: ['黑色高端风', '不要文字', '电影级灯光'],
        },
      },
      {
        name: 'generate_image',
        input: {
          deliverable: 'main',
          prompt: '另一段会被忽略的描述',
          userConstraints: ['不要文字'],
        },
      },
    ];

    compileImageSuiteBatch(calls, userInput);

    // Platform-default order is authoritative even when the agent reverses it.
    expect(calls.map((call) => call.input.prompt)).toEqual([
      '生成主图，黑色高端风，不要文字',
      '生成亚马逊A+详情页，不要文字',
    ]);
    expect(calls.map((call) => call.input.deliverable)).toEqual(['main', 'a_plus']);
    expect(calls[0]!.input.userConstraints).not.toContain('电影级灯光');
  });

  test('supports safe agent-selected roles for platforms without defaults', () => {
    const calls: Array<{ name: string; input: any }> = [{
      name: 'generate_image',
      input: { platform: 'shopee', deliverable: '店铺横幅图', prompt: 'ignored' },
    }];
    compileImageSuiteBatch(calls, '生成Shopee套图');
    expect(calls[0]!.input).toMatchObject({
      platform: 'shopee',
      deliverable: '店铺横幅图',
      prompt: '生成店铺横幅图',
    });
  });

  test('continues registered role compilation from a later model step', () => {
    const calls: Array<{ name: string; input: any }> = [{
      name: 'generate_image',
      input: { deliverable: 'feature', prompt: 'ignored' },
    }];
    compileImageSuiteBatch(calls, '生成这个产品的亚马逊套图', 2);
    expect(calls[0]!.input).toMatchObject({
      deliverable: 'feature',
      prompt: '生成功能图',
    });
  });

  test('marks invalid child tasks for a model retry instead of forwarding the suite request', () => {
    const calls: Array<{ name: string; input: any }> = [{
      name: 'generate_image',
      input: { deliverable: '专业高端视觉，使用电影级灯光', prompt: '生成Shopee套图' },
    }];
    compileImageSuiteBatch(calls, '生成Shopee套图');
    expect(calls[0]!.input.prompt).toBeUndefined();
    expect(calls[0]!.input[IMAGE_REQUEST_POLICY_ERROR]).toContain(
      'short structured deliverable name',
    );
  });

  test('keeps explicit counts available for ordinary multi-image requests', () => {
    expect(getExplicitImageCount('生成 5 张统一风格插画')).toBe(5);
    expect(getExplicitImageCount('Generate three images')).toBe(3);
  });
});
