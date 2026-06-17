<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Canvas from "../components/Canvas.vue";
import Sidebar from "../components/sidebar.vue";
import AgentPanel from "../components/AgentPanel.vue";

const route = useRoute();
const router = useRouter();

const canvasRef = ref<any>(null);
const agentPanelCollapsed = ref(false); // starts open
const activeWorkspaceId = ref<string | number | null>(null);
const workspaces = ref<any[]>([]);

const validateAndSetWorkspace = async () => {
  const queryId = route.query.projectId;
  try {
    const res = await fetch("http://localhost:3000/workspaces");
    if (res.ok) {
      workspaces.value = await res.json();
      if (queryId) {
        const exists = workspaces.value.some(w => String(w.id) === String(queryId));
        if (exists) {
          activeWorkspaceId.value = String(queryId);
        } else {
          activeWorkspaceId.value = workspaces.value.length > 0 ? workspaces.value[0].id : null;
        }
      } else {
        activeWorkspaceId.value = workspaces.value.length > 0 ? workspaces.value[0].id : null;
      }
    }
  } catch (err) {
    console.error("Failed to validate workspace ID:", err);
    activeWorkspaceId.value = null;
  }
};

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
    <Toast position="top-center" />
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
      <div class="flex flex-col items-center gap-4 max-w-sm text-center p-8 rounded-2xl bg-[var(--p-surface-0)] border border-[var(--p-surface-200)] shadow-sm">
        <div class="w-12 h-12 rounded-full bg-[var(--p-surface-100)] flex items-center justify-center text-[var(--p-text-muted-color)]">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-[var(--p-text-color)]">暂无活动工作空间</h3>
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
    />
  </div>
</template>
