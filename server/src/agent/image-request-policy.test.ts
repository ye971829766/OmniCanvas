import { describe, expect, test } from 'bun:test';
import {
  applyFinalImageRequestPolicy,
  applyFinalImageSeriesLayout,
  finalImagePromptFromUserInput,
  getFinalImagePromptMode,
  getFinalImageSeriesStrategy,
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
    )).toBe('preserve');
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

  test('protects a production-ready user prompt but does not delete technical controls', () => {
    const userPrompt =
      '用这双鞋做一张暗黑科技风电商主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字';
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: '改成纯白背景目录图',
      style: 'minimal catalog',
      size: '1536x1024',
      quality: 'high',
      aspectRatio: '3:2',
    }, userPrompt);

    expect(input).toEqual({
      prompt: userPrompt,
      size: '1536x1024',
      quality: 'high',
      aspectRatio: '3:2',
    });
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

  test('leaves shared variants and non-image tools completely untouched', () => {
    const calls = [{
      name: 'generate_image',
      input: { prompt: 'Agent prompt', quality: 'high' },
    }];
    applyFinalImageSeriesLayout(calls, '生成 5 张统一风格的电商主图');
    expect(calls[0]!.input).toEqual({ prompt: 'Agent prompt', quality: 'high' });

    const input = { text: 'hello' };
    expect(applyFinalImageRequestPolicy('add_text', input, 'ignored')).toBe(input);
  });
});
