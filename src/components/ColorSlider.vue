<template>
  <div class="color-picker-row">
    <!-- Hue Slider (Rainbow track with spring animation) -->
    <div
      ref="colorSlider"
      class="slider-container"
      id="color-slider"
      style="width: 100%"
      @pointerdown="onColorPointerDown"
      @pointermove="onColorPointerMove"
      @pointerup="onColorPointerUp"
      @pointercancel="onColorPointerUp"
      @dblclick="togglePopover"
    >
      <svg
        class="slider-track-svg"
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            :id="gradientId"
            gradientUnits="userSpaceOnUse"
            x1="2"
            y1="16"
            x2="98"
            y2="16"
          >
            <stop offset="0%" stop-color="hsl(0, 100%, 50%)" />
            <stop offset="16.6%" stop-color="hsl(60, 100%, 50%)" />
            <stop offset="33.3%" stop-color="hsl(120, 100%, 50%)" />
            <stop offset="50%" stop-color="hsl(180, 100%, 50%)" />
            <stop offset="66.6%" stop-color="hsl(240, 100%, 50%)" />
            <stop offset="83.3%" stop-color="hsl(300, 100%, 50%)" />
            <stop offset="100%" stop-color="hsl(360, 100%, 50%)" />
          </linearGradient>
        </defs>
        <path
          ref="colorTrack"
          id="color-path"
          :stroke="`url(#${gradientId})`"
          stroke-width="4.5"
          stroke-linecap="round"
          fill="none"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <div
        ref="colorThumbContainer"
        id="color-thumb-container"
        class="thumb-wrapper"
      >
        <svg
          ref="colorThumbSvg"
          id="color-thumb"
          viewBox="0 0 32 50"
          class="color-thumb-svg"
        >
          <path
            ref="colorThumbPath"
            id="color-thumb-path"
            :fill="solidColor"
            stroke="white"
            stroke-width="2.5"
          />
        </svg>
      </div>
    </div>

    <!-- Hex Input -->
    <div class="hex-input-wrapper">
      <span class="hex-prefix">#</span>
      <input
        ref="hexInputEl"
        type="text"
        class="hex-input"
        maxlength="6"
        :value="isEditingHex ? editingHexValue : hexDisplay"
        @focus="onHexFocus"
        @blur="onHexBlur"
        @keydown.enter.prevent="onHexEnter"
        @keydown.stop
        @input="onHexInput"
      />
    </div>

    <!-- Opacity Input -->
    <div class="opacity-input-wrapper">
      <input
        ref="opacityInputEl"
        type="text"
        class="opacity-input"
        maxlength="3"
        :value="isEditingOpacity ? editingOpacityValue : Math.round(alpha)"
        @focus="onOpacityFocus"
        @blur="onOpacityBlur"
        @keydown.enter.prevent="onOpacityEnter"
        @keydown.up.stop.prevent="nudgeOpacity(1)"
        @keydown.down.stop.prevent="nudgeOpacity(-1)"
        @keydown.stop
        @input="onOpacityInput"
      />
      <span class="opacity-suffix">%</span>
    </div>

    <!-- Full Color Popover -->
    <Teleport to="body">
      <Transition name="popover-fade">
        <div
          v-if="showPopover"
          class="popover-backdrop"
          @pointerdown.self="closePopover"
          @mousedown.self.stop
          @click.self.stop
        >
          <div
            ref="popoverEl"
            class="color-popover"
            :style="popoverStyle"
            @pointerdown.stop
            @mousedown.stop
            @click.stop
          >
            <!-- 2D Saturation-Value picker -->
            <div
              ref="svPicker"
              class="sv-area"
              :style="{ backgroundColor: `hsl(${hue}, 100%, 50%)` }"
              @pointerdown="onSvDown"
              @pointermove="onSvMove"
              @pointerup="onSvUp"
              @pointercancel="onSvUp"
            >
              <div class="sv-white"></div>
              <div class="sv-black"></div>
              <div class="sv-cursor" :style="svCursorStyle"></div>
            </div>

            <!-- Hue strip -->
            <div
              ref="popHueStrip"
              class="pop-hue-strip"
              @pointerdown="onPopHueDown"
              @pointermove="onPopHueMove"
              @pointerup="onPopHueUp"
              @pointercancel="onPopHueUp"
            >
              <div
                class="pop-hue-thumb"
                :style="{ left: `${(hue / 360) * 100}%` }"
              ></div>
            </div>

            <!-- Alpha strip -->
            <div
              ref="popAlphaStrip"
              class="pop-alpha-strip"
              @pointerdown="onPopAlphaDown"
              @pointermove="onPopAlphaMove"
              @pointerup="onPopAlphaUp"
              @pointercancel="onPopAlphaUp"
            >
              <div class="pop-alpha-checkerboard"></div>
              <div
                class="pop-alpha-gradient"
                :style="{
                  background: `linear-gradient(to right, transparent, ${solidColor})`,
                }"
              ></div>
              <div class="pop-alpha-thumb" :style="{ left: `${alpha}%` }"></div>
            </div>

            <!-- Popover Inputs -->
            <div class="pop-inputs-row">
              <div class="pop-hex-wrapper">
                <span class="hex-prefix">#</span>
                <input
                  type="text"
                  class="hex-input"
                  maxlength="6"
                  :value="isEditingPopHex ? editingPopHexValue : hexDisplay"
                  @focus="onPopHexFocus"
                  @blur="onPopHexBlur"
                  @keydown.enter.prevent="onPopHexEnter"
                  @keydown.stop
                  @input="onPopHexInput"
                />
              </div>
              <div class="pop-opacity-wrapper">
                <input
                  type="text"
                  class="opacity-input"
                  maxlength="3"
                  :value="
                    isEditingPopOpacity
                      ? editingPopOpacityValue
                      : Math.round(alpha)
                  "
                  @focus="onPopOpacityFocus"
                  @blur="onPopOpacityBlur"
                  @keydown.enter.prevent="onPopOpacityEnter"
                  @keydown.up.stop.prevent="nudgePopOpacity(1)"
                  @keydown.down.stop.prevent="nudgePopOpacity(-1)"
                  @keydown.stop
                  @input="onPopOpacityInput"
                />
                <span class="opacity-suffix">%</span>
              </div>
              <div
                class="pop-preview"
                :style="{ backgroundColor: fullColor }"
              ></div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import Spring from "../utils/spring";

