import { describe, expect, test } from 'bun:test';
import { webSearchTool } from './web-search.tools';

describe('web search visual research', () => {
  test('requests and returns described image references when asked', async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.TAVILY_API_KEY;
    let requestBody: any;
    process.env.TAVILY_API_KEY = 'test-key';
    globalThis.fetch = (async (_url: unknown, init: any) => {
      requestBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({
        query: '2026 footwear ecommerce design trends',
        answer: 'Editorial close crops and restrained neutral palettes recur.',
        results: [{
          title: 'Footwear campaign examples',
          url: 'https://example.com/case-study',
          content: 'Strong product scale, tactile macro details and calm typography.',
          score: 0.95,
        }],
        images: [
          {
            url: 'https://www.tiktok.com/api/img/?itemId=expired',
            description: '',
          },
          {
            url: 'https://example.com/reference.jpg',
            description: 'Neutral footwear hero image with directional side light.',
          },
        ],
        response_time: 0.4,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await webSearchTool.execute({
        query: '2026 footwear ecommerce design trends',
        search_depth: 'advanced',
        include_images: true,
        search_scope: 'visual_design',
      }, {} as any);

      expect(requestBody.include_images).toBe(true);
      expect(requestBody.include_image_descriptions).toBe(true);
      expect(requestBody.exclude_domains).toContain('taobao.com');
      expect(requestBody.exclude_domains).toContain('amazon.com');
      expect(requestBody.exclude_domains).toContain('tiktok.com');
      expect(result.output).toMatchObject({
        totalResults: 1,
        scope: 'visual_design',
        excludedStorefrontDomains: true,
        images: [{
          url: 'https://example.com/reference.jpg',
          description: 'Neutral footwear hero image with directional side light.',
        }],
      });
      expect(JSON.stringify(result.output)).not.toContain('tiktok.com/api/img');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.TAVILY_API_KEY;
      else process.env.TAVILY_API_KEY = originalKey;
    }
  });
});
