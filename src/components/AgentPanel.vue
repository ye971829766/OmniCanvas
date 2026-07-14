<script setup lang="ts">
import {
  ref,
  watch,
  computed,
  onUnmounted,
  onMounted,
  type Ref,
  toRef,
} from "vue";
import { useAgent } from "@/composables/useAgent";
import { gsap } from "gsap";

import AgentHeader from "./agent/AgentHeader.vue";
import AgentMessages from "./agent/AgentMessages.vue";
import AgentInput from "./agent/AgentInput.vue";
import { useConfirm } from "primevue/useconfirm";
import { Undo2 } from "lucide-vue-next";
import type { AgentAttachmentInput } from "@/types/agent";
const confirm = useConfirm();

const props = defineProps<{
  canvasApp: Ref<any> | any;
  recordHistory?: () => void;
  beginHistoryTransaction?: () => void;
  commitHistoryTransaction?: () => boolean;
  rollbackHistoryTransaction?: () => boolean;
  undoHistory?: () => void;
  collapsed: boolean;
  onAgentPlace?: (node: any) => void;
  workspaceId?: string | number;
}>();

const emit = defineEmits<{
  (e: "update:collapsed", val: boolean): void;
}>();

const canvasAppRef = ref(props.canvasApp);
watch(
  () => props.canvasApp,
  (v) => (canvasAppRef.value = v),
);

const {
  messages,
  running,
  canUndoLastRun,
  loadingHistory,
  send,
  retryLastMessage,
  stop,
  undoLastRun,
  reset,
  nodeStates,
  zoomToNode,
} = useAgent(
  canvasAppRef as any,
  props.recordHistory,
  toRef(props, "workspaceId") as any,
  props.onAgentPlace as any,
  {
    begin: props.beginHistoryTransaction,
    commit: props.commitHistoryTransaction,
    rollback: props.rollbackHistoryTransaction,
    undo: props.undoHistory,
  },
);

const collapsed = computed({
  get: () => props.collapsed,
  set: (val) => emit("update:collapsed", val),
});
const input = ref("");

const scrollRef = ref<any>(null);
const userScrolledUp = ref(false);

function onScroll() {
  if (scrollRef.value) {
    userScrolledUp.value = scrollRef.value.isUserScrolledUp();
  }
}

function handleReset() {
  if (messages.value.length === 0) return;
  confirm.require({
    message: "确定要清空当前会话吗？",
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
    accept: () => {
      reset();
    },
  });
}

const containerRef = ref<HTMLElement | null>(null);
const isVisible = ref(!props.collapsed);

// Refs for content animation
const headerRef = ref<HTMLElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const bottomRef = ref<HTMLElement | null>(null);

onMounted(() => {
  if (collapsed.value) {
    gsap.set(containerRef.value, { xPercent: 100, opacity: 0 });
    isVisible.value = false;
  } else {
    gsap.set(containerRef.value, { xPercent: 0, opacity: 1 });
    isVisible.value = true;
  }
});

watch(collapsed, (isCollapsed) => {
  if (isCollapsed) {
    // Smooth exit animation first, hide display after animation finishes
    gsap.to(containerRef.value, {
      xPercent: 100,
      opacity: 0,
      duration: 0.25,
      ease: "power2.inOut",
      onComplete: () => {
        isVisible.value = false;
      },
    });
  } else {
    // Show display first, then slide & fade enter
    isVisible.value = true;
    gsap.fromTo(
      containerRef.value,
      { xPercent: 100, opacity: 0 },
      {
        xPercent: 0,
        opacity: 1,
        duration: 0.25,
        ease: "power2.inOut",
      },
    );
    gsap.fromTo(
      [headerRef.value, messagesRef.value, bottomRef.value],
      { opacity: 0, y: 4 },
      { opacity: 1, y: 0, duration: 0.22, ease: "power2.out", delay: 0.05 },
    );
  }
});

// Active timer and active status calculations
let timerInterval: any = null;
const elapsedTime = ref(0);
const showNotificationBanner = ref(false);
const notificationEnabled = ref(false);

watch(running, (newRunning) => {
  if (newRunning) {
    elapsedTime.value = 0;
    showNotificationBanner.value = !notificationEnabled.value;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsedTime.value++;
    }, 1000);
  } else {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    showNotificationBanner.value = false;
    // Trigger real system notification if enabled
    if (notificationEnabled.value && Notification.permission === "granted") {
      new Notification("OmniCanvas 设计任务已完成", {
        body: "您的 AI 设计已成功放置到画布！",
      });
    }
  }
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

async function submit(payload?: {
  text: string;
  attachments: AgentAttachmentInput[];
}) {
  const text = payload?.text ?? input.value;
  const files = payload?.attachments ?? [];
  if (!text.trim() && files.length === 0) return;
  input.value = "";
  await send(text, files);
}

function useSuggestion(s: string) {
  input.value = s;
  submit();
}

function handleZoomToNode(refId: string) {
  zoomToNode(refId, { force: true, select: true });
}
</script>

