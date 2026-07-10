<template>
  <div>
    <!-- Minimap Toggle Button -->
    <div class="minimap-btn-wrapper">
      <Button
        rounded
        text
        title="小地图"
        style="
          width: 32px;
          height: 32px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        "
        @click="togglePopover"
      >
        <MapIcon :size="16" />
      </Button>
    </div>

    <!-- PrimeVue Minimap Popover -->
    <Popover
      ref="popoverRef"
      class="minimap-popover"
      @show="onPopoverShow"
      @hide="onPopoverHide"
    >
      <div class="minimap-content">
        <div
          class="minimap-panel"
          :class="{ dragging: isDragging }"
        >
          <canvas
            ref="minimapCanvas"
            class="minimap-canvas"
            role="img"
            aria-label="画布小地图"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @pointerleave="onPointerUp"
            @wheel.prevent="onWheel"
          />
        </div>
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import {
  shallowRef,
  ref,
  watch,
  onMounted,
  onUnmounted,
  type PropType,
} from "vue";
import { App, ZoomEvent, MoveEvent } from "leafer-ui";
import { Map as MapIcon } from "lucide-vue-next";
import {
  clientPointToWorld,
  createMinimapTransform,
  getViewportWorldRect,
  getZoomLayerPositionForViewportCenter,
  minimapRectsEqual,
  type MinimapRect,
  type MinimapTransform,
} from "@/utils/minimapGeometry";

const props = defineProps({
  canvasApp: {
    type: Object as PropType<App | null>,
    default: null,
  },
});

/** Align with vue-flow MiniMap defaults */
const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;
/** vue-flow offsetScale — extra padding around content in viewBox units */
const OFFSET_SCALE = 5;
const NODE_BORDER_RADIUS = 5;
const ZOOM_STEP = 1;

const popoverRef = ref();
const minimapCanvas = shallowRef<HTMLCanvasElement | null>(null);
const isDragging = ref(false);
const isVisible = ref(false);

let rafId: number | null = null;
let renderScheduled = false;

const togglePopover = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const onPopoverShow = () => {
  isVisible.value = true;
  transform = null;
  transformContentBounds = null;
  transformViewportSize = null;
  // Canvas mounts after show — wait a tick then paint
  setTimeout(scheduleRender, 50);
};

const onPopoverHide = () => {
  isVisible.value = false;
  isDragging.value = false;
  dragTransform = null;
  cancelViewportUpdate();
};

let transform: MinimapTransform | null = null;
let dragTransform: MinimapTransform | null = null;
let transformContentBounds: MinimapRect | null = null;
let transformViewportSize: { width: number; height: number } | null = null;

// ── Color helpers ──────────────────────────────────────────────────

function getElementColor(tag: string, isDark: boolean): string {
  // Soft fills similar to vue-flow nodeColor, tinted by type
  switch (tag) {
    case "Image":
      return isDark ? "rgba(96, 165, 250, 0.7)" : "rgba(59, 130, 246, 0.65)";
    case "ImageGen":
      return isDark ? "rgba(192, 132, 252, 0.7)" : "rgba(168, 85, 247, 0.65)";
    case "VideoGen":
      return isDark ? "rgba(244, 114, 182, 0.7)" : "rgba(236, 72, 153, 0.65)";
    case "VideoNode":
      return isDark ? "rgba(248, 113, 113, 0.7)" : "rgba(239, 68, 68, 0.65)";
    case "Rect":
      return isDark ? "rgba(74, 222, 128, 0.65)" : "rgba(34, 197, 94, 0.6)";
    case "Ellipse":
      return isDark ? "rgba(250, 204, 21, 0.65)" : "rgba(234, 179, 8, 0.6)";
    case "Text":
      return isDark ? "rgba(161, 161, 170, 0.65)" : "rgba(113, 113, 122, 0.55)";
    case "Frame":
      return isDark ? "rgba(56, 189, 248, 0.35)" : "rgba(14, 165, 233, 0.3)";
    case "Group":
      return isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(14, 165, 233, 0.2)";
    default:
      // vue-flow default nodeColor ≈ #e2e2e2
      return isDark ? "rgba(161, 161, 170, 0.55)" : "rgba(226, 226, 226, 0.9)";
  }
}

