import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';

/**
 * Tavily Search API integration for agent web search capability.
 * @see https://docs.tavily.com
 */

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  images?: string[];
}

interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilySearchResult[];
  response_time: string;
  images?: Array<string | { url: string; description?: string }>;
}

const VISUAL_DESIGN_EXCLUDED_DOMAINS = [
  'taobao.com',
  'tmall.com',
  'jd.com',
  '1688.com',
  'alicdn.com',
  'aliexpress.com',
  'amazon.com',
  'ebay.com',
  'walmart.com',
  'temu.com',
  'shopee.com',
  'lazada.com',
  'tiktok.com',
  'youtube.com',
];

const UNSTABLE_RESEARCH_IMAGE_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'youtube.com',
  'www.youtube.com',
]);

function isStableResearchImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !UNSTABLE_RESEARCH_IMAGE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function tavilySearch(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    includeAnswer?: boolean;
    topic?: 'general' | 'news';
    timeRange?: 'day' | 'week' | 'month' | 'year';
    includeDomains?: string[];
    excludeDomains?: string[];
    includeImages?: boolean;
  },
): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      'TAVILY_API_KEY is not configured. Get a free key at https://tavily.com',
    );
  }

  const body: Record<string, any> = {
    query,
    max_results: options?.maxResults ?? 5,
    search_depth: options?.searchDepth ?? 'basic',
    include_answer: options?.includeAnswer ?? true,
  };

  if (options?.topic) body.topic = options.topic;
  if (options?.timeRange) body.time_range = options.timeRange;
  if (options?.includeDomains?.length)
    body.include_domains = options.includeDomains;
  if (options?.excludeDomains?.length)
    body.exclude_domains = options.excludeDomains;
  if (options?.includeImages) {
    body.include_images = true;
    body.include_image_descriptions = true;
  }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Tavily API error (${res.status}): ${errorText}`);
  }

  return res.json() as Promise<TavilyResponse>;
}

/** Web search tool – lets the agent query the internet for real-time information. */
export const webSearchTool: AgentTool = {
  name: 'web_search',
  description:
    'Search the web for real-time information using Tavily. ' +
    'Use this when you need up-to-date facts, current events, design trends, ' +
    'brand guidelines, color palettes from live websites, or any information ' +
    'that may not be in your training data. Returns relevant search results ' +
    'with an AI-generated summary answer.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'The search query. Be specific and descriptive for better results.',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (1-10, default: 5).',
      },
      search_depth: {
        type: 'string',
        description:
          '"basic" for fast results, "advanced" for higher relevance (slower). Default: "basic".',
      },
      topic: {
        type: 'string',
        description:
          '"general" for general search, "news" for news-specific results. Default: "general".',
      },
      time_range: {
        type: 'string',
        description:
          'Filter results by time: "day", "week", "month", or "year". Optional.',
      },
      include_images: {
        type: 'boolean',
        description:
          'Return image-search references with descriptions. Use true for visual design, trend, competitor, product-photography, or mood research; otherwise omit it.',
      },
      search_scope: {
        type: 'string',
        enum: ['visual_design'],
        description:
          'Use "visual_design" for campaign, editorial, agency, award, photography, or design-trend research. It excludes marketplace storefront domains so a single listing product photo cannot dominate art direction. Omit search_scope when researching Chinese ecommerce 主图/详情页 module structure and layout patterns from design articles (still never put web images in refImages as product identity).',
      },
    },
    required: ['query'],
  },
  async execute(input: any, _ctx: ToolContext): Promise<ToolResult> {
    const query = input.query as string;
    if (!query?.trim()) {
      return { output: { error: 'Search query cannot be empty.' } };
    }

    try {
      const visualDesignScope = input.search_scope === 'visual_design';
      const response = await tavilySearch(query, {
        maxResults: Math.min(Math.max(input.max_results ?? 5, 1), 10),
        searchDepth: input.search_depth === 'advanced' ? 'advanced' : 'basic',
        includeAnswer: true,
        topic: input.topic === 'news' ? 'news' : 'general',
        timeRange: ['day', 'week', 'month', 'year'].includes(input.time_range)
          ? input.time_range
          : undefined,
        includeImages: input.include_images === true,
        excludeDomains: visualDesignScope
          ? VISUAL_DESIGN_EXCLUDED_DOMAINS
          : undefined,
      });

      const results = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 500),
        relevanceScore: r.score,
      }));
      const images = (response.images ?? [])
        .map((image) => typeof image === 'string'
          ? { url: image, description: '' }
          : {
              url: image?.url,
              description: image?.description?.slice(0, 500) ?? '',
            })
        .filter((image) =>
          typeof image.url === 'string' &&
          image.url.startsWith('http') &&
          (!visualDesignScope || isStableResearchImageUrl(image.url))
        )
        // In visual-design research the agent normally issues two searches.
        // Cap each source at three references so the first result set cannot
        // fill the entire multimodal context and force one copied direction.
        .slice(0, visualDesignScope ? 3 : 8);

      return {
        output: {
          answer: response.answer ?? null,
          results,
          totalResults: results.length,
          ...(images.length > 0 ? { images } : {}),
          responseTime: response.response_time,
          ...(visualDesignScope
            ? { scope: 'visual_design', excludedStorefrontDomains: true }
            : {}),
          note: `Found ${results.length} results for "${query}".`,
        },
      };
    } catch (e: any) {
      return {
        output: {
          error: e.message ?? 'Web search failed.',
          suggestion: e.message?.includes('TAVILY_API_KEY')
            ? 'Please set TAVILY_API_KEY in server/.env'
            : 'Try simplifying the query or try again later.',
        },
      };
    }
  },
};

/** URL content extraction tool – lets the agent read the content of a specific web page. */
export const webExtractTool: AgentTool = {
  name: 'web_extract',
  description:
    'Extract and read the main content from a specific URL. ' +
    'Use this after web_search when you need the full content of a page, ' +
    'or when the user provides a specific URL to reference.',
  parameters: {
    type: 'object',
    properties: {
      urls: {
        type: 'string',
        description:
          'The URL(s) to extract content from. Comma-separated for multiple URLs (max 5).',
      },
    },
    required: ['urls'],
  },
  async execute(input: any, _ctx: ToolContext): Promise<ToolResult> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        output: {
          error:
            'TAVILY_API_KEY is not configured. Get a free key at https://tavily.com',
        },
      };
    }

    const urlList = (input.urls as string)
      .split(',')
      .map((u: string) => u.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (urlList.length === 0) {
      return { output: { error: 'No valid URLs provided.' } };
    }

    try {
      const res = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ urls: urlList }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Tavily Extract API error (${res.status}): ${errorText}`);
      }

      const data: any = await res.json();
      const extracted = (data.results ?? []).map((r: any) => ({
        url: r.url,
        content: r.raw_content?.slice(0, 3000) ?? r.content?.slice(0, 3000) ?? '',
      }));

      return {
        output: {
          results: extracted,
          note: `Extracted content from ${extracted.length} URL(s).`,
        },
      };
    } catch (e: any) {
      return {
        output: {
          error: e.message ?? 'URL extraction failed.',
        },
      };
    }
  },
};
