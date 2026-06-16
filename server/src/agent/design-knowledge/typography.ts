/**
 * Typography system — typography scales, font families, and rules.
 * This guides the planner and layout engines to make premium typographic choices.
 */

export interface FontCombination {
  id: string;
  name: string;
  titleFont: string;
  bodyFont: string;
  keywords: string[];
}

export const FONT_COMBINATIONS: FontCombination[] = [
  {
    id: 'modern-sans',
    name: '现代无衬线 (Inter + PingFang)',
    titleFont: 'Inter, "PingFang SC", "Helvetica Neue", sans-serif',
    bodyFont: '"PingFang SC", "Microsoft YaHei", sans-serif',
    keywords: ['现代', '科技', '极简', '商务', '通用', 'clean', 'modern', 'minimal'],
  },
  {
    id: 'elegant-serif',
    name: '雅致衬线 (Playfair + Songti)',
    titleFont: '"Playfair Display", "Georgia", "Source Han Serif SC", "Songti SC", serif',
    bodyFont: '"Source Han Serif SC", "Songti SC", "Georgia", serif',
    keywords: ['优雅', '高端', '奢侈', '文艺', '古典', '中国风', '复古', 'luxury', 'elegant'],
  },
  {
    id: 'dynamic-display',
    name: '动感展示 (Outfit + Heavy)',
    titleFont: '"Outfit", "Impact", "Arial Black", sans-serif',
    bodyFont: '"PingFang SC", sans-serif',
    keywords: ['潮流', '运动', '年轻', '活力', '波普', 'pop', 'sporty', 'vibrant'],
  },
];

/**
 * Font Size Scale based on Major Third (1.25) or perfect fourth.
 * E.g., base 16px -> 20 -> 25 -> 31 -> 39 -> 49 -> 61 -> 76 -> 95
 */
export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  md: 20,
  lg: 24,
  xl: 30,
  xxl: 38,
  h3: 48,
  h2: 60,
  h1: 76,
  display: 96,
};

export const LINE_HEIGHTS = {
  heading: 1.2,
  subtitle: 1.3,
  body: 1.5,
  tight: 1.1,
};

export const LETTER_SPACINGS = {
  heading: -0.02, // slightly tighter for headers
  body: 0.0,
  wide: 0.05, // e.g. for subtitles or tags
};

/** Match font combination by keywords */
export function matchFontCombination(input: string): FontCombination {
  const lower = input.toLowerCase();
  let best = FONT_COMBINATIONS[0]!;
  let bestScore = 0;
  for (const combo of FONT_COMBINATIONS) {
    let score = 0;
    for (const kw of combo.keywords) {
      if (lower.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = combo;
    }
  }
  return best;
}

/** Get size for a layer role */
export function getFontSizeForRole(role: string, canvasHeight: number): number {
  // Scale text size proportional to canvas height (assuming standard height is around 1000px)
  const scale = Math.max(0.6, Math.min(2.0, canvasHeight / 1000));
  switch (role) {
    case 'title':
      return Math.round(FONT_SIZES.h1 * scale);
    case 'subtitle':
      return Math.round(FONT_SIZES.h3 * scale);
    case 'cta':
      return Math.round(FONT_SIZES.lg * scale);
    case 'body':
      return Math.round(FONT_SIZES.md * scale);
    case 'accent':
    case 'logo':
      return Math.round(FONT_SIZES.base * scale);
    default:
      return Math.round(FONT_SIZES.md * scale);
  }
}
