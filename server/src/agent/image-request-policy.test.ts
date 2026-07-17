import { describe, expect, test } from 'bun:test';
import {
  applyFinalImageRequestPolicy,
  applyFinalImageSeriesLayout,
  finalImagePromptFromUserInput,
  getEcommercePlatformHint,
  getFinalImagePromptMode,
  getFinalImageSeriesStrategy,
  isAmazonAPlusRequest,
  shouldResearchFinalImageRequest,
} from './image-request-policy';

describe('final image request policy', () => {
  test('removes editor metadata without rewriting the user brief', () => {
    expect(finalImagePromptFromUserInput(
      '@gpt-image-2 [modelId:gpt-image-2] 生成一张 16:9 的山水画 [refId:image_1]',
    )).toBe('生成一张 16:9 的山水画');
  });

  test('distinguishes a concrete prompt from a high-level creative task', () => {
    expect(getFinalImagePromptMode(
      '帮我生成适合的电商主图，生成 5 张，风格要统一',
    )).toBe('optimize');
    expect(getFinalImagePromptMode(
      '用这双鞋做一张暗黑科技风电商主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字',
    )).toBe('normalize');
    expect(getFinalImagePromptMode(
      '不要改写提示词，生成一张黑白建筑摄影',
    )).toBe('verbatim');
    expect(getFinalImagePromptMode(
      '生成这双鞋的淘宝套图 主图+详情页',
    )).toBe('optimize');
    expect(getFinalImageSeriesStrategy(
      '生成这双鞋的淘宝套图 主图+详情页',
    )).toBe('role_suite');
  });

  test('researches underspecified commercial briefs unless the user opts out', () => {
    expect(shouldResearchFinalImageRequest(
      '生成这双鞋的淘宝套图 主图+详情页',
    )).toBe(true);
    expect(shouldResearchFinalImageRequest(
      '不要联网，帮我生成适合的电商主图',
    )).toBe(false);
    expect(shouldResearchFinalImageRequest(
      '用这双鞋做暗黑科技风淘宝主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字',
    )).toBe(false);
  });

  test('passes the full agent-authored prompt and provider controls through in optimize mode', () => {
    const userPrompt = '生成这双鞋的淘宝套图 主图+详情页';
    const agentPrompt = [
      '为白色厚底运动鞋设计淘宝首屏主图。',
      '以夸张的低机位透视和动态切片构图建立速度感，让鞋成为压倒性的视觉主体；',
      '使用深靛蓝到电光青的空间光场、锐利边缘光和半透明运动轨迹，加入大胆的纵向编辑排版，整体像一线运动品牌新品 campaign，而不是普通棚拍。',
      '保持参考鞋款的轮廓、鞋面结构、配色和标识一致，不添加未经提供的参数或功效。',
    ].join('');
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: agentPrompt,
      style: 'dynamic editorial campaign',
      size: '2048x2048',
      quality: 'high',
      aspectRatio: '1:1',
      refImages: ['asset_product'],
    }, userPrompt);

    expect(input).toEqual({
      prompt: agentPrompt,
      style: 'dynamic editorial campaign',
      size: '2048x2048',
      quality: 'high',
      aspectRatio: '1:1',
      refImages: ['asset_product'],
    });
  });

  test('keeps the original concrete brief authoritative while allowing production normalization', () => {
    const userPrompt =
      '用这双鞋做一张暗黑科技风电商主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字';
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: '改成纯白背景目录图',
      style: 'minimal catalog',
      size: '1536x1024',
      quality: 'high',
      aspectRatio: '3:2',
    }, userPrompt);

    expect(input.prompt).toContain(userPrompt);
    expect(input.prompt).toContain('改成纯白背景目录图');
    expect(input.prompt).toContain('如有冲突以上述原始要求为准');
    expect(input.style).toBe('minimal catalog');
    expect(input).toMatchObject({
      size: '1536x1024',
      quality: 'high',
      aspectRatio: '3:2',
    });
  });

  test('honors an explicit verbatim request but still applies the final-quality floor', () => {
    const userPrompt = '不要改写提示词：黑白建筑摄影，强烈透视';
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: 'rewritten',
      style: 'colorful illustration',
    }, userPrompt);

    expect(input).toEqual({ prompt: userPrompt, quality: 'high' });
  });

  test('adds suite layout metadata and high quality without rewriting creative prompts', () => {
    const userPrompt = '生成这双鞋的淘宝套图 主图+详情页';
    const prompts = Array.from({ length: 6 }, (_, index) =>
      `由 Agent 自由创作的完整生产提示词 ${index + 1}：每一张都有不同的具体场景、构图、灯光和排版。`,
    );
    const calls: Array<{ name: string; input: any }> = prompts.map((prompt) => ({
      name: 'generate_image',
      input: { prompt, refImages: ['asset_product'] },
    }));

    applyFinalImageSeriesLayout(calls, userPrompt);

    expect(calls.map((call) => call.input.prompt)).toEqual(prompts);
    expect(calls.map((call) => call.input.seriesRole)).toEqual([
      'main_hero',
      'main_scene',
      'main_detail',
      'detail_overview',
      'detail_material',
      'detail_usage',
    ]);
    expect(calls.slice(0, 3).every((call) =>
      call.input.size === '1024x1024' &&
      call.input.aspectRatio === '1:1' &&
      call.input.quality === 'high'
    )).toBe(true);
    expect(calls.slice(3).every((call) =>
      call.input.size === '1024x1536' &&
      call.input.aspectRatio === '2:3' &&
      call.input.quality === 'high'
    )).toBe(true);
  });

  test('preserves explicit controls and a failed role when retried alone', () => {
    const userPrompt = '生成这双鞋的淘宝套图 主图+详情页';
    const retry = [{
      name: 'generate_image',
      input: {
        prompt: '保留失败任务的完整原始创意提示词',
        seriesRole: 'detail_material',
        size: '2048x3072',
        aspectRatio: '2:3',
        quality: 'medium',
      },
    }];

    applyFinalImageSeriesLayout(retry, userPrompt);

    expect(retry[0]!.input).toEqual({
      prompt: '保留失败任务的完整原始创意提示词',
      seriesRole: 'detail_material',
      size: '2048x3072',
      aspectRatio: '2:3',
      quality: 'medium',
    });
  });

  test('leaves non-commercial shared variants and non-image tools untouched', () => {
    const calls: Array<{ name: string; input: any }> = [{
      name: 'generate_image',
      input: { prompt: 'Agent prompt', quality: 'high' },
    }];
    applyFinalImageSeriesLayout(calls, '生成 5 张统一风格的插画');
    expect(calls[0]!.input).toEqual({ prompt: 'Agent prompt', quality: 'high' });

    const input = { text: 'hello' };
    expect(applyFinalImageRequestPolicy('add_text', input, 'ignored')).toBe(input);
  });

  test('detects Amazon A+ and fills commercial provider defaults when omitted', () => {
    expect(getEcommercePlatformHint('生成亚马逊的高级A+详情页')).toBe('amazon');
    expect(isAmazonAPlusRequest('生成亚马逊的高级A+详情页')).toBe(true);
    expect(getFinalImagePromptMode('生成亚马逊的高级A+详情页')).toBe('optimize');
    expect(shouldResearchFinalImageRequest('生成亚马逊的高级A+详情页')).toBe(true);

    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: 'A multi-module Amazon A+ catalog page for white sneakers.',
      refImages: ['asset_product'],
    }, '生成亚马逊的高级A+详情页');

    expect(input.quality).toBe('high');
    expect(input.aspectRatio).toBe('2:3');
    expect(input.size).toBe('1024x1536');
    expect(input.prompt).toContain('Amazon A+');

    const calls: Array<{ name: string; input: any }> = [{
      name: 'generate_image',
      input: {
        prompt: 'Premium multi-module A+ content page',
        refImages: ['asset_product'],
      },
    }];
    applyFinalImageSeriesLayout(calls, '生成亚马逊的高级A+详情页');
    expect(calls[0]!.input.quality).toBe('high');
    expect(calls[0]!.input.aspectRatio).toBe('2:3');
    expect(calls[0]!.input.size).toBe('1024x1536');
  });

  test('does not force A+ layout onto explicit Taobao detail briefs', () => {
    expect(isAmazonAPlusRequest('生成这双鞋的淘宝详情页')).toBe(false);
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: '淘宝详情页模块',
      quality: 'high',
      aspectRatio: '2:3',
      size: '1024x1536',
    }, '生成这双鞋的淘宝详情页');
    expect(input.prompt).toBe('淘宝详情页模块');
    expect(input.quality).toBe('high');
  });

  test('keeps every Amazon listing-suite image square and assigns category-neutral roles', () => {
    const calls: Array<{ name: string; input: any }> = Array.from({ length: 6 }, (_, index) => ({
      name: 'generate_image',
      input: {
        prompt: `Amazon image ${index + 1}`,
        ...(index >= 3 ? { size: '1024x1536', aspectRatio: '1:1' } : {}),
      },
    }));

    applyFinalImageSeriesLayout(calls, '生成这件产品的亚马逊套图');

    expect(calls.map((call) => call.input.seriesRole)).toEqual([
      'main',
      'supporting_view',
      'lifestyle',
      'feature_evidence',
      'visible_detail',
      'use_or_scale',
    ]);
    expect(calls.every((call) =>
      call.input.size === '2000x2000' &&
      call.input.aspectRatio === '1:1' &&
      call.input.quality === 'high'
    )).toBe(true);
  });
});
