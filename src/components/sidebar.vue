<template>
  <div class="relative h-full flex">
    <div
      ref="containerRef"
      class="sidebar-shell"
      :class="{ 'is-collapsed': collapsed }"
    >
      <div class="sidebar-inner">
        <!-- Header -->
        <div class="sidebar-header">
          <div class="sidebar-brand">
            <div
              class="logo-btn-wrapper"
              @mouseenter="handleEnter"
              @mouseleave="handleLeave"
            >
              <span
                v-if="!collapsed || !openShow"
                class="brand-mark"
                aria-hidden="true"
              >
                <img
                  class="brand-mark-img"
                  :src="logoUrl"
                  alt=""
                  draggable="false"
                />
              </span>
              <button
                v-else
                type="button"
                title="展开"
                class="sidebar-icon-btn"
                aria-label="展开侧栏"
                @click="collapsed = false"
              >
                <PanelRightClose :size="18" :stroke-width="2" />
              </button>
            </div>

            <Transition name="fade">
              <span v-if="renderExpandedContent" class="brand-title">
                OmniCanvas
              </span>
            </Transition>
          </div>

          <Transition name="fade">
            <button
              v-if="renderExpandedContent"
              type="button"
              title="收起"
              class="sidebar-icon-btn"
              aria-label="收起侧栏"
              @click="collapsed = true"
            >
              <PanelLeftClose :size="18" :stroke-width="2" />
            </button>
          </Transition>
        </div>

        <!-- Primary actions -->
        <div class="sidebar-actions" :class="{ 'is-collapsed': collapsed }">
          <button
            type="button"
            class="nav-action"
            :class="{ 'is-collapsed': collapsed }"
            title="创建新工作空间"
            @click="createNewWorkspace"
          >
            <SquarePen :size="17" :stroke-width="2" class="nav-action-icon" />
            <Transition name="fade">
              <span v-if="renderExpandedContent" class="nav-action-label">
                新建工作空间
              </span>
            </Transition>
            <Transition name="fade">
              <kbd v-if="renderExpandedContent" class="key-tip"
                >Ctrl+Shift+O</kbd
              >
            </Transition>
          </button>

          <button
            type="button"
            class="nav-action"
            :class="{
              'is-collapsed': collapsed,
              'is-active': showSearch && !collapsed,
            }"
            title="搜索工作空间"
            @click="toggleSearch"
          >
            <Search :size="17" :stroke-width="2" class="nav-action-icon" />
            <Transition name="fade">
              <span v-if="renderExpandedContent" class="nav-action-label">
                搜索工作空间
              </span>
            </Transition>
            <Transition name="fade">
              <kbd v-if="renderExpandedContent" class="key-tip"
                >Ctrl+Shift+F</kbd
              >
            </Transition>
          </button>
        </div>

        <!-- Search -->
        <div v-if="showSearch && !collapsed" class="search-wrap">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="搜索工作空间..."
            class="search-input"
            @keydown.esc="
              showSearch = false;
              searchQuery = '';
            "
          />
          <button
            v-if="searchQuery"
            type="button"
            class="search-clear"
            title="清空"
            aria-label="清空搜索"
            @click="searchQuery = ''"
          >
            <X :size="14" />
          </button>
        </div>

        <!-- Workspace list -->
        <div v-if="!collapsed" class="history-list">
          <div v-if="filteredWorkspaces.length === 0" class="list-empty">
            {{ searchQuery ? "无匹配工作空间" : "暂无工作空间" }}
          </div>
          <div v-else class="history-items">
            <div
              v-for="item in filteredWorkspaces"
              :key="item.id"
              class="history-item"
              :class="{
                'is-active': String(activeWorkspaceId) === String(item.id),
              }"
              @click="selectWorkspace(item)"
            >
              <span
                class="workspace-name-span"
                :data-id="item.id"
                v-tooltip="{
                  value: item.name,
                  disabled: !isOverflowMap[item.id],
                }"
              >
                {{ item.name }}
              </span>

              <button
                type="button"
                class="item-menu-btn"
                title="更多"
                aria-label="工作空间菜单"
                @click.stop="toggleMenu($event, item)"
              >
                <EllipsisVertical :size="15" :stroke-width="2" />
              </button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="sidebar-footer">
          <button
            v-if="isLoggedIn && renderExpandedContent"
            type="button"
            class="credits-card"
            title="查看积分与账单"
            @click="openBilling('plans')"
          >
            <span class="credits-label">
              <Coins :size="15" :stroke-width="2" />
              可用积分
            </span>
            <span class="credits-value">
              {{
                balanceLoading
                  ? "—"
                  : formatBalance(balance?.availableCredits || 0)
              }}
            </span>
          </button>
          <button
            v-else-if="isLoggedIn"
            type="button"
            class="sidebar-icon-btn footer-icon-solo"
            :title="`可用积分 ${formatBalance(balance?.availableCredits || 0)}`"
            @click="openBilling('plans')"
          >
            <Coins :size="18" :stroke-width="2" />
          </button>

          <!-- Expanded footer -->
          <div v-if="renderExpandedContent" class="footer-row">
            <button
              type="button"
              class="user-chip"
              @click="isLoggedIn ? openProfileModal() : openAuthModal('login')"
            >
              <span class="user-avatar" aria-hidden="true">
                <img
                  v-if="currentUser?.avatarUrl"
                  :src="currentUser.avatarUrl"
                  alt=""
                  class="user-avatar-img"
                />
                <template v-else>{{ userInitials }}</template>
              </span>
              <span class="user-name">{{ displayName }}</span>
            </button>

            <div class="footer-actions">
              <button
                v-if="!isLoggedIn"
                type="button"
                class="login-link"
                @click="openAuthModal('login')"
              >
                登录
              </button>
              <button
                type="button"
                class="sidebar-icon-btn"
                :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
                @click="toggleTheme"
              >
                <Sun v-if="isDark" :size="17" :stroke-width="2" />
                <Moon v-else :size="17" :stroke-width="2" />
              </button>
              <button
                v-if="isLoggedIn"
                type="button"
                class="sidebar-icon-btn"
                title="个人中心"
                @click="openProfileModal"
              >
                <Settings :size="17" :stroke-width="2" />
              </button>
            </div>
          </div>

          <!-- Collapsed footer -->
          <div v-else class="footer-collapsed">
            <button
              type="button"
              class="sidebar-icon-btn"
              :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
              @click="toggleTheme"
            >
              <Sun v-if="isDark" :size="17" :stroke-width="2" />
              <Moon v-else :size="17" :stroke-width="2" />
            </button>
            <button
              v-if="isLoggedIn"
              type="button"
              class="sidebar-icon-btn"
              title="个人中心"
              @click="openProfileModal"
            >
              <Settings :size="17" :stroke-width="2" />
            </button>
            <button
              type="button"
              class="user-avatar user-avatar-btn"
              :title="displayName"
              @click="isLoggedIn ? openProfileModal() : openAuthModal('login')"
            >
              <img
                v-if="currentUser?.avatarUrl"
                :src="currentUser.avatarUrl"
                alt=""
                class="user-avatar-img"
              />
              <template v-else>{{ userInitials }}</template>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Rename / Delete Menu Popover -->
    <Popover
      ref="menuPopoverRef"
      appendTo="body"
      :dismissable="true"
      :pt="{ content: { style: { padding: '4px' } } }"
    >
      <div class="menu-popover">
        <button type="button" class="menu-item" @click="renameWorkspace">
          <Pencil :size="14" class="menu-item-icon" />
          <span>重命名</span>
        </button>
        <button
          type="button"
          class="menu-item is-danger"
          @click="confirmDelete"
        >
          <Trash2 :size="14" />
          <span>删除</span>
        </button>
      </div>
    </Popover>

    <!-- Rename Dialog -->
    <Dialog
      v-model:visible="renameDialogVisible"
      modal
      header="重命名工作区"
      :style="{ width: '25rem' }"
    >
      <div class="rename-dialog-body">
        <label for="newWorkspaceName" class="rename-label">
          请输入新工作空间名称
        </label>
        <InputText
          id="newWorkspaceName"
          v-model="newWorkspaceName"
          class="w-full"
          autocomplete="off"
          @keydown.enter="submitRename"
        />
      </div>
      <template #footer>
        <Button label="取消" text @click="renameDialogVisible = false" />
        <Button label="确定" @click="submitRename" />
      </template>
    </Dialog>

    <UserProfileModal />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import logoUrl from "@/assets/logo.png";
