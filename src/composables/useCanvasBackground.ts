import {
  ref,
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
  bgStart: "#ffffff", // Pure white center
  bgEnd: "#f1f5f9",   // Soft slate 100 edge
  dot: { r: 100, g: 116, b: 139 }, // Slate 500
  spacing: 32,        // Classic Figma spacing (32px)
} as const;

const DARK = {
  bgStart: "#0f172a", // Lighter slate 900 center
  bgEnd: "#020617",   // Deep dark slate 950 edge
  dot: { r: 148, g: 163, b: 184 }, // Slate 400
  spacing: 32,
} as const;

/** Ripple accent — matches the new primary Apple Classic Blue theme color */
const ACCENT = { r: 0, g: 122, b: 255 }; // #007aff

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
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx); // Redraw immediately to avoid a blank frame and flashing during layout transitions
    }
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

  function drawDots(
    ctx: CanvasRenderingContext2D,
    config: typeof LIGHT | typeof DARK,
    panX: number,
    panY: number,
    alpha: number,
  ): void {
    const { r, g, b } = config.dot;
    const s = config.spacing;
    const radius = 1.0; // 1px radius micro-dot (2px diameter)

    // Tile offset so the grid scrolls continuously with the viewport (no parallax)
    const offsetX = ((panX % s) + s) % s;
    const offsetY = ((panY % s) + s) % s;

    // Use Slate 500 at 22% opacity to ensure visibility at all zoom levels, yet stay soft
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.22})`;

    ctx.beginPath();
    for (let x = offsetX - s; x < logicalW + s; x += s) {
      for (let y = offsetY - s; y < logicalH + s; y += s) {
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
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

  function drawScene(ctx: CanvasRenderingContext2D): void {
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
    // Base background with vignette studio lighting
    const cx = W / 2;
    const cy = H / 2;
    const rad = Math.max(W, H) * 0.85;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, config.bgStart);
    grad.addColorStop(1, config.bgEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ------------------------------------------------------------------
    // Grid opacity driven by zoom level
    // ------------------------------------------------------------------
    let gridOpacity = 1.0;
    if (zoom > 3.0) {
      // Graceful fade above 300 % — gone by 400 %
      gridOpacity = Math.max(0, 1 - (zoom - 3.0) / 1.0);
    }

    if (gridOpacity > 0.004) {
      drawDots(ctx, config, panX, panY, gridOpacity);
    }

    // ------------------------------------------------------------------
    // Ripples (drawn on top so they're always visible)
    // ------------------------------------------------------------------
    drawRipples(ctx, performance.now());
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

    drawScene(ctx);
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
