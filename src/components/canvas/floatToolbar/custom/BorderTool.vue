<template>
  <button
    type="button"
    class="border-trigger"
    title="边框"
    :disabled="disabled"
    @click="togglePanel"
    id="border-trigger-btn"
  >
    <div class="border-preview-swatch">
      <div 
        class="swatch-inner" 
        :style="swatchStyle"
      ></div>
    </div>
    <span class="border-width-preview" v-if="strokeWidthValue > 0">
      {{ strokeWidthValue }}px
    </span>
    <span class="border-width-preview-none" v-else>
      无边框
    </span>
  </button>

  <Popover
    ref="popoverRef"
    append-to="body"
    :dismissable="true"
    :pt="popoverPt"
    id="border-panel-popover"
  >
    <div class="border-panel">
      <!-- Title: Color -->
      <div class="panel-section-title">边框颜色</div>
      
      <!-- Color Picker -->
      <ColorSlider
        v-model:hue="hue"
        v-model:saturation="saturation"
        v-model:lightness="lightness"
        v-model:alpha="alpha"
      />

      <div class="panel-divider"></div>

      <!-- Title: Thickness -->
      <div class="panel-section-title">边框粗细</div>
      <div class="thickness-row">
        <Slider
          v-model="strokeWidthValue"
          class="thickness-slider"
          :min="0"
          :max="20"
          id="border-thickness-slider"
        />
        <InputNumber
          v-model="strokeWidthValue"
          size="small"
          class="thickness-input"
          :min="0"
          :max="20"
          id="border-thickness-input"
        />
      </div>
    </div>
  </Popover>
</template>

<script setup lang="ts">
// import { Popover, Slider, InputNumber } from "primevue";
import ColorSlider from "@/components/ColorSlider.vue";
import { ref, computed, watch, type PropType } from "vue";
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

const popoverRef = ref();
const popoverPt = {
  root: { class: "toolbar-popover-root" },
  content: { class: "toolbar-popover-content" },
};

// Local color values
const hue = ref(0);
const saturation = ref(0);
const lightness = ref(0);
const alpha = ref(100);

// Helper color converters
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

// Color string parser
function parseColor(stroke: any): { h: number; s: number; l: number; a: number } {
  const defaultColor = { h: 0, s: 0, l: 0, a: 100 }; // Default black
  const val = typeof stroke === "function" ? stroke.toString() : stroke;
  if (typeof val !== "string" || !val) return defaultColor;

  const str = val.trim().toLowerCase();

  // 1. Hex
  if (str.startsWith("#")) {
    const hex = str.slice(1);
    let r = 0,
      g = 0,
      b = 0,
      a = 100;
    if (hex.length === 3 || hex.length === 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
      if (hex.length === 4) {
        a = Math.round((parseInt(hex[3] + hex[3], 16) / 255) * 100);
      }
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) {
        a = Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100);
      }
    }
    const [h, s, l] = rgbToHsl(r, g, b);
    return { h, s, l, a };
  }

  // 2. RGB/RGBA
  if (str.startsWith("rgb")) {
    const match = str.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
    );
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      const a =
        match[4] !== undefined ? Math.round(parseFloat(match[4]) * 100) : 100;
      const [h, s, l] = rgbToHsl(r, g, b);
      return { h, s, l, a };
    }
  }

  // 3. HSL/HSLA
  if (str.startsWith("hsl")) {
    const match = str.match(
      /hsla?\((\d+),\s*([\d.]+)%?,\s*([\d.]+)%?(?:,\s*([\d.]+))?\)/,
    );
    if (match) {
      const h = parseInt(match[1], 10);
      const s = parseFloat(match[2]);
      const l = parseFloat(match[3]);
      const a =
        match[4] !== undefined ? Math.round(parseFloat(match[4]) * 100) : 100;
      return { h, s, l, a };
    }
  }

  // 4. Fallback named colors
  const namedColors: Record<string, [number, number, number]> = {
    white: [0, 0, 100],
    black: [0, 0, 0],
    red: [0, 100, 50],
    blue: [240, 100, 50],
    green: [120, 100, 25],
    yellow: [60, 100, 50],
    gray: [0, 0, 50],
    transparent: [0, 0, 0],
  };

  if (namedColors[str]) {
    const [h, s, l] = namedColors[str];
    const a = str === "transparent" ? 0 : 100;
    return { h, s, l, a };
  }

  return defaultColor;
}