const props = defineProps({
  hue: { type: Number, default: 45 },
  saturation: { type: Number, default: 100 },
  lightness: { type: Number, default: 50 },
  alpha: { type: Number, default: 100 },
});

const emit = defineEmits([
  "update:hue",
  "update:saturation",
  "update:lightness",
  "update:alpha",
]);

// =====================
// Color Conversions
// =====================

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  if (hex.length < 6) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

// HSL ↔ HSV conversion (for the 2D picker which works in HSV space)
function hslToHsv(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return [h, sv * 100, v * 100];
}

function hsvToHsl(h: number, s: number, v: number): [number, number, number] {
  s /= 100;
  v /= 100;
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return [h, Math.round(sl * 100), Math.round(l * 100)];
}

// =====================
// Computed
// =====================

const solidColor = computed(
  () => `hsl(${props.hue}, ${props.saturation}%, ${props.lightness}%)`,
);

const fullColor = computed(
  () =>
    `hsla(${props.hue}, ${props.saturation}%, ${props.lightness}%, ${props.alpha / 100})`,
);

const hexDisplay = computed(() => {
  const [r, g, b] = hslToRgb(props.hue, props.saturation, props.lightness);
  return rgbToHex(r, g, b);
});

// SV cursor position (converted from HSL props to HSV coordinates)
const svCursorStyle = computed(() => {
  const [, sv, v] = hslToHsv(props.hue, props.saturation, props.lightness);
  return {
    left: `${sv}%`,
    top: `${100 - v}%`,
  };
});

// =====================
// Unique IDs & DOM Refs
// =====================

const gradientId = `rainbow-${Math.random().toString(36).substring(2, 9)}`;

const colorSlider = ref<HTMLDivElement | null>(null);
const colorTrack = ref<SVGPathElement | null>(null);
const colorThumbContainer = ref<HTMLDivElement | null>(null);
const colorThumbPath = ref<SVGPathElement | null>(null);
const colorThumbSvg = ref<SVGSVGElement | null>(null);
const hexInputEl = ref<HTMLInputElement | null>(null);
const opacityInputEl = ref<HTMLInputElement | null>(null);
const svPicker = ref<HTMLDivElement | null>(null);
const popHueStrip = ref<HTMLDivElement | null>(null);
const popAlphaStrip = ref<HTMLDivElement | null>(null);

// =====================
// Springs & Thumb Morph
// =====================

