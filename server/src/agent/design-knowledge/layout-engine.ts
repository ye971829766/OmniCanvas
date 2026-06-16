/**
 * Layout Engine — computes bounds and positions for canvas elements
 * based on design rules, visual hierarchy, and templates.
 */
export interface CanvasSize {
  width: number;
  height: number;
}

export interface LayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayerRole =
  | 'background'
  | 'hero'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'cta'
  | 'logo'
  | 'decoration'
  | 'accent';

export type LayerType =
  | 'background'
  | 'shape'
  | 'text'
  | 'image'
  | 'video';

export interface LayoutElement {
  id: string;
  type: LayerType;
  role: LayerRole;
  text?: string;
  fontSize?: number;
  // Desired/aspect ratio request (e.g. 1.0, 1.77)
  aspectRatio?: number;
}

export interface ComputedBounds extends LayerBounds {
  id: string;
}

/**
 * Computes coordinate bounds for all elements in a canvas.
 * Implements standard premium design grid and spacing rules.
 */
export function computeLayout(
  canvas: CanvasSize,
  layoutHint: string,
  elements: LayoutElement[],
): ComputedBounds[] {
  const margin = Math.round(Math.min(canvas.width, canvas.height) * 0.06); // 6% margin
  const safeWidth = canvas.width - 2 * margin;
  const safeHeight = canvas.height - 2 * margin;

  const results: ComputedBounds[] = [];

  // Group elements by category
  const background = elements.find((e) => e.role === 'background' || e.type === 'background');
  const hero = elements.find((e) => e.role === 'hero');
  const title = elements.find((e) => e.role === 'title');
  const subtitle = elements.find((e) => e.role === 'subtitle');
  const body = elements.find((e) => e.role === 'body');
  const cta = elements.find((e) => e.role === 'cta');
  const logo = elements.find((e) => e.role === 'logo');
  const decorations = elements.filter((e) => e.role === 'decoration' || e.role === 'accent');

  // 1. Add background
  if (background) {
    results.push({
      id: background.id,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    });
  }

  // Helper: Get text height estimate
  const getTextHeight = (el?: LayoutElement, defaultSz = 32) => {
    if (!el) return 0;
    const size = el.fontSize ?? defaultSz;
    const lineCount = el.text ? Math.ceil(el.text.length / 18) : 1;
    return Math.round(size * 1.3 * lineCount);
  };

  const titleH = getTextHeight(title, 64);
  const subtitleH = getTextHeight(subtitle, 36);
  const bodyH = getTextHeight(body, 24);
  const ctaH = cta ? (cta.type === 'text' ? getTextHeight(cta, 28) : 60) : 0;
  const logoH = logo ? 50 : 0;

  const spacing = Math.round(canvas.height * 0.025); // 2.5% spacing between elements

  switch (layoutHint) {
    case 'hero-overlay': {
      // ── HERO OVERLAY: Full bleed background/image with overlay text ──
      // Hero element (if any) takes full space
      if (hero) {
        results.push({
          id: hero.id,
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        });
      }

      // Add a semi-transparent card block in the middle/bottom to hold text if background is busy
      const textBlockHeight = titleH + subtitleH + bodyH + ctaH + spacing * 4;
      const textBlockY = Math.round(canvas.height - textBlockHeight - margin);
      const textBlockX = margin;
      const textBlockW = safeWidth;

      // Position text elements sequentially downwards inside the overlay card
      let curY = textBlockY + spacing;

      if (logo) {
        results.push({
          id: logo.id,
          x: Math.round(canvas.width / 2 - 50),
          y: margin,
          width: 100,
          height: logoH,
        });
      }

      if (title) {
        results.push({
          id: title.id,
          x: textBlockX + spacing,
          y: curY,
          width: textBlockW - 2 * spacing,
          height: titleH,
        });
        curY += titleH + spacing;
      }

      if (subtitle) {
        results.push({
          id: subtitle.id,
          x: textBlockX + spacing,
          y: curY,
          width: textBlockW - 2 * spacing,
          height: subtitleH,
        });
        curY += subtitleH + spacing;
      }

      if (body) {
        results.push({
          id: body.id,
          x: textBlockX + spacing,
          y: curY,
          width: textBlockW - 2 * spacing,
          height: bodyH,
        });
        curY += bodyH + spacing;
      }

      if (cta) {
        results.push({
          id: cta.id,
          x: Math.round(canvas.width / 2 - 100),
          y: curY,
          width: 200,
          height: ctaH,
        });
      }
      break;
    }

    case 'split-horizontal': {
      // ── SPLIT HORIZONTAL: Left/Right Split ──
      const splitX = Math.round(canvas.width * 0.5);
      const sideW = splitX - margin - spacing;

      // Left: Hero image
      if (hero) {
        results.push({
          id: hero.id,
          x: margin,
          y: margin,
          width: sideW,
          height: safeHeight,
        });
      }

      // Right: Text Stack
      let curY = margin + Math.round(safeHeight * 0.15); // Start slightly down

      if (logo) {
        results.push({
          id: logo.id,
          x: splitX + spacing,
          y: margin,
          width: 80,
          height: logoH,
        });
      }

      if (title) {
        results.push({
          id: title.id,
          x: splitX + spacing,
          y: curY,
          width: sideW,
          height: titleH,
        });
        curY += titleH + spacing;
      }

      if (subtitle) {
        results.push({
          id: subtitle.id,
          x: splitX + spacing,
          y: curY,
          width: sideW,
          height: subtitleH,
        });
        curY += subtitleH + spacing;
      }

      if (body) {
        results.push({
          id: body.id,
          x: splitX + spacing,
          y: curY,
          width: sideW,
          height: bodyH,
        });
        curY += bodyH + spacing;
      }

      if (cta) {
        results.push({
          id: cta.id,
          x: splitX + spacing,
          y: curY,
          width: Math.min(200, sideW),
          height: ctaH,
        });
      }
      break;
    }

    case 'split-vertical': {
      // ── SPLIT VERTICAL: Top/Bottom Split (Top image, Bottom text) ──
      const splitY = Math.round(canvas.height * 0.45);

      if (hero) {
        results.push({
          id: hero.id,
          x: margin,
          y: margin,
          width: safeWidth,
          height: splitY - margin - spacing,
        });
      }

      let curY = splitY + spacing;

      if (logo) {
        results.push({
          id: logo.id,
          x: margin,
          y: curY,
          width: 80,
          height: logoH,
        });
        curY += logoH + spacing;
      }

      if (title) {
        results.push({
          id: title.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: titleH,
        });
        curY += titleH + spacing;
      }

      if (subtitle) {
        results.push({
          id: subtitle.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: subtitleH,
        });
        curY += subtitleH + spacing;
      }

      if (body) {
        results.push({
          id: body.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: bodyH,
        });
        curY += bodyH + spacing;
      }

      if (cta) {
        results.push({
          id: cta.id,
          x: Math.round(canvas.width / 2 - 100),
          y: curY,
          width: 200,
          height: ctaH,
        });
      }
      break;
    }

    case 'centered': {
      // ── CENTERED: Stacked vertically down the center ──
      let curY = margin + Math.round(safeHeight * 0.08);

      if (logo) {
        results.push({
          id: logo.id,
          x: Math.round(canvas.width / 2 - 40),
          y: curY,
          width: 80,
          height: logoH,
        });
        curY += logoH + spacing;
      }

      if (hero) {
        const heroH = Math.round(canvas.height * 0.3);
        results.push({
          id: hero.id,
          x: Math.round(canvas.width / 2 - 150),
          y: curY,
          width: 300,
          height: heroH,
        });
        curY += heroH + spacing;
      }

      if (title) {
        results.push({
          id: title.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: titleH,
        });
        curY += titleH + spacing;
      }

      if (subtitle) {
        results.push({
          id: subtitle.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: subtitleH,
        });
        curY += subtitleH + spacing;
      }

      if (body) {
        results.push({
          id: body.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: bodyH,
        });
        curY += bodyH + spacing;
      }

      if (cta) {
        results.push({
          id: cta.id,
          x: Math.round(canvas.width / 2 - 100),
          y: curY,
          width: 200,
          height: ctaH,
        });
      }
      break;
    }

    case 'grid': {
      // ── GRID: Products layout ──
      let curY = margin;

      if (title) {
        results.push({
          id: title.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: titleH,
        });
        curY += titleH + spacing;
      }

      // Gather grid elements (images or accent shapes)
      const gridItems = elements.filter((e) => e.role === 'hero' || e.role === 'accent' || e.type === 'image');
      if (gridItems.length > 0) {
        const cols = gridItems.length >= 4 ? 2 : gridItems.length;
        const rows = Math.ceil(gridItems.length / cols);
        const cellW = Math.round((safeWidth - (cols - 1) * spacing) / cols);
        const cellH = Math.round((canvas.height * 0.4 - (rows - 1) * spacing) / rows);

        gridItems.forEach((item, index) => {
          const c = index % cols;
          const r = Math.floor(index / cols);
          results.push({
            id: item.id,
            x: margin + c * (cellW + spacing),
            y: curY + r * (cellH + spacing),
            width: cellW,
            height: cellH,
          });
        });

        curY += rows * (cellH + spacing) + spacing;
      }

      if (subtitle) {
        results.push({
          id: subtitle.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: subtitleH,
        });
        curY += subtitleH + spacing;
      }

      if (cta) {
        results.push({
          id: cta.id,
          x: Math.round(canvas.width / 2 - 100),
          y: curY,
          width: 200,
          height: ctaH,
        });
      }
      break;
    }

    case 'columns': {
      // ── COLUMNS: Horizontal row of elements side-by-side ──
      const colItems = elements.filter(
        (e) => e.role === 'hero' || e.role === 'accent' || e.type === 'image'
      );
      if (colItems.length > 0) {
        const cols = colItems.length;
        const cellW = Math.round((safeWidth - (cols - 1) * spacing) / cols);
        const cellH = safeHeight;

        colItems.forEach((item, index) => {
          results.push({
            id: item.id,
            x: margin + index * (cellW + spacing),
            y: margin,
            width: cellW,
            height: cellH,
          });
        });
      }
      break;
    }

    case 'hero':
    default: {
      // ── HERO: Standard poster layout (Top 55% Hero visual, Bottom text stack) ──
      const heroHeight = Math.round(canvas.height * 0.55);

      if (hero) {
        results.push({
          id: hero.id,
          x: margin,
          y: margin,
          width: safeWidth,
          height: heroHeight,
        });
      }

      let curY = margin + heroHeight + spacing;

      if (title) {
        results.push({
          id: title.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: titleH,
        });
        curY += titleH + spacing;
      }

      if (subtitle) {
        results.push({
          id: subtitle.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: subtitleH,
        });
        curY += subtitleH + spacing;
      }

      if (body) {
        results.push({
          id: body.id,
          x: margin,
          y: curY,
          width: safeWidth,
          height: bodyH,
        });
        curY += bodyH + spacing;
      }

      if (cta) {
        results.push({
          id: cta.id,
          x: Math.round(canvas.width / 2 - 100),
          y: curY,
          width: 200,
          height: ctaH,
        });
      }
      break;
    }
  }

  // Handle any unpositioned decorations/accents by spreading them or placing them at the bottom
  const positionedIds = new Set(results.map((r) => r.id));
  const unpositioned = elements.filter((e) => !positionedIds.has(e.id));

  unpositioned.forEach((e, idx) => {
    if (e.role === 'logo') {
      results.push({
        id: e.id,
        x: margin,
        y: margin,
        width: 80,
        height: logoH,
      });
    } else {
      // Stack decorations or auxiliary elements neatly
      results.push({
        id: e.id,
        x: margin + idx * 30,
        y: canvas.height - margin - 40,
        width: 100,
        height: 30,
      });
    }
  });

  return results;
}
