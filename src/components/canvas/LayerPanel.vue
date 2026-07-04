<template>
  <div>
    <!-- Floating Layer Panel Toggle Button -->
    <div class="absolute left-20px bottom-3 z-40">
      <Button
        rounded
        text
        title="图层管理"
        style="
          width: 32px;
          height: 32px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        "
        @click="togglePopover"
      >
        <LayersIcon :size="16" />
      </Button>
    </div>

    <!-- PrimeVue Layer Panel Popover -->
    <Popover ref="popoverRef" class="layer-popover" style="width: 300px">
      <div style="width: 100%">
        <div class="layer-popover-header">图层管理</div>
        <div class="layer-list-container">
          <div v-if="layersList.length === 0" class="empty-state">
            无图层元素
          </div>
          <div
            v-for="layer in layersList"
            :key="layer.innerId"
            :class="['layer-item', { active: selectedId === layer.innerId }]"
            :style="{ paddingLeft: (layer.depth * 14 + 10) + 'px' }"
            @click="selectLayerOnCanvas(layer)"
            @dblclick="focusElementOnCanvas(layer)"
          >
            <!-- Reorder buttons -->
            <div class="layer-actions-left">
              <button
                class="reorder-btn"
                :disabled="!canMoveUp(layer)"
                title="上移一层"
                @click.stop="moveLayerUp(layer)"
              >
                <ChevronUp :size="12" />
              </button>
              <button
                class="reorder-btn"
                :disabled="!canMoveDown(layer)"
                title="下移一层"
                @click.stop="moveLayerDown(layer)"
              >
                <ChevronDown :size="12" />
              </button>
            </div>

            <!-- Collapse Toggle for Containers -->
            <span
              v-if="layer.hasChildren"
              class="collapse-toggle-btn"
              @click.stop="toggleCollapse(layer)"
            >
              <ChevronDown v-if="!isCollapsed(layer)" :size="12" />
              <ChevronRight v-else :size="12" />
            </span>
            <span v-else class="collapse-spacer"></span>

            <!-- Element Type Icon -->
            <div class="layer-type-icon">
              <component :is="getLayerIcon(layer)" :size="14" />
            </div>

            <!-- Editable Label -->
            <div class="layer-name-wrapper">
              <input
                v-if="renamingId === layer.innerId"
                v-model="renameValue"
                class="layer-rename-input"
                @blur="finishRename(layer)"
                @keydown.enter="finishRename(layer)"
                @keydown.escape="cancelRename"
                @click.stop
                ref="renameInput"
              />
              <span
                v-else
                class="layer-name-text"
                @dblclick.stop="startRename(layer)"
                title="双击重命名"
              >
                {{ getLayerName(layer) }}
              </span>
            </div>

            <!-- Actions -->
            <div class="layer-actions-right">
              <button
                class="action-btn"
                :class="{ 'is-active': layer.visible === false }"
                :title="layer.visible === false ? '显示' : '隐藏'"
                @click.stop="toggleLayerVisibility(layer)"
              >
                <EyeOff v-if="layer.visible === false" :size="14" />
                <Eye v-else :size="14" />
              </button>
              <button
                class="action-btn"
                :class="{ 'is-active': layer.locked }"
                :title="layer.locked ? '解锁' : '锁定'"
                @click.stop="toggleLayerLock(layer)"
              >
                <Lock v-if="layer.locked" :size="14" />
                <Unlock v-else :size="14" />
              </button>
              <button
                class="action-btn delete"
                title="删除"
                @click.stop="deleteLayer(layer)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, toRaw, type PropType } from "vue";

// // PrimeVue components
// import Drawer from "primevue/drawer";
// import Button from "primevue/button";

// Lucide icons
import {
  Layers as LayersIcon,
  Square,
  Video,
  Type,
  Frame,
  Minus,
  Star,
  Circle,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Boxes,
} from "lucide-vue-next";

// Leafer UI types/events
import { ChildEvent, PropertyEvent, App } from "leafer-ui";
import { EditorEvent } from "@leafer-in/editor";