// ── Collect elements (world space) ─────────────────────────────────

interface ElementRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

const SKIP_TAGS = new Set([
  "Leafer",
  "Editor",
  "EditBox",
  "App",
  "Viewport",
  "Page",
]);

function collectElements(
  node: any,
  out: ElementRect[],
  isDark: boolean,
  sceneRoot: any,
  depth = 0,
) {
  if (!node || depth > 32) return;

  const children = node.children;
  if (!children || children.length === 0) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || child.visible === false) continue;

    const tag = child.tag || child.__tag || "";
    if (SKIP_TAGS.has(tag) || tag.startsWith("Edit")) continue;
    if (child.isTaskOverlay) continue;

    // Scene-relative bounds exclude the zoom layer's camera transform.
    const wb = child.getBounds?.("box", sceneRoot);
    let x: number;
    let y: number;
    let w: number;
    let h: number;

    if (wb && Number.isFinite(wb.width) && Number.isFinite(wb.height)) {
      x = wb.x;
      y = wb.y;
      w = wb.width;
      h = wb.height;
    } else {
      x = child.x ?? 0;
      y = child.y ?? 0;
      w = child.width ?? 0;
      h = child.height ?? 0;
    }

    if (w > 0 && h > 0) {
      out.push({
        x,
        y,
        w,
        h,
        color: getElementColor(tag, isDark),
      });
    }

    if (child.children?.length) {
      collectElements(child, out, isDark, sceneRoot, depth + 1);
    }
  }
}

// ── Bounds helpers (vue-flow getRectOfNodes / getBoundsofRects) ────

function getRectOfElements(elements: ElementRect[]): MinimapRect | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + el.w > maxX) maxX = el.x + el.w;
    if (el.y + el.h > maxY) maxY = el.y + el.h;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getViewportSize(app: App) {
  const viewEl = app.view as HTMLElement;
  return {
    width: app.width || viewEl?.clientWidth || window.innerWidth,
    height: app.height || viewEl?.clientHeight || window.innerHeight,
  };
}

function getViewportWorld(app: App): MinimapRect {
  const zoomLayer = (app as any).zoomLayer || app.tree;
  return getViewportWorldRect(zoomLayer as any, getViewportSize(app));
}

// ── Render ─────────────────────────────────────────────────────────

