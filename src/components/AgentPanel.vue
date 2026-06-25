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
import { Button } from "primevue";
import { gsap } from "gsap";

import AgentHeader from "./agent/AgentHeader.vue";
import AgentMessages from "./agent/AgentMessages.vue";
import AgentInput from "./agent/AgentInput.vue";

const props = defineProps<{
  canvasApp: Ref<any> | any;
  recordHistory?: () => void;
  collapsed: boolean;
  workspaceId: string | number | null;
}>();

const emit = defineEmits<{
  (e: "update:collapsed", val: boolean): void;
}>();

const canvasAppRef = ref(props.canvasApp);
watch(
  () => props.canvasApp,
  (v) => (canvasAppRef.value = v),
);

const { messages, running, send, stop, reset, nodeStates, zoomToNode } =
  useAgent(
    canvasAppRef as any,
    props.recordHistory,
    toRef(props, "workspaceId"),
  );

const collapsed = computed({
  get: () => props.collapsed,
  set: (val) => emit("update:collapsed", val),
});
const input = ref("");
const scrollRef = ref<any>(null);
const userScrolledUp = ref(false);
const isScrollingToBottom = ref(false);

function onScroll() {
  if (scrollRef.value && !isScrollingToBottom.value) {
    userScrolledUp.value = scrollRef.value.isUserScrolledUp();
  }
}

function scrollToBottomForce() {
  if (scrollRef.value) {
    isScrollingToBottom.value = true;
    userScrolledUp.value = false;
    scrollRef.value.scrollToBottom();
    setTimeout(() => {
      isScrollingToBottom.value = false;
    }, 400);
  }
}

function handleReset() {
  if (messages.value.length === 0) return;
  if (confirm("确定要清空当前会话吗？")) {
    reset();
  }
}

const containerRef = ref<HTMLElement | null>(null);

onMounted(() => {
  if (collapsed.value) {
    gsap.set(containerRef.value, {
      // width: 0,
      x: 400,
      borderLeftWidth: 0,
    });
  }
});

watch(collapsed, (isCollapsed) => {
  if (isCollapsed) {
    gsap.to(containerRef.value, {
      // width: 0,
      x: 400,
      borderLeftWidth: 0,
      duration: 0.35,
      ease: "power2.inOut",
    });
  } else {
    gsap.to(containerRef.value, {
      // width: 400,
      x: 0,
      borderLeftWidth: 1,
      duration: 0.25,
      ease: "power2.inOut",
    });
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
    showNotificationBanner.value = !notificationEnabled.value; // Only show banner if notification is not yet enabled
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
        body: `AI 助手已经完成了设计！总共耗时 ${formattedElapsedTime.value}。`,
        icon: "/favicon.ico",
      });
    }
  }
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const formattedElapsedTime = computed(() => {
  const m = Math.floor(elapsedTime.value / 60);
  const s = elapsedTime.value % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
});

const TOOL_LABELS: Record<string, string> = {
  set_frame: "设置画板",
  generate_image: "生成图片",
  generate_video: "生成视频",
  add_text: "添加文字",
  add_rect: "添加图形",
  update_node: "调整元素",
  remove_node: "删除元素",
  query_canvas: "读取画布",
  collect_inspiration: "收集灵感",
  auto_layout: "自动布局",
  align_nodes: "对齐元素",
  distribute_nodes: "分布元素",
  set_brand: "设置品牌",
  apply_palette: "应用配色",
  verify_design: "视觉质检",
  plan_design: "规划任务",
  export_node_image: "截取画面",
  analyze_design: "视觉分析",
  review_and_adjust: "布局检查",
  focus_node: "聚焦元素",
  add_frame: "添加画板",
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

const currentStatusText = computed(() => {
  if (!running.value) return "";
  const lastMsg = messages.value[messages.value.length - 1];
  if (lastMsg && lastMsg.role === "assistant") {
    const activeTool = lastMsg.tools.find((t) => !t.done);
    if (activeTool) return toolLabel(activeTool.name);
    return "思考中";
  }
  return "思考中";
});

function enableNotification() {
  if (!("Notification" in window)) {
    alert("您的浏览器不支持系统通知。");
    return;
  }
  Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      notificationEnabled.value = true;
      showNotificationBanner.value = false;
      // Show confirmation notification
      new Notification("通知已开启", {
        body: "当 Agent 任务完成时，您将会收到通知气泡！",
      });
    } else {
      alert("系统通知权限已被拒绝，请在浏览器设置中允许通知以启用该功能。");
    }
  });
}

const suggestions = [
  "生成一张可爱的橘猫照片",
  "做一张咖啡店开业海报，暖色调",
  "画一个科技感的产品 banner",
  "生成一段海浪的短视频",
];

async function submit(payload?: { text: string; attachments: string[] }) {
  const text = payload?.text ?? input.value;
  const files = payload?.attachments ?? [];
  if ((!text.trim() && files.length === 0) || running.value) return;
  input.value = "";
  await send(text, files);
}

function useSuggestion(s: string) {
  input.value = s;
  submit();
}
</script>

<template>
  <div ref="containerRef" class="agent-panel shrink-0" style="width: 400px">
    <div class="flex flex-col h-full justify-start">
      <!-- Header -->
      <AgentHeader
        :messages-count="messages.length"
        @reset="handleReset"
        @collapse="collapsed = true"
      />

      <!-- Messages -->
      <AgentMessages
        ref="scrollRef"
        :messages="messages"
        :node-states="nodeStates"
        :suggestions="suggestions"
        @use-suggestion="useSuggestion"
        @zoom-to-node="zoomToNode"
        @scroll="onScroll"
      />

      <!-- Bottom Layout Group -->
      <div class="agent-panel-bottom">
        <!-- Floating Scroll-to-bottom Button -->
        <Transition name="fade">
          <Button
            severity="secondary"
            raised
            v-if="userScrolledUp"
            class="scroll-to-bottom-btn"
            @click="scrollToBottomForce"
            :icon="'pi pi-angle-down'"
            rounded
          >
          </Button>
        </Transition>

        <!-- Notification Banner -->
        <div
          v-if="showNotificationBanner && running"
          class="notification-banner"
        >
          <span class="notification-text">完成后通知我</span>
          <div class="notification-actions">
            <button class="notification-btn-enable" @click="enableNotification">开启</button>
            <button class="notification-btn-close" @click="showNotificationBanner = false">×</button>
          </div>
        </div>

        <!-- Bottom Status Bar -->
        <div v-if="running" class="agent-status-bar">
          <span class="status-dot" />
          <span class="status-text">{{ currentStatusText }}</span>
          <span class="status-timer">{{ formattedElapsedTime }}</span>
        </div>

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

.agent-status-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  font-size: var(--text-sm);
  color: var(--p-text-muted-color, #6b7280);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--p-primary-color, #6d28d9);
  flex-shrink: 0;
  animation: dot-pulse 1.6s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}

.status-text {
  flex: 1;
  font-weight: 400;
  color: var(--p-text-muted-color, #6b7280);
}

.status-timer {
  font-family: var(--font-family-mono, monospace);
  font-size: var(--text-xs);
  color: var(--p-text-muted-color, #9ca3af);
  font-weight: 400;
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
