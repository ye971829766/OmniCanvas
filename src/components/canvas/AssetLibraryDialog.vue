<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="素材库"
    :style="{ width: '920px' }"
    :breakpoints="{ '960px': '75vw', '641px': '100vw' }"
    class="asset-library-dialog"
    @show="onShow"
  >
    <div class="asset-library-layout">
      <!-- Left Sidebar: Group Management -->
      <div class="sidebar-container">
        <div class="sidebar-header">
          <span class="section-title">全部分组</span>
          <Button
            icon="pi pi-plus"
            text
            rounded
            severity="secondary"
            size="small"
            title="新建分组"
            @click="showCreateGroupInput = true"
          />
        </div>

        <!-- Inline New Group Input -->
        <div v-if="showCreateGroupInput" class="inline-group-input">
          <InputText
            v-model="newGroupName"
            placeholder="分组名称..."
            size="small"
            autofocus
            class="w-full mr-1"
            @keyup.enter="handleCreateGroup"
          />
          <Button
            icon="pi pi-check"
            text
            severity="success"
            size="small"
            @click="handleCreateGroup"
          />
          <Button
            icon="pi pi-times"
            text
            severity="danger"
            size="small"
            @click="cancelCreateGroup"
          />
        </div>

        <div class="groups-list">
          <!-- All Assets Group -->
          <div
            :class="['group-item', { active: activeGroupId === 'all' }]"
            @click="activeGroupId = 'all'"
          >
            <i class="pi pi-folder-open mr-2"></i>
            <span class="group-name">全部素材</span>
          </div>

          <!-- Un-grouped Assets -->
          <div
            :class="['group-item', { active: activeGroupId === 'null' }]"
            @click="activeGroupId = 'null'"
          >
            <i class="pi pi-folder mr-2"></i>
            <span class="group-name">未分组</span>
          </div>

          <!-- User Custom Groups -->
          <div
            v-for="group in groups"
            :key="group.id"
            :class="['group-item', { active: activeGroupId === group.id, 'editing-mode': editingGroupId === group.id }]"
            @click="activeGroupId = group.id"
          >
            <i class="pi pi-folder mr-2"></i>
            
            <!-- Inline rename mode -->
            <div v-if="editingGroupId === group.id" class="flex items-center w-full" @click.stop>
              <InputText
                v-model="editingGroupName"
                size="small"
                class="w-full py-0.5 px-1 text-sm mr-1"
                @keyup.enter="handleRenameGroup(group)"
              />
              <Button
                icon="pi pi-check"
                text
                severity="success"
                size="small"
                class="p-0 min-w-0"
                @click="handleRenameGroup(group)"
              />
            </div>
            
            <template v-else>
              <span class="group-name">{{ group.name }}</span>
              <div class="group-actions ml-auto">
                <Button
                  icon="pi pi-pencil"
                  text
                  rounded
                  severity="secondary"
                  class="action-btn"
                  @click.stop="startRenameGroup(group)"
                />
                <Button
                  icon="pi pi-trash"
                  text
                  rounded
                  severity="danger"
                  class="action-btn"
                  @click.stop="handleDeleteGroup(group)"
                />
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Right Panel: Assets Grid -->
      <div class="main-panel">
        <!-- Top Toolbar -->
        <div class="panel-header">
          <div class="search-wrap">
            <div class="search-box-container">
              <i class="pi pi-search search-icon"></i>
              <InputText
                v-model="searchQuery"
                placeholder="搜索素材名称..."
                size="small"
                class="search-input"
              />
            </div>
          </div>

          <div class="actions-wrap">
            <!-- Sort Selector -->
            <Select
              v-model="activeSort"
              :options="sortOptions"
              optionLabel="label"
              optionValue="value"
              size="small"
              class="sort-dropdown"
              placeholder="排序方式"
            />

            <!-- File Upload to library -->
            <Button
              label="上传素材"
              icon="pi pi-plus"
              size="small"
              class="upload-lib-btn"
              :loading="isUploading"
              @click="triggerUpload"
            />
            <input
              ref="fileInput"
              type="file"
              accept="image/*,video/*"
              multiple
              style="display: none"
              @change="handleUpload"
            />
          </div>
        </div>

        <!-- Category Swapper Tabs -->
        <div class="category-tabs">
          <div
            v-for="cat in categories"
            :key="cat.value"
            :class="['category-tab', { active: activeCategory === cat.value }]"
            @click="activeCategory = cat.value"
          >
            {{ cat.label }}
          </div>
        </div>

        <!-- Assets List Container -->
        <div class="assets-grid-container">
          <div v-if="loading" class="empty-state">
            <i class="pi pi-spin pi-spinner text-3xl mb-2"></i>
            <span>正在加载素材...</span>
          </div>

          <div v-else-if="filteredAssets.length === 0" class="empty-state">
            <i class="pi pi-image text-4xl mb-2 text-gray-400"></i>
            <span>暂无素材，点击上方“上传素材”添加</span>
          </div>

          <!-- Drag and drop grid -->
          <div v-else class="assets-grid">
            <div
              v-for="(asset, index) in filteredAssets"
              :key="asset.id"
              class="asset-card"
              :draggable="activeSort === 'custom'"
              @dragstart="onDragStart($event, index)"
              @dragover.prevent
              @drop="onDrop($event, index)"
            >
              <div class="asset-preview-container" @dblclick="insertToCanvas(asset)">
                <img
                  v-if="asset.type === 'image'"
                  :src="asset.url"
                  :alt="asset.name"
                  class="preview-img"
                  loading="lazy"
                />
                <div v-else class="video-preview-wrap">
                  <img
                    :src="asset.thumbnailUrl || asset.url"
                    class="preview-img"
                    loading="lazy"
                  />
                  <div class="video-play-overlay">
                    <i class="pi pi-play-circle text-3xl text-white"></i>
                  </div>
                </div>

                <!-- Hover actions overlay -->
                <div class="hover-overlay">
                  <Button
                    label="插入"
                    icon="pi pi-plus"
                    size="small"
                    severity="primary"
                    class="insert-btn"
                    @click="insertToCanvas(asset)"
                  />
                </div>
              </div>

              <!-- Info & Context Actions -->
              <div class="asset-info">
                <span class="asset-name" :title="asset.name">{{ asset.name }}</span>
                <div class="asset-card-footer mt-1">
                  <span class="asset-type-badge">{{ asset.type === 'image' ? '图片' : '视频' }}</span>
                  <div class="flex items-center gap-1 ml-auto">
                    <!-- Move Group Dropdown -->
                    <Button
                      icon="pi pi-folder"
                      text
                      rounded
                      severity="secondary"
                      size="small"
                      class="card-btn"
                      title="移动至分组"
                      @click="toggleMoveMenu($event, asset)"
                    />
                    <Button
                      icon="pi pi-trash"
                      text
                      rounded
                      severity="danger"
                      size="small"
                      class="card-btn"
                      title="删除素材"
                      @click="handleDeleteAsset(asset)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Teleported floating move-group menu -->
    <Menu ref="moveMenuRef" :model="moveMenuItems" popup />
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useConfirm } from "primevue/useconfirm";
import {
  Dialog,
  Button,
  InputText,
  Select,
  Menu,
} from "primevue";
import {
  getAssetGroups,
  createAssetGroup,
  renameAssetGroup,
  deleteAssetGroup,
  getAssets,
  addAsset,
  moveAssetGroup,
  deleteAsset,
  reorderAssets,
  type Asset,
  type AssetGroup,
} from "@/utils/api";
import { uploadImage, uploadVideo } from "@/utils/api";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "insert-media", media: { url: string; type: string; thumbnailUrl?: string }): void;
}>();

