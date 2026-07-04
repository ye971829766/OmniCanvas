import {
  ref,
  shallowRef,
  onMounted,
  onUnmounted,
  type Ref,
  type ShallowRef,
} from "vue";
import type { App as LeaferApp } from "leafer-ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Ripple {
  /** Logical (CSS) x coordinate relative to the canvas container */
  x: number;
  /** Logical (CSS) y coordinate relative to the canvas container */
  y: number;
  startTime: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// Theme constants
// ---------------------------------------------------------------------------

const LIGHT = {
  bg: "#f5f6f7",
  dot: { r: 199, g: 201, b: 206 }, // #c7c9ce — clearly visible on light canvas
  dotRadius: 0.95, // 1.9 px diameter
  spacing: 24,
} as const;

const DARK = {
  bg: "#121215",
  dot: { r: 82, g: 82, b: 90 }, // #52525a — visible on dark canvas
  dotRadius: 0.85, // 1.7 px diameter
  spacing: 24,
} as const;

/** Ripple accent — neutral near-black, matches the near-black CTA palette */
const ACCENT = { r: 28, g: 28, b: 30 }; // #1c1c1e

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * Manages an infinite-canvas background rendered on a <canvas> element.
 *
 * Features:
 *  - Two-layer parallax dot grid (bg dots move slightly slower than fg dots)
 *  - Smooth zoom-driven opacity: fade above 200 %, merge-texture below 30 %
 *  - Dark-mode radial vignette
 *  - AI-ripple effect: call triggerRipple(x, y) in screen coords to spawn one
 *
 * @param canvasEl   Ref to the <canvas> DOM element inside CanvasBackground.vue
 * @param leaferApp  ShallowRef to the Leafer App instance (may be null initially)
 */
