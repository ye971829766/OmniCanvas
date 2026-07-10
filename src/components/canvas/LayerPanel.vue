<template>
  <div class="layer-panel-host">
    <div class="layer-toggle-wrapper">
      <Button
        rounded
        text
        title="图层"
        :class="{ active: panelOpen }"
        @click="panelOpen = !panelOpen"
      >
        <LayersIcon :size="16" />
      </Button>
    </div>

    <Transition name="layer-panel">
      <aside
        v-if="panelOpen"
        ref="panelRef"
        class="layer-panel"
        :style="{ width: `${panelWidth}px` }"
        aria-label="图层面板"
      >
        <header class="layer-panel-header">
          <div class="layer-panel-title">
            <ListTree :size="15" />
            <span>图层</span>
            <span class="layer-count">{{ totalLayers }}</span>
          </div>
          <div class="header-actions">
            <button
              class="icon-button"
              type="button"
              title="全部展开"
              @click="expandAll"
            >
              <ChevronsDown :size="15" />
            </button>
            <button
              class="icon-button"
              type="button"
              title="全部收起"
              @click="collapseAll"
            >
              <ChevronsUp :size="15" />
            </button>
            <button
              class="icon-button"
              type="button"
              title="关闭图层面板"
              @click="panelOpen = false"
            >
              <X :size="15" />
            </button>
          </div>
        </header>

        <div class="layer-search-wrap">
          <Search :size="14" class="search-icon" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="layer-search-input"
            type="search"
            placeholder="搜索图层"
            aria-label="搜索图层"
            @keydown.escape="clearSearch"
          />
          <button
            v-if="searchQuery"
            class="search-clear-button"
            type="button"
            title="清除搜索"
            @click="clearSearch"
          >
            <X :size="13" />
          </button>
        </div>

        <div class="layer-command-bar">
          <button
            class="command-button"
            type="button"
            title="编组 (Ctrl+G)"
            :disabled="!canGroup"
            @click="groupSelected"
          >
            <GroupIcon :size="15" />
          </button>
          <button
            class="command-button"
            type="button"
            title="取消编组 (Ctrl+Shift+G)"
            :disabled="!canUngroup"
            @click="ungroupSelected"
          >
            <Ungroup :size="15" />
          </button>
          <span class="command-divider"></span>
          <button
            class="command-button"
            type="button"
            title="移到顶层"
            :disabled="selectedCount === 0"
            @click="bringSelectedToFront"
          >
            <BringToFront :size="15" />
          </button>
          <button
            class="command-button"
            type="button"
            title="移到底层"
            :disabled="selectedCount === 0"
            @click="sendSelectedToBack"
          >
            <SendToBack :size="15" />
          </button>
          <span class="command-spacer"></span>
          <span v-if="selectedCount" class="selection-count">
            已选 {{ selectedCount }}
          </span>
        </div>

        <div
          ref="treeRef"
          class="layer-tree"
          role="tree"
          tabindex="0"
          @keydown="handleTreeKeydown"
          @click.self="clearSelection"
        >
          <div v-if="layersList.length === 0" class="empty-state">
            <Search v-if="searchQuery" :size="20" />
            <LayersIcon v-else :size="20" />
            <span>{{ searchQuery ? "没有匹配图层" : "画布中暂无图层" }}</span>
          </div>

          <div
            v-for="layer in layersList"
            :key="layer.id"
            class="layer-row"
            :class="{
              selected: selectedIds.has(layer.id),
              focused: focusedId === layer.id,
              hidden: layer.effectivelyHidden,
              locked: layer.effectivelyLocked,
              dragging: draggingIds.has(layer.id),
              'drop-above': dropTargetId === layer.id && dropMode === 'above',
              'drop-inside': dropTargetId === layer.id && dropMode === 'inside',
              'drop-below': dropTargetId === layer.id && dropMode === 'below',
            }"
            :style="{ '--layer-depth': layer.depth }"
            :data-layer-id="layer.id"
            role="treeitem"
            :aria-level="layer.depth + 1"
            :aria-selected="selectedIds.has(layer.id)"
            :aria-expanded="
              layer.isContainer ? !collapsedIds.has(layer.id) : undefined
            "
            draggable="true"
            @click="handleRowClick($event, layer)"
            @dblclick="focusLayerOnCanvas(layer)"
            @contextmenu.prevent="openContextMenu($event, layer)"
            @dragstart="handleDragStart($event, layer)"
            @dragover="handleDragOver($event, layer)"
            @dragleave="handleDragLeave($event, layer)"
            @drop="handleDrop($event, layer)"
            @dragend="clearDragState"
          >
            <GripVertical class="drag-handle" :size="13" />

            <button
              v-if="layer.isContainer"
              class="disclosure-button"
              type="button"
              :title="collapsedIds.has(layer.id) ? '展开' : '收起'"
              @click.stop="toggleCollapsed(layer)"
            >
              <ChevronRight
                :size="14"
                :class="[
                  'disclosure-icon',
                  { expanded: !collapsedIds.has(layer.id) },
                ]"
              />
            </button>
            <span v-else class="disclosure-spacer"></span>

            <component
              :is="getLayerIcon(layer)"
              class="layer-type-icon"
              :size="14"
            />

            <div class="layer-name-wrap">
              <input
                v-if="renamingId === layer.id"
                ref="renameInputRef"
                v-model="renameValue"
                class="layer-rename-input"
                @blur="finishRename(layer)"
                @keydown.enter.prevent="finishRename(layer)"
                @keydown.escape.prevent="cancelRename"
                @click.stop
                @dblclick.stop
              />
              <span
                v-else
                class="layer-name"
                :title="layer.name"
                @dblclick.stop="startRename(layer)"
              >
                {{ layer.name }}
              </span>
              <span v-if="layer.hasChildren" class="child-count">
                {{ layer.childCount }}
              </span>
            </div>

            <div class="row-actions">
              <button
                class="row-action-button"
                :class="{ active: !layer.visible }"
                type="button"
                :title="layer.visible ? '隐藏' : '显示'"
                @click.stop="toggleLayerVisibility(layer)"
              >
                <Eye v-if="layer.visible" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
              <button
                class="row-action-button"
                :class="{ active: layer.locked }"
                type="button"
                :title="layer.locked ? '解锁' : '锁定'"
                @click.stop="toggleLayerLock(layer)"
              >
                <Lock v-if="layer.locked" :size="14" />
                <Unlock v-else :size="14" />
              </button>
            </div>
          </div>
        </div>

        <footer class="layer-panel-footer">
          <span class="footer-status">
            {{
              searchQuery
                ? `${layersList.length} 个结果`
                : `${totalLayers} 个图层`
            }}
          </span>
          <div class="footer-actions">
            <button
              class="icon-button"
              type="button"
              title="定位到选中图层"
              :disabled="selectedCount !== 1"
              @click="focusSelectedLayer"
            >
              <LocateFixed :size="15" />
            </button>
            <button
              class="icon-button"
              type="button"
              title="切换选中图层可见性"
              :disabled="selectedCount === 0"
              @click="toggleSelectedVisibility"
            >
              <Eye :size="15" />
            </button>
            <button
              class="icon-button"
              type="button"
              title="切换选中图层锁定"
              :disabled="selectedCount === 0"
              @click="toggleSelectedLock"
            >
              <Lock :size="15" />
            </button>
            <button
              class="icon-button danger"
              type="button"
              title="删除选中图层"
              :disabled="selectedCount === 0"
              @click="deleteSelectedLayers"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </footer>

        <div
          class="panel-resize-handle"
          title="拖动调整宽度"
          @pointerdown="startPanelResize"
        ></div>
      </aside>
    </Transition>

    <Teleport to="body">
      <div
        v-if="contextMenu.open"
        class="layer-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @pointerdown.stop
        @contextmenu.prevent
      >
        <button type="button" @click="renameContextLayer">
          <Pencil :size="14" />
          <span>重命名</span>
          <kbd>F2</kbd>
        </button>
        <button type="button" @click="focusSelectedLayer">
          <LocateFixed :size="14" />
          <span>定位到画布</span>
        </button>
        <div class="context-divider"></div>
        <button type="button" :disabled="!canGroup" @click="groupSelected">
          <GroupIcon :size="14" />
          <span>编组</span>
          <kbd>Ctrl G</kbd>
        </button>
        <button type="button" :disabled="!canUngroup" @click="ungroupSelected">
          <Ungroup :size="14" />
          <span>取消编组</span>
        </button>
        <button type="button" @click="bringSelectedToFront">
          <BringToFront :size="14" />
          <span>移到顶层</span>
        </button>
        <button type="button" @click="sendSelectedToBack">
          <SendToBack :size="14" />
          <span>移到底层</span>
        </button>
        <div class="context-divider"></div>
        <button type="button" @click="toggleSelectedVisibility">
          <Eye :size="14" />
          <span>切换可见性</span>
        </button>
        <button type="button" @click="toggleSelectedLock">
          <Lock :size="14" />
          <span>切换锁定</span>
        </button>
        <button class="danger" type="button" @click="deleteSelectedLayers">
          <Trash2 :size="14" />
          <span>删除</span>
          <kbd>Del</kbd>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  watch,
  type Component,
  type PropType,
} from "vue";
import {
  Box as BoxIcon,
  BringToFront,
  ChevronsDown,
  ChevronsUp,
  ChevronRight,
  Circle,
  Clapperboard,
  Frame,
  GripVertical,
  Group as GroupIcon,
  Image as ImageIcon,
  Layers as LayersIcon,
  ListTree,
  LocateFixed,
  Lock,
  Minus,
  PenTool,
  Pencil,
  Search,
  SendToBack,
  Shapes,
  Sparkles,
  Square,
  Star,
  Trash2,
  Type,
  Ungroup,
  Unlock,
  Video,
  Eye,
  EyeOff,
  X,
} from "lucide-vue-next";
import { ChildEvent, PropertyEvent, type App } from "leafer-ui";
import { EditorEvent } from "@leafer-in/editor";
import {
  buildLayerTree,
  getLayerDisplayName,
  getLayerDropIndex,
  getLayerNodeId,
  getLayerSelectionRange,
  getLayerTag,
  hasLayerAncestorInSet,
  isLayerContainer,
  isLayerDescendant,
  moveLayerNodesWithRollback,
  type LayerDropMode,
  type LayerTreeItem,
} from "@/utils/layerTree";