const toast = useToast();
const confirm = useConfirm();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

// ---- State Variables ----
const loading = ref(false);
const isUploading = ref(false);
const groups = ref<AssetGroup[]>([]);
const assets = ref<Asset[]>([]);
const activeGroupId = ref<string>("all");
const activeCategory = ref<string>("all");
const searchQuery = ref("");
const activeSort = ref<string>("newest");

const showCreateGroupInput = ref(false);
const newGroupName = ref("");

const editingGroupId = ref<string | null>(null);
const editingGroupName = ref("");

const fileInput = ref<HTMLInputElement | null>(null);

const moveMenuRef = ref();
const targetMoveAsset = ref<Asset | null>(null);

// ---- Config Options ----
const categories = [
  { label: "全部", value: "all" },
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
];

const sortOptions = [
  { label: "最新上传", value: "newest" },
  { label: "名称排序", value: "name" },
  { label: "自定义排序", value: "custom" },
];

// ---- Lifecycle / Trigger ----
const onShow = async () => {
  await fetchGroups();
  await fetchAssets();
};

watch([activeGroupId, activeCategory], async () => {
  await fetchAssets();
});

// ---- Fetch Data ----
const fetchGroups = async () => {
  try {
    groups.value = await getAssetGroups();
  } catch (err) {
    console.error("Failed to load asset groups:", err);
  }
};