function render() {
  renderScheduled = false;
  rafId = null;

  if (!isVisible.value) return;

  const canvas = minimapCanvas.value;
  const app = props.canvasApp;
  if (!canvas || !app?.tree) return;

  const dpr = window.devicePixelRatio || 1;
  const cw = MINIMAP_WIDTH;
  const ch = MINIMAP_HEIGHT;

  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const isDark = document.documentElement.classList.contains("p-dark");

  // Background — vue-flow uses #fff; map to surface token feel
  ctx.fillStyle = isDark ? "rgba(24, 24, 27, 0.95)" : "rgba(255, 255, 255, 0.95)";
  ctx.fillRect(0, 0, cw, ch);

  const elements: ElementRect[] = [];
  collectElements(app.tree, elements, isDark, app.tree);

  const nodesBB = getRectOfElements(elements);
  const viewBB = getViewportWorld(app);
  const viewportSizeChanged =
    !transformViewportSize ||
    Math.abs(transformViewportSize.width - viewBB.width) > 0.001 ||
    Math.abs(transformViewportSize.height - viewBB.height) > 0.001;
  if (
    !dragTransform &&
    (!transform ||
      viewportSizeChanged ||
      !minimapRectsEqual(nodesBB, transformContentBounds))
  ) {
    transform = createMinimapTransform(
      nodesBB,
      viewBB,
      { width: cw, height: ch },
      OFFSET_SCALE,
    );
    transformContentBounds = nodesBB ? { ...nodesBB } : null;
    transformViewportSize = {
      width: viewBB.width,
      height: viewBB.height,
    };
  }

  const activeTransform = dragTransform || transform;
  if (!activeTransform) return;
  const {
    viewBoxX,
    viewBoxY,
    viewBoxW,
    viewBoxH,
    worldPerPixel,
  } = activeTransform;

  const worldToMini = (wx: number, wy: number) => ({
    x: ((wx - viewBoxX) / viewBoxW) * cw,
    y: ((wy - viewBoxY) / viewBoxH) * ch,
  });

  // Draw nodes
  for (const el of elements) {
    const p = worldToMini(el.x, el.y);
    const rw = (el.w / viewBoxW) * cw;
    const rh = (el.h / viewBoxH) * ch;
    if (rw < 0.5 && rh < 0.5) continue;

    const drawW = Math.max(rw, 1);
    const drawH = Math.max(rh, 1);
    const r = Math.min(
      NODE_BORDER_RADIUS / worldPerPixel,
      Math.min(drawW, drawH) / 2,
      4,
    );

    ctx.fillStyle = el.color;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, drawW, drawH, r);
    ctx.fill();
  }

  // vue-flow mask: evenodd path — fill whole map, cut out viewport hole
  const vp = worldToMini(viewBB.x, viewBB.y);
  const vpW = (viewBB.width / viewBoxW) * cw;
  const vpH = (viewBB.height / viewBoxH) * ch;

  ctx.save();
  ctx.beginPath();
  // Outer rect
  ctx.rect(0, 0, cw, ch);
  // Inner hole (viewport) — reverse winding for evenodd
  const viewportX = vp.x;
  const viewportY = vp.y;
  const viewportW = Math.max(vpW, 2);
  const viewportH = Math.max(vpH, 2);
  const holeX = Math.max(0, viewportX);
  const holeY = Math.max(0, viewportY);
  const holeRight = Math.min(cw, viewportX + viewportW);
  const holeBottom = Math.min(ch, viewportY + viewportH);
  const holeW = Math.max(0, holeRight - holeX);
  const holeH = Math.max(0, holeBottom - holeY);
  if (holeW > 0 && holeH > 0) ctx.rect(holeX, holeY, holeW, holeH);
  // vue-flow maskColor = rgb(240, 240, 240, 0.6)
  ctx.fillStyle = isDark
    ? "rgba(0, 0, 0, 0.45)"
    : "rgba(240, 240, 240, 0.6)";
  ctx.fill("evenodd");
  ctx.restore();

  // Subtle viewport border (maskStroke) for readability when hole is large
  if (holeW > 0 && holeH > 0) {
    ctx.strokeStyle = isDark
      ? "rgba(255, 255, 255, 0.25)"
      : "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(holeX + 0.5, holeY + 0.5, holeW - 1, holeH - 1);
  }
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  rafId = requestAnimationFrame(render);
}

// ── Coordinate mapping ─────────────────────────────────────────────

function clientToWorld(clientX: number, clientY: number) {
  const canvas = minimapCanvas.value;
  const activeTransform = dragTransform || transform;
  if (!canvas || !activeTransform) return null;

  const rect = canvas.getBoundingClientRect();
  return clientPointToWorld(clientX, clientY, rect, activeTransform);
}

let viewportRafId: number | null = null;
let pendingViewportCenter: { worldX: number; worldY: number } | null = null;

function setViewportCenter(worldX: number, worldY: number) {
  pendingViewportCenter = { worldX, worldY };
  if (viewportRafId !== null) return;

  viewportRafId = requestAnimationFrame(() => {
    viewportRafId = null;
    const center = pendingViewportCenter;
    pendingViewportCenter = null;
    const app = props.canvasApp;
    if (!center || !app?.tree) return;

    const zoomLayer = (app as any).zoomLayer || app.tree;
    const position = getZoomLayerPositionForViewportCenter(
      center.worldX,
      center.worldY,
      zoomLayer as any,
      getViewportSize(app),
    );

    try {
      zoomLayer.set(position);
      scheduleRender();
    } catch (err) {
      console.warn("Minimap navigation failed:", err);
    }
  });
}