const props = defineProps({
  canvasApp: {
    type: Object as PropType<App | null>,
    default: null,
  },
  recordHistoryDebounced: {
    type: Function as PropType<(delay?: number) => void>,
    required: true,
  },
  workspaceId: {
    type: [String, Number] as PropType<string | number | null>,
    default: null,
  },
});

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 460;
const PANEL_OPEN_KEY = "omnicanvas:layer-panel:open";
const PANEL_WIDTH_KEY = "omnicanvas:layer-panel:width";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is optional; the panel still works without persistence.
  }
}

const storedWidth = Number(readStorage(PANEL_WIDTH_KEY));
const panelOpen = ref(readStorage(PANEL_OPEN_KEY) === "true");
const panelWidth = ref(
  Number.isFinite(storedWidth)
    ? Math.min(Math.max(storedWidth, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH)
    : 320,
);
const panelRef = ref<HTMLElement | null>(null);
const treeRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const renameInputRef = ref<HTMLInputElement | null>(null);

const searchQuery = ref("");
const layersList = ref<LayerTreeItem[]>([]);
const layerMap = ref(new Map<string, LayerTreeItem>());
const totalLayers = ref(0);
const selectedIds = ref<Set<string>>(new Set());
const focusedId = ref<string | null>(null);
const selectionAnchorId = ref<string | null>(null);
const collapsedIds = ref<Set<string>>(new Set());
const renamingId = ref<string | null>(null);
const renameValue = ref("");

const draggingIds = ref<Set<string>>(new Set());
const dropTargetId = ref<string | null>(null);
const dropMode = ref<LayerDropMode | null>(null);
let dragExpandTimer: ReturnType<typeof setTimeout> | null = null;

const contextMenu = ref({
  open: false,
  x: 0,
  y: 0,
  targetId: null as string | null,
});

const selectedCount = computed(() => selectedIds.value.size);
const selectedNodes = computed(() =>
  [...selectedIds.value]
    .map((id) => layerMap.value.get(id)?.node)
    .filter((node) => !!node?.parent),
);
const canGroup = computed(() => selectedNodes.value.length > 1);
const canUngroup = computed(() =>
  selectedNodes.value.some((node) => getLayerTag(node) === "Group"),
);

function workspaceCollapseKey() {
  return `omnicanvas:layer-panel:collapsed:${props.workspaceId ?? "default"}`;
}

function loadCollapsedState() {
  const stored = readStorage(workspaceCollapseKey());
  if (!stored) {
    collapsedIds.value = new Set();
    return;
  }
  try {
    const ids = JSON.parse(stored);
    collapsedIds.value = new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    collapsedIds.value = new Set();
  }
}

function persistCollapsedState() {
  writeStorage(workspaceCollapseKey(), JSON.stringify([...collapsedIds.value]));
}

function getRawNode(layer: LayerTreeItem | any) {
  return toRaw(layer?.node || layer);
}

function ensureStableLayerIds(node: any) {
  if (!node || node.isCropOverlay || node.isTaskOverlay) return;
  if (!node.__historyId) {
    node.__historyId = `layer_${node.innerId}_${Math.random().toString(36).slice(2, 7)}`;
  }
  if (isLayerContainer(node) && node.children?.length) {
    node.children.forEach(ensureStableLayerIds);
  }
}

function updateLayers() {
  const app = props.canvasApp;
  if (!app?.tree) {
    layersList.value = [];
    layerMap.value = new Map();
    totalLayers.value = 0;
    return;
  }
  app.tree.children.forEach(ensureStableLayerIds);
  const result = buildLayerTree(
    app.tree,
    collapsedIds.value,
    searchQuery.value,
  );
  layersList.value = result.items;
  layerMap.value = result.byId;
  totalLayers.value = result.total;
}

let refreshRafId: number | null = null;
function scheduleLayerRefresh() {
  if (refreshRafId !== null) return;
  refreshRafId = requestAnimationFrame(() => {
    refreshRafId = null;
    updateLayers();
  });
}

function expandNodeAncestors(node: any) {
  const app = props.canvasApp;
  if (!app?.tree) return;
  const next = new Set(collapsedIds.value);
  let current = node?.parent;
  let changed = false;
  while (current && current !== app.tree) {
    const id = getLayerNodeId(current);
    if (next.delete(id)) changed = true;
    current = current.parent;
  }
  if (changed) {
    collapsedIds.value = next;
    persistCollapsedState();
  }
}

function scrollLayerIntoView(id: string) {
  if (!panelOpen.value) return;
  nextTick(() => {
    const rows =
      treeRef.value?.querySelectorAll<HTMLElement>("[data-layer-id]");
    const row = rows
      ? [...rows].find((element) => element.dataset.layerId === id)
      : null;
    row?.scrollIntoView({ block: "nearest" });
  });
}

function updateSelectionFromCanvas() {
  const app = props.canvasApp;
  const editorList = app?.editor?.list || [];
  const nextIds = new Set<string>();
  editorList.forEach((node: any) => {
    const id = getLayerNodeId(node);
    if (id) {
      nextIds.add(id);
      expandNodeAncestors(node);
    }
  });
  selectedIds.value = nextIds;
  const firstId = nextIds.values().next().value as string | undefined;
  if (firstId) {
    focusedId.value = firstId;
    selectionAnchorId.value = firstId;
    updateLayers();
    scrollLayerIntoView(firstId);
  } else {
    focusedId.value = null;
  }
}

function applyCanvasSelection(ids: Iterable<string>) {
  const app = props.canvasApp;
  if (!app?.editor) return;
  const nextIds = new Set(ids);
  const nodes = [...nextIds]
    .map((id) => layerMap.value.get(id)?.node)
    .filter((node) => !!node?.parent);
  if (nodes.length) app.editor.select(nodes);
  else app.editor.cancel();
  selectedIds.value = new Set(nodes.map(getLayerNodeId));
}

function clearSelection() {
  applyCanvasSelection([]);
  focusedId.value = null;
  selectionAnchorId.value = null;
}

function handleRowClick(event: MouseEvent, layer: LayerTreeItem) {
  treeRef.value?.focus({ preventScroll: true });
  focusedId.value = layer.id;

  if (event.shiftKey && selectionAnchorId.value) {
    const range = getLayerSelectionRange(
      layersList.value,
      selectionAnchorId.value,
      layer.id,
    );
    const next =
      event.ctrlKey || event.metaKey
        ? new Set([...selectedIds.value, ...range])
        : new Set(range);
    applyCanvasSelection(next);
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    const next = new Set(selectedIds.value);
    if (next.has(layer.id)) next.delete(layer.id);
    else next.add(layer.id);
    applyCanvasSelection(next);
    selectionAnchorId.value = layer.id;
    return;
  }

  applyCanvasSelection([layer.id]);
  selectionAnchorId.value = layer.id;
}

function selectLayerByKeyboard(layer: LayerTreeItem) {
  focusedId.value = layer.id;
  selectionAnchorId.value = layer.id;
  applyCanvasSelection([layer.id]);
  scrollLayerIntoView(layer.id);
}

function toggleCollapsed(layer: LayerTreeItem) {
  if (!layer.isContainer) return;
  const next = new Set(collapsedIds.value);
  if (next.has(layer.id)) next.delete(layer.id);
  else next.add(layer.id);
  collapsedIds.value = next;
  persistCollapsedState();
  updateLayers();
}

function expandAll() {
  collapsedIds.value = new Set();
  persistCollapsedState();
  updateLayers();
}

function collapseAll() {
  collapsedIds.value = new Set(
    [...layerMap.value.values()]
      .filter((layer) => layer.isContainer && layer.hasChildren)
      .map((layer) => layer.id),
  );
  persistCollapsedState();
  updateLayers();
}

function clearSearch() {
  if (searchQuery.value) searchQuery.value = "";
  else searchInputRef.value?.blur();
}

const iconMap: Record<string, Component> = {
  Box: BoxIcon,
  Ellipse: Circle,
  Frame,
  Group: GroupIcon,
  Image: ImageIcon,
  ImageGen: Sparkles,
  Line: Minus,
  Path: PenTool,
  Pen: PenTool,
  Polygon: Shapes,
  Rect: Square,
  Star,
  Text: Type,
  VideoGen: Clapperboard,
  VideoNode: Video,
};

function getLayerIcon(layer: LayerTreeItem) {
  return iconMap[layer.tag] || Square;
}

function startRename(layer: LayerTreeItem) {
  applyCanvasSelection([layer.id]);
  renamingId.value = layer.id;
  renameValue.value = getLayerDisplayName(layer.node);
  contextMenu.value.open = false;
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
}

function finishRename(layer: LayerTreeItem) {
  if (renamingId.value !== layer.id) return;
  const node = getRawNode(layer);
  const previousName = typeof node.name === "string" ? node.name : "";
  const nextName = renameValue.value.trim();
  renamingId.value = null;
  if (nextName === previousName) return;
  node.name = nextName;
  props.recordHistoryDebounced(0);
  scheduleLayerRefresh();
}

function cancelRename() {
  renamingId.value = null;
  renameValue.value = "";
  treeRef.value?.focus({ preventScroll: true });
}

function focusLayerOnCanvas(layer: LayerTreeItem) {
  const app = props.canvasApp;
  const node = getRawNode(layer);
  if (!app?.tree || !node || node.visible === false) return;
  (app.tree as any).zoom(node, 100, undefined, 0.35);
  applyCanvasSelection([layer.id]);
}

function focusSelectedLayer() {
  const id = selectedIds.value.values().next().value as string | undefined;
  const layer = id ? layerMap.value.get(id) : null;
  if (layer && selectedCount.value === 1) focusLayerOnCanvas(layer);
  contextMenu.value.open = false;
}

function cleanUpNode(node: any) {
  if (node?.children) [...node.children].forEach(cleanUpNode);
  if (
    getLayerTag(node) === "VideoNode" &&
    typeof node.removeVideoLayer === "function"
  ) {
    node.removeVideoLayer();
  }
}

function getTopLevelCommandNodes(nodes = selectedNodes.value) {
  const app = props.canvasApp;
  if (!app?.tree) return [];
  const set = new Set(nodes);
  return nodes.filter((node) => !hasLayerAncestorInSet(node, set, app.tree));
}

function afterLayerMutation(selectNodes?: any[]) {
  const app = props.canvasApp;
  if (selectNodes && app?.editor) {
    const alive = selectNodes.filter((node) => !!node?.parent);
    if (alive.length) app.editor.select(alive);
    else app.editor.cancel();
  }
  props.recordHistoryDebounced(0);
  contextMenu.value.open = false;
  scheduleLayerRefresh();
}

function toggleNodesVisibility(nodes: any[]) {
  if (!nodes.length) return;
  const shouldShow = nodes.every((node) => node.visible === false);
  nodes.forEach((node) => (node.visible = shouldShow));
  if (!shouldShow && props.canvasApp?.editor) {
    const remaining = selectedNodes.value.filter(
      (node) => node.visible !== false,
    );
    if (remaining.length) props.canvasApp.editor.select(remaining);
    else props.canvasApp.editor.cancel();
  }
  afterLayerMutation();
}

function toggleNodesLock(nodes: any[]) {
  if (!nodes.length) return;
  const shouldUnlock = nodes.every((node) => node.locked === true);
  nodes.forEach((node) => (node.locked = !shouldUnlock));
  if (!shouldUnlock && props.canvasApp?.editor) {
    const remaining = selectedNodes.value.filter(
      (node) => node.locked !== true,
    );
    if (remaining.length) props.canvasApp.editor.select(remaining);
    else props.canvasApp.editor.cancel();
  }
  afterLayerMutation();
}

function toggleLayerVisibility(layer: LayerTreeItem) {
  toggleNodesVisibility([getRawNode(layer)]);
}

function toggleLayerLock(layer: LayerTreeItem) {
  toggleNodesLock([getRawNode(layer)]);
}

function toggleSelectedVisibility() {
  toggleNodesVisibility(getTopLevelCommandNodes());
}

function toggleSelectedLock() {
  toggleNodesLock(getTopLevelCommandNodes());
}

function deleteSelectedLayers() {
  const nodes = getTopLevelCommandNodes();
  if (!nodes.length) return;
  props.canvasApp?.editor?.cancel();
  nodes.forEach((node) => {
    cleanUpNode(node);
    node.remove();
  });
  selectedIds.value = new Set();
  focusedId.value = null;
  afterLayerMutation();
}

function groupSelected() {
  const app = props.canvasApp;
  const nodes = getTopLevelCommandNodes();
  if (!app?.editor || nodes.length < 2) return;
  app.editor.select(nodes);
  const group = app.editor.group();
  if (group) app.editor.select(group as any);
  afterLayerMutation(group ? [group as any] : undefined);
}

function ungroupSelected() {
  const app = props.canvasApp;
  if (!app?.editor) return;
  const groups = selectedNodes.value.filter(
    (node) => getLayerTag(node) === "Group",
  );
  if (!groups.length) return;
  app.editor.select(groups);
  const children = app.editor.ungroup();
  afterLayerMutation(children);
}

function bringSelectedToFront() {
  const app = props.canvasApp;
  const nodes = getTopLevelCommandNodes();
  if (!app?.editor || !nodes.length) return;
  app.editor.select(nodes);
  app.editor.toTop();
  afterLayerMutation(nodes);
}

function sendSelectedToBack() {
  const app = props.canvasApp;
  const nodes = getTopLevelCommandNodes();
  if (!app?.editor || !nodes.length) return;
  app.editor.select(nodes);
  app.editor.toBottom();
  afterLayerMutation(nodes);
}

function openContextMenu(event: MouseEvent, layer: LayerTreeItem) {
  if (!selectedIds.value.has(layer.id)) {
    applyCanvasSelection([layer.id]);
    selectionAnchorId.value = layer.id;
  }
  focusedId.value = layer.id;
  const width = 210;
  const height = 330;
  contextMenu.value = {
    open: true,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    targetId: layer.id,
  };
}

function renameContextLayer() {
  const layer = contextMenu.value.targetId
    ? layerMap.value.get(contextMenu.value.targetId)
    : null;
  if (layer) startRename(layer);
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!contextMenu.value.open) return;
  const target = event.target;
  if (target instanceof Element && target.closest(".layer-context-menu"))
    return;
  contextMenu.value.open = false;
}