const fetchAssets = async () => {
  loading.value = true;
  try {
    // If customized sorting is selected, get raw DB assets to sort.
    // In backend, getAssets will return sorted list.
    const res = await getAssets(activeGroupId.value, activeCategory.value);
    assets.value = res;
  } catch (err) {
    console.error("Failed to fetch assets:", err);
  } finally {
    loading.value = false;
  }
};

// ---- Filter / Sort computed ----
const filteredAssets = computed(() => {
  let list = [...assets.value];

  // Client side search filtering
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter((a) => a.name.toLowerCase().includes(q));
  }

  // Client side sorting
  if (activeSort.value === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (activeSort.value === "newest") {
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return list;
});

// ---- Group Actions ----
const handleCreateGroup = async () => {
  if (!newGroupName.value.trim()) return;
  try {
    const newGroup = await createAssetGroup(newGroupName.value.trim());
    groups.value.push(newGroup);
    activeGroupId.value = newGroup.id;
    newGroupName.value = "";
    showCreateGroupInput.value = false;
    toast.add({
      severity: "success",
      summary: "创建成功",
      detail: `分组 “${newGroup.name}” 已创建`,
      life: 2000,
    });
  } catch (err) {
    console.error("Failed to create group:", err);
  }
};

const cancelCreateGroup = () => {
  newGroupName.value = "";
  showCreateGroupInput.value = false;
};

const startRenameGroup = (group: AssetGroup) => {
  editingGroupId.value = group.id;
  editingGroupName.value = group.name;
};

const handleRenameGroup = async (group: AssetGroup) => {
  if (!editingGroupName.value.trim()) return;
  try {
    await renameAssetGroup(group.id, editingGroupName.value.trim());
    group.name = editingGroupName.value.trim();
    editingGroupId.value = null;
    toast.add({
      severity: "success",
      summary: "重命名成功",
      detail: "分组名称已修改",
      life: 2000,
    });
  } catch (err) {
    console.error("Failed to rename group:", err);
  }
};

const handleDeleteGroup = (group: AssetGroup) => {
  confirm.require({
    message: `确定要删除分组 “${group.name}” 吗？此分组下的素材将移至“未分组”。`,
    header: '删除分组',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
      outlined: true
    },
    acceptProps: {
      label: '确定',
      severity: 'danger'
    },
    accept: async () => {
      try {
        await deleteAssetGroup(group.id);
        groups.value = groups.value.filter((g) => g.id !== group.id);
        if (activeGroupId.value === group.id) {
          activeGroupId.value = "all";
        }
        await fetchAssets();
        toast.add({
          severity: "success",
          summary: "删除成功",
          detail: "分组已删除",
          life: 2000,
        });
      } catch (err) {
        console.error("Failed to delete group:", err);
      }
    }
  });
};

