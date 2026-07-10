<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { FolderKanban } from "lucide-vue-next";
import Canvas from "../components/Canvas.vue";
import Sidebar from "../components/sidebar.vue";
import AgentPanel from "../components/AgentPanel.vue";
import WorkspaceSkeleton from "../components/WorkspaceSkeleton.vue";
import { getWorkspaces } from "@/utils/api";
import { useUser } from "@/composables/useUser";

const route = useRoute();
const router = useRouter();
const { isLoggedIn } = useUser();

const canvasRef = ref<any>(null);
const agentPanelCollapsed = ref(false);
const activeWorkspaceId = ref<string | number | null>(null);
const workspaces = ref<any[]>([]);
const isInitializing = ref(true);

const validateAndSetWorkspace = async () => {
  const queryId = route.query.projectId;
  try {
    workspaces.value = await getWorkspaces();
    if (queryId) {
      const exists = workspaces.value.some(
        (w) => String(w.id) === String(queryId),
      );
      if (exists) {
        activeWorkspaceId.value = String(queryId);
      } else {
        activeWorkspaceId.value =
          workspaces.value.length > 0 ? workspaces.value[0].id : null;
      }
    } else {
      activeWorkspaceId.value =
        workspaces.value.length > 0 ? workspaces.value[0].id : null;
    }
  } catch (err) {
    console.error("Failed to validate workspace ID:", err);
    activeWorkspaceId.value = null;
  } finally {
    isInitializing.value = false;
  }
};

const handleOpenAgentPanel = () => {
  agentPanelCollapsed.value = false;
};

onMounted(async () => {
  await validateAndSetWorkspace();
  window.addEventListener("agent:open-panel", handleOpenAgentPanel);
});

onBeforeUnmount(() => {
  window.removeEventListener("agent:open-panel", handleOpenAgentPanel);
});

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    validateAndSetWorkspace();
  }
});

// Sync query parameter changes (including page load, history navigation) to state with validation
watch(
  () => route.query.projectId,
  () => {
    validateAndSetWorkspace();
  },
  { immediate: true },
);

// Sync local selection changes to query parameter
watch(activeWorkspaceId, (newId) => {
  if (newId) {
    if (String(route.query.projectId) !== String(newId)) {
      router.replace({
        path: "/canvas",
        query: { ...route.query, projectId: String(newId) },
      });
    }
  } else {
    if (route.query.projectId) {
      const query = { ...route.query };
      delete query.projectId;
      router.replace({
        path: "/canvas",
        query,
      });
    }
  }
});
</script>

<template>
  <div class="w-full h-full relative flex">
    <ConfirmDialog></ConfirmDialog>

    <!-- Full Page Layout Skeleton during initial network loading -->
    <WorkspaceSkeleton v-if="isInitializing" />

    <!-- Actual Workspace View after loading -->
    <template v-else>
      <Sidebar v-model:activeWorkspaceId="activeWorkspaceId" />
      <Canvas
        v-if="activeWorkspaceId"
        ref="canvasRef"
        :active-workspace-id="activeWorkspaceId"
        :agent-panel-collapsed="agentPanelCollapsed"
        @toggle-agent="agentPanelCollapsed = !agentPanelCollapsed"
      />
      <div
        v-else
        class="flex-1 h-full flex flex-col items-center justify-center bg-[var(--p-surface-50)] text-[var(--p-text-muted-color)]"
      >
        <div
          class="flex flex-col items-center gap-4 max-w-sm text-center p-8 rounded-2xl bg-[var(--p-surface-0)] border border-[var(--p-surface-200)] shadow-sm"
        >
          <div
            class="w-12 h-12 rounded-full bg-[var(--p-surface-100)] flex items-center justify-center text-[var(--p-text-muted-color)]"
          >
            <FolderKanban
              :size="24"
              class="w-6 h-6 shrink-0 text-[var(--p-text-muted-color)]"
            />
          </div>
          <h3 class="text-lg font-semibold text-[var(--p-text-color)]">
            暂无活动工作空间
          </h3>
          <p class="text-sm text-[var(--p-text-muted-color)]">
            当前没有任何工作空间。请在左侧侧边栏点击“创建新工作空间”以开启您的设计之旅。
          </p>
        </div>
      </div>

      <AgentPanel
        v-if="activeWorkspaceId && canvasRef?.canvasApp"
        v-model:collapsed="agentPanelCollapsed"
        :workspace-id="activeWorkspaceId"
        :canvas-app="canvasRef.canvasApp"
        :record-history="canvasRef.recordHistoryDebounced"
        :begin-history-transaction="canvasRef.beginHistoryTransaction"
        :commit-history-transaction="canvasRef.commitHistoryTransaction"
        :rollback-history-transaction="canvasRef.rollbackHistoryTransaction"
        :undo-history="canvasRef.undo"
        :on-agent-place="canvasRef.triggerAgentRipple"
      />
    </template>
  </div>
</template>
