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
import { Sparkles } from "lucide-vue-next";
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
    showNotificationBanner.value = true;
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
  query_canvas: "查看画布",
  collect_inspiration: "🔍 收集图片灵感",
  auto_layout: "📐 自动布局",
  align_nodes: "对齐元素",
  distribute_nodes: "分布元素",
  set_brand: "🏷️ 设置品牌",
  apply_palette: "🎨 应用色板",
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

const currentStatusText = computed(() => {
  if (!running.value) return "";
  const lastMsg = messages.value[messages.value.length - 1];
  if (lastMsg && lastMsg.role === "assistant") {
    const activeTool = lastMsg.tools.find((t) => !t.done);
    if (activeTool) {
      if (activeTool.name === "collect_inspiration")
        return "正在收集图片灵感...";
      return `正在执行 ${toolLabel(activeTool.name)}...`;
    }
    return "思考中...";
  }
  return "思考中...";
});

const estimatedTimeText = computed(() => {
  const lastMsg = messages.value[messages.value.length - 1];
  if (lastMsg && lastMsg.role === "assistant") {
    const activeTool = lastMsg.tools.find((t) => !t.done);
    if (activeTool) {
      if (activeTool.name === "collect_inspiration") return "1分钟";
    }
  }
  return "30秒";
});

function enableNotification() {
  notificationEnabled.value = true;
  showNotificationBanner.value = false;
  alert("任务完成通知已开启");
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
          <div class="notification-left">
            <span class="notification-icon">🔔</span>
            <span class="notification-text">任务完成时通知我</span>
          </div>
          <div class="notification-actions">
            <button class="notification-btn-enable" @click="enableNotification">
              开启
            </button>
            <button
              class="notification-btn-close"
              @click="showNotificationBanner = false"
            >
              ×
            </button>
          </div>
        </div>

        <!-- Bottom Status Bar -->
        <div v-if="running" class="agent-status-bar">
          <div class="status-left">
            <span class="status-logo-pulse"><Sparkles :size="10" /></span>
            <span class="status-text">{{ currentStatusText }}</span>
          </div>
          <div class="status-right">
            <span class="status-timer"
              >{{ formattedElapsedTime }} / {{ estimatedTimeText }}</span
            >
          </div>
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
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.08);
  border-top: 1px solid rgba(59, 130, 246, 0.12);
  border-bottom: 1px solid rgba(59, 130, 246, 0.12);
  font-size: 12px;
}

.notification-left {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #2563eb;
  font-weight: 500;
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notification-btn-enable {
  background: #2563eb;
  color: #fff;
  border: none;
  padding: 2.5px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: opacity 0.15s ease;
}

.notification-btn-enable:hover {
  opacity: 0.9;
}

.notification-btn-close {
  background: transparent;
  color: #6b7280;
  border: none;
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}

.agent-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--p-surface-50, #f9fafb);
  border-top: 1px solid var(--p-surface-100, #f3f4f6);
  font-size: 12px;
  color: var(--p-text-muted-color, #6b7280);
}

.status-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-logo-pulse {
  width: 16px;
  height: 16px;
  border-radius: 4.5px;
  background: linear-gradient(
    135deg,
    var(--p-primary-color),
    var(--p-primary-active-color, #6d28d9)
  );
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse-glow 1.5s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.08);
    opacity: 1;
  }
}

.status-text {
  font-weight: 500;
  color: var(--p-text-color, #111);
}

.status-timer {
  font-family: var(--font-family-mono, monospace);
  font-size: 11px;
  font-weight: 600;
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
