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

const flushCanvasBeforeLeave = () => {
  // Best-effort: fire an immediate workspace save so in-flight ImageGen taskIds
  // are less likely to be lost on refresh/close.
  try {
    void canvasRef.value?.saveCanvasState?.();
  } catch {
    /* ignore */
  }
};

onMounted(async () => {
  await validateAndSetWorkspace();
  window.addEventListener("agent:open-panel", handleOpenAgentPanel);
  window.addEventListener("beforeunload", flushCanvasBeforeLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushCanvasBeforeLeave();
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("agent:open-panel", handleOpenAgentPanel);
  window.removeEventListener("beforeunload", flushCanvasBeforeLeave);
  flushCanvasBeforeLeave();
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
  <div
    class="board-shell w-full h-full relative flex"
    :class="{
      'agent-panel-open': Boolean(activeWorkspaceId) && !agentPanelCollapsed,
    }"
  >
    <ConfirmDialog></ConfirmDialog>

    <!-- Full Page Layout Skeleton during initial network loading -->
    <WorkspaceSkeleton v-if="isInitializing" />

    <!-- Actual Workspace View after loading -->
    <template v-else>
      <Sidebar
        v-model:activeWorkspaceId="activeWorkspaceId"
        class="workspace-sidebar"
      />
      <Canvas
        v-if="activeWorkspaceId"
        ref="canvasRef"
        class="workspace-canvas"
        :active-workspace-id="activeWorkspaceId"
        :agent-panel-collapsed="agentPanelCollapsed"
        @toggle-agent="agentPanelCollapsed = !agentPanelCollapsed"
      />
      <div
        v-else
        class="flex-1 h-full flex flex-col items-center justify-center bg-[var(--surface-app)] text-[var(--p-text-muted-color)]"
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
        :record-history="
          (immediate?: boolean) =>
            immediate
              ? canvasRef.recordHistory?.(true)
              : canvasRef.recordHistoryDebounced?.()
        "
        :begin-history-transaction="canvasRef.beginHistoryTransaction"
        :commit-history-transaction="canvasRef.commitHistoryTransaction"
        :rollback-history-transaction="canvasRef.rollbackHistoryTransaction"
        :undo-history="canvasRef.undo"
        :on-agent-place="canvasRef.triggerAgentRipple"
      />
    </template>
  </div>
</template>

<style scoped>
.board-shell {
  --sidebar-expanded-width: 280px;
  --canvas-toolbar-safe-width: 371px;
  --agent-panel-width: clamp(
    320px,
    calc(
      100vw - var(--sidebar-expanded-width) -
        var(--canvas-toolbar-safe-width)
    ),
    420px
  );
  box-sizing: border-box;
  padding-right: 0;
  transition: padding-right 0.25s cubic-bezier(0.45, 0, 0.55, 1);
}

.board-shell.agent-panel-open {
  padding-right: var(--agent-panel-width);
}

@media (max-width: 640px) {
  .board-shell {
    --agent-panel-width: 100vw;
  }

  .board-shell.agent-panel-open {
    padding-right: 0;
    overflow: hidden;
  }

  .board-shell.agent-panel-open > .workspace-sidebar,
  .board-shell.agent-panel-open > .workspace-canvas {
    visibility: hidden;
    pointer-events: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .board-shell {
    transition: none;
  }
}
</style>