function getDragSourceLayers(layer: LayerTreeItem) {
  const candidateIds = selectedIds.value.has(layer.id)
    ? [...selectedIds.value]
    : [layer.id];
  const visibleIds = new Set(layersList.value.map((item) => item.id));
  const candidates = candidateIds
    .filter((id) => visibleIds.has(id))
    .map((id) => layerMap.value.get(id))
    .filter((item): item is LayerTreeItem => !!item?.node?.parent);
  const candidateNodes = new Set(candidates.map((item) => item.node));
  return candidates.filter(
    (item) =>
      !hasLayerAncestorInSet(item.node, candidateNodes, props.canvasApp?.tree),
  );
}

function isValidDrop(
  sources: LayerTreeItem[],
  target: LayerTreeItem,
  mode: LayerDropMode,
) {
  if (!sources.length || sources.some((source) => source.id === target.id)) {
    return false;
  }
  const newParent = mode === "inside" ? target.node : target.node?.parent;
  if (!newParent || (mode === "inside" && !target.isContainer)) return false;
  return !sources.some(
    (source) =>
      newParent === source.node || isLayerDescendant(newParent, source.node),
  );
}

function handleDragStart(event: DragEvent, layer: LayerTreeItem) {
  if (renamingId.value) {
    event.preventDefault();
    return;
  }
  if (!selectedIds.value.has(layer.id)) {
    applyCanvasSelection([layer.id]);
    selectionAnchorId.value = layer.id;
  }
  const sources = getDragSourceLayers(layer);
  draggingIds.value = new Set(sources.map((source) => source.id));
  event.dataTransfer?.setData("text/plain", layer.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event: DragEvent, target: LayerTreeItem) {
  const sources = [...draggingIds.value]
    .map((id) => layerMap.value.get(id))
    .filter((item): item is LayerTreeItem => !!item);
  if (!sources.length) return;

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
  let nextMode: LayerDropMode;
  if (target.isContainer && ratio >= 0.25 && ratio <= 0.75) {
    nextMode = "inside";
  } else {
    nextMode = ratio < 0.5 ? "above" : "below";
  }
  if (!isValidDrop(sources, target, nextMode)) return;

  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  dropTargetId.value = target.id;
  dropMode.value = nextMode;

  if (
    nextMode === "inside" &&
    target.isContainer &&
    collapsedIds.value.has(target.id) &&
    !dragExpandTimer
  ) {
    dragExpandTimer = setTimeout(() => {
      const next = new Set(collapsedIds.value);
      next.delete(target.id);
      collapsedIds.value = next;
      persistCollapsedState();
      updateLayers();
      dragExpandTimer = null;
    }, 600);
  }
}

function handleDragLeave(event: DragEvent, layer: LayerTreeItem) {
  const current = event.currentTarget as HTMLElement;
  if (
    event.relatedTarget instanceof Node &&
    current.contains(event.relatedTarget)
  ) {
    return;
  }
  if (dropTargetId.value === layer.id) {
    dropTargetId.value = null;
    dropMode.value = null;
  }
}

function moveDraggedLayers(target: LayerTreeItem, mode: LayerDropMode) {
  const app = props.canvasApp;
  if (!app?.tree) return;
  const sources = [...draggingIds.value]
    .map((id) => layerMap.value.get(id))
    .filter((item): item is LayerTreeItem => !!item?.node?.parent);
  if (!isValidDrop(sources, target, mode)) return;

  const newParent = mode === "inside" ? target.node : target.node.parent;
  const movingNodes = new Set(sources.map((source) => source.node));
  const visibleIndex = new Map(
    layersList.value.map((item, index) => [item.id, index]),
  );
  const orderedSources = [...sources].sort(
    (a, b) => (visibleIndex.get(b.id) ?? -1) - (visibleIndex.get(a.id) ?? -1),
  );
  const insertionIndex =
    mode === "inside"
      ? newParent.children.length
      : getLayerDropIndex(newParent.children, target.node, mode, movingNodes);
  const moved = moveLayerNodesWithRollback(
    app,
    orderedSources.map((source) => source.node),
    newParent,
    insertionIndex,
  );
  if (!moved) {
    scheduleLayerRefresh();
    return;
  }

  if (mode === "inside") {
    const next = new Set(collapsedIds.value);
    next.delete(target.id);
    collapsedIds.value = next;
    persistCollapsedState();
  }
  afterLayerMutation(orderedSources.map((source) => source.node));
}

function handleDrop(event: DragEvent, target: LayerTreeItem) {
  event.preventDefault();
  if (dropTargetId.value === target.id && dropMode.value) {
    moveDraggedLayers(target, dropMode.value);
  }
  clearDragState();
}

function clearDragState() {
  if (dragExpandTimer) {
    clearTimeout(dragExpandTimer);
    dragExpandTimer = null;
  }
  draggingIds.value = new Set();
  dropTargetId.value = null;
  dropMode.value = null;
}

function handleTreeKeydown(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement) return;
  const items = layersList.value;
  if (!items.length) return;
  const currentId = focusedId.value || selectedIds.value.values().next().value;
  const currentIndex = Math.max(
    0,
    items.findIndex((item) => item.id === currentId),
  );
  const current = items[currentIndex];

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    event.stopPropagation();
    applyCanvasSelection(items.map((item) => item.id));
    return;
  }

  switch (event.key) {
    case "ArrowUp":
      event.preventDefault();
      event.stopPropagation();
      selectLayerByKeyboard(items[Math.max(0, currentIndex - 1)]);
      break;
    case "ArrowDown":
      event.preventDefault();
      event.stopPropagation();
      selectLayerByKeyboard(
        items[Math.min(items.length - 1, currentIndex + 1)],
      );
      break;
    case "ArrowRight":
      if (current.isContainer && collapsedIds.value.has(current.id)) {
        event.preventDefault();
        toggleCollapsed(current);
      } else if (items[currentIndex + 1]?.depth > current.depth) {
        event.preventDefault();
        selectLayerByKeyboard(items[currentIndex + 1]);
      }
      break;
    case "ArrowLeft":
      if (current.isContainer && !collapsedIds.value.has(current.id)) {
        event.preventDefault();
        toggleCollapsed(current);
      } else if (current.parentId) {
        const parent = layerMap.value.get(current.parentId);
        if (parent) {
          event.preventDefault();
          selectLayerByKeyboard(parent);
        }
      }
      break;
    case "Enter":
    case "F2":
      event.preventDefault();
      event.stopPropagation();
      startRename(current);
      break;
    case "Delete":
    case "Backspace":
      event.preventDefault();
      event.stopPropagation();
      deleteSelectedLayers();
      break;
    case "Escape":
      contextMenu.value.open = false;
      cancelRename();
      break;
  }
}