const cDragY = new Spring(0);
const cThumbY = new Spring(0);
const cMorph = new Spring(0);

const pathD1 =
  "M 16 12 C 7.16 12 0 19.16 0 28 C 0 39.25 16 48 16 48 C 16 48 32 39.25 32 28 C 32 19.16 24.84 12 16 12 Z";
const pathD2 =
  "M 16 18 C 11.58 18 8 21.58 8 26 C 8 30.42 11.58 34 16 34 C 20.42 34 24 30.42 24 26 C 24 21.58 20.42 18 16 18 Z";

function parsePath(d: string): (string | number)[] {
  return (d.match(/[a-zA-Z]+|[0-9.-]+/g) || []).map((s) =>
    isNaN(parseFloat(s)) ? s : parseFloat(s),
  );
}
const parsed1 = parsePath(pathD1);
const parsed2 = parsePath(pathD2);

// =====================
// Drag States
// =====================

let cDragging = false;
let startY = 0;
let startLightness = 50;
let animationFrameId: number | null = null;
let lastTime = performance.now();

let svDragging = false;
let popHueDragging = false;
let popAlphaDragging = false;

// =====================
// Editing States
// =====================

const isEditingHex = ref(false);
const editingHexValue = ref("");
const isEditingOpacity = ref(false);
const editingOpacityValue = ref("");

// Popover inputs (separate state to avoid conflicts)
const isEditingPopHex = ref(false);
const editingPopHexValue = ref("");
const isEditingPopOpacity = ref(false);
const editingPopOpacityValue = ref("");

// =====================
// Popover State
// =====================

const showPopover = ref(false);
const popoverStyle = ref<Record<string, string>>({});

function togglePopover() {
  if (showPopover.value) {
    closePopover();
  } else {
    openPopover();
  }
}

function openPopover() {
  if (!colorThumbContainer.value) return;
  const rect = colorThumbContainer.value.getBoundingClientRect();
  const popWidth = 190;
  let left = rect.left + rect.width / 2 - popWidth / 2;
  // Clamp to viewport
  left = Math.max(8, Math.min(window.innerWidth - popWidth - 8, left));
  popoverStyle.value = {
    position: "fixed",
    left: `${left}px`,
    bottom: `${window.innerHeight - rect.top + 12}px`,
  };
  showPopover.value = true;
  document.addEventListener("keydown", onPopoverKeyDown);
}

function closePopover() {
  showPopover.value = false;
  document.removeEventListener("keydown", onPopoverKeyDown);
}

function onPopoverKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    closePopover();
  }
}

// =====================
// Hue Slider Handlers
// =====================

function updateColorFromEvent(e: PointerEvent) {
  if (!colorSlider.value) return;
  const rect = colorSlider.value.getBoundingClientRect();
  const trackLeft = rect.left + rect.width * 0.02;
  const trackRight = rect.left + rect.width * 0.98;
  const trackWidth = trackRight - trackLeft;

  let x = e.clientX - trackLeft;
  x = Math.max(0, Math.min(trackWidth, x));
  const percentage = x / trackWidth;
  emit("update:hue", Math.round(percentage * 360));

  if (cDragging) {
    const dy = startY - e.clientY;
    const newLightness = Math.max(0, Math.min(100, startLightness + dy * 0.5));
    emit("update:lightness", newLightness);
  }
}

function onColorPointerDown(e: PointerEvent) {
  cDragging = true;
  cThumbY.set(-25);
  cMorph.set(1);
  startY = e.clientY;

  if (props.saturation < 10) emit("update:saturation", 100);
  if (props.lightness < 10 || props.lightness > 95)
    emit("update:lightness", 50);
  startLightness =
    props.lightness < 10 || props.lightness > 95 ? 50 : props.lightness;

  if (colorSlider.value) {
    colorSlider.value.setPointerCapture(e.pointerId);
    updateColorFromEvent(e);
  }
}

function onColorPointerMove(e: PointerEvent) {
  if (!cDragging) return;
  updateColorFromEvent(e);
  if (!colorSlider.value) return;
  const rect = colorSlider.value.getBoundingClientRect();
  const cy = rect.top + rect.height / 2;
  cDragY.set(Math.max(-30, Math.min(30, (e.clientY - cy) * 0.4)));
}