const props = defineProps({
  canvasApp: {
    type: Object as PropType<App | null>,
    default: null,
  },
  recordHistoryDebounced: {
    type: Function as PropType<(delay?: number) => void>,
    required: true,
  },
});

// Layer panel state
const popoverRef = ref();
const layersList = ref<any[]>([]);
const selectedId = ref<number | null>(null);
const collapsedStates = ref<Record<number, boolean>>({});

const renamingId = ref<number | null>(null);
const renameValue = ref("");

const togglePopover = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const getRawNode = (layer: any) => {
  return toRaw(layer?.node || layer);
};

// Layer names and icons getters
const getLayerName = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return "";
  if (rawLayer.name) return rawLayer.name;
  switch (rawLayer.tag || rawLayer.__tag) {
    case "Rect":
      return "矩形元素";
    case "VideoNode":
      return "视频元素";
    case "Text":
      return "文本元素";
    case "Frame":
      return "画板容器";
    case "Line":
      return "线段元素";
    case "Star":
      return "星形元素";
    case "Ellipse":
      return "椭圆元素";
    case "Group":
      return "编组容器";
    default:
      return `${rawLayer.tag || "未命名图层"}`;
  }
};

const getLayerIcon = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return Square;
  switch (rawLayer.tag || rawLayer.__tag) {
    case "Rect":
      return Square;
    case "VideoNode":
      return Video;
    case "Text":
      return Type;
    case "Frame":
      return Frame;
    case "Line":
      return Minus;
    case "Star":
      return Star;
    case "Ellipse":
      return Circle;
    case "Group":
      return Boxes;
    default:
      return Square;
  }
};

// Reorder layer checks
const canMoveUp = (layer: any) => {
  const rawLayer = getRawNode(layer);
  const parent = rawLayer?.parent;
  if (!parent) return false;
  const children = parent.children;
  const idx = children.indexOf(rawLayer);
  return idx < children.length - 1;
};

const canMoveDown = (layer: any) => {
  const rawLayer = getRawNode(layer);
  const parent = rawLayer?.parent;
  if (!parent) return false;
  const children = parent.children;
  const idx = children.indexOf(rawLayer);
  return idx > 0;
};

// Reorder layers
const moveLayerUp = (layer: any) => {
  if (!props.canvasApp) return;
  const rawLayer = getRawNode(layer);
  const parent = rawLayer.parent;
  if (!parent) return;

  const children = parent.children;
  const idx = children.indexOf(rawLayer);
  if (idx < children.length - 1) {
    (props.canvasApp as any).isReordering = true;
    try {
      parent.remove(rawLayer);
      parent.addAt(rawLayer, idx + 1);
      props.canvasApp.editor.select(rawLayer);
      props.recordHistoryDebounced(0);
    } finally {
      (props.canvasApp as any).isReordering = false;
    }
  }
};

const moveLayerDown = (layer: any) => {
  if (!props.canvasApp) return;
  const rawLayer = getRawNode(layer);
  const parent = rawLayer.parent;
  if (!parent) return;

  const children = parent.children;
  const idx = children.indexOf(rawLayer);
  if (idx > 0) {
    (props.canvasApp as any).isReordering = true;
    try {
      parent.remove(rawLayer);
      parent.addAt(rawLayer, idx - 1);
      props.canvasApp.editor.select(rawLayer);
      props.recordHistoryDebounced(0);
    } finally {
      (props.canvasApp as any).isReordering = false;
    }
  }
};

const toggleCollapse = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return;
  collapsedStates.value[rawLayer.innerId] = !collapsedStates.value[rawLayer.innerId];
  updateLayers();
};

const isCollapsed = (layer: any) => {
  const rawLayer = getRawNode(layer);
  return rawLayer ? !!collapsedStates.value[rawLayer.innerId] : false;
};

const expandAncestors = (node: any) => {
  const app = props.canvasApp;
  if (!app?.tree) return;
  let current = node?.parent;
  while (current && current !== app.tree) {
    collapsedStates.value[current.innerId] = false;
    current = current.parent;
  }
};

