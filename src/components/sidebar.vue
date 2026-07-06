<template>
  <div class="relative h-full flex">
    <!-- Sidebar Container -->
    <div
      ref="containerRef"
      class="h-full bg-[var(--p-surface-0)] border-r border-[var(--p-surface-200)] flex flex-col overflow-hidden"
      style="width: 288px; padding: 10px"
    >
      <!-- Content Wrapper -->
      <div class="flex flex-col h-full justify-start">
        <!-- header -->
        <div class="w-full flex items-center justify-between">
          <!-- Left side: logo/title, or expand button when collapsed -->
          <div class="flex items-center">
            <div
              @mouseenter="handleEnter"
              @mouseleave="handleLeave"
              class="logo-btn-wrapper h-30px overflow-hidden relative flex items-center justify-center"
            >
              <!-- Show Logo when expanded, or when collapsed and NOT hovered -->
              <img
                v-if="!collapsed || !openShow"
                src="@/assets/logo.jpg"
                alt="OmniCanvas"
                key="logo"
                width="30"
                height="30"
                style="width: 30px; height: 30px; object-fit: cover"
                class="w-30px h-30px rounded-full shadow-sm shrink-0"
              />
              <!-- Show Expand Button when collapsed and hovered -->
              <Button
                v-else
                text
                rounded
                size="small"
                title="展开"
                key="expand"
                class="flex items-center justify-center p-0"
                @click="collapsed = false"
              >
                <PanelRightClose :size="18" />
              </Button>
            </div>

            <!-- Title (visible only when expanded) -->
            <Transition name="fade">
              <span
                v-if="renderExpandedContent"
                class="ml-2.5 text-xl font-bold font-mono tracking-wide whitespace-nowrap"
              >
                Omni
              </span>
            </Transition>
          </div>

          <!-- Collapse Button (visible only when expanded) -->
          <Transition name="fade">
            <Button
              v-if="renderExpandedContent"
              rounded
              size="small"
              text
              title="收起"
              class="flex items-center justify-center p-0"
              @click="collapsed = true"
            >
              <PanelLeftClose :size="18" />
            </Button>
          </Transition>
        </div>

        <!-- actions -->
        <div class="flex items-center gap-1 flex-col mt-2">
          <Button
            variant="text"
            rounded
            class="w-full !pl-0 !pr-0 action-item"
            @click="createNewWorkspace"
          >
            <div
              class="w-full flex items-center"
              :class="{
                'justify-between': !collapsed,
                'justify-center': collapsed,
              }"
            >
              <div class="flex justify-center gap-1">
                <SquarePen :size="18" class="shrink-0" />
                <Transition name="fade">
                  <span v-if="renderExpandedContent" class="whitespace-nowrap"
                    >创建新工作空间</span
                  >
                </Transition>
              </div>
              <Transition name="fade">
                <span
                  class="color-[var(--p-text-color)] key-tip whitespace-nowrap"
                  v-if="renderExpandedContent"
                  >Ctrl+Shift+O</span
                >
              </Transition>
            </div>
          </Button>

          <Button
            variant="text"
            rounded
            class="w-full !pl-0 !pr-0 action-item"
            @click="toggleSearch"
          >
            <div
              class="w-full flex items-center"
              :class="{
                'justify-between': !collapsed,
                'justify-center': collapsed,
              }"
            >
              <div class="flex justify-center gap-1">
                <Search :size="18" class="shrink-0" />
                <Transition name="fade">
                  <span v-if="renderExpandedContent" class="whitespace-nowrap"
                    >搜索工作空间</span
                  >
                </Transition>
              </div>
              <Transition name="fade">
                <span
                  class="color-[var(--p-text-color)] key-tip whitespace-nowrap"
                  v-if="renderExpandedContent"
                  >Ctrl+Shift+F</span
                >
              </Transition>
            </div>
          </Button>
        </div>

        <!-- Search Input Field -->
        <div v-if="showSearch && !collapsed" class="px-1 mt-2">
          <div class="relative w-full flex items-center">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              placeholder="搜索工作空间..."
              class="w-full px-3 py-1.5 pr-8 text-sm rounded-lg border border-[var(--p-surface-200)] bg-[var(--p-surface-0)] text-[var(--p-text-color)] focus:outline-none focus:border-[var(--p-primary-color)] placeholder-[var(--p-text-muted-color)] transition-colors"
              @keydown.esc="
                showSearch = false;
                searchQuery = '';
              "
            />
            <Button
              v-if="searchQuery"
              variant="text"
              rounded
              class="absolute right-1 !p-1 w-6 h-6 flex items-center justify-center text-[var(--p-text-muted-color)]"
              @click="searchQuery = ''"
            >
              <span class="text-xs">×</span>
            </Button>
          </div>
        </div>

        <!-- Main content placeholder -->
        <div
          class="flex-1 overflow-x-hidden overflow-y-auto history-list mt-2"
          v-if="!collapsed"
        >
          <div class="flex flex-col gap-0.5 pr-1">
            <div
              class="w-full flex justify-between p-1 items-center relative history-item rounded-lg transition-colors duration-150 cursor-pointer"
              :class="{
                'bg-[var(--p-surface-100)]':
                  String(activeWorkspaceId) === String(item.id),
                'hover:bg-[var(--p-surface-50)]':
                  String(activeWorkspaceId) !== String(item.id),
              }"
              v-for="item in filteredWorkspaces"
              :key="item.id"
              @click="selectWorkspace(item)"
            >
              <div class="flex-1 flex items-center min-w-0 pl-2 py-1">
                <span
                  class="workspace-name-span whitespace-nowrap overflow-hidden text-ellipsis"
                  :data-id="item.id"
                  v-tooltip="{
                    value: item.name,
                    disabled: !isOverflowMap[item.id],
                  }"
                >
                  {{ item.name }}
                </span>
              </div>

              <Button
                variant="text"
                rounded
                class="action !p-1 w-7 h-7 flex items-center justify-center shrink-0"
                @click.stop="toggleMenu($event, item)"
              >
                <EllipsisVertical
                  :size="16"
                  color="var(--p-text-muted-color)"
                />
              </Button>
            </div>
          </div>
        </div>

        <!-- Footer Profile & Settings -->
        <div class="border-t border-[var(--p-surface-100)] pt-4 mt-auto">
          <!-- Expanded State -->
          <div
            v-if="renderExpandedContent"
            key="expanded"
            class="flex items-center justify-between w-full px-1"
          >
            <div
              class="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity min-w-0 flex-1 mr-1"
              @click="isLoggedIn ? openProfileModal() : openAuthModal('login')"
            >
              <div
                class="w-30px h-30px rounded-full bg-[var(--p-primary-color)] flex items-center justify-center text-white text-xs font-semibold select-none shrink-0 shadow-sm overflow-hidden"
              >
                <img
                  v-if="currentUser?.avatarUrl"
                  :src="currentUser.avatarUrl"
                  alt="Avatar"
                  class="w-full h-full object-cover"
                />
                <template v-else>{{ userInitials }}</template>
              </div>
              <span
                class="text-sm font-medium text-[var(--p-text-color)] whitespace-nowrap overflow-hidden text-ellipsis"
              >
                {{ displayName }}
              </span>
            </div>
            <div class="flex items-center gap-0.5">
              <Button
                v-if="!isLoggedIn"
                variant="text"
                rounded
                size="small"
                class="!px-2 !py-1 text-xs text-[var(--p-primary-color)] font-semibold shrink-0"
                @click="openAuthModal('login')"
              >
                登录
              </Button>
              <Button
                variant="text"
                rounded
                class="!p-1.5 w-8 h-8 flex items-center justify-center text-[var(--p-text-muted-color)] hover:text-[var(--p-text-color)] shrink-0"
                :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
                @click="toggleTheme"
              >
                <Sun v-if="isDark" :size="18" />
                <Moon v-else :size="18" />
              </Button>
              <Button
                v-if="isLoggedIn"
                variant="text"
                rounded
                class="!p-1.5 w-8 h-8 flex items-center justify-center text-[var(--p-text-muted-color)] hover:text-[var(--p-text-color)] shrink-0"
                title="个人中心"
                @click="openProfileModal"
              >
                <Settings :size="18" />
              </Button>
            </div>
          </div>

          <!-- Collapsed State -->
          <div
            v-else
            key="collapsed"
            class="flex flex-col items-center gap-4 w-full"
          >
            <Button
              variant="text"
              rounded
              class="!p-1.5 w-8 h-8 flex items-center justify-center text-[var(--p-text-muted-color)] hover:text-[var(--p-text-color)] shrink-0"
              :title="isDark ? '切换到亮色模式' : '切换到暗色模式'"
              @click="toggleTheme"
            >
              <Sun v-if="isDark" :size="18" />
              <Moon v-else :size="18" />
            </Button>
            <Button
              v-if="isLoggedIn"
              variant="text"
              rounded
              class="!p-1.5 w-8 h-8 flex items-center justify-center text-[var(--p-text-muted-color)] hover:text-[var(--p-text-color)] shrink-0"
              title="个人中心"
              @click="openProfileModal"
            >
              <Settings :size="18" />
            </Button>
            <div
              class="w-30px h-30px rounded-full bg-[var(--p-primary-color)] flex items-center justify-center text-white text-xs font-semibold select-none shrink-0 cursor-pointer shadow-sm overflow-hidden"
              :title="displayName"
              @click="isLoggedIn ? openProfileModal() : openAuthModal('login')"
            >
              <img
                v-if="currentUser?.avatarUrl"
                :src="currentUser.avatarUrl"
                alt="Avatar"
                class="w-full h-full object-cover"
              />
              <template v-else>{{ userInitials }}</template>
            </div>
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
      <div class="flex flex-col gap-0.5 min-w-100px">
        <Button
          variant="text"
          class="!justify-start !py-1.5 !px-3 text-sm flex items-center gap-2 w-full hover:bg-[var(--p-surface-100)] rounded-md text-[var(--p-text-color)]"
          @click="renameWorkspace"
        >
          <Pencil :size="14" class="text-[var(--p-text-muted-color)]" />
          <span>重命名</span>
        </Button>
        <Button
          variant="text"
          severity="danger"
          class="!justify-start !py-1.5 !px-3 text-sm flex items-center gap-2 w-full hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md text-red-500"
          @click="confirmDelete"
        >
          <Trash2 :size="14" />
          <span>删除</span>
        </Button>
      </div>
    </Popover>

    <!-- Rename Dialog -->
    <Dialog
      v-model:visible="renameDialogVisible"
      modal
      header="重命名工作区"
      :style="{ width: '25rem' }"
    >
      <div class="flex flex-col gap-2 pt-2">
        <label
          for="newWorkspaceName"
          class="text-sm font-semibold text-[var(--p-text-muted-color)]"
          >请输入新工作空间名称:</label
        >
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

    <!-- Auth and Profile Modals -->
    <AuthModal />
    <UserProfileModal />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
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
} from "lucide-vue-next";
import { gsap } from "gsap";
import vTooltip from "primevue/tooltip";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useTheme } from "@/composables/useTheme";
import { useUser } from "@/composables/useUser";
import AuthModal from "@/components/auth/AuthModal.vue";
import UserProfileModal from "@/components/auth/UserProfileModal.vue";

