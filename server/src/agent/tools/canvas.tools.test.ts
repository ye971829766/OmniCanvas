import { afterEach, describe, expect, test } from 'bun:test';
import { exportRegistry } from '../export-registry';
import { exportNodeImageTool } from './canvas.tools';

describe('export_node_image production slicing', () => {
  afterEach(() => exportRegistry.clear());

  test('exports slice bounds, saves a URL-backed PNG, and adds the final canvas image', async () => {
    const canvasOps: any[] = [];
    const saved: Array<{ base64: string; extension: string }> = [];
    const canvasState: any[] = [{
      refId: 'desktop_slice_01_guide',
      type: 'rect',
      x: 0,
      y: 0,
      width: 2928,
      height: 1200,
      opacity: 0,
    }];
    const ctx: any = {
      sessionId: 'session',
      origin: 'http://localhost:3000',
      canvasState,
      assets: [],
      newRefId: (prefix: string) => `${prefix}_generated`,
      sink: {
        emit: () => undefined,
        canvas: (op: any) => {
          canvasOps.push(op);
          if (op.op === 'export_node') {
            exportRegistry.set(op.requestId, 'data:image/png;base64,UE5H');
          }
        },
      },
      files: {
        saveImageFromBase64: async (base64: string, extension: string) => {
          saved.push({ base64, extension });
          return 'desktop-01.png';
        },
      },
      memory: { setLastExportedNodeImage: () => undefined },
    };

    const result = await exportNodeImageTool.execute({
      refId: 'desktop_slice_01_guide',
      slice: true,
      saveToCanvas: true,
      outputRefId: 'a_plus_desktop_01',
      waitForGeneration: false,
    }, ctx);

    expect(canvasOps[0]).toMatchObject({
      op: 'export_node',
      refId: 'desktop_slice_01_guide',
      slice: true,
    });
    expect(saved).toEqual([{ base64: 'UE5H', extension: 'png' }]);
    expect(canvasOps.at(-1)).toMatchObject({
      op: 'add_node',
      node: {
        refId: 'a_plus_desktop_01',
        width: 2928,
        height: 1200,
        url: 'http://localhost:3000/files/desktop-01.png',
      },
    });
    expect(result.output).toMatchObject({
      refId: 'a_plus_desktop_01',
      sourceRefId: 'desktop_slice_01_guide',
      status: 'done',
      slice: true,
      width: 2928,
      height: 1200,
    });
  });
});
