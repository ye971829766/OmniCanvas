<template>
  <div>
    <button
      type="button"
      class="layout-trigger"
      :title="layoutTitle"
      :disabled="disabled || !canArrange"
      @click="togglePanel"
    >
      <Layers :size="16" />
      <ChevronDown :size="12" class="arrow-icon" />
    </button>

    <Popover
      ref="popoverRef"
      append-to="body"
      :dismissable="true"
      :pt="popoverPt"
    >
      <div class="arrangement-panel">
        <div class="panel-section">
          <span class="section-label">对齐</span>
          <div class="icon-grid">
            <button
              v-for="action in alignActions"
              :key="action.key"
              type="button"
              class="icon-btn"
              :title="action.title"
              :disabled="!canArrange"
              @click="action.run"
            >
              <component :is="action.icon" :size="15" />
            </button>
          </div>
        </div>

        <div class="divider"></div>

        <div class="panel-section">
          <span class="section-label">分布</span>
          <div class="icon-grid two-columns">
            <button
              v-for="action in distributeActions"
              :key="action.key"
              type="button"
              class="icon-btn"
              :title="action.title"
              :disabled="!canDistribute"
              @click="action.run"
            >
              <component :is="action.icon" :size="15" />
            </button>
          </div>
        </div>

        <div class="divider"></div>

        <div class="panel-section">
          <span class="section-label">层级</span>
          <div class="text-button-group">
            <button
              v-for="action in layerActions"
              :key="action.key"
              type="button"
              class="text-btn"
              :title="action.title"
              :disabled="!canArrange"
              @click="action.run"
            >
              <component :is="action.icon" :size="13" />
              <span>{{ action.title }}</span>
            </button>
          </div>
        </div>
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
// import { Popover } from "primevue";
import { computed, ref, type Component, type PropType } from "vue";
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceBetween,
  BringToFront,
  ChevronDown,
  Layers,
  SendToBack,
} from "lucide-vue-next";
import type {
  ToolbarChangePayload,
  ToolbarItem,
  ToolbarTarget,
} from "../types";

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BoundsItem = {
  el: ToolbarTarget;
  bounds: Bounds;
};

type ActionItem = {
  key: string;
  title: string;
  icon: Component;
  run: () => void;
};

type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
type DistributeMode = "horizontal" | "vertical";
type LayerMode = "front" | "back";

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

const selectedElements = computed<ToolbarTarget[]>(() => {
  props.version;
  const fromTarget = props.target.selectedList;
  const fromEditor = props.target.editor?.list;
  const list = Array.isArray(fromTarget)
    ? fromTarget
    : Array.isArray(fromEditor)
      ? fromEditor
      : [];

  return list.filter((el) => normalizeBounds(el?.worldBoxBounds));
});

const selectedBounds = computed<BoundsItem[]>(() => {
  props.version;
  return selectedElements.value
    .map((el) => ({ el, bounds: normalizeBounds(el.worldBoxBounds) }))
    .filter((item): item is BoundsItem => !!item.bounds);
});

const groupBounds = computed<Bounds | null>(() => {
  const items = selectedBounds.value;
  if (!items.length) return null;

  const minX = Math.min(...items.map((item) => item.bounds.x));
  const minY = Math.min(...items.map((item) => item.bounds.y));
  const maxX = Math.max(
    ...items.map((item) => item.bounds.x + item.bounds.width),
  );
  const maxY = Math.max(
    ...items.map((item) => item.bounds.y + item.bounds.height),
  );

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
});

const canArrange = computed(() => selectedBounds.value.length > 1);
const canDistribute = computed(() => selectedBounds.value.length > 2);

const layoutTitle = computed(() => {
  const count = selectedElements.value.length;
  return count > 1 ? `布局与排列（${count}个）` : "布局与排列";
});

const alignActions: ActionItem[] = [
  {
    key: "left",
    title: "左对齐",
    icon: AlignHorizontalJustifyStart,
    run: () => align("left"),
  },
  {
    key: "center",
    title: "水平居中",
    icon: AlignHorizontalJustifyCenter,
    run: () => align("center"),
  },
  {
    key: "right",
    title: "右对齐",
    icon: AlignHorizontalJustifyEnd,
    run: () => align("right"),
  },
  {
    key: "top",
    title: "顶部对齐",
    icon: AlignVerticalJustifyStart,
    run: () => align("top"),
  },
  {
    key: "middle",
    title: "垂直居中",
    icon: AlignVerticalJustifyCenter,
    run: () => align("middle"),
  },
  {
    key: "bottom",
    title: "底部对齐",
    icon: AlignVerticalJustifyEnd,
    run: () => align("bottom"),
  },
];

const distributeActions: ActionItem[] = [
  {
    key: "horizontal",
    title: "水平等距分布",
    icon: AlignHorizontalSpaceBetween,
    run: () => distribute("horizontal"),
  },
  {
    key: "vertical",
    title: "垂直等距分布",
    icon: AlignVerticalSpaceBetween,
    run: () => distribute("vertical"),
  },
];