function cancelViewportUpdate() {
  pendingViewportCenter = null;
  if (viewportRafId !== null) {
    cancelAnimationFrame(viewportRafId);
    viewportRafId = null;
  }
}

function zoomByWheel(deltaY: number, deltaMode: number, ctrlKey: boolean) {
  const app = props.canvasApp;
  if (!app?.tree) return;

  const tree = app.tree as any;
  const zoomLayer = (app as any).zoomLayer || tree;
  const zoom = zoomLayer.scaleX || zoomLayer.scale || 1;

  // vue-flow wheel zoom math
  const factor = ctrlKey ? 10 : 1;
  const pinchDelta =
    -deltaY *
    (deltaMode === 1 ? 0.05 : deltaMode ? 1 : 0.002) *
    ZOOM_STEP;
  const nextZoom = Math.min(
    Math.max(zoom * 2 ** (pinchDelta * factor), 0.05),
    64,
  );

  try {
    tree.zoom(nextZoom, undefined, undefined, 0);
    scheduleRender();
  } catch (err) {
    console.warn("Minimap zoom failed:", err);
  }
}

// ── Pointer / wheel ────────────────────────────────────────────────

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  if (!transform) render();
  dragTransform = transform ? { ...transform } : null;
  isDragging.value = true;

  const app = props.canvasApp;
  const zoomLayer = (app as any)?.zoomLayer || app?.tree;
  zoomLayer?.killAnimate?.();

  const canvas = minimapCanvas.value;
  canvas?.setPointerCapture(e.pointerId);

  // Click / drag scrubber: center viewport on minimap position
  const pos = clientToWorld(e.clientX, e.clientY);
  if (pos) setViewportCenter(pos.worldX, pos.worldY);
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return;
  const pos = clientToWorld(e.clientX, e.clientY);
  if (pos) setViewportCenter(pos.worldX, pos.worldY);
}

function onPointerUp(e: PointerEvent) {
  isDragging.value = false;
  dragTransform = null;
  const canvas = minimapCanvas.value;
  if (canvas) {
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }
  scheduleRender();
}

function onWheel(e: WheelEvent) {
  zoomByWheel(e.deltaY, e.deltaMode, e.ctrlKey);
}

// ── Lifecycle ──────────────────────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null;

function setupListeners(app: App) {
  if (!app.tree) return;
  app.tree.on(ZoomEvent.ZOOM, scheduleRender);
  app.tree.on(MoveEvent.MOVE, scheduleRender);
  app.tree.on("child.add", scheduleRender);
  app.tree.on("child.remove", scheduleRender);
  scheduleRender();
}

function cleanupListeners(app: App) {
  if (!app.tree) return;
  app.tree.off(ZoomEvent.ZOOM, scheduleRender);
  app.tree.off(MoveEvent.MOVE, scheduleRender);
  app.tree.off("child.add", scheduleRender);
  app.tree.off("child.remove", scheduleRender);
}

watch(
  () => props.canvasApp,
  (newApp, oldApp) => {
    if (oldApp) cleanupListeners(oldApp);
    transform = null;
    dragTransform = null;
    transformContentBounds = null;
    transformViewportSize = null;
    if (newApp) setupListeners(newApp);
  },
  { immediate: true },
);

onMounted(() => {
  // Property changes (x/y/width) may not bubble tree events
  pollInterval = setInterval(() => {
    if (isVisible.value) scheduleRender();
  }, 500);
});

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  cancelViewportUpdate();
  if (props.canvasApp) cleanupListeners(props.canvasApp);
});
</script>

<style scoped>
.minimap-btn-wrapper {
  position: absolute;
  left: 56px;
  bottom: 11px;
  z-index: 40;
}

.minimap-content {
  padding: 4px;
}

/* vue-flow MiniMap surface inside popover */
.minimap-panel {
  width: 200px;
  height: 150px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--surface-panel, #fff);
  border: 1px solid var(--glass-border, var(--border-color, #e5e7eb));
  cursor: grab;
  user-select: none;
}

.minimap-panel.dragging {
  cursor: grabbing;
}

.minimap-canvas {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  cursor: inherit;
  touch-action: none;
}
</style>