import {
  PanelLeftClose,
  PanelRightClose,
  SquarePen,
  Search,
  EllipsisVertical,
  Pencil,
  Trash2,
  Settings,
  Sun,
  Moon,
  Coins,
  X,
} from "lucide-vue-next";
import { gsap } from "gsap";
import vTooltip from "primevue/tooltip";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useTheme } from "@/composables/useTheme";
import { useUser } from "@/composables/useUser";
import UserProfileModal from "@/components/auth/UserProfileModal.vue";
import { useBilling } from "@/composables/useBilling";

const { isDark, toggleTheme } = useTheme();
const {
  currentUser,
  isLoggedIn,
  userInitials,
  displayName,
  openAuthModal,
  openProfileModal,
} = useUser();
const { balance, balanceLoading, openBilling, refreshBalance } = useBilling();
const formatBalance = (value: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);

const props = defineProps<{
  activeWorkspaceId: string | number | null;
}>();

const emit = defineEmits<{
  (e: "update:activeWorkspaceId", id: string | number | null): void;
}>();

import {
  getWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from "@/utils/api";

const confirm = useConfirm();
const toast = useToast();
const collapsed = ref(false);
const containerRef = ref<HTMLElement | null>(null);
const openShow = ref(false);
const renderExpandedContent = ref(true);

const workspaces = ref<any[]>([]);

const loadWorkspaces = async () => {
  try {
    workspaces.value = await getWorkspaces();
  } catch (err) {
    console.error("Failed to load workspaces:", err);
  }
};

onMounted(async () => {
  await loadWorkspaces();
  if (isLoggedIn.value) await refreshBalance();
});

watch(isLoggedIn, async () => {
  await loadWorkspaces();
  if (isLoggedIn.value) await refreshBalance();
  if (workspaces.value.length > 0) {
    emit("update:activeWorkspaceId", workspaces.value[0].id);
  } else {
    emit("update:activeWorkspaceId", null);
  }
});

const selectWorkspace = (item: any) => {
  emit("update:activeWorkspaceId", item.id);
};

const menuPopoverRef = ref();
const selectedWorkspace = ref<any>(null);

const searchQuery = ref("");
const showSearch = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

const renameDialogVisible = ref(false);
const newWorkspaceName = ref("");

const toggleSearch = () => {
  if (collapsed.value) {
    collapsed.value = false;
  }
  showSearch.value = !showSearch.value;
  if (showSearch.value) {
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  } else {
    searchQuery.value = "";
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.shiftKey) {
    if (e.key === "O" || e.key === "o") {
      e.preventDefault();
      createNewWorkspace();
    } else if (e.key === "F" || e.key === "f") {
      e.preventDefault();
      if (collapsed.value) {
        collapsed.value = false;
      }
      showSearch.value = true;
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    }
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

const filteredWorkspaces = computed(() => {
  if (!searchQuery.value) return workspaces.value;
  return workspaces.value.filter((ws) =>
    ws.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
  );
});

const toggleMenu = (event: Event, item: any) => {
  selectedWorkspace.value = item;
  menuPopoverRef.value?.toggle(event);
};

const createNewWorkspace = async () => {
  const workspaceName = "未命名工作区_" + Date.now();
  try {
    const newWs = await createWorkspace(workspaceName);
    await loadWorkspaces();
    emit("update:activeWorkspaceId", newWs.id);
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "创建失败",
    });
    console.error("Failed to create workspace:", err);
  }
};

const renameWorkspace = () => {
  if (!selectedWorkspace.value) return;
  menuPopoverRef.value?.hide();
  newWorkspaceName.value = selectedWorkspace.value.name;
  renameDialogVisible.value = true;
  nextTick(() => {
    const inputEl = document.getElementById("newWorkspaceName");
    if (inputEl) {
      (inputEl as HTMLInputElement).focus();
      (inputEl as HTMLInputElement).select();
    }
  });
};

const submitRename = async () => {
  if (!selectedWorkspace.value) return;
  const name = newWorkspaceName.value.trim() || "未命名工作区";
  try {
    await updateWorkspace(selectedWorkspace.value.id, name);
    await loadWorkspaces();
    renameDialogVisible.value = false;
    toast.add({
      severity: "success",
      summary: "重命名成功",
      detail: `工作空间已重命名为 "${name}"`,
      life: 3000,
    });
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "重命名失败",
      detail: "更新工作空间名称失败，请重试。",
      life: 3000,
    });
    console.error("Failed to rename workspace:", err);
  }
};

