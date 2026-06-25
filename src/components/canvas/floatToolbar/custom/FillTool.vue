<template>
  <button
    type="button"
    class="fill-trigger"
    title="填充"
    :disabled="disabled"
    @click="togglePanel"
  >
    <span class="color-swatch" :style="swatchStyle"></span>
  </button>

  <Popover
    ref="popoverRef"
    append-to="body"
    :dismissable="true"
    :pt="popoverPt"
  >
    <div class="fill-panel">
      <ColorSlider
        v-model:hue="hue"
        v-model:saturation="saturation"
        v-model:lightness="lightness"
        v-model:alpha="alpha"
      />
    </div>
  </Popover>
</template>

<script setup lang="ts">
// import { Popover } from "primevue";
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

// Local slider values
const hue = ref(45);
const saturation = ref(100);
const lightness = ref(50);
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
function parseColor(fill: any): { h: number; s: number; l: number; a: number } {
  const defaultColor = { h: 0, s: 100, l: 50, a: 0 }; // Default transparent
  const val = typeof fill === "function" ? fill.toString() : fill;
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

// Current target fill
const targetColor = computed(() => {
  props.version; // Force updates
  return props.target.fill;
});

// Watch target changes to update sliders
watch(
  targetColor,
  (newVal) => {
    let parsed = parseColor(newVal);

    // If fill is undefined/null/empty and target has a stroke, use stroke HSL as fallback but set alpha to 0
    if ((newVal === undefined || newVal === null || newVal === "") && props.target.stroke) {
      const parsedStroke = parseColor(props.target.stroke);
      parsed = {
        h: parsedStroke.h,
        s: parsedStroke.s,
        l: parsedStroke.l,
        a: 0, // Keep alpha 0 (transparent)
      };
    }

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

// Watch sliders to emit canvas changes
watch([hue, saturation, lightness, alpha], () => {
  const parsed = parseColor(props.target.fill);

  // If the target currently has no fill (parsed.a === 0) and local alpha is also 0,
  // we don't want to emit a new fill color (which would apply a transparent fill color value).
  if (parsed.a === 0 && alpha.value === 0) {
    return;
  }

  if (
    hue.value !== parsed.h ||
    saturation.value !== parsed.s ||
    lightness.value !== parsed.l ||
    alpha.value !== parsed.a
  ) {
    const value = `hsla(${hue.value}, ${saturation.value}%, ${lightness.value}%, ${alpha.value / 100})`;
    emit("change", { key: "fill", value });
  }
});

const solidColor = computed(() => {
  return `hsla(${hue.value}, ${saturation.value}%, ${lightness.value}%, ${alpha.value / 100})`;
});

const swatchStyle = computed(() => {
  if (alpha.value > 0) {
    return {
      backgroundColor: solidColor.value,
    };
  } else {
    return {
      backgroundColor: "#ffffff",
      backgroundImage: "linear-gradient(45deg, transparent 45%, #ef4444 45%, #ef4444 55%, transparent 55%)",
    };
  }
});

const togglePanel = (event: Event) => {
  popoverRef.value?.toggle(event);
};
</script>

<style scoped lang="scss">
.fill-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 30px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--p-surface-100);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.fill-icon {
  flex-shrink: 0;
}

.color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.fill-panel {
  width: 240px;
  padding: 2px;
}
</style>