function onColorPointerUp(e: PointerEvent) {
  cDragging = false;
  cDragY.set(0);
  cThumbY.set(0);
  cMorph.set(0);
  if (colorSlider.value) colorSlider.value.releasePointerCapture(e.pointerId);
}

// =====================
// SV Picker Handlers
// =====================

function updateSvFromEvent(e: PointerEvent) {
  if (!svPicker.value) return;
  const rect = svPicker.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  const sv = x * 100;
  const v = (1 - y) * 100;
  const [, sl, l] = hsvToHsl(props.hue, sv, v);
  emit("update:saturation", sl);
  emit("update:lightness", l);
}

function onSvDown(e: PointerEvent) {
  svDragging = true;
  if (svPicker.value) {
    svPicker.value.setPointerCapture(e.pointerId);
    updateSvFromEvent(e);
  }
}

function onSvMove(e: PointerEvent) {
  if (!svDragging) return;
  updateSvFromEvent(e);
}

function onSvUp(e: PointerEvent) {
  svDragging = false;
  if (svPicker.value) svPicker.value.releasePointerCapture(e.pointerId);
}

// =====================
// Popover Hue Strip Handlers
// =====================

function updatePopHueFromEvent(e: PointerEvent) {
  if (!popHueStrip.value) return;
  const rect = popHueStrip.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  emit("update:hue", Math.round(x * 360));
}

function onPopHueDown(e: PointerEvent) {
  popHueDragging = true;
  if (popHueStrip.value) {
    popHueStrip.value.setPointerCapture(e.pointerId);
    updatePopHueFromEvent(e);
  }
}

function onPopHueMove(e: PointerEvent) {
  if (!popHueDragging) return;
  updatePopHueFromEvent(e);
}

function onPopHueUp(e: PointerEvent) {
  popHueDragging = false;
  if (popHueStrip.value) popHueStrip.value.releasePointerCapture(e.pointerId);
}

// =====================
// Popover Alpha Strip Handlers
// =====================

function updatePopAlphaFromEvent(e: PointerEvent) {
  if (!popAlphaStrip.value) return;
  const rect = popAlphaStrip.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  emit("update:alpha", Math.round(x * 100));
}

function onPopAlphaDown(e: PointerEvent) {
  popAlphaDragging = true;
  if (popAlphaStrip.value) {
    popAlphaStrip.value.setPointerCapture(e.pointerId);
    updatePopAlphaFromEvent(e);
  }
}

function onPopAlphaMove(e: PointerEvent) {
  if (!popAlphaDragging) return;
  updatePopAlphaFromEvent(e);
}

function onPopAlphaUp(e: PointerEvent) {
  popAlphaDragging = false;
  if (popAlphaStrip.value)
    popAlphaStrip.value.releasePointerCapture(e.pointerId);
}

// =====================
// Inline Hex Input Handlers
// =====================

function onHexFocus() {
  isEditingHex.value = true;
  editingHexValue.value = hexDisplay.value;
}
function onHexInput(e: Event) {
  const target = e.target as HTMLInputElement;
  editingHexValue.value = target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
  target.value = editingHexValue.value;
}
function commitHex() {
  const result = hexToRgb(editingHexValue.value);
  if (!result) return;
  const [h, s, l] = rgbToHsl(result.r, result.g, result.b);
  emit("update:hue", h);
  emit("update:saturation", s);
  emit("update:lightness", l);
}
function onHexEnter() {
  commitHex();
  isEditingHex.value = false;
  hexInputEl.value?.blur();
}
function onHexBlur() {
  commitHex();
  isEditingHex.value = false;
}

// =====================
// Inline Opacity Input Handlers
// =====================

function onOpacityFocus() {
  isEditingOpacity.value = true;
  editingOpacityValue.value = String(Math.round(props.alpha));
}
function onOpacityInput(e: Event) {
  const target = e.target as HTMLInputElement;
  editingOpacityValue.value = target.value.replace(/[^0-9]/g, "").slice(0, 3);
  target.value = editingOpacityValue.value;
}
function commitOpacity() {
  const v = parseInt(editingOpacityValue.value, 10);
  if (!isNaN(v)) emit("update:alpha", Math.max(0, Math.min(100, v)));
}
function onOpacityEnter() {
  commitOpacity();
  isEditingOpacity.value = false;
  opacityInputEl.value?.blur();
}
function onOpacityBlur() {
  commitOpacity();
  isEditingOpacity.value = false;
}
function nudgeOpacity(d: number) {
  const c = parseInt(editingOpacityValue.value, 10) || Math.round(props.alpha);
  const n = Math.max(0, Math.min(100, c + d));
  editingOpacityValue.value = String(n);
  emit("update:alpha", n);
}

