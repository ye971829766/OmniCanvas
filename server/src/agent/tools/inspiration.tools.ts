import type { AgentTool, ToolContext, ToolResult } from '../tool.interface';

// Curated high-quality design reference images from Unsplash
const INSPIRATIONS = {
  cyberpunk: [
    'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1504701954957-2390f806e9f4?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1563089145-599997674d42?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1578894381163-e72c17f2d45f?w=300&h=300&fit=crop',
  ],
  zen: [
    'https://images.unsplash.com/photo-1504618223053-559bdef9dd5a?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1528164344705-47542687000d?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=300&h=300&fit=crop',
  ],
  tea: [
    'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1563822249548-9a72b6353cd1?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1598063412328-971c260f8582?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?w=300&h=300&fit=crop',
  ],
  cafe: [
    'https://images.unsplash.com/photo-1507133750040-4a8f57021571?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=300&h=300&fit=crop',
  ],
  tech: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=300&h=300&fit=crop',
  ],
  nature: [
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1472214222541-d510753a4907?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300&h=300&fit=crop',
  ],
  luxury: [
    'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1517840901100-8179e982acb7?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=300&h=300&fit=crop',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=300&h=300&fit=crop',
  ],
};

async function searchUnsplash(query: string): Promise<string[]> {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey || !query?.trim()) return [];
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12`;
    const res = await fetch(url, { headers: { 'Authorization': `Client-ID ${apiKey}` } });
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.results?.map((r: any) => r.urls?.regular).filter(Boolean) || [];
  } catch {
    return [];
  }
}

async function searchWikimedia(query: string): Promise<string[]> {
  if (!query?.trim()) return [];
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    return Object.values(data?.query?.pages || {})
      .map((p: any) => p?.imageinfo?.[0]?.url)
      .filter((u: any) => u && /\.(jpg|jpeg|png|webp)$/i.test(u));
  } catch {
    return [];
  }
}

export const collectInspirationTool: AgentTool = {
  name: 'collect_inspiration',
  description: 'Search and collect visual design inspiration references (mood board thumbnails) matching keywords in user request.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Design keywords to search, e.g. "cyberpunk eastern zen"' },
    },
    required: ['query'],
  },
  async execute(input: any, ctx: ToolContext): Promise<ToolResult> {
    const query = (input.query || '').toLowerCase();
    
    // Match keywords and select up to 12 total images from fallback list
    const fallbackUrls: string[] = [];
    if (query.includes('赛博') || query.includes('cyber') || query.includes('霓虹')) {
      fallbackUrls.push(...INSPIRATIONS.cyberpunk.slice(0, 6));
    }
    if (query.includes('禅') || query.includes('zen') || query.includes('日式') || query.includes('枯山水')) {
      fallbackUrls.push(...INSPIRATIONS.zen.slice(0, 6));
    }
    if (query.includes('茶') || query.includes('tea')) {
      fallbackUrls.push(...INSPIRATIONS.tea.slice(0, 6));
    }
    if (query.includes('咖啡') || query.includes('cafe') || query.includes('coffe')) {
      fallbackUrls.push(...INSPIRATIONS.cafe.slice(0, 6));
    }
    if (query.includes('科') || query.includes('tech') || query.includes('数码')) {
      fallbackUrls.push(...INSPIRATIONS.tech.slice(0, 6));
    }
    if (query.includes('自') || query.includes('nature') || query.includes('绿')) {
      fallbackUrls.push(...INSPIRATIONS.nature.slice(0, 6));
    }
    if (query.includes('奢') || query.includes('luxury') || query.includes('金')) {
      fallbackUrls.push(...INSPIRATIONS.luxury.slice(0, 6));
    }

    if (fallbackUrls.length === 0) {
      fallbackUrls.push(...INSPIRATIONS.zen.slice(0, 4));
      fallbackUrls.push(...INSPIRATIONS.cafe.slice(0, 4));
      fallbackUrls.push(...INSPIRATIONS.tech.slice(0, 4));
    }

    let urls = await searchUnsplash(input.query || '');
    if (urls.length === 0) urls = await searchWikimedia(input.query || '');
    if (urls.length === 0) urls = fallbackUrls;

    // Shuffle/slice to get unique set of up to 12 items
    const unique = [...new Set(urls)].slice(0, 12);

    return {
      output: {
        note: `Collected ${unique.length} reference images for query "${input.query}".`,
        images: unique,
      },
    };
  },
};
