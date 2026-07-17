import { describe, expect, test } from 'bun:test';
import {
  applyFinalImageRequestPolicy,
  applyFinalImageBatchPolicy,
  finalImagePromptFromUserInput,
  getEcommercePlatformHint,
  getFinalImageOutputLimit,
  getFinalImagePromptMode,
  getFinalImageSeriesStrategy,
  isAmazonAPlusRequest,
  isAmazonListingAndAPlusRequest,
  shouldAutoReviewFinalImageRequest,
  shouldResearchFinalImageRequest,
} from './image-request-policy';

describe('final image request policy', () => {
  test('removes editor metadata without rewriting the user brief', () => {
    expect(finalImagePromptFromUserInput(
      '@gpt-image-2 [modelId:gpt-image-2] 生成一张 16:9 的山水画 [refId:image_1]',
    )).toBe('生成一张 16:9 的山水画');
  });

  test('relays ordinary prompts and optimizes only after an explicit request', () => {
    expect(getFinalImagePromptMode(
      '帮我生成适合的电商主图，生成 5 张，风格要统一',
    )).toBe('normalize');
    expect(getFinalImagePromptMode(
      '用这双鞋做一张暗黑科技风电商主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字',
    )).toBe('normalize');
    expect(getFinalImagePromptMode(
      '不要改写提示词，生成一张黑白建筑摄影',
    )).toBe('verbatim');
    expect(getFinalImagePromptMode(
      '生成这双鞋的淘宝套图 主图+详情页',
    )).toBe('normalize');
    expect(getFinalImagePromptMode(
      '请优化提示词：生成这双鞋的淘宝套图 主图+详情页',
    )).toBe('optimize');
    expect(getFinalImageSeriesStrategy(
      '生成这双鞋的淘宝套图 主图+详情页',
    )).toBe('role_suite');
  });

  test('researches only when the user explicitly asks for it', () => {
    expect(shouldResearchFinalImageRequest(
      '生成这双鞋的淘宝套图 主图+详情页',
    )).toBe(false);
    expect(shouldResearchFinalImageRequest(
      '搜索竞品趋势，然后生成这双鞋的淘宝套图',
    )).toBe(true);
    expect(shouldResearchFinalImageRequest(
      '不要联网，帮我生成适合的电商主图',
    )).toBe(false);
    expect(shouldResearchFinalImageRequest(
      '用这双鞋做暗黑科技风淘宝主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字',
    )).toBe(false);
  });

  test('runs visual verification only when the user explicitly requests it', () => {
    expect(shouldAutoReviewFinalImageRequest('宇航员猫，月球，电影感')).toBe(false);
    expect(shouldAutoReviewFinalImageRequest('生成宇航员猫，并做视觉质检')).toBe(true);
    expect(shouldAutoReviewFinalImageRequest('Generate an image and run a quality check')).toBe(true);
    expect(shouldAutoReviewFinalImageRequest('快速预览一张图，不用质检')).toBe(false);
    expect(shouldAutoReviewFinalImageRequest('draft image, skip visual review')).toBe(false);
  });

  test('passes the full agent-authored prompt and provider controls through in optimize mode', () => {
    const userPrompt = '请优化提示词：生成这双鞋的淘宝套图 主图+详情页';
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

  test('replaces an agent rewrite with the exact ordinary user request', () => {
    const userPrompt =
      '用这双鞋做一张暗黑科技风电商主图，黑色背景、蓝色霓虹侧光，产品居中，不要文字';
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: '改成纯白背景目录图',
      style: 'minimal catalog',
      size: '1536x1024',
      quality: 'high',
      aspectRatio: '3:2',
    }, userPrompt);

    expect(input.prompt).toBe(userPrompt);
    expect(input.prompt).not.toContain('改成纯白背景目录图');
    expect(input.style).toBeUndefined();
    expect(input).toMatchObject({
      quality: 'high',
    });
    expect(input.size).toBeUndefined();
    expect(input.aspectRatio).toBeUndefined();
  });

  test('removes only the request wrapper from a bare A+ task', () => {
    const userPrompt = '帮我生成这个产品的A+详情页';
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: '一张专业亚马逊A+长页，包含主视觉、功能模块和材质特写',
      style: 'premium ecommerce',
      size: '1024x3072',
      aspectRatio: '1:3',
      refImages: ['asset_product'],
    }, userPrompt);

    expect(input).toEqual({
      prompt: '生成这个产品的A+详情页',
      quality: 'high',
      refImages: ['asset_product'],
    });
  });

  test('passes an ordinary edit request word for word', () => {
    const userPrompt = '把这个产品的背景换成红色';
    const input = applyFinalImageRequestPolicy('edit_image', {
      source: 'asset_product',
      prompt: 'Replace the background with a dramatic red studio set and rim light.',
      style: 'campaign',
      aspectRatio: '1:1',
    }, userPrompt);

    expect(input).toEqual({
      source: 'asset_product',
      prompt: userPrompt,
      quality: 'high',
    });
  });

  test('honors an explicit verbatim request but still applies the final-quality floor', () => {
    const userPrompt = '不要改写提示词：黑白建筑摄影，强烈透视';
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: 'rewritten',
      style: 'colorful illustration',
    }, userPrompt);

    expect(input).toEqual({ prompt: '黑白建筑摄影，强烈透视', quality: 'high' });
  });

  test('keeps suite decomposition minimal while preserving inferred deliverable names', () => {
    const userPrompt = '帮我生成这个产品的亚马逊套图';
    const calls: Array<{ name: string; input: any }> = [
      { prompt: '1. 生成主图', role: 'main' },
      { prompt: '2. 生成亚马逊A+详情页', role: 'a_plus' },
    ].map(({ prompt, role }, index) => ({
      name: 'generate_image',
      input: {
        prompt,
        seriesRole: role,
        refImages: ['asset_product'],
        ...(index === 0 ? {
          aspectRatio: '4:5',
          size: '1600x2000',
        } : {}),
      },
    }));

    applyFinalImageBatchPolicy(calls, userPrompt);

    expect(calls.map((call) => call.input.prompt)).toEqual([
      '生成主图',
      '生成亚马逊A+详情页',
    ]);
    expect(calls[0]!.input).toMatchObject({
      seriesRole: 'main',
      quality: 'high',
    });
    expect(calls[0]!.input.aspectRatio).toBeUndefined();
    expect(calls[0]!.input.size).toBeUndefined();
    expect(calls[1]!.input).toMatchObject({
      seriesRole: 'a_plus',
      quality: 'high',
    });
  });

  test('ignores an over-described suite prompt and compiles the registered task', () => {
    const userPrompt = '生成这个产品的亚马逊套图';
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: '生成专业高端主图，采用电影级灯光和黄金构图，突出产品卖点',
      style: 'luxury campaign',
      aspectRatio: '1:1',
    }, userPrompt);

    expect(input).toEqual({
      prompt: '生成主图',
      platform: 'amazon',
      deliverable: 'main',
      seriesRole: 'main',
      userConstraints: [],
      quality: 'high',
    });
  });

  test('keeps explicit user constraints when they are relevant to suite children', () => {
    const userPrompt = '生成这个产品的亚马逊套图，黑色高端风，不要文字';
    const calls = [
      {
        name: 'generate_image',
        input: {
          prompt: 'Agent prompt is ignored',
          deliverable: 'main',
          userConstraints: ['黑色高端风', '不要文字'],
        },
      },
      {
        name: 'generate_image',
        input: {
          prompt: 'Agent prompt is ignored',
          deliverable: 'a_plus',
          userConstraints: ['黑色高端风', '不要文字'],
        },
      },
    ];

    applyFinalImageBatchPolicy(calls, userPrompt);

    expect(calls.map((call) => call.input.prompt)).toEqual([
      '生成主图，黑色高端风，不要文字',
      '生成亚马逊A+详情页，黑色高端风，不要文字',
    ]);
  });

  test('keeps explicit suite order authoritative over an invalid agent role', () => {
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

    applyFinalImageBatchPolicy(retry, userPrompt);

    expect(retry[0]!.input).toMatchObject({
      platform: 'taobao',
      deliverable: 'main',
      seriesRole: 'main',
      quality: 'medium',
    });
    expect(retry[0]!.input.prompt).toBe('生成主图');
    expect(retry[0]!.input.size).toBeUndefined();
    expect(retry[0]!.input.aspectRatio).toBeUndefined();
  });

  test('leaves non-commercial shared variants and non-image tools untouched', () => {
    const calls: Array<{ name: string; input: any }> = [{
      name: 'generate_image',
      input: { prompt: 'Agent prompt', quality: 'high' },
    }];
    applyFinalImageBatchPolicy(calls, '生成 5 张统一风格的插画');
    expect(calls[0]!.input.prompt).toBe('生成 5 张统一风格的插画');
    expect(calls[0]!.input.quality).toBe('high');

    const input = { text: 'hello' };
    expect(applyFinalImageRequestPolicy('add_text', input, 'ignored')).toBe(input);
  });

  test('detects Amazon A+ but keeps advisory geometry model-authored', () => {
    expect(getEcommercePlatformHint('生成亚马逊的高级A+详情页')).toBe('amazon');
    expect(getEcommercePlatformHint('生成基础 A+ 详情页')).toBe('amazon');
    expect(isAmazonAPlusRequest('生成亚马逊的高级A+详情页')).toBe(true);
    expect(getFinalImageSeriesStrategy('生成基础 A+ 详情页')).toBe('shared_variants');
    expect(getFinalImageSeriesStrategy('生成完整 A+ 桌面端和移动端套组')).toBe('role_suite');
    expect(getFinalImagePromptMode('生成亚马逊的高级A+详情页')).toBe('normalize');
    expect(shouldResearchFinalImageRequest('生成亚马逊的高级A+详情页')).toBe(false);
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: 'A multi-module Amazon A+ catalog page for white sneakers.',
      refImages: ['asset_product'],
    }, '生成亚马逊的高级A+详情页');

    expect(input.quality).toBe('high');
    expect(input.aspectRatio).toBeUndefined();
    expect(input.size).toBeUndefined();
    expect(input.prompt).toBe('生成亚马逊的高级A+详情页');

    const calls: Array<{ name: string; input: any }> = [{
      name: 'generate_image',
      input: {
        prompt: 'Premium multi-module A+ content page',
        refImages: ['asset_product'],
      },
    }];
    applyFinalImageBatchPolicy(calls, '生成亚马逊的高级A+详情页');
    expect(calls[0]!.input.quality).toBe('high');
    expect(calls[0]!.input.aspectRatio).toBeUndefined();
    expect(calls[0]!.input.size).toBeUndefined();
  });

  test('recognizes bare Amazon suite separately from an explicit A+ request', () => {
    expect(isAmazonAPlusRequest('生成亚马逊套图：主图、功能图、详情页和包装图')).toBe(false);
    expect(isAmazonListingAndAPlusRequest('生成这双鞋的亚马逊套图，你自由发挥')).toBe(false);
    expect(isAmazonAPlusRequest('生成亚马逊 A+ 详情页')).toBe(true);
  });

  test('preserves explicit listing-only and A+-only scopes', () => {
    expect(isAmazonAPlusRequest('只生成亚马逊 Listing 套图，不要 A+')).toBe(false);
    expect(isAmazonListingAndAPlusRequest('只生成亚马逊 Listing 套图，不要 A+')).toBe(false);
    expect(isAmazonAPlusRequest('只生成亚马逊主图、功能图和包装图')).toBe(false);
    expect(isAmazonListingAndAPlusRequest('只生成 A+ 详情页')).toBe(false);
  });

  test('hard-caps only counts explicitly supplied by the user', () => {
    expect(getFinalImageOutputLimit('生成这双鞋的亚马逊套图，你自由发挥')).toBeUndefined();
    expect(getFinalImageOutputLimit('只生成亚马逊 A+ 详情页')).toBeUndefined();
    expect(getFinalImageOutputLimit('生成亚马逊主图、功能图、包装图和 A+ 详情页')).toBeUndefined();
    expect(getFinalImageOutputLimit('生成 6 张 Amazon listing images')).toBe(6);
    expect(getFinalImageOutputLimit('生成八张亚马逊 listing images')).toBe(8);
    expect(getFinalImageOutputLimit('生成完整 A+ 桌面端和移动端套组')).toBeUndefined();
    expect(getFinalImageOutputLimit('生成 5 张统一风格的猫咪图片')).toBe(5);
  });

  test('distinguishes A+-only and combined Amazon requests for output limits', () => {
    expect(isAmazonListingAndAPlusRequest('只生成 A+ 详情页')).toBe(false);
    expect(isAmazonListingAndAPlusRequest('生成亚马逊主图、包装图和 A+ 详情页')).toBe(true);
    expect(isAmazonListingAndAPlusRequest('Create six Amazon listing images')).toBe(false);
  });

  test('does not force A+ layout onto explicit Taobao detail briefs', () => {
    expect(isAmazonAPlusRequest('生成这双鞋的淘宝详情页')).toBe(false);
    const input = applyFinalImageRequestPolicy('generate_image', {
      prompt: '淘宝详情页模块',
      quality: 'high',
      aspectRatio: '2:3',
      size: '1024x1536',
    }, '生成这双鞋的淘宝详情页');
    expect(input.prompt).toBe('生成这双鞋的淘宝详情页');
    expect(input.quality).toBe('high');
  });

  test('compiles registered Amazon roles and removes agent-invented geometry', () => {
    const calls: Array<{ name: string; input: any }> = [
      {
        name: 'generate_image',
        input: {
          prompt: 'Amazon image 1',
          seriesRole: 'model_selected_anchor',
          size: '1536x1024',
          aspectRatio: '3:2',
        },
      },
      {
        name: 'generate_image',
        input: { prompt: 'Amazon image 2' },
      },
    ];

    applyFinalImageBatchPolicy(calls, '生成这件产品的亚马逊套图');

    expect(calls[0]!.input).toMatchObject({
      platform: 'amazon',
      deliverable: 'main',
      seriesRole: 'main',
      quality: 'high',
    });
    expect(calls[0]!.input.prompt).toBe('生成主图');
    expect(calls[0]!.input.size).toBeUndefined();
    expect(calls[0]!.input.aspectRatio).toBeUndefined();
    expect(calls[1]!.input).toMatchObject({
      platform: 'amazon',
      deliverable: 'a_plus',
      seriesRole: 'a_plus',
      prompt: '生成亚马逊A+详情页',
      quality: 'high',
    });
  });

  test('uses low quality for drafts and keeps explicit final quality authoritative', () => {
    expect(applyFinalImageRequestPolicy(
      'generate_image',
      { prompt: 'rough concept' },
      '快速预览一张宇航员猫草图',
    ).quality).toBe('low');
    expect(applyFinalImageRequestPolicy(
      'generate_image',
      { prompt: 'rough concept', quality: 'medium' },
      '快速预览一张宇航员猫草图',
    ).quality).toBe('medium');
    expect(applyFinalImageRequestPolicy(
      'generate_image',
      { prompt: 'final concept' },
      '高质量最终稿，宇航员猫',
    ).quality).toBe('high');
  });

  test('keeps only geometry explicitly present in the user request', () => {
    const explicit = applyFinalImageRequestPolicy(
      'generate_image',
      {
        prompt: 'Amazon campaign visual',
        size: '1024x1024',
        aspectRatio: '1:1',
      },
      '生成亚马逊商品图，1536x1024，3:2',
    );
    expect(explicit.size).toBe('1536x1024');
    expect(explicit.aspectRatio).toBe('3:2');

    const physicalDimensions = applyFinalImageRequestPolicy(
      'generate_image',
      { prompt: 'Product scene', aspectRatio: '1:1' },
      '生成桌子产品图，桌面实际尺寸为1200x600。',
    );
    expect(physicalDimensions.size).toBeUndefined();
    expect(physicalDimensions.aspectRatio).toBeUndefined();

    const meetingTime = applyFinalImageRequestPolicy(
      'generate_image',
      { prompt: 'Meeting notice', aspectRatio: '4:5' },
      '会议从3:30开始，做一张通知配图',
    );
    expect(meetingTime.aspectRatio).toBeUndefined();

    const sizeOnly = applyFinalImageRequestPolicy(
      'generate_image',
      { prompt: 'Portrait illustration', aspectRatio: '1:1' },
      '输出一张1024x1536的竖版插画',
    );
    expect(sizeOnly.size).toBe('1024x1536');
    expect(sizeOnly.aspectRatio).toBe('2:3');

    const standaloneRatio = applyFinalImageRequestPolicy(
      'generate_image',
      { prompt: 'Cinematic poster', aspectRatio: '1:1' },
      '16:9 电影感海报，雨夜城市',
    );
    expect(standaloneRatio.aspectRatio).toBe('16:9');

    const standaloneSize = applyFinalImageRequestPolicy(
      'generate_image',
      { prompt: 'Portrait illustration', aspectRatio: '1:1' },
      '1024x1536 竖版插画',
    );
    expect(standaloneSize.size).toBe('1024x1536');
    expect(standaloneSize.aspectRatio).toBe('2:3');

  });
});