export function useCanvasBackground(
  canvasEl: ShallowRef<HTMLCanvasElement | null>,
  leaferApp: ShallowRef<LeaferApp | null> | Ref<LeaferApp | null>,
) {
  // ---- state ----------------------------------------------------------------

  /** Active ripples — mutated each frame, kept shallow for perf */
  const ripples: Ripple[] = [];

  const isDark = ref(false);

  /** Logical (CSS-pixel) dimensions — updated by ResizeObserver */
  let logicalW = 0;
  let logicalH = 0;

  let rafId = 0;
  let darkObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;

  // ---- public API -----------------------------------------------------------

  /**
   * Spawn a ripple emanating from (x, y) in logical screen coordinates
   * relative to the canvas container (top-left = 0,0).
   *
   * For Leafer world coordinates, convert first:
   *   screenX = worldX * zoom + panX
   *   screenY = worldY * zoom + panY
   */
  function triggerRipple(x: number, y: number): void {
    ripples.push({ x, y, startTime: performance.now(), duration: 600 });
  }

  // ---- canvas sizing --------------------------------------------------------

  function resizeCanvas(): void {
    const canvas = canvasEl.value;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = parent.getBoundingClientRect();

    logicalW = width;
    logicalH = height;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Bake DPR into the transform so all draw calls use logical px
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- dark-mode observation ------------------------------------------------

  function syncDarkMode(): void {
    isDark.value =
      document.documentElement.classList.contains("p-dark") ||
      document.body.classList.contains("p-dark");
  }

  function setupDarkObserver(): void {
    syncDarkMode();
    const handler = () => syncDarkMode();
    darkObserver = new MutationObserver(handler);
    const opts: MutationObserverInit = {
      attributes: true,
      attributeFilter: ["class"],
    };
    darkObserver.observe(document.documentElement, opts);
    darkObserver.observe(document.body, opts);
  }

  // ---- drawing --------------------------------------------------------------

  function drawDotLayer(
    ctx: CanvasRenderingContext2D,
    config: typeof LIGHT | typeof DARK,
    panX: number,
    panY: number,
    parallaxFactor: number,
    radiusMult: number,
    alpha: number,
  ): void {
    const { r, g, b } = config.dot;
    const s = config.spacing;
    const radius = config.dotRadius * radiusMult;

    const lPanX = panX * parallaxFactor;
    const lPanY = panY * parallaxFactor;

    // Tile offset so the grid scrolls continuously with the viewport
    const offsetX = ((lPanX % s) + s) % s;
    const offsetY = ((lPanY % s) + s) % s;

    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;

    for (let x = offsetX - s; x < logicalW + s; x += s) {
      for (let y = offsetY - s; y < logicalH + s; y += s) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRipples(ctx: CanvasRenderingContext2D, now: number): void {
    const { r, g, b } = ACCENT;

    // Iterate backwards so we can splice expired ripples safely
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      const elapsed = now - rp.startTime;
      if (elapsed >= rp.duration) {
        ripples.splice(i, 1);
        continue;
      }

      const t = elapsed / rp.duration;
      const easedT = easeOutExpo(t);
      const maxRadius = 100; // expands to 200 px diameter
      const radius = easedT * maxRadius;

      // Opacity ramps from 8 % down to 0 as t → 1
      const fillAlpha = (1 - t) * 0.08;
      // A slightly brighter ring at the wavefront
      const strokeAlpha = (1 - t) * 0.22;

      // Filled circle
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${fillAlpha})`;
      ctx.fill();

      // Ring at the edge
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${strokeAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function draw(): void {
    const canvas = canvasEl.value;
    if (!canvas || logicalW === 0 || logicalH === 0) {
      rafId = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafId = requestAnimationFrame(draw);
      return;
    }

    const app = leaferApp.value;
    // Read zoom & pan directly from Leafer tree viewport
    const zoom: number = app ? ((app.tree as any).scale ?? 1) : 1;
    const panX: number = app ? ((app.tree as any).x ?? 0) : 0;
    const panY: number = app ? ((app.tree as any).y ?? 0) : 0;

    const config = isDark.value ? DARK : LIGHT;
    const W = logicalW;
    const H = logicalH;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Base background
    ctx.fillStyle = config.bg;
    ctx.fillRect(0, 0, W, H);

    // ------------------------------------------------------------------
    // Dot grid opacity driven by zoom level
    // ------------------------------------------------------------------
    let dotOpacity = 1.0;
    if (zoom > 2.0) {
      // Graceful fade above 200 % — gone by 250 %
      dotOpacity = Math.max(0, 1 - (zoom - 2.0) / 0.5);
    } else if (zoom < 0.3) {
      // Merge to soft texture below 30 %
      dotOpacity = Math.max(0, (zoom / 0.3) * 0.6);
    }

    if (dotOpacity > 0.004) {
      // Background (far) layer — moves slightly slower → parallax depth
      drawDotLayer(ctx, config, panX, panY, 0.97, 0.85, dotOpacity * 0.45);
      // Foreground layer — nominal speed, full size
      drawDotLayer(ctx, config, panX, panY, 1.0, 1.0, dotOpacity);
    }

    // ------------------------------------------------------------------
    // Low-zoom soft overlay — smoothes merged dots into a texture
    // ------------------------------------------------------------------
    if (zoom < 0.3) {
      const blurAlpha = (1 - zoom / 0.3) * 0.3;
      ctx.fillStyle = isDark.value
        ? `rgba(10,10,10,${blurAlpha})`
        : `rgba(245,246,247,${blurAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }



    // ------------------------------------------------------------------
    // Ripples (drawn on top so they're always visible)
    // ------------------------------------------------------------------
    drawRipples(ctx, performance.now());

    rafId = requestAnimationFrame(draw);
  }

  // ---- lifecycle ------------------------------------------------------------

  onMounted(() => {
    setupDarkObserver();
    resizeCanvas();

    if (canvasEl.value?.parentElement) {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(canvasEl.value.parentElement);
    }

    rafId = requestAnimationFrame(draw);
  });

  onUnmounted(() => {
    cancelAnimationFrame(rafId);
    darkObserver?.disconnect();
    resizeObserver?.disconnect();
  });

  return { triggerRipple, isDark };
}
