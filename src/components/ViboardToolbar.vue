<template>
  <div class="toolbar-viewport-overlay">
    <!-- Hidden file input for upload -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*,video/*"
      multiple
      style="display: none"
      @change="handleFileSelect"
    />

    <!-- Properties Panel Toolbar (Floats above main toolbar) -->
    <div
      ref="propertiesToolbarWrapper"
      :class="[
        'properties-toolbar-wrapper',
        { active: showPropertiesPanel && visibleToolDef?.panel },
        `${modelValue}-panel-wrapper`,
      ]"
      :style="{ width: visibleToolDef?.panelWidth || '380px' }"
    >
      <transition name="panel-fade" mode="out-in">
        <component
          v-if="visibleToolDef?.panel"
          :key="visibleToolDef.name"
          :is="visibleToolDef.panel"
          v-model:hue="activeHue"
          v-model:saturation="activeSaturation"
          v-model:lightness="activeLightness"
          v-model:alpha="activeAlpha"
          v-model:thickness="activeThickness"
          v-model:fontSize="activeTextSize"
          v-model:fontFamily="activeFontFamily"
          @submit-link="(url: any) => emit('submit-link', url)"
          @upload-file="(file: any) => emit('upload-file', file)"
        />
      </transition>
    </div>

    <!-- Toolbar Wrapper -->
    <div class="toolbar-wrapper">
      <div ref="mainToolbar" class="toolbar-container" id="main-toolbar">
        <!-- Shared Hover Pill Background -->
        <div ref="hoverPill" id="hover-pill" class="hover-pill"></div>

        <!-- Shared Active Pill Background -->
        <div
          ref="activePill"
          id="active-pill"
          :class="[
            'active-pill',
            isBlueTheme(props.modelValue) ? 'blue-bg' : 'brand-bg',
          ]"
        ></div>

        <!-- Dynamic Toolbar Items Rendering -->
        <template v-for="tool in toolList" :key="tool.name">
          <div v-if="tool.dividerBefore" class="divider"></div>

          <div class="tooltip-wrapper">
            <button
              v-if="tool.name !== 'link'"
              type="button"
              :class="[
                'tool-btn',
                { active: props.modelValue === tool.name, [tool.theme]: true },
              ]"
              :data-tool="tool.name"
              :data-shortcut="tool.shortcut.toUpperCase()"
              @click="handleToolClick(tool.name)"
              @pointerenter="onToolPointerEnter(tool.name)"
              @pointerleave="onToolPointerLeave"
            >
              <div :class="['icon-wrapper', `${tool.name}-icon`]">
                <!-- Dynamic Lucide Icons -->
                <component :is="getIconComponent(tool.icon)" class="icon-svg" />
              </div>
            </button>

            <!-- Upload button with direct file input -->
            <button
              v-else
              type="button"
              :class="[
                'tool-btn',
                { active: props.modelValue === tool.name, [tool.theme]: true },
              ]"
              :data-tool="tool.name"
              :data-shortcut="tool.shortcut.toUpperCase()"
              @click="triggerFileUpload"
              @pointerenter="onToolPointerEnter(tool.name)"
              @pointerleave="onToolPointerLeave"
            >
              <div :class="['icon-wrapper', `${tool.name}-icon`]">
                <component :is="getIconComponent(tool.icon)" class="icon-svg" />
              </div>
            </button>
            <span class="tooltip"
              >{{ tool.label }}
              <span class="shortcut">{{
                tool.shortcut.toUpperCase()
              }}</span></span
            >
          </div>

          <div v-if="tool.dividerAfter" class="divider"></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { defaultTools } from "./toolbar/toolRegistry";

import {
  MousePointer2,
  Hand,
  Frame,
  Type,
  Pencil,
  Circle,
  Upload,
  Square,
  Triangle,
  Star,
  Minus,
  Sparkles,
  Video,
} from "lucide-vue-next";

interface Tool {
  name: string;
  shortcut: string;
  theme: string;
  icon: string;
  label: string;
  panel?: any;
  panelWidth?: string;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
}

const IconMap: Record<string, any> = {
  MousePointer2,
  Hand,
  Frame,
  Type,
  Pencil,
  Circle,
  Upload,
  Square,
  Triangle,
  Star,
  Minus,
  Sparkles,
  Video,
};

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    tools?: Tool[];
  }>(),
  {
    modelValue: "select",
  },
);

const emit = defineEmits([
  "update:modelValue",
  "change-hue",
  "change-saturation",
  "change-lightness",
  "change-alpha",
  "change-thickness",
  "change-font-size",
  "change-font-family",
  "submit-link",
  "upload-file",
]);

// Use provided tools or fall back to default registry
const toolList = computed(() => props.tools || defaultTools.value);

// Resolve the active tool's definition (includes panel component reference)
const activeToolDef = computed(
  () => toolList.value.find((t) => t.name === props.modelValue) || null,
);

// Deferred version — only updates after the pill animation finishes,
// so the panel component doesn't flash before the animation starts.
const visibleToolDef = ref<any>(null);

// --- DOM refs ---
const mainToolbar = ref<HTMLDivElement | null>(null);
const propertiesToolbarWrapper = ref<HTMLDivElement | null>(null);
const activePill = ref<HTMLDivElement | null>(null);
const hoverPill = ref<HTMLDivElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// --- Shared panel state (v-model passthrough) ---
const hoveredTool = ref<string | null>(null);
const showPropertiesPanel = ref(true);

const activeHue = ref(45);
const activeSaturation = ref(100);
const activeLightness = ref(50);
const activeAlpha = ref(100);
const activeThickness = ref(4);
const activeTextSize = ref(24);
const activeFontFamily = ref("Inter");

// Watch inner states to emit values to parent
watch(activeHue, (v) => emit("change-hue", v));
watch(activeSaturation, (v) => emit("change-saturation", v));
watch(activeLightness, (v) => emit("change-lightness", v));
watch(activeAlpha, (v) => emit("change-alpha", v));
watch(activeThickness, (v) => emit("change-thickness", v));
watch(activeTextSize, (v) => emit("change-font-size", v));
watch(activeFontFamily, (v) => emit("change-font-family", v));

// --- Helpers ---

function isBlueTheme(toolName: string | undefined) {
  const tool = toolList.value.find((t) => t.name === toolName);
  return tool ? tool.theme === "blue" : true;
}

function getIconComponent(iconName: string) {
  return IconMap[iconName] || null;
}

function getBtnCoords(btn: HTMLElement) {
  if (!btn || !mainToolbar.value) return { top: 0, height: 0 };
  const btnRect = btn.getBoundingClientRect();
  const toolbarRect = mainToolbar.value.getBoundingClientRect();
  const style = window.getComputedStyle(mainToolbar.value);
  const borderTop = parseFloat(style.borderTopWidth) || 0;

  return {
    top: btnRect.top - toolbarRect.top - borderTop,
    height: btnRect.height,
  };
}

// --- Pill positioning ---

function initPillPosition() {
  if (!mainToolbar.value || !activePill.value || !hoverPill.value) return;
  const activeBtn = mainToolbar.value.querySelector(
    `[data-tool="${props.modelValue}"]`,
  ) as HTMLElement;
  if (!activeBtn) return;

  const coords = getBtnCoords(activeBtn);

  const prevTransition = activePill.value.style.transition;
  const prevHoverTransition = hoverPill.value.style.transition;
  activePill.value.style.transition = "none";
  hoverPill.value.style.transition = "none";

  activePill.value.style.top = `${coords.top}px`;
  activePill.value.style.height = `${coords.height}px`;

  hoverPill.value.style.top = `${coords.top}px`;
  hoverPill.value.style.height = `${coords.height}px`;

  void activePill.value.offsetHeight; // Force reflow
  activePill.value.style.transition = prevTransition;
  hoverPill.value.style.transition = prevHoverTransition;
}

function updateHoverPill() {
  if (!hoverPill.value || !mainToolbar.value) return;
  const targetTool = hoveredTool.value || props.modelValue;
  const targetBtn = mainToolbar.value.querySelector(
    `[data-tool="${targetTool}"]`,
  ) as HTMLElement;
  if (!targetBtn) return;

  const coords = getBtnCoords(targetBtn);
  hoverPill.value.style.top = `${coords.top}px`;
  hoverPill.value.style.height = `${coords.height}px`;

  if (hoveredTool.value && hoveredTool.value !== props.modelValue) {
    hoverPill.value.style.opacity = "1";
  } else {
    hoverPill.value.style.opacity = "0";
  }
}

// --- Tool transition animation ---

function triggerToolTransition(nextTool: string | undefined) {
  if (!mainToolbar.value || !activePill.value) return;

  const nextBtn = mainToolbar.value.querySelector(
    `[data-tool="${nextTool}"]`,
  ) as HTMLElement;
  if (!nextBtn) return;

  // 立即切换到新面板内容，提升响应速度
  visibleToolDef.value = activeToolDef.value;
  showPropertiesPanel.value = true;

  // 只更新 pill 的位置和高度，不做复杂动画
  const coords = getBtnCoords(nextBtn);
  activePill.value.style.top = `${coords.top}px`;
  activePill.value.style.height = `${coords.height}px`;

  updateHoverPill();
}

// --- Event handlers ---

function handleToolClick(toolName: string) {
  if (props.modelValue === toolName) {
    showPropertiesPanel.value = !showPropertiesPanel.value;
    return;
  }
  emit("update:modelValue", toolName);
  showPropertiesPanel.value = true;
}

function triggerFileUpload() {
  fileInput.value?.click();
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  // Emit each file to parent
  Array.from(files).forEach((file) => {
    emit("upload-file", file);
  });

  // Reset input so the same file can be selected again
  target.value = "";
}

function onToolPointerEnter(toolName: string) {
  hoveredTool.value = toolName;
  updateHoverPill();
}

function onToolPointerLeave() {
  hoveredTool.value = null;
  updateHoverPill();
}

// Watch modelValue changes to trigger transition
watch(
  () => props.modelValue,
  (newVal) => {
    triggerToolTransition(newVal);
  },
);

// --- Keyboard shortcuts ---

function onKeyDown(e: KeyboardEvent) {
  const isInput =
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    (e.target instanceof HTMLElement && e.target.isContentEditable);
  if (isInput) return;

  const key = e.key.toLowerCase();
  const matchedTool = toolList.value.find(
    (t) => t.shortcut.toLowerCase() === key,
  );
  if (matchedTool) {
    e.preventDefault();
    emit("update:modelValue", matchedTool.name);
  }
}

const handleDocumentPointerDown = (e: PointerEvent) => {
  if (props.modelValue !== "marker") return;
  const toolbarEl = mainToolbar.value;
  const propsEl = propertiesToolbarWrapper.value;
  if (
    toolbarEl?.contains(e.target as Node) ||
    propsEl?.contains(e.target as Node)
  ) {
    return;
  }
  showPropertiesPanel.value = false;
};

// --- Lifecycle ---

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", initPillPosition);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  visibleToolDef.value = activeToolDef.value;
  initPillPosition();
  setTimeout(initPillPosition, 50);
  setTimeout(initPillPosition, 200);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("resize", initPillPosition);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});
</script>

<style scoped>
/* Toolbar Viewport Overlay */
.toolbar-viewport-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 100;
  overflow: visible;
}