const confirmDelete = async () => {
  if (!selectedWorkspace.value) return;
  const idToDelete = selectedWorkspace.value.id;
  menuPopoverRef.value?.hide();

  confirm.require({
    message: `确定要删除工作空间 "${selectedWorkspace.value.name}" 吗？`,
    header: "提示",
    icon: "pi pi-exclamation-triangle",
    rejectProps: {
      label: "取消",
      severity: "secondary",
      outlined: true,
    },
    acceptProps: {
      label: "确认",
    },
    accept: async () => {
      try {
        await deleteWorkspace(idToDelete);
        await loadWorkspaces();
        if (String(props.activeWorkspaceId) === String(idToDelete)) {
          const nextId = workspaces.value.length
            ? workspaces.value[0].id
            : null;
          emit("update:activeWorkspaceId", nextId);
        }
        toast.add({
          severity: "success",
          summary: "操作成功",
          life: 3000,
        });
      } catch (err) {
        console.error("Failed to delete workspace:", err);
      }
    },
    reject: () => {},
  });
};

const handleEnter = () => {
  if (!collapsed.value) return;
  openShow.value = true;
};

const handleLeave = () => {
  if (!collapsed.value) return;
  openShow.value = false;
};

watch(collapsed, (isCollapsed) => {
  if (isCollapsed) {
    renderExpandedContent.value = false;
    openShow.value = false;
    // 68 = 12 + 44 + 12 — room for a readable mark (logo asset is icon+wordmark)
    gsap.to(containerRef.value, {
      width: 68,
      paddingLeft: 12,
      paddingRight: 12,
      duration: 0.35,
      ease: "power2.inOut",
    });
  } else {
    gsap.to(containerRef.value, {
      width: 280,
      paddingLeft: 12,
      paddingRight: 12,
      duration: 0.25,
      ease: "power2.inOut",
      onComplete: () => {
        renderExpandedContent.value = true;
        checkAllOverflows();
      },
    });
  }
});