// =====================
// Popover Hex Input Handlers
// =====================

function onPopHexFocus() {
  isEditingPopHex.value = true;
  editingPopHexValue.value = hexDisplay.value;
}
function onPopHexInput(e: Event) {
  const target = e.target as HTMLInputElement;
  editingPopHexValue.value = target.value
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6);
  target.value = editingPopHexValue.value;
}
function commitPopHex() {
  const result = hexToRgb(editingPopHexValue.value);
  if (!result) return;
  const [h, s, l] = rgbToHsl(result.r, result.g, result.b);
  emit("update:hue", h);
  emit("update:saturation", s);
  emit("update:lightness", l);
}
function onPopHexEnter() {
  commitPopHex();
  isEditingPopHex.value = false;
}
function onPopHexBlur() {
  commitPopHex();
  isEditingPopHex.value = false;
}

// =====================
// Popover Opacity Input Handlers
// =====================

function onPopOpacityFocus() {
  isEditingPopOpacity.value = true;
  editingPopOpacityValue.value = String(Math.round(props.alpha));
}
function onPopOpacityInput(e: Event) {
  const target = e.target as HTMLInputElement;
  editingPopOpacityValue.value = target.value
    .replace(/[^0-9]/g, "")
    .slice(0, 3);
  target.value = editingPopOpacityValue.value;
}
function commitPopOpacity() {
  const v = parseInt(editingPopOpacityValue.value, 10);
  if (!isNaN(v)) emit("update:alpha", Math.max(0, Math.min(100, v)));
}
function onPopOpacityEnter() {
  commitPopOpacity();
  isEditingPopOpacity.value = false;
}
function onPopOpacityBlur() {
  commitPopOpacity();
  isEditingPopOpacity.value = false;
}
function nudgePopOpacity(d: number) {
  const c =
    parseInt(editingPopOpacityValue.value, 10) || Math.round(props.alpha);
  const n = Math.max(0, Math.min(100, c + d));
  editingPopOpacityValue.value = String(n);
  emit("update:alpha", n);
}

// =====================
// Render Loop
// =====================

function render(time: number) {
  const dt = (time - lastTime) / 1000;
  lastTime = time;

  const c_dragY = cDragY.update(dt);
  const c_tY = cThumbY.update(dt);
  const c_m = cMorph.update(dt);

  if (colorTrack.value) {
    const c_bend = Math.max(-12, Math.min(12, c_dragY * 0.8));
    const c_cx = 2 + (props.hue / 360) * 96;
    colorTrack.value.setAttribute("d", `M 2 16 Q ${c_cx} ${16 + c_bend} 98 16`);

    if (colorThumbContainer.value) {
      colorThumbContainer.value.style.left = `calc(2% + ${(props.hue / 360) * 96}%)`;
      colorThumbContainer.value.style.transform = `translateY(${c_dragY}px)`;
    }

    let ip = "";
    for (let i = 0; i < parsed1.length; i++) {
      const p1 = parsed1[i];
      const p2 = parsed2[i];
      ip +=
        (typeof p1 === "number"
          ? (p2 as number) + (p1 - (p2 as number)) * c_m
          : p1) + " ";
    }
    if (colorThumbPath.value) colorThumbPath.value.setAttribute("d", ip.trim());
    if (colorThumbSvg.value)
      colorThumbSvg.value.style.transform = `translateY(${c_tY}px)`;
  }

  animationFrameId = requestAnimationFrame(render);
}

onMounted(() => {
  animationFrameId = requestAnimationFrame(render);
});
onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  closePopover();
});
</script>

<style scoped>
/* ========================
   Main Row Layout
   ======================== */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

/* ========================
   Hue Slider
   ======================== */
.slider-container {
  position: relative;
  height: 26px;
  touch-action: none;
  cursor: pointer;
  overflow: visible;
  flex: 1;
  min-width: 0;
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
  pointer-events: none;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform;
}

#color-thumb-container {
  margin-left: -13px;
  margin-top: -21px;
  width: 26px;
  height: 40px;
}

.color-thumb-svg {
  width: 100%;
  height: 40px;
  overflow: visible;
  filter: drop-shadow(0 4px 3px rgba(0, 0, 0, 0.07))
    drop-shadow(0 2px 2px rgba(0, 0, 0, 0.06));
}

