import { describe, expect, test } from 'bun:test';
import { resolveReferenceUrl } from './image-reference';

describe('resolveReferenceUrl', () => {
  test('resolves stable asset ids', async () => {
    const url = await resolveReferenceUrl('asset_product', {
      origin: 'http://localhost:3000',
      assets: [{ id: 'asset_product', url: '/files/product.png' }],
      canvasState: [],
    } as any);
    expect(url).toBe('http://localhost:3000/files/product.png');
  });

  test('prefers a persisted public asset URL', async () => {
    const url = await resolveReferenceUrl('asset_product', {
      origin: 'http://localhost:3000',
      assets: [
        {
          id: 'asset_product',
          url: 'http://localhost:3000/files/product.png',
          publicUrl: 'https://cloudflareimg.cdn.sn/i/product.webp',
        },
      ],
      canvasState: [],
    } as any);

    expect(url).toBe('https://cloudflareimg.cdn.sn/i/product.webp');
  });

  test('resolves canvas image refs', async () => {
    const url = await resolveReferenceUrl('image_node', {
      origin: 'http://localhost:3000',
      assets: [],
      canvasState: [{ refId: 'image_node', url: 'files/canvas.png' }],
    } as any);
    expect(url).toBe('http://localhost:3000/files/canvas.png');
  });
});