/* Shared Hover Pill Background */
.hover-pill {
  position: absolute;
  left: 4px;
  right: 4px;
  border-radius: 6px;
  z-index: 0;
  pointer-events: none;
  background-color: var(--zinc-100);
  opacity: 0;
  transition:
    top 0.35s cubic-bezier(0.2, 0.9, 0.4, 1),
    height 0.35s cubic-bezier(0.2, 0.9, 0.4, 1),
    opacity 0.2s ease;
}

/* Shared Active Pill Background */
.active-pill {
  position: absolute;
  left: 4px;
  right: 4px;
  border-radius: 6px;
  z-index: 1;
  pointer-events: none;
  transition:
    top 0.45s cubic-bezier(0.25, 1, 0.5, 1),
    height 0.45s cubic-bezier(0.25, 1, 0.5, 1),
    background-color 0.25s ease;
  transform-style: preserve-3d;
  perspective: 1000px;
}

.active-pill.blue-bg {
  background-color: var(--blue-bg);
}

.active-pill.brand-bg {
  background-color: var(--brand-bg);
}

/* Tool Buttons */
.tool-btn {
  position: relative;
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: color 0.2s ease;
  z-index: 2;
}

.tool-btn:hover {
  color: var(--text-primary);
}

.tool-btn.active {
  color: var(--blue-text);
}

