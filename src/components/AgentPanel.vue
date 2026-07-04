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

const props = defineProps<{
  canvasApp: Ref<any> | any;
  recordHistory?: () => void;
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
  loadingHistory,
  send,
  retryLastMessage,
  stop,
  reset,
  nodeStates,
  zoomToNode,
} = useAgent(
  canvasAppRef as any,
  props.recordHistory,
  toRef(props, "workspaceId") as any,
  props.onAgentPlace as any,
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
  if (confirm("确定要清空当前会话吗？")) {
    reset();
  }
}

const containerRef = ref<HTMLElement | null>(null);
const isVisible = ref(!props.collapsed);

// Refs for content animation
const headerRef = ref<HTMLElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const bottomRef = ref<HTMLElement | null>(null);

onMounted(() => {
  if (collapsed.value) {
    gsap.set(containerRef.value, { x: 420, opacity: 0 });
    isVisible.value = false;
  }
});

watch(collapsed, (isCollapsed) => {
  if (isCollapsed) {
    // Smooth exit animation first, hide display after animation finishes
    gsap.to(containerRef.value, {
      x: 420,
      opacity: 0,
      duration: 0.22,
      ease: "power2.in",
      onComplete: () => {
        isVisible.value = false;
      },
    });
  } else {
    // Show display first, then slide & fade enter
    isVisible.value = true;
    gsap.fromTo(
      containerRef.value,
      { x: 420, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.28,
        ease: "power3.out",
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
      new Notification("AgentsBoard 设计任务已完成", {
        body: "您的 AI 设计已成功放置到画布！",
      });
    }
  }
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const suggestions = [
  "生成一张可爱的橘猫照片",
  "做一张咖啡店开业海报，暖色调",
  "画一个科技感的产品 banner",
  "生成一段海浪的短视频",
];

async function submit(payload?: { text: string; attachments: string[] }) {
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
</script>

<template>
  <div
    ref="containerRef"
    class="agent-panel w-[420px]"
    :style="{ display: isVisible ? 'flex' : 'none' }"
  >
    <div class="flex-1 flex flex-col min-h-0">
      <!-- Header -->
      <div ref="headerRef" class="panel-header-row">
        <AgentHeader
          :messages-count="messages.length"
          @reset="handleReset"
          @collapse="collapsed = true"
        />
      </div>

      <!-- Messages -->
      <div ref="messagesRef" class="flex-1 min-h-0 flex flex-col">
        <AgentMessages
          ref="scrollRef"
          :messages="messages"
          :node-states="nodeStates"
          :suggestions="suggestions"
          :loading="loadingHistory"
          :running="running"
          :elapsed-time="elapsedTime"
          @use-suggestion="useSuggestion"
          @zoom-to-node="zoomToNode"
          @scroll="onScroll"
          @retry="retryLastMessage"
        />
      </div>

      <!-- Bottom Layout Group -->
      <div ref="bottomRef" class="agent-panel-bottom">
        <!-- Input Wrap -->
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
  right: 0;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-0, #fff);
  border-left: 1px solid var(--p-surface-200, #e5e7eb);
  overflow: hidden;
  z-index: 99;
}

.panel-header-row {
  display: flex;
  align-items: center;
  width: 100%;
  flex-shrink: 0;
}

.agent-panel-bottom {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-0, #fff);
  box-shadow: 0 -8px 16px -4px rgba(0, 0, 0, 0.04);
  z-index: 50;
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
  border-top: 1px solid var(--p-surface-100, #f3f4f6);
  font-size: var(--text-sm);
  color: var(--p-text-muted-color, #6b7280);
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
  color: var(--p-primary-color, #6d28d9);
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
  color: var(--p-text-muted-color, #9ca3af);
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
  background: rgba(250, 250, 250, 0.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.status-icon {
  display: flex;
  align-items: center;
  color: #10b981;
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
  color: #3f3f46;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-timer {
  font-family: var(--font-family-mono, "JetBrains Mono", "SF Mono", monospace);
  font-size: 11px;
  color: #a1a1aa;
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
    #10b981 25%,
    #34d399 50%,
    #10b981 75%,
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