const layerActions: ActionItem[] = [
  {
    key: "front",
    title: "置顶",
    icon: BringToFront,
    run: () => arrangeLayer("front"),
  },
  {
    key: "back",
    title: "置底",
    icon: SendToBack,
    run: () => arrangeLayer("back"),
  },
];

function togglePanel(event: Event) {
  if (props.disabled || !canArrange.value) return;
  popoverRef.value?.toggle(event);
}

function align(mode: AlignMode) {
  const box = groupBounds.value;
  if (!box || !canArrange.value) return;

  selectedBounds.value.forEach(({ el, bounds }) => {
    let dx = 0;
    let dy = 0;

    if (mode === "left") dx = box.x - bounds.x;
    if (mode === "center") {
      dx = box.x + box.width / 2 - (bounds.x + bounds.width / 2);
    }
    if (mode === "right") {
      dx = box.x + box.width - (bounds.x + bounds.width);
    }
    if (mode === "top") dy = box.y - bounds.y;
    if (mode === "middle") {
      dy = box.y + box.height / 2 - (bounds.y + bounds.height / 2);
    }
    if (mode === "bottom") {
      dy = box.y + box.height - (bounds.y + bounds.height);
    }

    moveElement(el, dx, dy);
  });

  afterArrange(`align:${mode}`);
}

function distribute(mode: DistributeMode) {
  if (!canDistribute.value) return;

  const axis = mode === "horizontal" ? "x" : "y";
  const sizeKey = mode === "horizontal" ? "width" : "height";
  const items = [...selectedBounds.value].sort(
    (a, b) => a.bounds[axis] - b.bounds[axis],
  );
  const first = items[0];
  const last = items[items.length - 1];
  const start = first.bounds[axis];
  const end = last.bounds[axis] + last.bounds[sizeKey];
  const totalSize = items.reduce((sum, item) => sum + item.bounds[sizeKey], 0);
  const gap = (end - start - totalSize) / (items.length - 1);
  let cursor = start;

  items.forEach(({ el, bounds }) => {
    const delta = cursor - bounds[axis];
    moveElement(el, mode === "horizontal" ? delta : 0, mode === "vertical" ? delta : 0);
    cursor += bounds[sizeKey] + gap;
  });

  afterArrange(`distribute:${mode}`);
}

function arrangeLayer(mode: LayerMode) {
  if (!canArrange.value) return;

  const elements = selectedElements.value;
  const selectedSet = new Set(elements);
  const parents = [...new Set(elements.map((el) => el.parent).filter(Boolean))];

  parents.forEach((parent) => {
    const children = Array.isArray(parent.children) ? parent.children : [];
    const selectedInParent = children.filter((child: ToolbarTarget) =>
      selectedSet.has(child),
    );
    if (!selectedInParent.length) return;

    selectedInParent.forEach((el: ToolbarTarget) => parent.remove?.(el));

    if (mode === "front") {
      selectedInParent.forEach((el: ToolbarTarget) => parent.add?.(el));
    } else if (typeof parent.addAt === "function") {
      selectedInParent.forEach((el: ToolbarTarget, index: number) =>
        parent.addAt(el, index),
      );
    } else {
      selectedInParent.forEach((el: ToolbarTarget) => parent.add?.(el));
    }
  });

  props.target.editor?.select?.(elements);
  afterArrange(`layer:${mode}`);
}

function moveElement(el: ToolbarTarget, dx: number, dy: number) {
  if (!dx && !dy) return;

  if (typeof el.moveWorld === "function") {
    el.moveWorld(dx, dy);
  } else if (typeof el.move === "function") {
    el.move(dx, dy);
  } else if (typeof el.set === "function") {
    el.set({ x: Number(el.x ?? 0) + dx, y: Number(el.y ?? 0) + dy });
  } else {
    el.x = Number(el.x ?? 0) + dx;
    el.y = Number(el.y ?? 0) + dy;
  }
}

function afterArrange(action: string) {
  props.target.editor?.updateEditBox?.();
  props.target.editor?.update?.();
  props.target.updateToolbarPosition?.();
  emit("change", { key: "layoutAndArrangement", value: action });
}

function normalizeBounds(bounds: unknown): Bounds | null {
  const data = bounds as Partial<Bounds> | null | undefined;
  if (!data) return null;

  const x = Number(data.x);
  const y = Number(data.y);
  const width = Number(data.width);
  const height = Number(data.height);

  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}
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

.arrangement-panel {
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: 180px;
  padding: 4px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 500;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.two-columns {
  grid-template-columns: repeat(2, 1fr);
}

.icon-btn,
.text-btn {
  border: 0;
  border-radius: 4px;
  color: var(--text-secondary);
  background: var(--p-surface-50);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--p-surface-900);
    background: var(--p-surface-100);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
}

.text-button-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.text-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 500;
}

.divider {
  height: 1px;
  background: var(--border-color);
}
</style>
