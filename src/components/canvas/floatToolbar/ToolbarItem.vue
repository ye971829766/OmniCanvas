<template>
  <div v-if="item.type === 'divider'" class="h-4 w-px bg-surface-200" />

  <button
    v-else-if="item.type === 'button'"
    type="button"
    :title="item.label"
    class="toolbar-icon-button"
    :disabled="isDisabled"
    @click="$emit('action', { action: item.action })"
  >
    <component :is="buttonIcon" :size="18" />
  </button>

  <label
    v-else-if="item.type === 'color'"
    class="toolbar-color-button"
    :title="item.label"
    :style="{ backgroundColor: colorValue }"
  >
    <input
      class="sr-only"
      type="color"
      :value="colorValue"
      :disabled="isDisabled"
      @input="emitColor"
    />
  </label>

  <input
    v-else-if="item.type === 'number'"
    :value="numberValue"
    class="toolbar-number-input"
    :title="item.label"
    :min="item.min"
    :max="item.max"
    :step="item.step ?? 1"
    :disabled="isDisabled"
    @keydown.stop
    type="number"
    @change="emitNumber"
  />

  <component
    :is="item.component"
    v-else-if="item.type === 'custom'"
    :target="target"
    :item="item"
    :disabled="isDisabled"
    :version="version"
    @change="$emit('change', $event)"
    @action="$emit('action', $event)"
  />
</template>

<script setup lang="ts">
import { computed, type PropType } from "vue";
import type {
  ToolbarActionPayload,
  ToolbarChangePayload,
  ToolbarItem,
  ToolbarTarget,
} from "./types";

const props = defineProps({
  item: {
    type: Object as PropType<ToolbarItem>,
    required: true,
  },
  target: {
    type: Object as PropType<ToolbarTarget>,
    required: true,
  },
  version: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits<{
  action: [payload: ToolbarActionPayload];
  change: [payload: ToolbarChangePayload];
}>();

const buttonIcon = computed(() => {
  props.version; // 追踪版本变化以刷新图标
  if (props.item.type !== "button") return null;
  return props.item.reactiveIcon?.(props.target) ?? props.item.icon;
});

const isDisabled = computed(() => {
  return "disabled" in props.item && props.item.disabled
    ? props.item.disabled(props.target)
    : false;
});

const colorValue = computed(() => {
  props.version;
  if (props.item.type !== "color") return "#000000";
  const value = props.target[props.item.key];
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : (props.item.fallback ?? "#000000");
});

const numberValue = computed(() => {
  props.version;
  if (props.item.type !== "number") return "0";
  const value = Number(props.target[props.item.key]);
  if (!Number.isFinite(value)) return "0";
  return formatNumberValue(value);
});

const emitColor = (event: Event) => {
  if (props.item.type !== "color") return;
  const input = event.target as HTMLInputElement;
  emitChange(props.item.key, input.value);
};

const emitNumber = (event: Event) => {
  if (props.item.type !== "number") return;
  const input = event.target as HTMLInputElement;
  const value = formatNumberValue(Number(input.value));
  if (!Number.isFinite(value)) return;
  emitChange(props.item.key, value);
};

const formatNumberValue = (value: number) => {
  if (props.item.type !== "number") return value;
  if (typeof props.item.precision !== "number") return value;
  const factor = 10 ** props.item.precision;
  return Math.round(value * factor) / factor;
};

const emitChange = (key: string, value: unknown) => {
  emit("change", { key, value });
};
</script>

<style scoped lang="scss">
.toolbar-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4.5px;
  border: 0;
  border-radius: 4px;
  color: var(--text-secondary);
  background: transparent;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: var(--p-surface-800);
    background: var(--p-surface-50);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.toolbar-color-button {
  width: 20px;
  height: 20px;
  border: 1px solid var(--p-surface-300);
  border-radius: 999px;
  overflow: hidden;
  transition: transform 0.15s ease;
  cursor: pointer;

  &:hover {
    transform: scale(1.05);
  }
}

.toolbar-number-input {
  width: 50px;
  height: 24px;
  padding: 1px 3px;
  border: 1px solid var(--p-surface-200);
  border-radius: 4px;
  color: var(--p-text-color);
  background: var(--p-surface-0);
  text-align: center;
  font-size: 11px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}
</style>
