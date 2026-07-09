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
        <canvas
          ref="minimapCanvas"
          class="minimap-canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
        />
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  shallowRef,
  watch,
  onMounted,
  onUnmounted,
  type PropType,
} from "vue";
import { App, ZoomEvent, MoveEvent } from "leafer-ui";
import { Map as MapIcon } from "lucide-vue-next";

const props = defineProps({
  canvasApp: {
    type: Object as PropType<App | null>,
    default: null,
  },
});

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 140;
const PADDING = 12;

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
  // Render immediately when opened
  setTimeout(scheduleRender, 50);
};

const onPopoverHide = () => {
  isVisible.value = false;
};

// ── Color helpers ──────────────────────────────────────────────────

function getElementColor(tag: string): string {
  switch (tag) {
    case "Image":
      return "rgba(59, 130, 246, 0.55)"; // blue
    case "ImageGen":
      return "rgba(168, 85, 247, 0.55)"; // purple
    case "VideoGen":
      return "rgba(236, 72, 153, 0.55)"; // pink
    case "VideoNode":
      return "rgba(239, 68, 68, 0.55)"; // red
    case "Rect":
      return "rgba(34, 197, 94, 0.50)"; // green
    case "Ellipse":
      return "rgba(234, 179, 8, 0.50)"; // yellow
    case "Text":
      return "rgba(107, 114, 128, 0.50)"; // gray
    case "Frame":
      return "rgba(14, 165, 233, 0.30)"; // sky
    case "Group":
      return "rgba(14, 165, 233, 0.20)"; // sky lighter
    default:
      return "rgba(148, 163, 184, 0.45)"; // slate
  }
}

// ── Collect all visible elements recursively ──────────────────────

interface ElementRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  radius: number;
}

function collectElements(node: any, out: ElementRect[]) {
  if (!node) return;

  const children = node.children;
  if (!children || children.length === 0) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || child.visible === false) continue;

    const tag = child.tag || child.__tag || "";

    // Skip editor/internal nodes
    if (
      tag === "Leafer" ||
      tag === "Editor" ||
      tag === "EditBox" ||
      tag === "App" ||
      tag === "Viewport" ||
      tag === "Page" ||
      tag.startsWith("Edit")
    )
      continue;

    // Skip task overlay nodes
    if (child.isTaskOverlay) continue;

    const x = child.x ?? 0;
    const y = child.y ?? 0;
    const w = child.width ?? 0;
    const h = child.height ?? 0;

    if (w > 0 && h > 0) {
      out.push({
        x,
        y,
        w,
        h,
        color: getElementColor(tag),
        radius: Math.min(4, Math.min(w, h) * 0.1),
      });
    }

    // Recurse into Groups / Frames
    if (child.children && child.children.length > 0) {
      collectElements(child, out);
    }
  }
}

// ── Compute world bounds of all elements ─────────────────────────

function getWorldBounds(elements: ElementRect[]) {
  if (elements.length === 0) {
    return { minX: -500, minY: -350, maxX: 500, maxY: 350 };
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const el of elements) {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + el.w > maxX) maxX = el.x + el.w;
    if (el.y + el.h > maxY) maxY = el.y + el.h;
  }
  // Add some padding around the world bounds
  const pw = (maxX - minX) * 0.15 || 100;
  const ph = (maxY - minY) * 0.15 || 70;
  return {
    minX: minX - pw,
    minY: minY - ph,
    maxX: maxX + pw,
    maxY: maxY + ph,
  };
}

// ── Render the minimap ──────────────────────────────────────────