/* ========================
   Inline Inputs
   ======================== */
.hex-input-wrapper,
.pop-hex-wrapper {
  display: flex;
  align-items: center;
  background-color: var(--p-surface-100);
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  padding: 0 6px;
  height: 22px;
  flex: 0 0 auto;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.hex-input-wrapper:focus-within,
.pop-hex-wrapper:focus-within {
  background-color: var(--p-surface-0);
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 2px rgba(108, 92, 255, 0.12);
}

.hex-prefix {
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  user-select: none;
}

.hex-input {
  width: 44px;
  border: none;
  background: transparent;
  font-size: 0.65rem;
  font-weight: 600;
  font-family: var(--font-family-mono, "Inter", monospace);
  color: var(--p-text-color);
  outline: none;
  padding: 0;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.opacity-input-wrapper,
.pop-opacity-wrapper {
  display: flex;
  align-items: center;
  background-color: var(--p-surface-100);
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  padding: 0 5px;
  height: 22px;
  flex: 0 0 auto;
  gap: 1px;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.opacity-input-wrapper:focus-within,
.pop-opacity-wrapper:focus-within {
  background-color: var(--p-surface-0);
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 2px rgba(108, 92, 255, 0.12);
}

.opacity-input {
  width: 20px;
  border: none;
  background: transparent;
  font-size: 0.65rem;
  font-weight: 600;
  font-family: var(--font-family-mono, "Inter", monospace);
  color: var(--p-text-color);
  outline: none;
  padding: 0;
  text-align: right;
}

.opacity-input::-webkit-outer-spin-button,
.opacity-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.opacity-suffix {
  font-size: 0.6rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  user-select: none;
}

/* ========================
   Popover
   ======================== */
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
}

.color-popover {
  width: 190px;
  background: var(--p-surface-0);
  color: var(--p-text-color);
  border: 1px solid var(--p-surface-200);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100000;
}

/* SV 2D Picker */
.sv-area {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  cursor: crosshair;
  touch-action: none;
  overflow: hidden;
}

.sv-white {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, white, transparent);
}

.sv-black {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent, black);
}

.sv-cursor {
  position: absolute;
  width: 11px;
  height: 11px;
  margin-left: -5.5px;
  margin-top: -5.5px;
  border-radius: 50%;
  border: 2.5px solid white;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

/* Hue Strip */
.pop-hue-strip {
  position: relative;
  height: 9px;
  border-radius: 6px;
  background: linear-gradient(
    to right,
    hsl(0, 100%, 50%),
    hsl(60, 100%, 50%),
    hsl(120, 100%, 50%),
    hsl(180, 100%, 50%),
    hsl(240, 100%, 50%),
    hsl(300, 100%, 50%),
    hsl(360, 100%, 50%)
  );
  cursor: pointer;
  touch-action: none;
}

.pop-hue-thumb {
  position: absolute;
  top: 50%;
  width: 11px;
  height: 11px;
  margin-left: -5.5px;
  margin-top: -5.5px;
  border-radius: 50%;
  border: 2.5px solid white;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.12),
    0 1px 4px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

/* Alpha Strip */
.pop-alpha-strip {
  position: relative;
  height: 9px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  touch-action: none;
}

.pop-alpha-checkerboard {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(45deg, #ddd 25%, transparent 25%),
    linear-gradient(-45deg, #ddd 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ddd 75%),
    linear-gradient(-45deg, transparent 75%, #ddd 75%);
  background-size: 8px 8px;
  background-position:
    0 0,
    0 4px,
    4px -4px,
    -4px 0;
}

.pop-alpha-gradient {
  position: absolute;
  inset: 0;
  border-radius: 6px;
}

.pop-alpha-thumb {
  position: absolute;
  top: 50%;
  width: 11px;
  height: 11px;
  margin-left: -5.5px;
  margin-top: -5.5px;
  border-radius: 50%;
  border: 2.5px solid white;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.12),
    0 1px 4px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

/* Popover Inputs Row */
.pop-inputs-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pop-hex-wrapper {
  flex: 1;
}

.pop-hex-wrapper .hex-input {
  width: 100%;
}

.pop-preview {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  flex: 0 0 22px;
}

/* Popover Transition */
.popover-fade-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s cubic-bezier(0.22, 1, 0.36, 1);
}
.popover-fade-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.popover-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