// Current target stroke
const targetStroke = computed(() => {
  props.version; // Force updates
  return props.target.stroke;
});

// Watch target stroke color changes to update sliders
watch(
  targetStroke,
  (newVal) => {
    const parsed = parseColor(newVal);
    // Prevent circular updates
    if (
      parsed.h !== hue.value ||
      parsed.s !== saturation.value ||
      parsed.l !== lightness.value ||
      parsed.a !== alpha.value
    ) {
      hue.value = parsed.h;
      saturation.value = parsed.s;
      lightness.value = parsed.l;
      alpha.value = parsed.a;
    }
  },
  { immediate: true },
);

// Watch local color sliders to emit stroke color changes
watch([hue, saturation, lightness, alpha], () => {
  const parsed = parseColor(props.target.stroke);
  if (
    hue.value !== parsed.h ||
    saturation.value !== parsed.s ||
    lightness.value !== parsed.l ||
    alpha.value !== parsed.a
  ) {
    const value = `hsla(${hue.value}, ${saturation.value}%, ${lightness.value}%, ${alpha.value / 100})`;
    emit("change", { key: "stroke", value });

    // If strokeWidth is 0, auto increase it to 2 to make border visible
    if (strokeWidthValue.value === 0) {
      emit("change", { key: "strokeWidth", value: 2 });
    }
  }
});

// Computed model-value for border width
const strokeWidthValue = computed({
  get() {
    props.version;
    const w = Number(props.target.strokeWidth);
    return Number.isFinite(w) ? Math.round(w) : 0;
  },
  set(val: number | null) {
    const w = val === null ? 0 : Math.round(val);
    
    // If setting width > 0 and stroke color is missing, set a default solid black border
    if (w > 0 && !props.target.stroke) {
      const defaultColor = `hsla(0, 0%, 0%, 1)`;
      hue.value = 0;
      saturation.value = 0;
      lightness.value = 0;
      alpha.value = 100;
      emit("change", { key: "stroke", value: defaultColor });
    }

    emit("change", { key: "strokeWidth", value: w });
  }
});

const swatchStyle = computed(() => {
  const w = strokeWidthValue.value;
  const strokeColor = props.target.stroke;
  
  if (w > 0 && strokeColor) {
    return {
      border: `2px solid ${strokeColor}`,
      backgroundColor: "transparent",
    };
  } else {
    // Show empty stroke placeholder
    return {
      border: "1px dashed var(--p-surface-400)",
      backgroundColor: "transparent",
      backgroundImage: "linear-gradient(45deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)",
    };
  }
});

const togglePanel = (event: Event) => {
  popoverRef.value?.toggle(event);
};
</script>

<style scoped lang="scss">
.border-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
  min-width: 60px;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--p-surface-100);
    border-color: var(--p-surface-300);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.border-preview-swatch {
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.swatch-inner {
  width: 100%;
  height: 100%;
  border-radius: 3px;
  transition: all 0.15s ease;
}

.border-width-preview {
  font-size: 9.5px;
  font-weight: 600;
  font-family: var(--font-family-mono);
  color: var(--text-primary);
}

.border-width-preview-none {
  font-size: 9.5px;
  font-weight: 500;
  color: var(--text-secondary);
}

.border-panel {
  width: 240px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-section-title {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--p-surface-600);
  margin-bottom: 2px;
}

.panel-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 6px 0;
}

.thickness-row {
  display: grid;
  grid-template-columns: 1fr 50px;
  align-items: center;
  gap: 8px;
}

.thickness-slider {
  min-width: 120px;
}

.thickness-input {
  width: 50px;
}

:deep(.p-inputnumber-input) {
  width: 50px;
  text-align: center;
  font-size: 11px;
  height: 24px;
  padding: 1px 2px;
}
</style>
