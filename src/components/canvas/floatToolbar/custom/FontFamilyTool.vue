<template>
  <button
    type="button"
    class="font-trigger"
    title="字体"
    :disabled="disabled"
    @click="togglePanel"
  >
    <span class="font-name-preview" :style="{ fontFamily: currentFont }">{{ currentFont }}</span>
    <ChevronDown :size="12" class="chevron-icon" />
  </button>

  <Popover
    ref="popoverRef"
    append-to="body"
    :dismissable="true"
    :pt="popoverPt"
  >
    <div class="font-panel">
      <div 
        v-for="font in fonts" 
        :key="font.value"
        :class="['font-item', { active: currentFont === font.value }]"
        :style="{ fontFamily: font.value }"
        @click="setFont(font.value)"
      >
        {{ font.label }}
      </div>
    </div>
  </Popover>
</template>

<script setup lang="ts">
// import { Popover } from "primevue";
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

const fonts = [
  { label: "Inter", value: "Inter" },
  { label: "Outfit", value: "Outfit" },
  { label: "Roboto", value: "Roboto" },
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
  { label: "Consolas", value: "Consolas" },
  { label: "Comic Sans", value: "Comic Sans MS" },
  { label: "Impact", value: "Impact" },
];

const currentFont = computed(() => {
  props.version; // Force reactivity
  return props.target.fontFamily || "Inter";
});

const togglePanel = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const setFont = (value: string) => {
  emit("change", { key: "fontFamily", value });
  popoverRef.value?.hide();
};
</script>

<style scoped lang="scss">
.font-trigger {
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
  min-width: 68px;
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

.font-name-preview {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.font-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 120px;
  max-height: 200px;
  overflow-y: auto;
  padding: 2px;
}

.font-item {
  padding: 4.5px 8px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  color: var(--text-primary);
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--p-surface-100);
    color: var(--text-primary);
  }

  &.active {
    background: var(--p-primary-100);
    color: var(--blue-text);
    font-weight: 600;
  }
}
</style>
