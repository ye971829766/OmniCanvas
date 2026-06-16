<template>
  <div>

  <button
    type="button"
    class="layout-trigger"
    :title="layoutTitle"
    :disabled="disabled"
    @click="togglePanel"
  >
    <component :is="layoutIcon" :size="16" />
    <ChevronDown :size="12" class="arrow-icon" />
  </button>

  <Popover
    ref="popoverRef"
    append-to="body"
    :dismissable="true"
    :pt="popoverPt"
  >
    <div class="layout-panel">
      <!-- Layout Mode Selection -->
      <div class="panel-section">
        <span class="section-label">布局模式</span>
        <div class="button-group">
          <button
            type="button"
            :class="['mode-btn', { active: currentFlow === false }]"
            title="自由布局"
            @click="setLayoutMode(false)"
          >
            <Layout :size="13" />
            <span>自由</span>
          </button>
          <button
            type="button"
            :class="['mode-btn', { active: currentFlow === 'x' }]"
            title="横向自动布局"
            @click="setLayoutMode('x')"
          >
            <Columns :size="13" />
            <span>横向</span>
          </button>
          <button
            type="button"
            :class="['mode-btn', { active: currentFlow === 'y' }]"
            title="纵向自动布局"
            @click="setLayoutMode('y')"
          >
            <Rows :size="13" />
            <span>纵向</span>
          </button>
        </div>
      </div>

      <!-- Advanced Auto Layout Settings (Only visible if flow is active) -->
      <template v-if="currentFlow !== false">
        <div class="divider"></div>

        <!-- Alignment -->
        <div class="panel-row">
          <span class="row-label">对齐方式</span>
          <Select
            :model-value="currentAlign"
            :options="alignOptions"
            option-label="label"
            option-value="value"
            class="align-select"
            @update:model-value="setAlign"
          />
        </div>

        <!-- Wrap -->
        <div class="panel-row">
          <span class="row-label">自动换行</span>
          <button
            type="button"
            :class="['wrap-toggle-btn', { active: currentWrap }]"
            @click="toggleWrap"
          >
            {{ currentWrap ? '开启' : '关闭' }}
          </button>
        </div>

        <!-- Gap -->
        <div class="panel-row">
          <span class="row-label">间距</span>
          <div class="slider-control">
            <Slider
              :model-value="currentGap"
              class="value-slider"
              :min="0"
              :max="100"
              @update:model-value="setGap"
            />
            <InputNumber
              :model-value="currentGap"
              size="small"
              class="value-input"
              :min="0"
              :max="100"
              @update:model-value="setGap"
            />
          </div>
        </div>

        <!-- Padding -->
        <div class="panel-row">
          <span class="row-label">内边距</span>
          <div class="slider-control">
            <Slider
              :model-value="currentPadding"
              class="value-slider"
              :min="0"
              :max="100"
              @update:model-value="setPadding"
            />
            <InputNumber
              :model-value="currentPadding"
              size="small"
              class="value-input"
              :min="0"
              :max="100"
              @update:model-value="setPadding"
            />
          </div>
        </div>
      </template>
    </div>
  </Popover>
  </div>

</template>

<script setup lang="ts">
// import { Popover, Slider, InputNumber, Select } from "primevue";
import { computed, ref, type PropType } from "vue";
import {
  Layout,
  Columns,
  Rows,
  ChevronDown,
} from "lucide-vue-next";
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
  change: [payload: ToolbarChangePayload];
}>();

const popoverRef = ref();
const popoverPt = {
  root: { class: "toolbar-popover-root" },
  content: { class: "toolbar-popover-content" },
};

const currentFlow = computed(() => {
  props.version;
  const val = props.target.flow;
  if (val === "x" || val === "y") return val;
  return false;
});

const currentAlign = computed(() => {
  props.version;
  return props.target.flowAlign ?? "top-left";
});

const currentWrap = computed(() => {
  props.version;
  return !!props.target.flowWrap;
});

const currentGap = computed(() => {
  props.version;
  const val = Number(props.target.gap);
  return Number.isFinite(val) ? val : 0;
});

const currentPadding = computed(() => {
  props.version;
  const val = Number(props.target.padding);
  return Number.isFinite(val) ? val : 0;
});

const layoutTitle = computed(() => {
  if (currentFlow.value === "x") return "横向自动布局";
  if (currentFlow.value === "y") return "纵向自动布局";
  return "自由布局";
});

const layoutIcon = computed(() => {
  if (currentFlow.value === "x") return Columns;
  if (currentFlow.value === "y") return Rows;
  return Layout;
});

const togglePanel = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const setLayoutMode = (mode: "x" | "y" | false) => {
  emit("change", { key: "flow", value: mode });
};

const setAlign = (value: string | null) => {
  if (!value) return;
  emit("change", { key: "flowAlign", value });
};

const toggleWrap = () => {
  emit("change", { key: "flowWrap", value: !currentWrap.value });
};

const setGap = (value: number | number[] | null) => {
  if (typeof value !== "number") return;
  emit("change", { key: "gap", value });
};

const setPadding = (value: number | number[] | null) => {
  if (typeof value !== "number") return;
  emit("change", { key: "padding", value });
};

const alignOptions = [
  { label: "左上对齐", value: "top-left" },
  { label: "上方居中", value: "top" },
  { label: "右上对齐", value: "top-right" },
  { label: "左对齐", value: "left" },
  { label: "居中对齐", value: "center" },
  { label: "右对齐", value: "right" },
  { label: "左下对齐", value: "bottom-left" },
  { label: "下方居中", value: "bottom" },
  { label: "右下对齐", value: "bottom-right" },
];
</script>

<style scoped lang="scss">
.layout-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 24px;
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--p-surface-800);
    background: var(--p-surface-100);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.arrow-icon {
  opacity: 0.7;
}

.layout-panel {
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: 230px;
  padding: 4px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label, .row-label {
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 500;
}

.button-group {
  display: flex;
  background: var(--zinc-100);
  padding: 2px;
  border-radius: 6px;
  gap: 2px;
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 22px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(.active) {
    color: var(--text-primary);
  }

  &.active {
    background: white;
    color: var(--brand-text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
}

.divider {
  height: 1px;
  background: var(--border-color);
}

.panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.align-select {
  flex: 1;
  max-width: 120px;
  height: 24px;
  font-size: 11px;
}

.wrap-toggle-btn {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--p-surface-400);
    color: var(--text-primary);
  }

  &.active {
    background: var(--blue-bg);
    color: var(--blue-text);
    border-color: transparent;
  }
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 140px;
}

.value-slider {
  flex: 1;
}

.value-input {
  width: 44px;
}

:deep(.p-inputnumber-input) {
  width: 44px;
  text-align: center;
  font-size: 11px;
  height: 24px;
  padding: 1px 2px;
}

:deep(.p-select) {
  height: 24px;
  font-size: 11px;
}
:deep(.p-select-label) {
  padding: 1px 6px;
  font-size: 11px;
  line-height: 20px;
}
</style>