// ---- Asset Upload Actions ----
const triggerUpload = () => {
  fileInput.value?.click();
};

const handleUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  isUploading.value = true;
  try {
    for (const file of Array.from(files)) {
      let url = "";
      let thumbnailUrl = "";
      let type = "image";

      const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
      if (file.type.startsWith("image/") && !isGif) {
        const res = await uploadImage(file);
        url = res.imageUrl;
        type = "image";
      } else if (file.type.startsWith("video/") || isGif) {
        const res = await uploadVideo(file);
        url = res.videoUrl;
        thumbnailUrl = res.thumbnailUrl;
        type = "video";
      }

      if (url) {
        // Save metadata
        await addAsset({
          name: file.name,
          type,
          url,
          thumbnailUrl: thumbnailUrl || undefined,
          groupId: activeGroupId.value === "all" || activeGroupId.value === "null" ? undefined : activeGroupId.value,
        });
      }
    }
    toast.add({
      severity: "success",
      summary: "上传成功",
      detail: "素材已添加至素材库",
      life: 2000,
    });
    await fetchAssets();
  } catch (err: any) {
    console.error("Failed to upload file to asset library:", err);
    toast.add({
      severity: "error",
      summary: "上传失败",
      detail: err?.message || "上传遇到错误，请重试",
      life: 3000,
    });
  } finally {
    isUploading.value = false;
    target.value = "";
  }
};

// ---- Move Asset to Group Menu ----
const toggleMoveMenu = (event: Event, asset: Asset) => {
  targetMoveAsset.value = asset;
  moveMenuRef.value.toggle(event);
};

const moveMenuItems = computed(() => {
  const items: any[] = [
    {
      label: "未分组",
      icon: "pi pi-folder",
      command: () => handleMoveAssetGroup(null),
    },
  ];

  groups.value.forEach((g) => {
    items.push({
      label: g.name,
      icon: "pi pi-folder",
      command: () => handleMoveAssetGroup(g.id),
    });
  });

  return items;
});

const handleMoveAssetGroup = async (groupId: string | null) => {
  if (!targetMoveAsset.value) return;
  try {
    await moveAssetGroup(targetMoveAsset.value.id, groupId);
    toast.add({
      severity: "success",
      summary: "移动成功",
      detail: "素材已成功移动分组",
      life: 1500,
    });
    await fetchAssets();
  } catch (err) {
    console.error("Failed to move asset group:", err);
  }
};

// ---- Delete Asset ----
const handleDeleteAsset = (asset: Asset) => {
  confirm.require({
    message: `确定从素材库中永久删除 “${asset.name}” 吗？`,
    header: '删除素材',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
      outlined: true
    },
    acceptProps: {
      label: '确定',
      severity: 'danger'
    },
    accept: async () => {
      try {
        await deleteAsset(asset.id);
        assets.value = assets.value.filter((a) => a.id !== asset.id);
        toast.add({
          severity: "success",
          summary: "删除成功",
          detail: "素材已成功删除",
          life: 1500,
        });
      } catch (err) {
        console.error("Failed to delete asset:", err);
      }
    }
  });
};

// ---- Drag and Drop Reordering ----
const onDragStart = (e: DragEvent, index: number) => {
  if (activeSort.value !== "custom") return;
  e.dataTransfer?.setData("text/plain", index.toString());
};

const onDrop = async (e: DragEvent, targetIndex: number) => {
  if (activeSort.value !== "custom") return;
  const sourceStr = e.dataTransfer?.getData("text/plain");
  if (!sourceStr) return;
  const sourceIndex = parseInt(sourceStr, 10);
  if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

  const items = [...assets.value];
  const [moved] = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, moved);
  assets.value = items;

  try {
    const ids = items.map((a) => a.id);
    await reorderAssets(ids);
  } catch (err) {
    console.error("Failed to save reorder:", err);
  }
};

