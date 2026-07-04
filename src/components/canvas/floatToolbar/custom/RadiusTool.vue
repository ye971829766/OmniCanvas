<template>
  <button
    type="button"
    class="radius-trigger"
    title="圆角"
    :disabled="disabled"
    @click="togglePanel"
  >
    <Spline :size="18" />
  </button>

  <Popover
    ref="popoverRef"
    append-to="body"
    :dismissable="true"
    :pt="popoverPt"
  >
    <div class="radius-panel">
      <span class="radius-label">圆角</span>
      <Slider
        :model-value="radiusValue"
        class="radius-slider"
        :min="0"
        :max="maxRadius"
        @update:model-value="setRadius"
      />
      <InputNumber
        :model-value="radiusValue"
        size="small"
        class="radius-input"
        :min="0"
        :max="maxRadius"
        @update:model-value="setRadius"
      />
    </div>
  </Popover>
</template>

<script setup lang="ts">
// import { Popover,Slider,InputNumber } from "primevue";

import { computed, ref, type PropType } from "vue";
import { Spline } from "lucide-vue-next";
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
const maxRadius = computed(() => {
  props.version;
  const width = Number(props.target.width);
  const height = Number(props.target.height);
  const shortestSide = Math.min(width || 400, height || 400);
  return Math.max(100, Math.round(shortestSide / 2));
});
const radiusValue = computed(() => {
  props.version;
  const value = Number(props.target.cornerRadius);
  return Number.isFinite(value) ? Math.round(value) : 0;
});

const togglePanel = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const setRadius = (value: number | number[] | null) => {
  if (typeof value !== "number") return;
  emit("change", { key: "cornerRadius", value: Math.round(value) });
};
</script>

<style scoped lang="scss">
.radius-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
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

.radius-panel {
  display: grid;
  grid-template-columns: auto 1fr 50px;
  align-items: center;
  gap: 8px;
  width: 210px;
}

.radius-label {
  color: var(--p-text-color);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.radius-slider {
  min-width: 120px;
}

.radius-input {
  width: 50px;
}

:deep(.p-inputnumber-input) {
  width: 50px;
  text-align: center;
  font-size: 11px;
}
</style>