let resizeStartX = 0;
let resizeStartWidth = 0;
function startPanelResize(event: PointerEvent) {
  event.preventDefault();
  resizeStartX = event.clientX;
  resizeStartWidth = panelWidth.value;
  document.body.classList.add("layer-panel-resizing");
  window.addEventListener("pointermove", resizePanel);
  window.addEventListener("pointerup", stopPanelResize, { once: true });
}

function resizePanel(event: PointerEvent) {
  const availableWidth = Math.max(
    PANEL_MIN_WIDTH,
    (panelRef.value?.parentElement?.clientWidth || window.innerWidth) - 32,
  );
  panelWidth.value = Math.min(
    Math.max(resizeStartWidth + event.clientX - resizeStartX, PANEL_MIN_WIDTH),
    Math.min(PANEL_MAX_WIDTH, availableWidth),
  );
}

function stopPanelResize() {
  window.removeEventListener("pointermove", resizePanel);
  document.body.classList.remove("layer-panel-resizing");
  writeStorage(PANEL_WIDTH_KEY, String(Math.round(panelWidth.value)));
}

function onPropertyChange(event: any) {
  if (
    event.propertyName === "name" ||
    event.propertyName === "visible" ||
    event.propertyName === "locked"
  ) {
    scheduleLayerRefresh();
  }
}

