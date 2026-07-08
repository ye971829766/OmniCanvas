<template>
  <div class="eraser-tool-container">
    <!-- Active drawing state controls -->
    <template v-if="isActive">
      <!-- Brush Thickness Slider -->
      <div class="brush-size-control">
        <span class="size-label">粗细: {{ brushSize }}px</span>
        <Slider v-model="brushSize" :min="8" :max="80" class="size-slider" />
      </div>

      <div class="control-divider"></div>

      <!-- Cancel Action -->
      <Button
        type="button"
        class="action-btn"
        severity="danger"
        variant="text"
        title="取消擦除"
        @click="cancelEraser"
      >
        <X :size="16" />
      </Button>

      <!-- Apply/Confirm Action -->
      <Button
        type="button"
        class="action-btn"
        severity="success"
        variant="text"
        title="应用橡皮擦"
        :disabled="!hasStrokes"
        @click="applyEraser"
      >
        <Check :size="16" />
      </Button>
    </template>

    <!-- Trigger Button -->
    <Button
      v-else
      type="button"
      class="eraser-trigger"
      severity="secondary"
      variant="text"
      title="橡皮擦局部重绘"
      :disabled="disabled || isProcessing"
      @click="startEraser"
    >
      <Loader2 v-if="isProcessing" class="animate-spin" :size="18" />
      <Eraser v-else :size="18" />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, toRaw, onUnmounted, type PropType } from "vue";
import { Loader2, Eraser, Check, X } from "lucide-vue-next";
import { ZoomEvent, MoveEvent, Box, Group, Pen, Rect, Image } from "leafer-ui";
import { inpaintImage } from "@/utils/api";
import type {
  ToolbarChangePayload,
  ToolbarItem,
  ToolbarTarget,
} from "../types";