// Visibility, lock, and delete operations
const toggleLayerVisibility = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return;
  rawLayer.visible = rawLayer.visible === false ? true : false;
  if (rawLayer.visible === false && props.canvasApp?.editor.hasItem(rawLayer)) {
    props.canvasApp.editor.cancel();
  }
  props.recordHistoryDebounced(0);
  updateLayers();
};

const toggleLayerLock = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return;
  rawLayer.locked = !rawLayer.locked;
  if (rawLayer.locked && props.canvasApp?.editor.hasItem(rawLayer)) {
    props.canvasApp.editor.cancel();
  }
  props.recordHistoryDebounced(0);
  updateLayers();
};

const deleteLayer = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return;
  if (
    (rawLayer.tag === "VideoNode" || rawLayer.__tag === "VideoNode") &&
    typeof rawLayer.removeVideoLayer === "function"
  ) {
    rawLayer.removeVideoLayer();
  }
  rawLayer.remove();
  if (props.canvasApp?.editor.hasItem(rawLayer)) {
    props.canvasApp.editor.cancel();
  }
  props.recordHistoryDebounced(0);
  updateLayers();
};

// Selection tracking
const selectLayerOnCanvas = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return;
  if (props.canvasApp && props.canvasApp.editor) {
    if (rawLayer.visible !== false) {
      props.canvasApp.editor.select(rawLayer);
      selectedId.value = rawLayer.innerId;
    }
  }
};

let focusTimeoutId: any = null;

const focusElementOnCanvas = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return;
  if (props.canvasApp && props.canvasApp.tree) {
    if (focusTimeoutId) {
      clearTimeout(focusTimeoutId);
    }

    // Zoom viewport to focus on the double-clicked layer (takes 0.8s)
    (props.canvasApp.tree as any).zoom(rawLayer, 100, undefined, 0.8);

    selectLayerOnCanvas(rawLayer);

    // After the zoom transition finishes (0.8s), trigger SELECT event to update the toolbar position
    focusTimeoutId = setTimeout(() => {
      if (props.canvasApp && props.canvasApp.editor) {
        props.canvasApp.editor.emit(EditorEvent.SELECT);
      }
      focusTimeoutId = null;
    }, 850);
  }
};

// Renaming
const startRename = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer) return;
  renamingId.value = rawLayer.innerId;
  renameValue.value = getLayerName(rawLayer);
  nextTick(() => {
    const el = document.querySelector(
      ".layer-rename-input",
    ) as HTMLInputElement;
    el?.focus();
    el?.select();
  });
};

const finishRename = (layer: any) => {
  const rawLayer = getRawNode(layer);
  if (!rawLayer || renamingId.value !== rawLayer.innerId) return;
  const newName = renameValue.value.trim();
  if (newName) {
    rawLayer.name = newName;
    props.recordHistoryDebounced(0);
    updateLayers();
  }
  renamingId.value = null;
};

const cancelRename = () => {
  renamingId.value = null;
};

const updateLayers = () => {
  const app = props.canvasApp;
  if (!app?.tree) return;
  const treeRoot = app.tree;

  const result: any[] = [];

  function traverse(node: any, depth = 0) {
    if (node === treeRoot) {
      if (node.children) {
        const reversed = [...node.children].reverse();
        reversed.forEach((child) => traverse(child, depth));
      }
      return;
    }

    // Skip helper / simulate nodes
    if (
      node.tag === "SimulateElement" ||
      node.__tag === "SimulateElement" ||
      node.className === "Editor"
    ) {
      return;
    }

    const isContainer = node.tag === "Frame" || node.__tag === "Frame" || node.tag === "Group" || node.__tag === "Group";
    const hasChildren = isContainer && node.children && node.children.length > 0;

    const nodeItem = {
      innerId: node.innerId,
      refId: node.refId,
      node: node,
      tag: node.tag || node.__tag,
      name: node.name,
      visible: node.visible,
      locked: node.locked,
      depth: depth,
      parent: node.parent,
      children: hasChildren ? node.children : [],
      hasChildren: hasChildren,
    };

    result.push(nodeItem);

    const collapsed = !!collapsedStates.value[node.innerId];
    if (!collapsed && hasChildren) {
      const reversed = [...node.children].reverse();
      reversed.forEach((child) => traverse(child, depth + 1));
    }
  }

  traverse(app.tree);
  layersList.value = result;
};