function setupListeners(app: App) {
  if (!app.tree || !app.editor) return;
  app.tree.on(ChildEvent.ADD, scheduleLayerRefresh);
  app.tree.on(ChildEvent.REMOVE, scheduleLayerRefresh);
  app.on(PropertyEvent.CHANGE, onPropertyChange);
  app.editor.on(EditorEvent.SELECT, updateSelectionFromCanvas);
}

function cleanupListeners(app: App) {
  if (!app.tree || !app.editor) return;
  app.tree.off(ChildEvent.ADD, scheduleLayerRefresh);
  app.tree.off(ChildEvent.REMOVE, scheduleLayerRefresh);
  app.off(PropertyEvent.CHANGE, onPropertyChange);
  app.editor.off(EditorEvent.SELECT, updateSelectionFromCanvas);
}

watch(panelOpen, (open) => {
  writeStorage(PANEL_OPEN_KEY, String(open));
  if (open) {
    updateLayers();
    updateSelectionFromCanvas();
  } else {
    contextMenu.value.open = false;
    cancelRename();
  }
});

watch(searchQuery, updateLayers);

watch(
  () => props.workspaceId,
  () => {
    loadCollapsedState();
    updateLayers();
  },
  { immediate: true },
);

watch(
  () => props.canvasApp,
  (app, oldApp) => {
    if (oldApp) cleanupListeners(oldApp);
    selectedIds.value = new Set();
    if (app) setupListeners(app);
    updateLayers();
    updateSelectionFromCanvas();
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  window.removeEventListener("pointermove", resizePanel);
  if (refreshRafId !== null) cancelAnimationFrame(refreshRafId);
  if (dragExpandTimer) clearTimeout(dragExpandTimer);
  if (props.canvasApp) cleanupListeners(props.canvasApp);
  document.body.classList.remove("layer-panel-resizing");
});
</script>