<template>
  <div
    ref="containerRef"
    class="agent-panel"
    :style="{ display: isVisible ? 'flex' : 'none' }"
  >
    <div class="w-full flex flex-col h-full min-h-0 shrink-0">
      <!-- Header -->
      <div ref="headerRef" class="panel-header-row">
        <AgentHeader
          :messages-count="messages.length"
          @reset="handleReset"
          @collapse="collapsed = true"
        />
      </div>

      <!-- Messages (slightly sunken well for depth) -->
      <div ref="messagesRef" class="agent-messages-well">
        <AgentMessages
          ref="scrollRef"
          :messages="messages"
          :node-states="nodeStates"
          :loading="loadingHistory"
          :running="running"
          :elapsed-time="elapsedTime"
          @use-suggestion="useSuggestion"
          @zoom-to-node="handleZoomToNode"
          @scroll="onScroll"
          @retry="retryLastMessage"
        />
      </div>

      <!-- Bottom Layout Group -->
      <div ref="bottomRef" class="agent-panel-bottom">
        <button
          v-if="canUndoLastRun && !running"
          class="undo-agent-run"
          type="button"
          @click="undoLastRun"
        >
          <Undo2 :size="13" />
          撤销本次修改
        </button>
        <AgentInput
          v-model="input"
          :running="running"
          :canvas-app="canvasAppRef"
          @submit="submit"
          @stop="stop"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-panel {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 90;
  width: var(--agent-panel-width, min(420px, calc(100vw - 16px)));
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface-panel);
  border-left: 1px solid var(--border-color);
  overflow: hidden;
  /* White card plane floating on darker canvas */
  box-shadow:
    -1px 0 0 var(--border-subtle),
    -12px 0 32px rgba(16, 24, 40, 0.07);
  transition: width var(--dur-normal, 0.25s) var(--ease-smooth, cubic-bezier(0.45, 0, 0.55, 1));
  will-change: transform, opacity, width;
}

:global(.p-dark .agent-panel) {
  box-shadow:
    -1px 0 0 var(--border-subtle),
    -12px 0 32px rgba(0, 0, 0, 0.42);
}

@media (prefers-reduced-motion: reduce) {
  .agent-panel {
    transition: none;
  }
}

.panel-header-row {
  display: flex;
  align-items: center;
  width: 100%;
  flex-shrink: 0;
}

.agent-messages-well {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* Keep the whole agent panel as one white plane (avoids gray "fog" band) */
  background: var(--surface-panel);
}

.agent-panel-bottom {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--surface-panel);
  border-top: 1px solid var(--border-color);
  z-index: 50;
}

.undo-agent-run {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 10px 14px 0;
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    color var(--dur-fast, 150ms) var(--ease-default, ease),
    background var(--dur-fast, 150ms) var(--ease-default, ease),
    border-color var(--dur-fast, 150ms) var(--ease-default, ease);
}

.undo-agent-run:hover {
  color: var(--text-primary);
  background: var(--surface-hover, var(--p-surface-100));
  border-color: var(--border-strong, var(--p-surface-300));
}

.scroll-to-bottom-btn {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 60;
}

.notification-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px;
  border-top: 1px solid var(--border-subtle);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.notification-text {
  font-weight: 400;
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-btn-enable {
  background: transparent;
  color: var(--accent-primary);
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
}

.notification-btn-enable:hover {
  opacity: 0.75;
}

.notification-btn-close {
  background: transparent;
  color: var(--text-muted);
  border: none;
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

/* ── B3: Status Bar ────────────────────────────────────────────── */
.agent-status-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px 12px;
  font-size: var(--text-sm);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border-top: 1px solid var(--border-subtle);
  overflow: hidden;
}

.status-icon {
  display: flex;
  align-items: center;
  color: var(--accent-success);
  flex-shrink: 0;
}

.icon-spin {
  animation: icon-spin 3s linear infinite;
}
.icon-spin-slow {
  animation:
    icon-spin 4s linear infinite,
    sparkle-scale 2s ease-in-out infinite;
}
.icon-pulse {
  animation: sparkle-scale 1.5s ease-in-out infinite;
}

@keyframes icon-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes sparkle-scale {
  0%,
  100% {
    transform: scale(0.88);
  }
  50% {
    transform: scale(1.12);
  }
}

.status-text {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-timer {
  font-family: var(--font-family-mono, "JetBrains Mono", "SF Mono", monospace);
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

/* Flowing progress bar pinned to bottom of status bar */
.status-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent-success) 25%,
    var(--accent-success) 50%,
    var(--accent-success) 75%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: progress-flow 2s linear infinite;
}

@keyframes progress-flow {
  0% {
    background-position: 120% 0;
  }
  100% {
    background-position: -120% 0;
  }
}

/* Text slide-swap transition */
.text-swap-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.text-swap-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.text-swap-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.text-swap-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

/* Status bar mount/unmount */
.status-bar-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.status-bar-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.status-bar-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.status-bar-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 0);
}
</style>