function render() {
  renderScheduled = false;

  const canvas = minimapCanvas.value;
  const app = props.canvasApp;
  if (!canvas || !app?.tree) return;

  const dpr = window.devicePixelRatio || 1;
  const cw = MINIMAP_WIDTH;
  const ch = MINIMAP_HEIGHT;

  // Ensure canvas dimensions match
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

  // Draw background
  const isDark = document.documentElement.classList.contains("p-dark");
  ctx.fillStyle = isDark ? "rgba(24, 24, 27, 0.6)" : "rgba(248, 250, 252, 0.6)";
  ctx.beginPath();
  ctx.roundRect(0, 0, cw, ch, 6);
  ctx.fill();

  // Collect elements
  const elements: ElementRect[] = [];
  collectElements(app.tree, elements);

  // Calculate world bounds
  const wb = getWorldBounds(elements);
  const worldW = wb.maxX - wb.minX;
  const worldH = wb.maxY - wb.minY;

  // Fit world into minimap with padding
  const drawW = cw - PADDING * 2;
  const drawH = ch - PADDING * 2;
  const scale = Math.min(drawW / worldW, drawH / worldH);
  const offsetX = PADDING + (drawW - worldW * scale) / 2;
  const offsetY = PADDING + (drawH - worldH * scale) / 2;

  // Draw elements
  for (const el of elements) {
    const rx = (el.x - wb.minX) * scale + offsetX;
    const ry = (el.y - wb.minY) * scale + offsetY;
    const rw = el.w * scale;
    const rh = el.h * scale;

    // Don't draw elements smaller than 1px
    if (rw < 1 && rh < 1) continue;

    ctx.fillStyle = el.color;
    ctx.beginPath();
    const r = Math.min(el.radius * scale, 3);
    ctx.roundRect(rx, ry, Math.max(rw, 1), Math.max(rh, 1), r);
    ctx.fill();
  }

  // Draw viewport indicator
  const tree = app.tree as any;
  const zoom = tree.scaleX || tree.scale || 1;
  const panX = tree.x || 0;
  const panY = tree.y || 0;

  // Get canvas container size
  const viewEl = app.view as HTMLElement;
  const containerW = viewEl?.clientWidth || window.innerWidth;
  const containerH = viewEl?.clientHeight || window.innerHeight;

  // Convert screen viewport back to world coordinates
  const vpWorldX = -panX / zoom;
  const vpWorldY = -panY / zoom;
  const vpWorldW = containerW / zoom;
  const vpWorldH = containerH / zoom;

  // Map viewport to minimap
  const vpX = (vpWorldX - wb.minX) * scale + offsetX;
  const vpY = (vpWorldY - wb.minY) * scale + offsetY;
  const vpW = vpWorldW * scale;
  const vpH = vpWorldH * scale;

  // Viewport rect
  ctx.strokeStyle = "rgba(0, 122, 255, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "rgba(0, 122, 255, 0.08)";
  ctx.beginPath();
  ctx.roundRect(vpX, vpY, vpW, vpH, 2);
  ctx.fill();
  ctx.stroke();

  // Store transform info for hit testing
  (canvas as any).__minimapTransform = {
    scale,
    offsetX,
    offsetY,
    worldMinX: wb.minX,
    worldMinY: wb.minY,
  };
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  rafId = requestAnimationFrame(render);
}

// ── Pointer interaction ─────────────────────────────────────────

function minimapToWorld(clientX: number, clientY: number) {
  const canvas = minimapCanvas.value;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  const t = (canvas as any).__minimapTransform;
  if (!t) return null;

  const worldX = (mx - t.offsetX) / t.scale + t.worldMinX;
  const worldY = (my - t.offsetY) / t.scale + t.worldMinY;

  return { worldX, worldY };
}

function navigateTo(worldX: number, worldY: number) {
  const app = props.canvasApp;
  if (!app?.tree) return;

  const tree = app.tree as any;
  const zoom = tree.scaleX || tree.scale || 1;

  const viewEl = app.view as HTMLElement;
  const containerW = viewEl?.clientWidth || window.innerWidth;
  const containerH = viewEl?.clientHeight || window.innerHeight;

  // Center the viewport on the clicked world position
  const targetPanX = -(worldX * zoom - containerW / 2);
  const targetPanY = -(worldY * zoom - containerH / 2);

  try {
    tree.set({ x: targetPanX, y: targetPanY });
    scheduleRender();
  } catch (err) {
    console.warn("Minimap navigation failed:", err);
  }
}

function onPointerDown(e: PointerEvent) {
  isDragging.value = true;

  const canvas = minimapCanvas.value;
  if (canvas) {
    canvas.setPointerCapture(e.pointerId);
  }

  const pos = minimapToWorld(e.clientX, e.clientY);
  if (pos) {
    navigateTo(pos.worldX, pos.worldY);
  }
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return;

  const pos = minimapToWorld(e.clientX, e.clientY);
  if (pos) {
    navigateTo(pos.worldX, pos.worldY);
  }
}

function onPointerUp(e: PointerEvent) {
  isDragging.value = false;

  const canvas = minimapCanvas.value;
  if (canvas) {
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
  }
}

// ── Lifecycle & watchers ────────────────────────────────────────

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
    if (newApp) setupListeners(newApp);
  },
  { immediate: true },
);

onMounted(() => {
  // Poll for updates at a low frequency (element property changes like position/size
  // don't always fire tree-level events)
  pollInterval = setInterval(() => {
    if (isVisible.value) {
      scheduleRender();
    }
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
  if (props.canvasApp) {
    cleanupListeners(props.canvasApp);
  }
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

.minimap-canvas {
  display: block;
  border-radius: 6px;
  cursor: crosshair;
}

.minimap-canvas:active {
  cursor: grabbing;
}
</style>