<style scoped>
.layer-panel-host {
  position: absolute;
  inset: 0;
  z-index: 70;
  pointer-events: none;
}

.layer-toggle-wrapper {
  position: absolute;
  left: 20px;
  bottom: 11px;
  z-index: 2;
  pointer-events: auto;
}

.layer-toggle-button {
  width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.layer-toggle-button.active {
  color: var(--p-primary-color) !important;
  background: var(--p-surface-100) !important;
}

.layer-panel {
  position: absolute;
  top: 64px;
  bottom: 80px;
  left: 12px;
  min-width: 280px;
  max-width: min(460px, calc(100% - 32px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  background: color-mix(in srgb, var(--surface-panel) 96%, transparent);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.layer-panel-header,
.layer-panel-footer,
.layer-command-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.layer-panel-header {
  height: 40px;
  justify-content: space-between;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--border-color);
}

.layer-panel-title,
.header-actions,
.footer-actions {
  display: flex;
  align-items: center;
}

.layer-panel-title {
  gap: 7px;
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.layer-count {
  min-width: 20px;
  padding: 1px 6px;
  color: var(--text-secondary);
  background: var(--p-surface-100);
  border-radius: 999px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.header-actions,
.footer-actions {
  gap: 2px;
}

.icon-button,
.command-button,
.row-action-button,
.disclosure-button,
.search-clear-button {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-button,
.command-button {
  width: 28px;
  height: 28px;
  border-radius: 5px;
}

.icon-button:hover:not(:disabled),
.command-button:hover:not(:disabled),
.row-action-button:hover,
.disclosure-button:hover,
.search-clear-button:hover {
  color: var(--text-primary);
  background: var(--p-surface-100);
}

.icon-button:disabled,
.command-button:disabled {
  opacity: 0.35;
  cursor: default;
}

.icon-button.danger:hover:not(:disabled) {
  color: var(--accent-error);
  background: color-mix(in srgb, var(--accent-error) 10%, transparent);
}

.layer-search-wrap {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 38px;
  margin: 8px 8px 6px;
}

.search-icon {
  position: absolute;
  left: 9px;
  color: var(--text-secondary);
  pointer-events: none;
}

.layer-search-input {
  width: 100%;
  height: 32px;
  padding: 0 30px 0 30px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  background: var(--p-surface-50);
  color: var(--text-primary);
  font-size: 12px;
}

.layer-search-input:focus {
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--p-primary-color) 14%, transparent);
}

.search-clear-button {
  position: absolute;
  right: 5px;
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.layer-command-bar {
  min-height: 34px;
  gap: 2px;
  padding: 2px 8px 6px;
  border-bottom: 1px solid var(--border-color);
}

.command-divider {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--border-color);
}

.command-spacer {
  flex: 1;
}

.selection-count {
  color: var(--text-secondary);
  font-size: 10px;
  white-space: nowrap;
}

.layer-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0 8px;
  outline: none;
  scrollbar-width: thin;
}

.layer-tree:focus-visible {
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--p-primary-color) 50%, transparent);
}

.layer-row {
  --indent: calc(var(--layer-depth) * 16px);
  position: relative;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 6px 0 calc(4px + var(--indent));
  color: var(--text-primary);
  cursor: default;
  user-select: none;
  content-visibility: auto;
  contain-intrinsic-size: auto 30px;
}

.layer-row::after {
  content: "";
  position: absolute;
  right: 6px;
  left: calc(7px + var(--indent));
  height: 2px;
  border-radius: 2px;
  background: var(--p-primary-color);
  opacity: 0;
  pointer-events: none;
}

.layer-row:hover {
  background: var(--p-surface-50);
}

.layer-row.selected {
  background: color-mix(
    in srgb,
    var(--p-primary-color) 13%,
    var(--p-surface-0)
  );
}

.layer-row.focused.selected {
  box-shadow: inset 2px 0 0 var(--p-primary-color);
}

.layer-row.hidden .layer-name,
.layer-row.hidden .layer-type-icon,
.layer-row.locked .layer-name,
.layer-row.locked .layer-type-icon {
  opacity: 0.48;
}

.layer-row.dragging {
  opacity: 0.35;
}

.layer-row.drop-above::after {
  top: -1px;
  opacity: 1;
}

.layer-row.drop-below::after {
  bottom: -1px;
  opacity: 1;
}

.layer-row.drop-inside {
  background: color-mix(
    in srgb,
    var(--p-primary-color) 18%,
    var(--p-surface-0)
  );
  box-shadow: inset 0 0 0 1px var(--p-primary-color);
}

.drag-handle {
  flex: 0 0 auto;
  color: var(--text-secondary);
  opacity: 0;
  cursor: grab;
}

.layer-row:hover .drag-handle,
.layer-row.selected .drag-handle {
  opacity: 0.6;
}

.disclosure-button,
.disclosure-spacer {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
}

.disclosure-button {
  border-radius: 4px;
}

.disclosure-icon {
  transition: transform 0.15s ease;
}

.disclosure-icon.expanded {
  transform: rotate(90deg);
}

.layer-type-icon {
  flex: 0 0 auto;
  color: var(--text-secondary);
}

.layer-name-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}

