import { describe, expect, test } from 'bun:test';
import { editImageTool } from './image-processing.tools';

describe('image processing canvas task state', () => {
  test('marks edit_image tasks as image edits instead of upscales', async () => {
    const canvasOps: any[] = [];
    const imageRequests: any[] = [];
    const ctx = {
      sessionId: 'test-session',
      canvasState: [{
        refId: 'source_image',
        type: 'image',
        url: 'data:image/png;base64,AA==',
        x: 10,
        y: 20,
        width: 320,
        height: 480,
      }],
      assets: [],
      origin: 'http://localhost:3000',
      newRefId: () => 'edit_1',
      sink: {
        canvas: (op: any) => canvasOps.push(op),
      },
      ai: {
        generateImageFromJson: async (request: any) => {
          imageRequests.push(request);
          return { taskId: 'task_edit_1', status: 'generating' };
        },
      },
    } as any;

    await editImageTool.execute({
      source: 'source_image',
      prompt: 'Add a handbag and keep everything else unchanged.',
    }, ctx);

    expect(imageRequests).toHaveLength(1);
    expect(canvasOps).toContainEqual({
      op: 'generation_started',
      refId: 'edit_1',
      kind: 'image',
      taskId: 'task_edit_1',
      generationType: 'edit',
    });
  });
});