const isOverflowMap = ref<Record<string, boolean>>({});

const checkAllOverflows = () => {
  nextTick(() => {
    const elements = document.querySelectorAll(".workspace-name-span");
    elements.forEach((el) => {
      const id = el.getAttribute("data-id");
      if (id) {
        isOverflowMap.value[id] = el.scrollWidth > el.clientWidth;
      }
    });
  });
};

watch(
  filteredWorkspaces,
  () => {
    checkAllOverflows();
  },
  { deep: true, immediate: true },
);
</script>

<style lang="scss" scoped>
.sidebar-shell {
  height: 100%;
  width: 280px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-panel, var(--p-surface-0));
  border-right: 1px solid var(--border-color);
  /* Lift white chrome off the darker canvas plane */
  box-shadow:
    1px 0 0 var(--border-subtle),
    8px 0 24px rgba(16, 24, 40, 0.04);
  z-index: 2;
}

:global(.p-dark) .sidebar-shell {
  box-shadow:
    1px 0 0 var(--border-subtle),
    8px 0 24px rgba(0, 0, 0, 0.28);
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* Shared collapsed rail size — nav / footer icons */
$rail-size: 36px;
/* Logo mark is larger than icons so the multicolored O stays legible */
$logo-size: 40px;
$logo-size-collapsed: 44px;

/* ── Header ─────────────────────────────────────────────────────── */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: $logo-size;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo-btn-wrapper {
  width: $logo-size;
  height: $logo-size;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-mark {
  width: $logo-size;
  height: $logo-size;
  display: block;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  user-select: none;
  pointer-events: none;
}

.brand-mark-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.brand-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary, var(--p-text-color));
  white-space: nowrap;
  line-height: 1.2;
}