const props = defineProps({
  target: {
    type: Object as PropType<ToolbarTarget>,
    required: true,
  },
  item: {
    type: Object as PropType<ToolbarItem>,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  version: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits<{
  action: [payload: unknown];
  change: [payload: ToolbarChangePayload];
}>();

const isActive = ref(false);
const brushSize = ref(24);

const undoStack = ref<Pen[]>([]);
const redoStack = ref<Pen[]>([]);
const hasStrokes = computed(() => undoStack.value.length > 0);

const localUndo = () => {
  console.log("EraserTool: localUndo called. Current undoStack size:", undoStack.value.length);
  if (undoStack.value.length === 0) return;
  const stroke = undoStack.value.pop();
  if (stroke) {
    try {
      stroke.remove();
      console.log("EraserTool: successfully removed stroke node from canvas.");
    } catch (err) {
      console.error("EraserTool: failed to remove stroke node:", err);
    }
    redoStack.value.push(stroke);
  }
};

const localRedo = () => {
  console.log("EraserTool: localRedo called. Current redoStack size:", redoStack.value.length);
  if (redoStack.value.length === 0) return;
  const stroke = redoStack.value.pop();
  if (stroke && strokeGroup) {
    try {
      strokeGroup.add(stroke);
      console.log("EraserTool: successfully restored stroke node to canvas.");
    } catch (err) {
      console.error("EraserTool: failed to restore stroke node:", err);
    }
    undoStack.value.push(stroke);
  }
};

const onKeyDown = (e: KeyboardEvent) => {
  const key = e.key.toLowerCase();
  const isCtrl = e.ctrlKey || e.metaKey;
  console.log("EraserTool: onKeyDown captured key:", e.key, "isCtrl:", isCtrl, "isActive:", isActive.value);

  if (!isActive.value) return;

  if (key === "escape") {
    e.preventDefault();
    e.stopPropagation();
    cancelEraser();
    return;
  }

  if (isCtrl) {
    if (key === "z") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        localRedo();
      } else {
        localUndo();
      }
    } else if (key === "y") {
      e.preventDefault();
      e.stopPropagation();
      localRedo();
    }
  }
};

const isProcessing = computed(
  () =>
    props.target?.generationStatus === "generating" &&
    props.target?.generationType === "inpaint",
);

let tempGroup: Box | null = null;
let strokeGroup: Group | null = null;
let cursorRect: Rect | null = null;
let currentPen: Pen | null = null;
let isDrawing = false;
let originalMoveDrag: boolean | null = null;

const getCanvasApp = () => toRaw(props.target.app);

const getCanvasView = (): HTMLElement | null => {
  const canvasApp = getCanvasApp();
  return (canvasApp?.view as HTMLElement | undefined) ?? null;
};

const getViewportZoom = () => {
  const canvasApp = getCanvasApp();
  if (!canvasApp?.tree) return 1;
  const v = { x: 1, y: 0 };
  try {
    canvasApp.tree.localToWorld(v, undefined, true);
  } catch (_) {
    return 1;
  }
  return Math.sqrt(v.x * v.x + v.y * v.y) || 1;
};

// Build a Leafer IImageCursor object — let Leafer's own system show it on the hittable Rect
const buildLeaferCursor = (brushPx: number) => {
  const r = Math.max(4, brushPx / 2);
  const d = Math.ceil(r * 2 + 6);
  const cx = d / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}">` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="black" stroke-width="3.5"/>` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="white" stroke-width="2.5"/>` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(0, 122, 255, 0.9)" stroke-width="1.2"/>` +
    `</svg>`;
  const base64 = window.btoa(svg);
  return { url: `data:image/svg+xml;base64,${base64}`, x: cx, y: cx };
};

const updateCursorRect = () => {
  if (!cursorRect) return;
  const cursorObj = buildLeaferCursor(brushSize.value);
  cursorRect.cursor = cursorObj as any;

  // Set globally on the Leafer canvasApp and its tree to override default tool cursors
  const canvasApp = getCanvasApp();
  if (canvasApp) {
    canvasApp.cursor = cursorObj as any;
    if (canvasApp.tree) {
      canvasApp.tree.cursor = cursorObj as any;
    }
    canvasApp.updateCursor?.();
  }

  // Sync to DOM view cursor to ensure instant update and support during drag
  const view = getCanvasView();
  if (view) {
    view.style.cursor = `url('${cursorObj.url}') ${cursorObj.x} ${cursorObj.y}, crosshair`;
  }
};



watch(brushSize, () => {
  if (isActive.value) updateCursorRect();
});

// Manual inverse transform: page coordinates → box-local coordinates (avoiding worldToLocal API issues)
const pageToBoxLocal = (
  pageX: number,
  pageY: number,
  box: {
    x: number;
    y: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
  },
) => {
  const scaleX = box.scaleX ?? 1;
  const scaleY = box.scaleY ?? 1;
  const rotation = box.rotation ?? 0;

  const dx = pageX - box.x;
  const dy = pageY - box.y;

  if (Math.abs(rotation) < 0.001) {
    return { x: dx / scaleX, y: dy / scaleY };
  }

  const θ = (-rotation * Math.PI) / 180;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);
  return {
    x: (dx * cos - dy * sin) / scaleX,
    y: (dx * sin + dy * cos) / scaleY,
  };
};

const bindPointerEvents = () => {
  const view = getCanvasView();
  if (!view) return;

  view.addEventListener("pointerdown", onPointerDown, true);
  view.addEventListener("pointermove", onPointerMove, true);
  view.addEventListener("pointerup", onPointerUp, true);
  view.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("keydown", onKeyDown, true);
};

const unbindPointerEvents = () => {
  const view = getCanvasView();
  if (view) {
    view.removeEventListener("pointerdown", onPointerDown, true);
    view.removeEventListener("pointermove", onPointerMove, true);
    view.removeEventListener("pointerup", onPointerUp, true);
    view.removeEventListener("pointercancel", onPointerUp, true);
    view.style.cursor = "default";
  }

  window.removeEventListener("pointerup", onPointerUp, true);
  window.removeEventListener("pointercancel", onPointerUp, true);
  window.removeEventListener("keydown", onKeyDown, true);
};

const capturePointer = (target: EventTarget | null, pointerId: number) => {
  try {
    (target as HTMLElement | null)?.setPointerCapture?.(pointerId);
  } catch (_) {}
};

const releasePointer = (pointerId: number) => {
  try {
    getCanvasView()?.releasePointerCapture?.(pointerId);
  } catch (_) {}
};

const restoreEditor = () => {
  const canvasApp = getCanvasApp();
  if (canvasApp?.editor) {
    canvasApp.editor.visible = true;
    canvasApp.editor.hittable = true;
  }

  // Restore target image hittest
  const rawTarget = toRaw(props.target);
  if (rawTarget) rawTarget.hittest = true;

  if (tempGroup) {
    try {
      tempGroup.remove();
    } catch (_) {}
    tempGroup = null;
    strokeGroup = null;
  }

  if (cursorRect) {
    try {
      cursorRect.remove();
    } catch (_) {}
    cursorRect = null;
  }

  if (canvasApp?.tree?.config?.move && originalMoveDrag !== null) {
    canvasApp.tree.config.move.drag = originalMoveDrag;
    originalMoveDrag = null;
  }

  unbindPointerEvents();

  if (canvasApp) {
    canvasApp.cursor = "default";
    if (canvasApp.tree) {
      canvasApp.tree.cursor = "default";
    }
    canvasApp.updateCursor?.();
    canvasApp.editor?.emit("editor.scale");
  }

  isDrawing = false;
  currentPen = null;
  isActive.value = false;
  undoStack.value = [];
  redoStack.value = [];
};

const getStrokeGroupScale = () => {
  if (!strokeGroup) return 1;
  const v = { x: 1, y: 0 };
  try {
    strokeGroup.localToWorld(v, undefined, true);
  } catch (_) {
    return 1;
  }
  return Math.sqrt(v.x * v.x + v.y * v.y) || 1;
};

// Draw strokes inside the clipping Box using manual inverse transform (no worldToLocal API needed).
const onPointerDown = (e: PointerEvent) => {
  if (!isActive.value || !tempGroup || !strokeGroup) return;

  e.stopPropagation();
  e.preventDefault();

  const canvasApp = getCanvasApp();
  const pagePoint = canvasApp.tree.getPagePointByClient(e);
  if (!pagePoint) return;

  isDrawing = true;
  capturePointer(e.currentTarget, e.pointerId);

  const local = pageToBoxLocal(pagePoint.x, pagePoint.y, {
    x: tempGroup.x ?? 0,
    y: tempGroup.y ?? 0,
    scaleX: tempGroup.scaleX,
    scaleY: tempGroup.scaleY,
    rotation: tempGroup.rotation,
  });
  currentPen = new Pen({ x: local.x, y: local.y });
  strokeGroup.add(currentPen);
  currentPen.setStyle({
    stroke: "rgba(0, 122, 255, 0.6)",
    strokeWidth: brushSize.value / getStrokeGroupScale(),
    strokeJoin: "round",
    strokeCap: "round",
  });
  currentPen.moveTo(0, 0);
};

const onPointerMove = (e: PointerEvent) => {
  if (!isDrawing || !currentPen || !tempGroup || !strokeGroup) return;

  e.stopPropagation();
  e.preventDefault();

  const canvasApp = getCanvasApp();
  const pagePoint = canvasApp.tree.getPagePointByClient(e);
  if (!pagePoint) return;

  const local = pageToBoxLocal(pagePoint.x, pagePoint.y, {
    x: tempGroup.x ?? 0,
    y: tempGroup.y ?? 0,
    scaleX: tempGroup.scaleX,
    scaleY: tempGroup.scaleY,
    rotation: tempGroup.rotation,
  });
  currentPen.lineTo(
    local.x - (currentPen.x || 0),
    local.y - (currentPen.y || 0),
  );
};

const onPointerUp = (e: PointerEvent) => {
  console.log("EraserTool: onPointerUp. isDrawing:", isDrawing, "currentPen:", !!currentPen);
  if (isDrawing) {
    if (currentPen) {
      undoStack.value.push(currentPen);
      console.log("EraserTool: pushed pen to undoStack. New size:", undoStack.value.length);
      redoStack.value = []; // Clear redo stack on new action
    }
    e.stopPropagation();
    e.preventDefault();
  }
  releasePointer(e.pointerId);
  isDrawing = false;
  currentPen = null;
};

const startEraser = () => {
  const canvasApp = getCanvasApp();
  const view = getCanvasView();
  if (!view) return;

  const rawTarget = toRaw(props.target);

  // Bring this element to the top layer
  const parent = rawTarget.parent;
  if (parent && typeof parent.add === "function") {
    parent.add(rawTarget);
  }

  // Zoom/Focus to this element
  if (canvasApp.tree) {
    (canvasApp.tree as any).zoom?.(rawTarget, 100, undefined, 0.8);

    // Smoothly animate the toolbar position during zoom
    let count = 0;
    const interval = setInterval(() => {
      canvasApp.editor?.emit("editor.scale");
      count++;
      if (count > 20) clearInterval(interval);
    }, 50);
  }

  isActive.value = true;
  undoStack.value = [];
  redoStack.value = [];

  if (canvasApp.editor) {
    canvasApp.editor.visible = false;
    canvasApp.editor.hittable = false;
  }

  if (canvasApp.tree?.config?.move) {
    originalMoveDrag = Boolean(canvasApp.tree.config.move.drag);
    canvasApp.tree.config.move.drag = false;
  }

  // Box aligned to image — overflow:hide clips strokes to element bounds
  tempGroup = new Box({
    x: rawTarget.x,
    y: rawTarget.y,
    width: rawTarget.width,
    height: rawTarget.height,
    scaleX: rawTarget.scaleX,
    scaleY: rawTarget.scaleY,
    rotation: rawTarget.rotation,
    overflow: "hide",
    hittest: false,
  });
  const rawParent =
    toRaw(props.target.parent) || toRaw(canvasApp.zoomLayer) || canvasApp.tree;
  rawParent.add(tempGroup);

  strokeGroup = new Group({ hittest: false });
  tempGroup.add(strokeGroup);

  // Hittable Rect placed directly on rawParent (same layer as tempGroup) to avoid
  // tempGroup's hittest:false blocking events. Nearly-transparent fill (not 0) is required
  // by Leafer to register the element as a valid hit target.
  // Disable hittest on the image itself so Leafer's cursor tracking reaches cursorRect first
  rawTarget.hittest = false;

  cursorRect = new Rect({
    x: rawTarget.x,
    y: rawTarget.y,
    width: rawTarget.width,
    height: rawTarget.height,
    scaleX: rawTarget.scaleX ?? 1,
    scaleY: rawTarget.scaleY ?? 1,
    rotation: rawTarget.rotation ?? 0,
    fill: "rgba(0,0,0,0.01)",
    hitFill: "all",
    hittest: true,
  });
  rawParent.add(cursorRect);

  bindPointerEvents();
  updateCursorRect();
};

const cancelEraser = () => {
  restoreEditor();
};

const applyEraser = async () => {
  const imageUrl = props.target.url;
  const parent = props.target.parent;

  if (!strokeGroup || !strokeGroup.children.length) {
    return;
  }

  // Get local bounding box of all strokes relative to strokeGroup's parent (tempGroup / the image space)
  const bounds = strokeGroup.boxBounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  try {
    const rawTarget = toRaw(props.target);

    // strokeGroup is inside the Box (image-aligned), so boxBounds are already in image-local space
    const imageLocalLeft = bounds.x;
    const imageLocalTop = bounds.y;
    const imageLocalWidth = bounds.width;
    const imageLocalHeight = bounds.height;

    // Load actual image file to get native dimensions
    const imgHelper = new window.Image();
    imgHelper.src = imageUrl;
    await new Promise((resolve, reject) => {
      imgHelper.onload = resolve;
      imgHelper.onerror = reject;
    });

    const naturalWidth = imgHelper.naturalWidth;
    const naturalHeight = imgHelper.naturalHeight;

    // Project image-local coordinates to raw image pixel dimensions
    const rawLeft = (imageLocalLeft / rawTarget.width) * naturalWidth;
    const rawTop = (imageLocalTop / rawTarget.height) * naturalHeight;
    const rawWidth = (imageLocalWidth / rawTarget.width) * naturalWidth;
    const rawHeight = (imageLocalHeight / rawTarget.height) * naturalHeight;

    // Clip to image boundaries as required by Baidu's API
    const finalLeft = Math.round(
      Math.max(0, Math.min(naturalWidth - 2, rawLeft)),
    );
    const finalTop = Math.round(
      Math.max(0, Math.min(naturalHeight - 2, rawTop)),
    );
    const finalWidth = Math.round(
      Math.max(1, Math.min(naturalWidth - finalLeft - 1, rawWidth)),
    );
    const finalHeight = Math.round(
      Math.max(1, Math.min(naturalHeight - finalTop - 1, rawHeight)),
    );

    console.log("Inpaint mapping coordinates:", {
      layout: {
        imageLocalLeft,
        imageLocalTop,
        imageLocalWidth,
        imageLocalHeight,
      },
      natural: { naturalWidth, naturalHeight },
      final: { finalLeft, finalTop, finalWidth, finalHeight },
    });

    restoreEditor(); // Remove red mask layer and restore editor immediately

    // Call NestJS backend inpaint endpoint
    const res = await inpaintImage(imageUrl, [
      {
        left: finalLeft,
        top: finalTop,
        width: finalWidth,
        height: finalHeight,
      },
    ]);

    if (res && res.taskId) {
      const rawParent = toRaw(parent);
      if (rawTarget && rawParent) {
        // Spawn a new Image element on the right (offset 20px) running the task
        const newImage = new Image({
          x: rawTarget.x + rawTarget.width + 20,
          y: rawTarget.y,
          width: rawTarget.width,
          height: rawTarget.height,
          scaleX: rawTarget.scaleX,
          scaleY: rawTarget.scaleY,
          rotation: rawTarget.rotation,
          url: rawTarget.url, // Start with original url as placeholder
          editable: true,
        });

        newImage.set({
          taskId: res.taskId,
          generationStatus: "generating",
          generationType: "inpaint",
        });

        rawParent.add(newImage);

        emit("change", {
          key: "url",
          value: rawTarget.url,
          skipHistory: false,
          immediateSave: true,
        });
      }
    }
  } catch (error: any) {
    restoreEditor();
    console.error("Inpaint failed:", error);
  }
};

onUnmounted(() => {
  if (isActive.value) {
    restoreEditor();
  }
});
</script>

<style scoped lang="scss">
.eraser-tool-container {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
}

.eraser-trigger {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.brush-size-control {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--text-secondary);
  padding: 0 4px;

  .size-label {
    white-space: nowrap;
    min-width: 65px;
  }

  .size-slider {
    width: 60px;
  }
}

.control-divider {
  width: 1px;
  height: 14px;
  background: rgba(0, 0, 0, 0.08);
}

.action-btn {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}
</style>