const { isDark, toggleTheme } = useTheme();
const {
  currentUser,
  isLoggedIn,
  userInitials,
  displayName,
  openAuthModal,
  openProfileModal,
  fetchProfile,
} = useUser();

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

// Workspaces list
const workspaces = ref<any[]>([]);

const loadWorkspaces = async () => {
  try {
    workspaces.value = await getWorkspaces();
  } catch (err) {
    console.error("Failed to load workspaces:", err);
  }
};

onMounted(async () => {
  await fetchProfile();
  await loadWorkspaces();
});

watch(isLoggedIn, async () => {
  await loadWorkspaces();
  if (workspaces.value.length > 0) {
    emit("update:activeWorkspaceId", workspaces.value[0].id);
  } else {
    emit("update:activeWorkspaceId", null);
  }
});

const selectWorkspace = (item: any) => {
  emit("update:activeWorkspaceId", item.id);
};

// Menu Popover state
const menuPopoverRef = ref();
const selectedWorkspace = ref<any>(null);

// Search state
const searchQuery = ref("");
const showSearch = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

// Rename state
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

const openSettings = () => {
  window.open("http://localhost:5174", "_blank");
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
    gsap.to(containerRef.value, {
      width: 52,
      paddingLeft: 10,
      paddingRight: 10,
      duration: 0.35,
      ease: "power2.inOut",
    });
  } else {
    gsap.to(containerRef.value, {
      width: 288,
      paddingLeft: 10,
      paddingRight: 10,
      duration: 0.25,
      ease: "power2.inOut",
      onComplete: () => {
        renderExpandedContent.value = true;
        checkAllOverflows();
      },
    });
  }
});

// Tooltip logic using PrimeVue v-tooltip for overflowing text
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
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.action-item {
  .key-tip {
    opacity: 0;
  }
  &:hover {
    .key-tip {
      opacity: 1;
    }
  }
}

.history-item {
  color: var(--p-text-color);
  font-size: var(--text-base);
  font-weight: 500;

  .action {
    opacity: 0;
  }
  cursor: pointer;
  &:hover {
    .action {
      opacity: 1;
    }
  }
}
</style>