.sidebar-icon-btn {
  width: $rail-size;
  height: $rail-size;
  min-width: $rail-size;
  min-height: $rail-size;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary, var(--p-text-muted-color));
  cursor: pointer;
  transition:
    color var(--dur-fast, 150ms) var(--ease-default, ease),
    background var(--dur-fast, 150ms) var(--ease-default, ease);
}

.sidebar-icon-btn:hover {
  color: var(--text-primary, var(--p-text-color));
  background: var(--surface-hover, var(--p-surface-100));
}

/* Collapsed: one vertical center line for logo + actions + footer */
.sidebar-shell.is-collapsed {
  .sidebar-header {
    justify-content: center;
    min-height: $logo-size-collapsed;
    margin-bottom: 12px;
  }

  .sidebar-brand {
    justify-content: center;
    width: 100%;
  }

  .logo-btn-wrapper {
    width: $logo-size-collapsed;
    height: $logo-size-collapsed;
  }

  .brand-mark {
    width: $logo-size-collapsed;
    height: $logo-size-collapsed;
    border-radius: 12px;
  }

  .sidebar-actions {
    align-items: center;
    width: 100%;
  }

  .sidebar-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .footer-icon-solo {
    margin: 0 0 10px;
  }
}

/* ── Actions ────────────────────────────────────────────────────── */
.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.sidebar-actions.is-collapsed {
  align-items: center;
}

.nav-action {
  width: 100%;
  min-height: $rail-size;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary, var(--p-text-color));
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--dur-fast, 150ms) var(--ease-default, ease),
    color var(--dur-fast, 150ms) var(--ease-default, ease);

  &.is-collapsed {
    width: $rail-size;
    height: $rail-size;
    min-height: $rail-size;
    padding: 0;
    justify-content: center;
  }

  &.is-active {
    background: var(--surface-active, var(--p-surface-100));
    font-weight: 600;
  }

  &:hover {
    background: var(--surface-hover, var(--p-surface-50));

    .key-tip {
      opacity: 1;
    }
  }

  &.is-active:hover {
    background: var(--surface-active, var(--p-surface-100));
  }
}

.nav-action-icon {
  flex-shrink: 0;
  color: var(--text-secondary, var(--p-text-muted-color));
}

.nav-action:hover .nav-action-icon,
.nav-action.is-active .nav-action-icon {
  color: var(--text-primary, var(--p-text-color));
}

.nav-action-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}

.key-tip {
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted, var(--p-text-muted-color));
  opacity: 0;
  white-space: nowrap;
  transition: opacity var(--dur-fast, 150ms) ease;
  pointer-events: none;
}

/* ── Search ─────────────────────────────────────────────────────── */
.search-wrap {
  position: relative;
  margin-top: 8px;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  height: 34px;
  padding: 0 32px 0 12px;
  border: 1px solid var(--border-color, var(--p-surface-200));
  border-radius: 10px;
  background: var(--surface-sunken, var(--p-surface-50));
  color: var(--text-primary, var(--p-text-color));
  font-size: 13px;
  outline: none;
  transition:
    border-color var(--dur-fast, 150ms) ease,
    box-shadow var(--dur-fast, 150ms) ease;

  &::placeholder {
    color: var(--text-muted, var(--p-text-muted-color));
  }

  &:focus {
    border-color: var(--accent-primary, var(--p-primary-color));
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--accent-primary, #161618) 8%, transparent);
    background: var(--surface-panel, var(--p-surface-0));
  }
}

.search-clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted, var(--p-text-muted-color));
  cursor: pointer;

  &:hover {
    color: var(--text-primary, var(--p-text-color));
    background: var(--surface-hover, var(--p-surface-100));
  }
}

/* ── Workspace list ─────────────────────────────────────────────── */
.history-list {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  margin-top: 12px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;

  &:hover {
    scrollbar-color: var(--p-surface-300, rgba(0, 0, 0, 0.15)) transparent;
  }

  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 99px;
  }
  &:hover::-webkit-scrollbar-thumb {
    background: var(--p-surface-300, rgba(0, 0, 0, 0.15));
  }
}

.list-empty {
  padding: 16px 10px;
  font-size: 12.5px;
  color: var(--text-muted, var(--p-text-muted-color));
  text-align: center;
}