const updateSelection = () => {
  const app = props.canvasApp;
  if (!app?.editor) return;
  if (app.editor.list.length === 1) {
    const selectedNode = app.editor.list[0];
    selectedId.value = selectedNode.innerId;
    expandAncestors(selectedNode);
    updateLayers();
  } else {
    selectedId.value = null;
  }
};

const onPropertyChangeGlobal = (e: any) => {
  if (
    e.propertyName === "name" ||
    e.propertyName === "visible" ||
    e.propertyName === "locked"
  ) {
    updateLayers();
  }
};

// Watch canvasApp to initialize tree and selection listeners
watch(
  () => props.canvasApp,
  (app, oldApp) => {
    if (oldApp) {
      try {
        oldApp.tree.off(ChildEvent.ADD, updateLayers);
        oldApp.tree.off(ChildEvent.REMOVE, updateLayers);
        oldApp.off(PropertyEvent.CHANGE, onPropertyChangeGlobal);
        oldApp.editor.off(EditorEvent.SELECT, updateSelection);
      } catch (err) {
        console.warn("Error cleaning up canvas listeners in LayerPanel:", err);
      }
    }
    if (!app) return;

    // Listen for children add/remove and property changes
    app.tree.on(ChildEvent.ADD, updateLayers);
    app.tree.on(ChildEvent.REMOVE, updateLayers);
    app.on(PropertyEvent.CHANGE, onPropertyChangeGlobal);

    // Listen for editor select changes
    app.editor.on(EditorEvent.SELECT, updateSelection);

    // Initial load
    updateLayers();
    updateSelection();
  },
  { immediate: true },
);
</script>

<style scoped>
.layer-list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.layer-popover-header {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.8rem;
  padding: 24px 0;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--p-surface-0);
  border: 1px solid var(--p-surface-200);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.layer-item:hover {
  background: var(--p-surface-50);
  border-color: var(--p-surface-300);
}

.layer-item.active {
  background: var(--p-surface-100);
  border-color: var(--p-primary-color);
}

.layer-actions-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.layer-item:hover .layer-actions-left,
.layer-item.active .layer-actions-left {
  opacity: 1;
}

.reorder-btn {
  background: none;
  border: none;
  padding: 1px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  transition: all 0.15s ease;
}

.reorder-btn:hover:not(:disabled) {
  background: var(--p-surface-200);
  color: var(--p-text-color);
}

.reorder-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.collapse-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 16px;
  height: 16px;
  color: var(--p-text-muted-color);
  border-radius: 4px;
  transition: all 0.2s ease;
}

.collapse-toggle-btn:hover {
  background: var(--p-surface-100);
  color: var(--p-text-color);
}

.collapse-spacer {
  width: 16px;
  height: 16px;
  display: inline-block;
  flex-shrink: 0;
}

.layer-type-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--brand-text);
  opacity: 0.85;
}

.layer-name-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.layer-name-text {
  font-size: 0.78rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.layer-rename-input {
  width: 100%;
  font-size: 0.78rem;
  font-weight: 500;
  padding: 1px 3px;
  border: 1px solid var(--p-primary-color);
  border-radius: 3px;
  outline: none;
  background: var(--p-surface-0);
}

.layer-actions-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  background: none;
  border: none;
  padding: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
  opacity: 0;
}

.layer-item:hover .action-btn,
.layer-item.active .action-btn {
  opacity: 0.5;
}

.layer-item .action-btn.is-active {
  opacity: 1;
  color: var(--p-primary-color);
}

.layer-item .action-btn:hover {
  opacity: 1 !important;
  background: var(--p-surface-100);
  color: var(--p-surface-700);
}

.layer-item .action-btn.delete:hover {
  background: #fef2f2;
  color: var(--accent-error);
}
</style>

<style>
/* Global overrides for teleported PrimeVue Popover elements */
.layer-popover {
  box-shadow: 0 10px 25px -10px rgba(0, 0, 0, 0.08) !important;
}

.layer-popover .p-popover-content {
  padding: 8px 12px !important;
}
</style>
