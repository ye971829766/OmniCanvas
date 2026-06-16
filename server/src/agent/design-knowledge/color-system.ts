/**
 * Color system — curated palettes and contrast-checking utilities.
 * The planner can reference these by name, or the LLM can generate custom ones.
 */

export interface Palette {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  background: string;
  /** Style keywords that trigger this palette */
  keywords: string[];
}

export const PALETTES: Palette[] = [
  {
    id: 'warm-cafe',    label: '暖色咖啡',
    primary: '#8B4513',  secondary: '#D2691E', accent: '#F4A460',  text: '#FFFFFF',  background: '#3E2723',
    keywords: ['暖色', '咖啡', 'cafe', 'warm', '温暖', '棕色'],
  },
  {
    id: 'tech-blue',    label: '科技蓝',
    primary: '#2563EB',  secondary: '#1E40AF', accent: '#60A5FA',  text: '#F8FAFC',  background: '#0F172A',
    keywords: ['科技', 'tech', '蓝色', 'blue', '商务', '数码', '互联网'],
  },
  {
    id: 'nature-green',  label: '自然绿',
    primary: '#059669',  secondary: '#047857', accent: '#34D399',  text: '#FFFFFF',  background: '#064E3B',
    keywords: ['自然', 'nature', '绿色', 'green', '环保', '健康', '有机'],
  },
  {
    id: 'sunset-warm',   label: '日落暖橙',
    primary: '#EA580C',  secondary: '#C2410C', accent: '#FB923C',  text: '#FFFFFF',  background: '#431407',
    keywords: ['日落', 'sunset', '橙色', 'orange', '活力', '热情'],
  },
  {
    id: 'luxury-dark',   label: '奢华暗金',
    primary: '#D4AF37',  secondary: '#B8860B', accent: '#FFD700',  text: '#FAFAFA',  background: '#1A1A1A',
    keywords: ['奢华', 'luxury', '金色', 'gold', '高端', '黑金', '尊贵'],
  },
  {
    id: 'pastel-soft',   label: '柔和粉彩',
    primary: '#F472B6',  secondary: '#A78BFA', accent: '#67E8F9',  text: '#1F2937',  background: '#FFF7ED',
    keywords: ['粉色', 'pastel', '柔和', 'soft', '可爱', '清新', '少女'],
  },
  {
    id: 'minimal-mono',  label: '极简黑白',
    primary: '#111827',  secondary: '#374151', accent: '#6B7280',  text: '#111827',  background: '#FFFFFF',
    keywords: ['极简', 'minimal', '黑白', 'mono', '简约', '素雅'],
  },
  {
    id: 'vibrant-pop',   label: '活力撞色',
    primary: '#7C3AED',  secondary: '#EC4899', accent: '#FBBF24',  text: '#FFFFFF',  background: '#18181B',
    keywords: ['活力', 'vibrant', '撞色', 'pop', '潮流', '年轻', '电商'],
  },
  {
    id: 'ocean-calm',    label: '海洋沉静',
    primary: '#0EA5E9',  secondary: '#0284C7', accent: '#38BDF8',  text: '#F0F9FF',  background: '#0C4A6E',
    keywords: ['海洋', 'ocean', '沉静', 'calm', '水蓝', '旅游'],
  },
  {
    id: 'earth-tone',    label: '大地色系',
    primary: '#92400E',  secondary: '#78350F', accent: '#D97706',  text: '#FFFBEB',  background: '#451A03',
    keywords: ['大地', 'earth', '复古', 'retro', '秋天', '陶土'],
  },
];

/** Find a palette matching keywords in user input. */
export function matchPalette(input: string): Palette | null {
  const lower = input.toLowerCase();
  let best: Palette | null = null;
  let bestScore = 0;
  for (const p of PALETTES) {
    let score = 0;
    for (const kw of p.keywords) {
      if (lower.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/**
 * Check WCAG contrast ratio between two hex colors.
 * Returns the ratio (>= 4.5 for AA normal text, >= 3.0 for AA large text).
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Ensure text is readable against background; swap to white/black if needed. */
export function ensureReadable(textColor: string, bgColor: string): string {
  const ratio = contrastRatio(textColor, bgColor);
  if (ratio >= 4.5) return textColor;
  // Try white and black, pick whichever has better contrast
  const whiteRatio = contrastRatio('#FFFFFF', bgColor);
  const blackRatio = contrastRatio('#000000', bgColor);
  return whiteRatio > blackRatio ? '#FFFFFF' : '#111111';
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function hexToRgb(hex: string): number[] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}
