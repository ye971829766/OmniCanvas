<template>
  <div
    ref="thicknessSlider"
    class="slider-container"
    id="thickness-slider"
    style="width: 120px"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <svg
      class="slider-track-svg"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
    >
      <path ref="thicknessTrack" id="thickness-path" :fill="color" d=""></path>
    </svg>
    <div
      ref="thicknessThumbContainer"
      id="thickness-thumb-container"
      class="thumb-wrapper"
    >
      <div ref="thicknessThumb" class="thickness-thumb" id="thickness-thumb">
        <div
          ref="thicknessDot"
          class="thickness-inner"
          id="thickness-inner"
          :style="{ backgroundColor: color }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import Spring from "../utils/spring";

const props = defineProps({
  modelValue: {
    type: Number,
    default: 4,
  },
  color: {
    type: String,
    default: "hsl(45, 90%, 65%)",
  },
});

const emit = defineEmits(["update:modelValue"]);

const thicknessSlider = ref<HTMLDivElement | null>(null);
const thicknessTrack = ref<SVGPathElement | null>(null);
const thicknessThumbContainer = ref<HTMLDivElement | null>(null);
const thicknessThumb = ref<HTMLDivElement | null>(null);
const thicknessDot = ref<HTMLDivElement | null>(null);

// Springs
const tDragY = new Spring(0);
const tDragScale = new Spring(0);
const tThumbY = new Spring(0);
const tThumbSize = new Spring(Math.max(12, props.modelValue * 0.8 + 6));
const tInnerSize = new Spring(props.modelValue);

let tDragging = false;
let animationFrameId: number | null = null;
let lastTime = performance.now();

function getThicknessPercentage() {
  return (props.modelValue - 1) / 19;
}

function updateThicknessFromEvent(e: PointerEvent) {
  if (!thicknessSlider.value) return;
  const rect = thicknessSlider.value.getBoundingClientRect();
  const trackLeft = rect.left + rect.width * 0.05;
  const trackRight = rect.left + rect.width * 0.95;
  const trackWidth = trackRight - trackLeft;

  let x = e.clientX - trackLeft;
  x = Math.max(0, Math.min(trackWidth, x));
  const percentage = x / trackWidth;
  const thickness = 1 + percentage * 19;

  emit("update:modelValue", thickness);
  tInnerSize.set(thickness);
  if (!tDragging) {
    tThumbSize.set(Math.max(16, thickness + 8));
  }
}

function onPointerDown(e: PointerEvent) {
  tDragging = true;
  tDragScale.set(1);
  tThumbY.set(-32);
  tThumbSize.set(32);
  if (thicknessSlider.value) {
    thicknessSlider.value.setPointerCapture(e.pointerId);
    updateThicknessFromEvent(e);
  }
}

function onPointerMove(e: PointerEvent) {
  if (!tDragging) return;
  updateThicknessFromEvent(e);

  if (!thicknessSlider.value) return;
  const rect = thicknessSlider.value.getBoundingClientRect();
  const cy = rect.top + rect.height / 2;
  const rawDiff = e.clientY - cy;
  const resistance = 0.4;
  tDragY.set(Math.max(-30, Math.min(30, rawDiff * resistance)));
}

function onPointerUp(e: PointerEvent) {
  tDragging = false;
  tDragScale.set(0);
  tDragY.set(0);
  tThumbY.set(0);
  tThumbSize.set(Math.max(12, props.modelValue * 0.8 + 6));
  if (thicknessSlider.value) {
    thicknessSlider.value.releasePointerCapture(e.pointerId);
  }
}

watch(
  () => props.modelValue,
  (newVal) => {
    tInnerSize.set(newVal);
    if (!tDragging) {
      tThumbSize.set(Math.max(12, newVal * 0.8 + 6));
    }
  },
);

function render(time: number) {
  const dt = (time - lastTime) / 1000;
  lastTime = time;

  const t_dragY = tDragY.update(dt);
  const t_scale = tDragScale.update(dt);
  const t_tY = tThumbY.update(dt);
  const t_tSize = tThumbSize.update(dt);
  const t_iSize = tInnerSize.update(dt);

  if (thicknessTrack.value) {
    const percentage = getThicknessPercentage();
    const cx = 5 + percentage * 90;

    const t_min = 2;
    const t_max = 16;
    const T_cx = t_min + percentage * (t_max - t_min);

    const t_bend = Math.max(-12, Math.min(12, t_dragY * 0.8));
    const dy = (x: number) => t_bend * Math.sin((x / 100) * Math.PI);
    const dy_left = dy(5);
    const dy_right = dy(95);
    const dy_mid = dy(cx);

    const p1y_top = 16 - t_min / 2 + dy_left;
    const p1y_bot = 16 + t_min / 2 + dy_left;
    const p2y_top = 16 - t_max / 2 + dy_right;
    const p2y_bot = 16 + t_max / 2 + dy_right;

    const bulge = t_scale * 3;
    const c_y_top = 16 - T_cx / 2 - bulge + dy_mid;
    const c_y_bot = 16 + T_cx / 2 + bulge + dy_mid;

    const tPath = `M 5 ${p1y_top} Q ${cx} ${c_y_top} 95 ${p2y_top} A ${
      t_max / 2
    } ${t_max / 2} 0 0 1 95 ${p2y_bot} Q ${cx} ${c_y_bot} 5 ${p1y_bot} A ${
      t_min / 2
    } ${t_min / 2} 0 0 1 5 ${p1y_top} Z`;

    thicknessTrack.value.setAttribute("d", tPath);

    if (thicknessThumbContainer.value) {
      thicknessThumbContainer.value.style.left = `calc(5% + ${percentage * 90}%)`;
      thicknessThumbContainer.value.style.transform = `translateY(${t_dragY}px)`;
    }

    if (thicknessThumb.value) {
      thicknessThumb.value.style.transform = `translateY(${t_tY}px)`;
      thicknessThumb.value.style.width = `${t_tSize}px`;
      thicknessThumb.value.style.height = `${t_tSize}px`;
    }

    if (thicknessDot.value) {
      thicknessDot.value.style.width = `${t_iSize}px`;
      thicknessDot.value.style.height = `${t_iSize}px`;
    }
  }

  animationFrameId = requestAnimationFrame(render);
}

onMounted(() => {
  animationFrameId = requestAnimationFrame(render);
});

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});
</script>

<style scoped>
.slider-container {
  position: relative;
  height: 26px;
  touch-action: none;
  cursor: pointer;
  overflow: visible;
}

.slider-track-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.thumb-wrapper {
  position: absolute;
  top: 13px;
  left: 0;
  pointer-events: none;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform;
}

#thickness-thumb-container {
  margin-left: -16px;
  margin-top: -16px;
  width: 32px;
  height: 32px;
}

.thickness-thumb {
  background-color: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  will-change: width, height, transform;
}

.thickness-inner {
  border-radius: 9999px;
  will-change: width, height;
}
</style>