// ---- Insert to Canvas ----
const insertToCanvas = (asset: Asset) => {
  emit("insert-media", {
    url: asset.url,
    type: asset.type,
    thumbnailUrl: asset.thumbnailUrl,
  });
  visible.value = false;
};
</script>

<style scoped>
.asset-library-layout {
  display: flex;
  height: 520px;
  overflow: hidden;
  margin: -1.25rem -1.5rem; /* negate default Dialog padding */
}

/* Sidebar Styling */
.sidebar-container {
  width: 210px;
  flex-shrink: 0;
  background-color: var(--surface-sunken);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 1rem 0.5rem;
  overflow-y: auto;
  user-select: none;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.5rem 0.5rem 0.5rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 0.75rem;
}

.section-title {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.inline-group-input {
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  margin-bottom: 0.5rem;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.group-item {
  display: flex;
  align-items: center;
  padding: 0.5rem 3rem 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-default), color var(--dur-fast) var(--ease-default);
  color: var(--text-primary);
  font-size: 0.9rem;
  position: relative;
}

.group-item.editing-mode {
  padding-right: 0.75rem !important;
}

.group-item:hover {
  background-color: var(--surface-hover);
}

.group-item.active {
  background-color: var(--surface-active);
  font-weight: 600;
}

.group-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
}

.group-actions {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease-default);
}

.group-item:hover .group-actions {
  opacity: 1;
  pointer-events: auto;
}

.action-btn {
  width: 20px !important;
  height: 20px !important;
  padding: 0 !important;
  font-size: 0.7rem !important;
}

/* Main Grid Styling */
.main-panel {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--surface-panel);
}

.panel-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.search-wrap {
  width: 260px;
}

.search-box-container {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-secondary);
  pointer-events: none;
  font-size: 0.9rem;
}

.search-input {
  width: 100% !important;
  border-radius: 9999px !important;
  padding-left: 2.25rem !important;
  font-size: 0.85rem !important;
}

.actions-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sort-dropdown {
  width: 140px;
}

.upload-lib-btn {
  background-color: var(--accent-primary) !important;
  border-color: var(--accent-primary) !important;
  color: var(--text-inverse) !important;
  font-weight: 600;
}

/* Tabs */
.category-tabs {
  display: flex;
  padding: 0.5rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  gap: 1rem;
  background-color: var(--surface-sunken);
}

.category-tab {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--dur-fast);
}

.category-tab:hover {
  color: var(--text-primary);
  background-color: var(--surface-hover);
}

.category-tab.active {
  color: var(--text-primary);
  background-color: var(--surface-panel);
  box-shadow: var(--shadow-sm);
}

/* Grid Scroll Area */
.assets-grid-container {
  flex-grow: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.assets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
}

.asset-card {
  background-color: var(--surface-sunken);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.asset-card[draggable="true"] {
  cursor: grab;
}

.asset-card[draggable="true"]:active {
  cursor: grabbing;
}

.asset-card:hover {
  border-color: var(--border-strong);
}

.asset-preview-container {
  aspect-ratio: 1;
  background-color: var(--p-surface-900);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  cursor: pointer;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-preview-wrap {
  width: 100%;
  height: 100%;
  position: relative;
}

.video-play-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--dur-fast);
}

.video-preview-wrap:hover .video-play-overlay {
  background-color: rgba(0, 0, 0, 0.45);
}

.hover-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.4);
  opacity: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity var(--dur-fast);
  pointer-events: none;
}

.asset-preview-container:hover .hover-overlay {
  opacity: 1;
  pointer-events: auto;
}

.insert-btn {
  pointer-events: auto;
}

.asset-info {
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
}

.asset-name {
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}

.asset-card-footer {
  display: flex;
  align-items: center;
  margin-top: auto;
}

.asset-type-badge {
  font-size: 0.7rem;
  color: var(--text-secondary);
  background-color: var(--surface-hover);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}

.card-btn {
  width: 22px !important;
  height: 22px !important;
  padding: 0 !important;
  font-size: 0.75rem !important;
}
</style>
