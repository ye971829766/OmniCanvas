import { describe, expect, test } from 'bun:test';
import { planEcommerceSuiteTool } from './ecommerce-suite.tools';
import { generateImageTool } from './generation.tools';
import {
  getGenerationAspectRatio,
  getGptImageGenerationSize,
} from '../ecommerce-plan';

function createContext(canvasState: any[] = []) {
  const events: any[] = [];
  const imageRequests: any[] = [];
  let plan: any = null;
  let sequence = 0;
  const ctx = {
    sessionId: 'test-session',
    assets: [{
      id: 'asset_product',
      url: 'data:image/png;base64,AA==',
      name: 'product.png',
      createdAt: Date.now(),
    }],
    canvasState,
    origin: 'http://localhost:3000',
    newRefId: (prefix = 'node') => `${prefix}_${++sequence}`,
    sink: {
      emit: (event: any) => events.push(event),
      canvas: (op: any) => events.push({ type: 'canvas_op', op }),
    },
    memory: {
      getPlan: () => plan,
      setPlan: (_sessionId: string, nextPlan: any) => { plan = nextPlan; },
    },
    ai: {
      generateImageFromJson: async (request: any) => {
        imageRequests.push(request);
        return { taskId: `task_${imageRequests.length}`, status: 'generating' };
      },
    },
  } as any;
  return { ctx, events, imageRequests };
}

describe('generateImageTool ecommerce placement', () => {
  test('recovers omitted metadata and creates a root-canvas image grid', async () => {
    const { ctx, events, imageRequests } = createContext();
    const planResult = await planEcommerceSuiteTool.execute({
      platforms: ['amazon'],
      sourceAssetId: 'asset_product',
      imagesPerPlatform: 3,
    }, ctx);
    const deliverables = (planResult.output as any).deliverables;

    await Promise.all(deliverables.map((item: any) =>
      generateImageTool.execute({
        prompt: `Generate ${item.role}`,
      }, ctx),
    ));

    const imageNodes = events
      .filter((event) => event.type === 'canvas_op' && event.op.op === 'add_node')
      .map((event) => event.op.node)
      .filter((node) => node.type === 'image_gen');
    expect(imageNodes.every((node) => node.parentId === undefined)).toBe(true);
    expect(imageNodes.map((node) => ({
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      aspectRatio: node.aspectRatio,
      preserveLayout: node.preserveLayout,
    }))).toEqual(deliverables.map((item: any) => ({
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      aspectRatio: '1:1',
      preserveLayout: true,
    })));
    expect(imageRequests.map((request) => request.aspectRatio)).toEqual([
      '1:1',
      '1:1',
      '1:1',
    ]);
    expect(imageRequests.every((request) => request.size === '2000x2000')).toBe(true);
    expect(imageRequests.every((request) => request.quality === 'high')).toBe(true);
    expect(imageRequests.every((request) => request.images?.[0] === 'data:image/png;base64,AA==')).toBe(true);
    expect(imageRequests.every((request) => request.prompt.includes('reference product as immutable'))).toBe(true);
    expect(events.some((event) => event.type === 'canvas_op' && event.op.node?.type === 'frame')).toBe(false);
  });

  test('chooses a provider-supported ratio closest to the target frame', () => {
    expect(getGenerationAspectRatio(2000, 2000)).toBe('1:1');
    expect(getGenerationAspectRatio(750, 1000)).toBe('3:4');
    expect(getGenerationAspectRatio(1464, 600)).toBe('21:9');
    expect(getGptImageGenerationSize(2000, 2000)).toBe('2000x2000');
    expect(getGptImageGenerationSize(1464, 600)).toBe('1472x608');
  });

  test('ignores a stale parent frame and places the suite below it', async () => {
    const legacyFrames = [{
      refId: 'legacy_frame',
      type: 'frame',
      width: 2000,
      height: 2000,
      x: 0,
      y: 0,
    }];
    const { ctx, events } = createContext(legacyFrames);
    await planEcommerceSuiteTool.execute({
      platforms: ['amazon'],
      sourceAssetId: 'asset_product',
      imagesPerPlatform: 1,
    }, ctx);

    await generateImageTool.execute({
      prompt: 'Regenerate main image',
      parentId: 'legacy_frame',
    }, ctx);
    const generatedNode = events
      .filter((event) => event.type === 'canvas_op' && event.op.op === 'add_node')
      .map((event) => event.op.node)
      .find((node) => node.type === 'image_gen');
    expect(generatedNode.parentId).toBeUndefined();
    expect(generatedNode.x).toBe(0);
    expect(generatedNode.y).toBe(2240);
  });
});