.layer-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
}

.child-count {
  color: var(--text-secondary);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.layer-rename-input {
  width: 100%;
  height: 23px;
  padding: 0 5px;
  border: 1px solid var(--p-primary-color);
  border-radius: 4px;
  outline: none;
  background: var(--p-surface-0);
  color: var(--text-primary);
  font-size: 12px;
}

.row-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 1px;
}

.row-action-button {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  opacity: 0;
}

.layer-row:hover .row-action-button,
.layer-row.selected .row-action-button,
.row-action-button.active {
  opacity: 0.72;
}

.row-action-button.active {
  color: var(--p-primary-color);
}

.layer-panel-footer {
  min-height: 38px;
  justify-content: space-between;
  padding: 4px 8px 4px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--surface-panel);
}

.footer-status {
  color: var(--text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.empty-state {
  height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 12px;
}

.panel-resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 7px;
  cursor: ew-resize;
}

.panel-resize-handle::after {
  content: "";
  position: absolute;
  top: 40%;
  right: 2px;
  width: 2px;
  height: 42px;
  border-radius: 2px;
  background: var(--p-primary-color);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.panel-resize-handle:hover::after {
  opacity: 0.55;
}

.layer-panel-enter-active,
.layer-panel-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.layer-panel-enter-from,
.layer-panel-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

@media (max-height: 620px) {
  .layer-panel {
    top: 48px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .layer-panel-enter-active,
  .layer-panel-leave-active,
  .disclosure-icon {
    transition: none;
  }
}
</style>

<style>
.layer-context-menu {
  position: fixed;
  z-index: 1200;
  width: 210px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--surface-panel);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
}

.layer-context-menu button {
  width: 100%;
  height: 30px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}

.layer-context-menu button:hover:not(:disabled) {
  background: var(--p-surface-100);
}

.layer-context-menu button:disabled {
  opacity: 0.35;
  cursor: default;
}

.layer-context-menu button.danger {
  color: var(--accent-error);
}

.layer-context-menu kbd {
  color: var(--text-secondary);
  font-family: var(--font-family-mono);
  font-size: 9px;
}

.layer-context-menu .context-divider {
  height: 1px;
  margin: 4px 5px;
  background: var(--border-color);
}

body.layer-panel-resizing {
  cursor: ew-resize !important;
  user-select: none !important;
}
</style>
