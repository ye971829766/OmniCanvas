<template>
  <!--
    Infinite-canvas background layer.
    Sits behind Leafer's canvas at z-index 0, pointer-events none.
    Parent must be position:relative (or absolute) with explicit dimensions.
  -->
  <canvas
    ref="canvasEl"
    aria-hidden="true"
    class="canvas-bg"
  />
</template>

<script setup lang="ts">
import { shallowRef, type ShallowRef } from "vue";
import type { App as LeaferApp } from "leafer-ui";
import { useCanvasBackground } from "@/composables/useCanvasBackground";

// ---- props ------------------------------------------------------------------

const props = defineProps<{
  /** Leafer App instance — may be null while the canvas is still loading */
  leaferApp: LeaferApp | null;
}>();

// ---- internal refs ----------------------------------------------------------

const canvasEl = shallowRef<HTMLCanvasElement | null>(null);

// Cast to ShallowRef so the composable signature is satisfied.
// We use a getter-based computed so reactivity flows through prop changes.
import { computed } from "vue";
const leaferAppRef = computed(() => props.leaferApp) as unknown as ShallowRef<LeaferApp | null>;

// ---- composable -------------------------------------------------------------

const { triggerRipple } = useCanvasBackground(canvasEl, leaferAppRef);

// ---- public API -------------------------------------------------------------

/**
 * Trigger a ripple emanating from (x, y) in logical screen coordinates
 * relative to this component's top-left corner.
 *
 * For Leafer world-space coordinates, convert first:
 *   screenX = worldX * zoom + panX
 *   screenY = worldY * zoom + panY
 */
defineExpose({ triggerRipple });
</script>

<style scoped>
.canvas-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  display: block;
}
</style>