.tool-btn.active.brand {
  color: var(--brand-text);
}

/* Icon Wrappers */
.icon-wrapper {
  position: relative;
  z-index: 2;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.icon-svg {
  width: 16px;
  height: 16px;
  stroke-width: 2px;
}

/* Divider styling */
.divider {
  width: 16px;
  height: 1px;
  background-color: var(--border-color);
  margin: 4px 0;
  z-index: 2;
}

/* Micro-animations on Hover */
.tool-btn:not(.active):hover .select-icon {
  transform: scale(1.1) rotate(-15deg) translate(-1px, -1px);
}

.tool-btn:not(.active):hover .pan-icon {
  animation: wiggle 0.4s ease-in-out;
}

.tool-btn:not(.active):hover .frame-icon {
  transform: scale(1.1);
}

.tool-btn:not(.active):hover .text-icon {
  transform: scale(1.1) translateY(-2px);
}

.tool-btn:not(.active):hover .marker-icon {
  transform: scale(1.1) rotate(-20deg) translate(2px, -2px);
}

.tool-btn:not(.active):hover .shape-icon {
  transform: scale(1.15);
}

.tool-btn:not(.active):hover .link-icon {
  transform: scale(1.1);
}

.tool-btn:not(.active):hover .image-gen-icon {
  animation: wiggle 0.4s ease-in-out;
}

.tool-btn:not(.active):hover .video-gen-icon {
  animation: wiggle 0.4s ease-in-out;
}

/* Wiggle animation keyframes */
@keyframes wiggle {
  0%,
  100% {
    transform: scale(1.1) rotate(0deg);
  }
  20% {
    transform: scale(1.1) rotate(-15deg);
  }
  40% {
    transform: scale(1.1) rotate(15deg);
  }
  60% {
    transform: scale(1.1) rotate(-10deg);
  }
  80% {
    transform: scale(1.1) rotate(5deg);
  }
}

/* Active Icon Pop Animation */
.tool-btn.active .icon-wrapper {
  animation: icon-pop 0.45s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes icon-pop {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(0.8);
  }
  70% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

/* Tooltip */
.tooltip-wrapper {
  position: relative;
  display: inline-block;
  z-index: 3;
}

.tooltip {
  position: absolute;
  left: 44px;
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  background-color: var(--tooltip-bg);
  color: white;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    transform 0.15s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.tooltip .shortcut {
  color: #a1a1aa;
  margin-left: 4px;
  font-family: var(--font-family-mono);
  font-size: 0.65rem;
}

.tooltip-wrapper:hover .tooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

/* Toolbar Floating Wrapper */
.toolbar-wrapper {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
  pointer-events: none;
}

.toolbar-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow:
    0 10px 25px -10px rgba(0, 0, 0, 0.05),
    0 1px 3px rgba(0, 0, 0, 0.01);
  pointer-events: auto;
  overflow: visible;
}

/* Secondary Properties Toolbar */
.properties-toolbar-wrapper {
  position: absolute;
  left: 72px;
  top: 50%;
  transform: translateY(-50%) translateX(10px);
  height: 44px;
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  box-shadow: 0 10px 25px -10px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  opacity: 0;
  pointer-events: none;
  z-index: 99;
  transition:
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.25, 1, 0.5, 1),
    width 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  overflow: visible;
}

.properties-toolbar-wrapper.active {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
  pointer-events: auto;
}

/* Panel slide transition */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
}

.panel-fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.panel-fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