.history-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-right: 2px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 4px 0 10px;
  border-radius: 10px;
  /* Default list text is primary-adjacent so the rail doesn't look washed-out */
  color: color-mix(
    in srgb,
    var(--text-primary, #1a1b1e) 72%,
    var(--text-secondary, #5f646e)
  );
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--dur-fast, 150ms) ease,
    color var(--dur-fast, 150ms) ease;

  &:hover {
    background: var(--surface-hover, var(--p-surface-50));
    color: var(--text-primary, var(--p-text-color));

    .item-menu-btn {
      opacity: 1;
    }
  }

  /* Solid black selected — matches canvas bottom toolbar active pill */
  &.is-active {
    background: var(--accent-primary, var(--p-primary-color, #18181b));
    color: var(--text-inverse, #ffffff);
    font-weight: 600;

    .item-menu-btn {
      opacity: 1;
      /* Inverse of the active pill — white on light primary, dark on dark primary */
      color: color-mix(
        in srgb,
        var(--text-inverse, #fff) 72%,
        transparent
      );

      &:hover {
        background: color-mix(
          in srgb,
          var(--text-inverse, #fff) 14%,
          transparent
        );
        color: var(--text-inverse, #fff);
      }
    }
  }

  &.is-active:hover {
    background: var(--accent-primary, var(--p-primary-color, #18181b));
    color: var(--text-inverse, #ffffff);
  }
}

.workspace-name-span {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
}

.item-menu-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted, var(--p-text-muted-color));
  opacity: 0;
  cursor: pointer;
  transition:
    opacity var(--dur-fast, 150ms) ease,
    background var(--dur-fast, 150ms) ease,
    color var(--dur-fast, 150ms) ease;

  &:hover {
    background: var(--surface-active, var(--p-surface-200));
    color: var(--text-primary, var(--p-text-color));
  }
}

/* ── Footer ─────────────────────────────────────────────────────── */
.sidebar-footer {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.credits-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border-color, var(--p-surface-200));
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition:
    background var(--dur-fast, 150ms) ease,
    border-color var(--dur-fast, 150ms) ease;

  &:hover {
    background: var(--surface-hover, var(--p-surface-100));
    border-color: var(--border-strong, var(--p-surface-300));
  }
}

.credits-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted, var(--p-text-muted-color));
}

.credits-value {
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, var(--p-text-color));
}

.footer-icon-solo {
  display: flex;
  margin: 0 auto 10px;
}

.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
  margin-right: 2px;
  padding: 4px 6px 4px 4px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast, 150ms) ease;

  &:hover {
    background: var(--surface-hover, var(--p-surface-100));
  }
}

.user-avatar {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--accent-primary, var(--p-primary-color, #161618));
  color: var(--text-inverse, #fff);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  overflow: hidden;
  user-select: none;
}

.user-avatar.user-avatar-btn {
  /* Collapsed rail: keep 28px visual size (icons are ~17px in 36px hit boxes) */
  width: 28px;
  height: 28px;
  border: none;
  padding: 0;
  cursor: pointer;
  box-sizing: border-box;
  border-radius: 8px;
  margin: 4px 0;
}

.user-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.user-name {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, var(--p-text-color));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.login-link {
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary, var(--p-text-color));
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: var(--surface-hover, var(--p-surface-100));
  }
}

.footer-collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}

/* ── Popover / dialog ───────────────────────────────────────────── */
.menu-popover {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary, var(--p-text-color));
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--surface-hover, var(--p-surface-100));
  }

  &.is-danger {
    color: var(--accent-error, #ff3b30);
  }

  &.is-danger:hover {
    background: color-mix(
      in srgb,
      var(--accent-error, #ff3b30) 8%,
      transparent
    );
  }
}

.menu-item-icon {
  color: var(--text-muted, var(--p-text-muted-color));
}

.menu-item.is-danger .menu-item-icon {
  color: inherit;
}

.rename-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
}

.rename-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, var(--p-text-muted-color));
}

/* ── Transitions ────────────────────────────────────────────────── */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

:global(.p-dark .user-avatar) {
  background: var(--p-primary-color, #f4f4f6);
  color: var(--p-primary-contrast-color, #18181b);
}
</style>
