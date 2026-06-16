<template>
  <button
    type="button"
    class="size-trigger"
    title="字号"
    :disabled="disabled"
    @click="togglePanel"
  >
    <span class="size-number-preview">{{ fontSizeValue }}</span>
    <ChevronDown :size="12" class="chevron-icon" />
  </button>

  <Popover
    ref="popoverRef"
    append-to="body"
    :dismissable="true"
    :pt="popoverPt"
  >
    <div class="size-panel">
      <span class="size-label">字号</span>
      <Slider
        :model-value="fontSizeValue"
        class="size-slider"
        :min="10"
        :max="120"
        @update:model-value="setFontSize"
      />
      <InputNumber
        :model-value="fontSizeValue"
        size="small"
        class="size-input"
        :min="10"
        :max="120"
        @update:model-value="setFontSize"
      />
    </div>
  </Popover>
</template>

<script setup lang="ts">
// import { Popover, Slider, InputNumber } from "primevue";
import { computed, ref, type PropType } from "vue";
import { ChevronDown } from "lucide-vue-next";
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

const fontSizeValue = computed(() => {
  props.version; // Force updates
  const value = Number(props.target.fontSize);
  return Number.isFinite(value) ? Math.round(value) : 24;
});

const togglePanel = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const setFontSize = (value: number | number[] | null) => {
  if (typeof value !== "number") return;
  emit("change", { key: "fontSize", value: Math.round(value) });
};
</script>

<style scoped lang="scss">
.size-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 24px;
  padding: 0 4px 0 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
  min-width: 44px;
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

.size-number-preview {
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-family-mono);
}

.chevron-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.size-panel {
  display: grid;
  grid-template-columns: auto 1fr 50px;
  align-items: center;
  gap: 8px;
  width: 210px;
}

.size-label {
  color: var(--p-surface-800);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.size-slider {
  min-width: 120px;
}

.size-input {
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
