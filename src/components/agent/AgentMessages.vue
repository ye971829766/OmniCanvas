<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import { RotateCcw, ChevronDown } from "lucide-vue-next";
import {
  IncremarkContent,
  AutoScrollContainer,
  type UseIncremarkOptions,
} from "@incremark/vue";
import { vStreamingDot } from "@/directives/vStreamingDot";
import ToolCallCard from "./ToolCallCard.vue";
import ToolCallGroup from "./ToolCallGroup.vue";
import GeneratedMediaGallery from "./GeneratedMediaGallery.vue";
import AgentPlanCard from "./AgentPlanCard.vue";
import { Image } from "primevue";
import logoImg from "@/assets/logo.jpg";
import type { ChatMessage, ToolCallItem } from "@/composables/useAgent";
import { stripInternalToolErrors } from "@/composables/useAgent";
import { getToolActiveLabel, isInternalAgentTool } from "./tool-labels";

function getToolActiveNameText(name: string): string {
  if (name === "generate_image") return "正在执行 GPT Image 2";
  if (name === "collect_inspiration") return "正在收集图片灵感";
  if (name === "generate_video") return "正在执行 VideoGen";
  if (
    name === "add_text" ||
    name === "set_frame" ||
    name === "add_rect" ||
    name === "add_frame"
  ) {
    return "正在进行排版设计";
  }
  return getToolActiveLabel(name);
}

function getThinkingText(m: ChatMessage): string {
  if (m.tools && m.tools.length > 0) {
    const activeTool = m.tools.find(
      (tool) => !tool.done && !isInternalAgentTool(tool.name),
    );
    if (activeTool) {
      return getToolActiveNameText(activeTool.name);
    }
    if (m.tools.some((tool) => !tool.done && isInternalAgentTool(tool.name))) {
      return "正在完善设计细节";
    }
  }
  if (m.progress?.message) {
    return /(质量检测|验证质量|视觉验证|质检)/.test(m.progress.message)
      ? "正在完善设计细节"
      : m.progress.message;
  }
  return "思考中";
}


const props = defineProps<{
  messages: ChatMessage[];
  nodeStates: Record<string, any>;
  suggestions: string[];
  loading?: boolean;
  running?: boolean;
  elapsedTime?: number;
}>();

const emit = defineEmits<{
  (e: "useSuggestion", s: string): void;
  (e: "zoomToNode", refId: string): void;
  (e: "scroll"): void;
  (e: "retry"): void;
}>();

const scrollRef = ref<any>(null);
const userScrolledUp = ref(false);
let autoScrollTimer: ReturnType<typeof setTimeout> | null = null;

function scrollToBottom() {
  scrollRef.value?.scrollToBottom();
  userScrolledUp.value = false;
}

watch(
  () => props.loading,
  async (isLoading) => {
    if (!isLoading) {
      await nextTick();
      scrollToBottom();
      setTimeout(() => scrollToBottom(), 120);
      setTimeout(() => scrollToBottom(), 350);
    }
  },
);

watch(
  () =>
    props.messages
      .map(
        (message) =>
          `${message.id}:${message.text.length}:${message.liveText?.length || 0}:` +
          `${message.blocks?.length || 0}:${message.tools.length}:` +
          `${message.tools.filter((tool) => tool.done).length}:` +
          `${message.progress?.message || ""}:` +
          `${message.plan?.steps.filter((step) => step.status === "completed").length || 0}`,
      )
      .join("|"),
  () => {
    if (userScrolledUp.value) return;
    if (autoScrollTimer) clearTimeout(autoScrollTimer);
    autoScrollTimer = setTimeout(async () => {
      await nextTick();
      if (!userScrolledUp.value) scrollToBottom();
      autoScrollTimer = null;
    }, 80);
  },
);

onBeforeUnmount(() => {
  if (autoScrollTimer) clearTimeout(autoScrollTimer);
});

function handleScroll() {
  if (scrollRef.value) {
    userScrolledUp.value = scrollRef.value.isUserScrolledUp() ?? false;
  }
  emit("scroll");
}

function isUserScrolledUp() {
  return scrollRef.value?.isUserScrolledUp() ?? false;
}

defineExpose({
  scrollToBottom,
  isUserScrolledUp,
});

const getIncremarkOptions = (streaming: boolean): UseIncremarkOptions => ({
  gfm: true,
  math: { tex: true },
  typewriter: {
    enabled: streaming,
    charsPerTick: [1, 3],
    tickInterval: 30,
    effect: "none",
  },
});

interface ToolRenderBlock {
  type: "single" | "group";
  tool?: ToolCallItem;
  tools?: ToolCallItem[];
  id: string;
}

function getVisibleTools(tools: ToolCallItem[] = []): ToolCallItem[] {
  return tools.filter((tool) => !isInternalAgentTool(tool.name));
}

function groupTools(tools: ToolCallItem[]): ToolRenderBlock[] {
  const visibleTools = getVisibleTools(tools);
  if (!visibleTools.length) return [];

  const STANDALONE_TOOLS = new Set([
    "generate_image",
    "generate_video",
    "collect_inspiration",
    "edit_image",
    "remove_background",
    "inpaint_image",
    "upscale_image",
    "plan_ecommerce_suite",
  ]);

  const blocks: ToolRenderBlock[] = [];
  let currentGroup: ToolCallItem[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      if (currentGroup.length === 1) {
        blocks.push({
          type: "single",
          tool: currentGroup[0],
          id: currentGroup[0].id,
        });
      } else {
        blocks.push({
          type: "group",
          tools: [...currentGroup],
          id: `blk_group_${currentGroup[0].id}`,
        });
      }
      currentGroup = [];
    }
  };

  for (const tool of visibleTools) {
    if (STANDALONE_TOOLS.has(tool.name)) {
      flushGroup();
      blocks.push({
        type: "single",
        tool,
        id: tool.id,
      });
    } else {
      currentGroup.push(tool);
    }
  }
  flushGroup();
  return blocks;
}

function filterBlocks(blocks: any[]): any[] {
  if (!blocks || !blocks.length) return [];
  const result: any[] = [];

  for (const blk of blocks) {
    if (blk.type === "text" || blk.type === "update") {
      if (blk.text && stripInternalToolErrors(blk.text).trim()) {
        result.push(blk);
      }
    } else if (blk.type === "tools" && blk.tools?.length) {
      result.push(blk);
    } else if (blk.type === "plan" && blk.plan?.steps) {
      result.push(blk);
    }
  }

  return result;
}

function hasBlockType(message: ChatMessage, type: string): boolean {
  return Boolean(message.blocks?.some((block) => block.type === type));
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return "";
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function getRunDuration(message: ChatMessage): string {
  if (message.streaming) return formatDuration((props.elapsedTime || 0) * 1000);
  return formatDuration(message.elapsedMs);
}

function getRunLabel(message: ChatMessage): string {
  if (message.streaming || message.runStatus === "running") return "处理中";
  if (message.runStatus === "stopped") return "已停止";
  if (message.error || message.runStatus === "failed") return "未完成";
  return "已处理";
}

interface ParsedMessagePart {
  type: "text" | "grid" | "image_ref";
  content: string | string[];
  refId?: string;
}

function normalizeCodeLangs(raw: string): string {
  if (!raw) return "";
  return raw.replace(/```(math|maths|formula|equation)\b/gi, "```latex");
}

function parseMessageText(text: string): ParsedMessagePart[] {
  text = normalizeCodeLangs(stripInternalToolErrors(text));
  if (!text || !text.trim()) return [];
  const regex = /\[inspiration_grid:([^\]]+)\]|\[@image:#([^\]]+)\]/g;
  const parts: ParsedMessagePart[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const sub = text.substring(lastIndex, match.index);
      if (sub.trim()) {
        parts.push({
          type: "text",
          content: sub,
        });
      }
    }
    if (match[1]) {
      const urls = match[1].split(",").map((u) => u.trim());
      parts.push({ type: "grid", content: urls });
    } else if (match[2]) {
      const refId = match[2].trim();
      parts.push({ type: "image_ref", content: `[@image:#${refId}]`, refId });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const tail = text.substring(lastIndex);
    if (tail.trim()) {
      parts.push({ type: "text", content: tail });
    }
  }

  return parts;
}

function parseUserText(text: string) {
  if (!text) return [];
  const regex = /(@\w+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
    }
    parts.push({ type: "mention", content: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.substring(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", content: text }];
}
</script>

<template>
  <div class="agent-messages-container relative flex-1 flex flex-col min-h-0">
    <AutoScrollContainer
      ref="scrollRef"
      class="agent-messages"
      :threshold="60"
      behavior="smooth"
      @scroll="handleScroll"
    >
      <!-- Loading history skeleton -->
      <div v-if="props.loading" class="agent-loading-history">
        <div class="loading-skeleton" v-for="i in 3" :key="i">
          <div class="skeleton-avatar" />
          <div class="skeleton-lines">
            <div class="skeleton-line" :style="{ width: `${60 + i * 10}%` }" />
            <div
              class="skeleton-line short"
              :style="{ width: `${30 + i * 8}%` }"
            />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="messages.length === 0" class="agent-empty">
        <div class="ambient-blob blob-1" aria-hidden="true" />
        <div class="ambient-blob blob-2" aria-hidden="true" />
        <div class="ambient-blob blob-3" aria-hidden="true" />
        <div class="agent-empty-logo">
          <img
            :src="logoImg"
            alt="OmniCanvas"
            width="56"
            height="56"
            style="width: 56px; height: 56px; object-fit: cover"
            class="agent-empty-logo-img float-logo"
          />
        </div>
        <p class="empty-title">告诉我你想设计什么</p>
        <p class="empty-sub">描述想法，我来生成图像、视频和排版</p>
        <div class="agent-suggestions">
          <button
            v-for="s in suggestions"
            :key="s"
            class="agent-chip"
            @click="emit('useSuggestion', s)"
          >
            <span class="chip-text">{{ s }}</span>
            <span class="chip-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <!-- Conversation -->
      <template v-for="m in messages" :key="m.id">
        <!-- user -->
        <div
          v-if="
            m.role === 'user' &&
            m.text.trim() !== '[Visual Image Expired in History]'
          "
          class="flex flex-col items-end w-full group relative"
        >
          <div class="agent-bubble-user-wrap relative">
            <div class="agent-bubble-user">
              <template
                v-for="(part, pidx) in parseUserText(m.text)"
                :key="pidx"
              >
                <span v-if="part.type === 'mention'" class="mention-chip-msg">{{
                  part.content
                }}</span>
                <template v-else>{{ part.content }}</template>
              </template>
            </div>
          </div>
          <!-- user attachments grid -->
          <div
            v-if="m.images && m.images.length > 0"
            class="user-attached-images"
          >
            <div
              v-for="(img, iidx) in m.images"
              :key="iidx"
              class="user-image-wrapper"
              style="width: 72px; height: 72px"
            >
              <Image class="user-image" :src="img" alt="Image" preview />
            </div>
          </div>
        </div>

        <!-- assistant run, rendered as an execution record instead of a chat bubble -->
        <div v-else class="assistant-run">
          <div class="run-meta" :class="`is-${m.runStatus || 'completed'}`">
            <span>{{ getRunLabel(m) }}</span>
            <span v-if="getRunDuration(m)" class="run-duration">
              {{ getRunDuration(m) }}
            </span>
          </div>
          <div class="run-divider" />

          <div
            v-if="m.streaming && (m.progress?.message || m.tools.some((tool) => !tool.done))"
            class="run-progress"
            role="status"
            aria-live="polite"
          >
            {{ getThinkingText(m) }}
          </div>

          <div v-if="m.blocks?.length" class="run-blocks">
            <template v-for="blk in filterBlocks(m.blocks)" :key="blk.id">
              <div v-if="blk.type === 'update'" class="run-update">
                <span class="run-update-dot" aria-hidden="true" />
                <IncremarkContent
                  class="incremark update-markdown"
                  :content="stripInternalToolErrors(blk.text)"
                  :is-finished="true"
                  :incremark-options="getIncremarkOptions(false)"
                />
              </div>

              <AgentPlanCard
                v-else-if="blk.type === 'plan'"
                :plan="blk.plan"
              />

              <div
                v-else-if="blk.type === 'tools' && groupTools(blk.tools).length"
                class="tool-cards"
              >
                <template
                  v-for="block in groupTools(blk.tools)"
                  :key="block.id"
                >
                  <ToolCallGroup
                    v-if="block.type === 'group' && block.tools"
                    :tools="block.tools"
                  />
                  <ToolCallCard
                    v-else-if="block.type === 'single' && block.tool"
                    :tool="block.tool"
                  />
                </template>
                <GeneratedMediaGallery
                  :tools="getVisibleTools(blk.tools)"
                  :node-states="nodeStates"
                  @zoom="emit('zoomToNode', $event)"
                />
              </div>

              <div
                v-else-if="blk.type === 'text'"
                class="agent-bubble-ai run-final"
              >
                <template
                  v-for="(part, idx) in parseMessageText(blk.text)"
                  :key="idx"
                >
                  <IncremarkContent
                    v-if="part.type === 'text' && typeof part.content === 'string'"
                    class="incremark markdown-body"
                    :content="part.content"
                    :is-finished="true"
                    :incremark-options="getIncremarkOptions(false)"
                  />
                  <div v-else-if="part.type === 'grid'" class="inspiration-grid">
                    <div
                      v-for="(url, uidx) in part.content"
                      :key="uidx"
                      class="inspiration-item"
                    >
                      <img :src="url" class="inspiration-img" />
                    </div>
                  </div>
                  <button
                    v-else-if="part.type === 'image_ref' && part.refId"
                    class="inline-image-tag-btn"
                    @click="emit('zoomToNode', part.refId)"
                  >
                    {{ part.content }}
                  </button>
                </template>
              </div>
            </template>
          </div>

          <AgentPlanCard
            v-if="m.plan && !hasBlockType(m, 'plan')"
            :plan="m.plan"
          />

          <div v-if="m.streaming && m.liveText?.trim()" class="run-live-update">
            <IncremarkContent
              v-streaming-dot="true"
              class="incremark update-markdown"
              :content="stripInternalToolErrors(m.liveText)"
              :is-finished="false"
              :incremark-options="getIncremarkOptions(true)"
            />
          </div>

          <div
            v-if="
              !m.blocks?.length &&
              m.text &&
              stripInternalToolErrors(m.text).trim()
            "
            class="agent-bubble-ai run-final"
          >
            <IncremarkContent
              class="incremark markdown-body"
              :content="stripInternalToolErrors(m.text)"
              :is-finished="!m.streaming"
              :incremark-options="getIncremarkOptions(!!m.streaming)"
            />
          </div>

          <div v-if="m.error" class="structured-error-card mt-2">
            <div class="error-card-header">
              <span class="error-card-title">任务未能完成</span>
            </div>
            <p class="error-card-desc">{{ m.error }}</p>
            <div class="error-card-actions">
              <button class="error-retry-btn" @click="emit('retry')">
                <RotateCcw :size="12" />
                <span>重试</span>
              </button>
            </div>
          </div>

          <GeneratedMediaGallery
            v-if="m.tools.length && !hasBlockType(m, 'tools')"
            :tools="m.tools"
            :node-states="nodeStates"
            @zoom="emit('zoomToNode', $event)"
          />
        </div>
      </template>
    </AutoScrollContainer>

    <!-- Floating Scroll-to-Bottom Button (Reference Image 1/2 style) -->
    <Transition name="fade">
      <button
        v-if="userScrolledUp"
        class="floating-scroll-bottom-btn"
        @click="scrollToBottom"
        title="滚动到最新消息"
        aria-label="滚动到底部"
      >
        <ChevronDown :size="16" />
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.agent-loading-history {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 16px;
}

.loading-skeleton {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.skeleton-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--p-surface-200, #e4e4e7);
  flex-shrink: 0;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: var(--p-surface-200, #e4e4e7);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-line.short {
  height: 10px;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.8;
  }
}

.agent-empty {
  margin: auto 0;
  text-align: center;
  padding: 16px 4px;
}

.agent-empty-logo {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.agent-empty-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Gentle float for empty-state logo */
.float-logo {
  animation: logo-float 3s ease-in-out infinite;
  transform-origin: center;
}

@keyframes logo-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

/* ── E2: Ambient background blobs ────────────────────────────────── */
.ambient-blob {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0.025;
  filter: blur(32px);
  animation: blob-drift 8s ease-in-out infinite;
}

.blob-1 {
  width: 120px;
  height: 120px;
  background: #7c3aed;
  top: 10%;
  left: 15%;
  animation-delay: 0s;
  animation-duration: 9s;
}

.blob-2 {
  width: 80px;
  height: 80px;
  background: #10b981;
  top: 60%;
  right: 20%;
  animation-delay: -3s;
  animation-duration: 7s;
}

.blob-3 {
  width: 100px;
  height: 100px;
  background: #f59e0b;
  bottom: 15%;
  left: 35%;
  animation-delay: -5s;
  animation-duration: 11s;
}

@keyframes blob-drift {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(12px, -8px) scale(1.08);
  }
  66% {
    transform: translate(-8px, 6px) scale(0.94);
  }
}

/* Dark mode: blobs slightly more visible */
:global(.p-dark .ambient-blob) {
  opacity: 0.045;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--p-text-color, #18181b);
  margin: 12px 0 4px;
}

.empty-sub {
  font-size: var(--text-sm);
  color: var(--p-text-muted-color, #71717a);
  margin: 0 0 18px;
}

.agent-suggestions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  padding: 0 8px;
}

.agent-chip {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--p-surface-200, #e5e7eb);
  background: transparent;
  color: var(--p-text-color, #18181b);
  font-size: var(--text-sm);
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.agent-chip:hover {
  background: var(--p-surface-50, #fafafa);
  border-color: var(--p-surface-300, #d4d4d8);
  transform: translateY(-2px);
}

.chip-text {
  flex: 1;
}

.chip-arrow {
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  color: var(--p-text-muted-color, #71717a);
  font-size: 12px;
  flex-shrink: 0;
}

.agent-chip:hover .chip-arrow {
  opacity: 1;
  transform: translateX(0);
}

.agent-bubble-user {
  max-width: 88%;
  padding: 10px 14px;
  border-radius: 18px 18px 4px 18px;
  background: var(--surface-hover);
  color: var(--text-primary);
  font-size: var(--text-base);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  animation: msg-enter-user 0.28s cubic-bezier(0, 0, 0.2, 1) both;
}

@keyframes msg-enter-user {
  from {
    opacity: 0;
    transform: scale(0.93) translateX(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateX(0);
  }
}

.agent-bubble-ai {
  max-width: 100%;
  padding: 0;
  background: transparent;
  font-size: var(--text-base);
  line-height: 1.7;
  word-break: break-word;
  animation: msg-enter-ai 0.3s cubic-bezier(0, 0, 0.2, 1) both;
}

.assistant-run {
  --agent-text-primary: var(--p-text-color, #18181b);
  --agent-text-secondary: #52525b;
  --agent-text-muted: #71717a;
  --agent-text-disabled: #a1a1aa;
  --agent-border-subtle: var(--p-surface-200, #e4e4e7);
  --agent-border-strong: var(--p-surface-300, #d4d4d8);
  --agent-surface: var(--p-surface-50, #fafafa);
  --agent-surface-raised: var(--p-surface-0, #ffffff);
  --agent-surface-hover: var(--p-surface-100, #f4f4f5);
  --accent-primary: #4f46e5;
  --accent-success: #15803d;
  --accent-error: #dc2626;
  --accent-warning: #b45309;

  --text-primary: var(--agent-text-primary);
  --text-secondary: var(--agent-text-secondary);
  --text-muted: var(--agent-text-muted);
  --text-disabled: var(--agent-text-disabled);
  --surface-panel: var(--agent-surface-raised);
  --surface-sunken: var(--agent-surface);
  --surface-hover: var(--agent-surface-hover);
  --surface-active: var(--agent-border-subtle);
  --border-default: var(--agent-border-subtle);
  --border-subtle: var(--agent-border-subtle);
  --border-strong: var(--agent-border-strong);

  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 0 4px;
}

.run-meta {
  display: flex;
  align-items: baseline;
  gap: 5px;
  color: var(--agent-text-muted);
  font-size: 11.5px;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}

.run-meta.is-failed,
.run-meta.is-stopped {
  color: var(--accent-error, #dc2626);
}

.run-duration {
  color: var(--agent-text-disabled);
}

.run-divider {
  width: 100%;
  height: 1px;
  background: var(--agent-border-subtle);
}

.run-progress {
  color: var(--agent-text-secondary);
  font-size: 12.5px;
  line-height: 1.45;
}

.run-blocks {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.run-update {
  min-width: 0;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  align-items: start;
  gap: 6px;
  color: var(--agent-text-secondary);
}

.run-update-dot {
  width: 4px;
  height: 4px;
  margin: 8px 0 0 2px;
  border-radius: 50%;
  background: var(--agent-text-muted);
}

.update-markdown {
  min-width: 0;
  color: var(--agent-text-secondary);
  font-size: 12.5px;
  line-height: 1.58;
  overflow-wrap: anywhere;
}

.update-markdown :deep(p),
.update-markdown :deep(li),
.update-markdown :deep(ul),
.update-markdown :deep(ol) {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
  margin: 0;
}

.update-markdown :deep(strong) {
  color: var(--agent-text-primary);
  font-weight: 600;
}

.update-markdown :deep(em) {
  color: inherit;
}

.update-markdown :deep(code) {
  color: var(--agent-text-primary);
  font-size: 0.92em;
  background: var(--agent-surface-hover);
  border: 1px solid var(--agent-border-subtle);
  border-radius: 4px;
  padding: 0.08em 0.3em;
}

.update-markdown :deep(ul),
.update-markdown :deep(ol) {
  padding-left: 1.15rem;
}

.run-live-update {
  padding-left: 16px;
}

.run-final {
  padding-top: 2px;
}

@keyframes msg-enter-ai {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── ChatGPT-style Pulsing Streaming Dot (Inline at text tail) ────── */
.incremark {
  --incremark-color-text-primary: var(--agent-text-primary, #18181b);
  --incremark-color-text-secondary: var(--agent-text-secondary, #52525b);
  --incremark-color-text-tertiary: var(--agent-text-muted, #71717a);
  --incremark-color-background-base: var(--agent-surface-raised, #ffffff);
  --incremark-color-background-elevated: var(--agent-surface, #fafafa);
  --incremark-color-border-default: var(--agent-border-subtle, #e4e4e7);
  --incremark-color-border-subtle: var(--agent-border-subtle, #e4e4e7);
  --incremark-color-border-strong: var(--agent-border-strong, #d4d4d8);
  --incremark-color-code-inline-background: var(--agent-surface-hover, #f4f4f5);
  --incremark-color-code-inline-text: var(--agent-text-primary, #18181b);
  --incremark-color-code-block-background: #18181b;
  --incremark-color-code-block-text: #f4f4f5;
  --incremark-color-interactive-link: var(--agent-text-primary, #18181b);
  --incremark-color-interactive-link-hover: var(--agent-text-primary, #18181b);
  --incremark-color-interactive-link-visited: var(--agent-text-secondary, #52525b);
  --incremark-color-interactive-checked: var(--accent-success, #15803d);
  --incremark-color-status-pending: var(--accent-primary, #4f46e5);
  --incremark-color-status-completed: var(--accent-success, #15803d);
  --incremark-color-neutral-2: var(--agent-surface, #fafafa);
  --incremark-color-neutral-8: var(--agent-text-secondary, #52525b);
  --incremark-color-neutral-9: var(--agent-text-primary, #18181b);
  --incremark-typography-font-size-base: 14px;
  --incremark-typography-font-size-heading-h1: 15px;
  --incremark-typography-font-size-heading-h2: 14.5px;
  --incremark-typography-font-size-heading-h3: 14px;
  --incremark-typography-font-size-heading-h4: 14px;
  --incremark-typography-font-size-heading-h5: 14px;
  --incremark-typography-font-size-heading-h6: 14px;
  position: relative;
}

:deep(.streaming-cursor-dot) {
  display: inline-block;
  width: 7.5px;
  height: 7.5px;
  border-radius: 50%;
  background: var(--p-text-color, #18181b);
  margin-left: 4px;
  vertical-align: 1px;
  transform-origin: center;
  animation: chatgpt-dot-pulse 0.8s ease-in-out infinite alternate;
}

:global(.p-dark .streaming-cursor-dot) {
  background: #f4f4f5;
}

@keyframes chatgpt-dot-pulse {
  0% {
    opacity: 0.2;
    transform: scale(0.75);
  }
  100% {
    opacity: 1;
    transform: scale(1.25);
  }
}

.markdown-body {
  --markdown-border: var(--agent-border-subtle);
  --markdown-border-strong: var(--agent-border-strong);
  --markdown-surface: var(--agent-surface);
  --markdown-surface-raised: var(--agent-surface-raised);
  --markdown-muted: var(--agent-text-muted);

  min-width: 0;
  max-width: 100%;
  font-size: 14px;
  line-height: 1.64;
  color: var(--agent-text-primary);
  overflow-wrap: anywhere;
  text-rendering: optimizeLegibility;
}

.markdown-body :deep(p) {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
  margin: 0 0 8px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 5px 0 9px;
  padding-left: 1.25rem;
}

.markdown-body :deep(li) {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
  margin: 2px 0;
  padding-left: 0.1rem;
}

.markdown-body :deep(li::marker) {
  color: var(--markdown-muted);
  font-size: 0.9em;
}

.markdown-body :deep(li > p) {
  margin: 0;
}

.markdown-body :deep(li > ul),
.markdown-body :deep(li > ol) {
  margin: 3px 0;
}

.markdown-body :deep(.incremark-list.task-list) {
  padding-left: 0;
  list-style: none;
}

.markdown-body :deep(.incremark-list-item.task-item) {
  padding-left: 0;
}

.markdown-body :deep(.task-label) {
  align-items: flex-start;
  gap: 8px;
}

.markdown-body :deep(.task-label .checkbox) {
  width: 15px;
  height: 15px;
  margin: 4px 0 0;
  accent-color: var(--p-primary-color, #18181b);
}

.markdown-body :deep(strong) {
  color: var(--agent-text-primary);
  font-weight: 600;
}

.markdown-body :deep(em) {
  color: var(--agent-text-secondary);
}

.markdown-body :deep(a) {
  color: var(--agent-text-primary);
  font-weight: 540;
  text-decoration-line: underline;
  text-decoration-color: rgba(24, 24, 27, 0.32);
  text-decoration-color: color-mix(
    in srgb,
    var(--p-text-color, #18181b) 32%,
    transparent
  );
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
  transition:
    color var(--dur-fast, 150ms) ease,
    text-decoration-color var(--dur-fast, 150ms) ease;
}

.markdown-body :deep(a:hover) {
  text-decoration-color: currentColor;
}

.markdown-body :deep(a:focus-visible) {
  outline: 2px solid var(--p-primary-color, #18181b);
  outline-offset: 2px;
  border-radius: 2px;
}

/* ── Markdown Tables ────────────────────────────────────────────── */
.markdown-body :deep(.incremark-table-wrapper) {
  max-width: 100%;
  margin: 12px 0;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  border: 1px solid var(--markdown-border);
  border-radius: 7px;
  background: var(--markdown-surface-raised);
  scrollbar-width: thin;
  scrollbar-color: var(--markdown-border-strong) transparent;
}

.markdown-body :deep(.incremark-table-wrapper::-webkit-scrollbar) {
  height: 6px;
}

.markdown-body :deep(.incremark-table-wrapper::-webkit-scrollbar-thumb) {
  background: var(--markdown-border-strong);
  border-radius: 999px;
}

.markdown-body :deep(table) {
  width: max-content;
  min-width: 100%;
  max-width: none;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  display: table;
}

.markdown-body :deep(thead) {
  background: var(--markdown-surface);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px 10px;
  border: 0;
  border-right: 1px solid var(--markdown-border);
  border-bottom: 1px solid var(--markdown-border);
  text-align: left;
  vertical-align: top;
  word-break: normal;
  overflow-wrap: anywhere;
}

.markdown-body :deep(th) {
  font-weight: 680;
  color: var(--p-text-color, #18181b);
  background: var(--markdown-surface);
  white-space: nowrap;
}

.markdown-body :deep(th:last-child),
.markdown-body :deep(td:last-child) {
  border-right: 0;
}

.markdown-body :deep(tbody tr:last-child td) {
  border-bottom: 0;
}

.markdown-body :deep(tbody tr) {
  background: var(--markdown-surface-raised);
  transition: background-color var(--dur-fast, 150ms) ease;
}

.markdown-body :deep(tbody tr:nth-child(even)) {
  background: var(--markdown-surface);
  background: color-mix(
    in srgb,
    var(--markdown-surface) 58%,
    var(--markdown-surface-raised)
  );
}

.markdown-body :deep(tbody tr:hover) {
  background: var(--markdown-surface);
}

/* ── Headings ────────────────────────────────────────────────────── */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  font-weight: 600;
  color: var(--agent-text-primary);
  margin: 14px 0 6px;
  line-height: 1.42;
  letter-spacing: 0;
  text-wrap: pretty;
}

.markdown-body :deep(h1) {
  font-size: 15px;
}
.markdown-body :deep(h2) {
  font-size: 14.5px;
}
.markdown-body :deep(h3) {
  font-size: 14px;
}
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  font-size: 14px;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child),
.markdown-body :deep(h4:first-child),
.markdown-body :deep(h5:first-child),
.markdown-body :deep(h6:first-child) {
  margin-top: 0;
}

/* ── Code & Pre ──────────────────────────────────────────────────── */
.markdown-body :deep(code) {
  font-family:
    "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.86em;
  background: var(--markdown-surface);
  color: var(--p-text-color, #18181b);
  padding: 0.16em 0.38em;
  border: 1px solid var(--markdown-border);
  border-radius: 4px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.markdown-body :deep(.incremark-code) {
  margin: 12px 0;
  border: 1px solid #3f3f46;
  border-radius: 7px;
  overflow: hidden;
  background: #18181b;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.markdown-body :deep(.code-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 8px 5px 12px;
  background: #202024;
  color: #a1a1aa;
  font-size: 11px;
  font-family:
    "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  min-height: 34px;
  border-bottom: 1px solid #3f3f46;
}

.markdown-body :deep(.code-header .language) {
  color: #a1a1aa;
  text-transform: lowercase;
  font-weight: 600;
  letter-spacing: 0;
}

.markdown-body :deep(.code-btn),
.markdown-body :deep(button.code-btn),
.markdown-body :deep(.incremark-code-copy-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  min-width: 26px;
  min-height: 26px;
  padding: 0;
  border: none;
  background: transparent;
  color: #a1a1aa;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  box-shadow: none;
  opacity: 0.82;
  transition:
    background-color var(--dur-fast, 150ms) ease,
    color var(--dur-fast, 150ms) ease,
    opacity var(--dur-fast, 150ms) ease;
}

.markdown-body :deep(.code-btn:hover),
.markdown-body :deep(button.code-btn:hover),
.markdown-body :deep(.incremark-code-copy-btn:hover) {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  opacity: 1;
}

.markdown-body :deep(.code-btn:focus-visible),
.markdown-body :deep(button.code-btn:focus-visible),
.markdown-body :deep(.incremark-code-copy-btn:focus-visible) {
  outline: 2px solid #a1a1aa;
  outline-offset: 1px;
  opacity: 1;
}

.markdown-body :deep(.code-btn svg),
.markdown-body :deep(button.code-btn svg),
.markdown-body :deep(.incremark-icon),
.markdown-body :deep(.incremark-icon svg) {
  width: 14px;
  height: 14px;
  max-width: 14px;
  max-height: 14px;
  display: block;
}

.markdown-body :deep(pre) {
  background: #18181b;
  color: #f4f4f5;
  max-width: 100%;
  padding: 12px 14px;
  border-radius: 0 0 8px 8px;
  overflow-x: auto;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.62;
  tab-size: 2;
  scrollbar-width: thin;
  scrollbar-color: #52525b transparent;
}

.markdown-body :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
  border: 0;
  border-radius: 0;
  font-size: inherit;
  white-space: pre;
  overflow-wrap: normal;
  word-break: normal;
}

/* ── Blockquote & HR ─────────────────────────────────────────────── */
.markdown-body :deep(blockquote) {
  margin: 11px 0;
  padding: 3px 0 3px 12px;
  border-left: 0;
  color: var(--markdown-muted);
  background: transparent;
  border-radius: 0;
}

.markdown-body :deep(blockquote::before) {
  width: 2px;
  border-radius: 1px;
  background: var(--markdown-border-strong);
}

.markdown-body :deep(blockquote p) {
  margin-bottom: 6px;
}

.markdown-body :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--markdown-border);
  margin: 16px 0;
}

.markdown-body :deep(img) {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: 280px;
  height: auto;
  margin: 12px auto;
  object-fit: contain;
  border: 1px solid var(--markdown-border);
  border-radius: 7px;
  background: var(--markdown-surface);
}

.markdown-body :deep(a > img) {
  transition:
    border-color var(--dur-fast, 150ms) ease,
    box-shadow var(--dur-fast, 150ms) ease;
}

.markdown-body :deep(a:hover > img) {
  border-color: var(--markdown-border-strong);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.markdown-body :deep(kbd) {
  display: inline-block;
  min-width: 20px;
  padding: 1px 5px;
  border: 1px solid var(--markdown-border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--markdown-surface-raised);
  color: var(--p-text-color, #18181b);
  font-family:
    "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.78em;
  line-height: 1.5;
  text-align: center;
}

.markdown-body :deep(del) {
  color: var(--markdown-muted);
}

.markdown-body :deep(mark) {
  padding: 0 2px;
  border-radius: 2px;
  background: rgba(250, 204, 21, 0.28);
  background: color-mix(in srgb, #facc15 28%, transparent);
  color: inherit;
}

@media (max-width: 520px) {
  .markdown-body :deep(h1) {
    font-size: 15px;
  }

  .markdown-body :deep(h2) {
    font-size: 14px;
  }

  .markdown-body :deep(pre) {
    padding: 11px 12px;
    font-size: 12px;
  }
}

.agent-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
}

/* Pulse ring wrapper around AI avatar */
.avatar-ring {
  position: relative;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

/* ── Interactive Inline Image Tag Button ([@image:#1]) ──────────────── */
.inline-image-tag-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--p-surface-100, #f4f4f5);
  border: 1px solid var(--p-surface-200, #e4e4e7);
  color: #10b981;
  font-family: var(--font-family-mono, monospace);
  font-size: 11.5px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 6px;
  cursor: pointer;
  margin: 0 3px;
  vertical-align: baseline;
  transition: all 0.15s ease;
}

.inline-image-tag-btn:hover {
  background: #10b981;
  color: #ffffff;
  border-color: #10b981;
  transform: translateY(-1px);
}

/* ── Structured Error Card (Reference Image 5 style) ────────────────── */
.structured-error-card {
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: #fef2f2;
  border-radius: 12px;
  padding: 12px 14px;
  margin: 8px 0;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.05);
}

:global(.p-dark .structured-error-card) {
  background: rgba(40, 16, 16, 0.6);
  border-color: rgba(239, 68, 68, 0.3);
}

.error-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.error-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

:global(.p-dark .error-card-title) {
  color: #f4f4f5;
}

.error-card-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 10px;
}

:global(.p-dark .error-card-desc) {
  color: #a1a1aa;
}

.error-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: #2563eb;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
  transition: opacity 0.15s ease;
}

.error-retry-btn:hover {
  opacity: 0.8;
  text-decoration: underline;
}

/* ── Floating Scroll to Bottom Button ────────────────────────────── */
.floating-scroll-bottom-btn {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--p-surface-0, #ffffff);
  border: 1px solid var(--p-surface-200, #e4e4e7);
  color: var(--p-text-color, #18181b);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  z-index: 20;
  transition: all 0.2s ease;
}

.floating-scroll-bottom-btn:hover {
  background: var(--p-surface-100, #f4f4f5);
  transform: translateX(-50%) scale(1.1);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}

/* Copy Button on User Messages */
.agent-bubble-user-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
}

.msg-copy-btn {
  opacity: 0;
  transition: opacity 0.15s ease;
  background: transparent;
  border: none;
  color: var(--p-text-muted-color, #a1a1aa);
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
}

.agent-bubble-user-wrap:hover .msg-copy-btn {
  opacity: 1;
}

.msg-copy-btn:hover {
  color: var(--p-text-color, #18181b);
}

/* ── AI inline thinking indicator (Right next to Avatar, Gemini/ChatGPT Style) ── */
.inline-thinking-header {
  --thinking-ink: var(--p-text-color, #18181b);
  --thinking-muted: var(--p-text-muted-color, #71717a);
  --thinking-faint: rgba(24, 24, 27, 0.16);

  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  min-height: 24px;
  margin: 0 0 5px;
  padding: 1px 0 5px;
  color: var(--thinking-muted);
  user-select: none;
  transform: translateZ(0);
}

.thinking-label {
  position: relative;
  font-weight: 600;
  font-size: 13px;
  line-height: 1.3;
  letter-spacing: 0;
  white-space: nowrap;
  color: transparent;
  background: linear-gradient(
    90deg,
    var(--thinking-muted) 0%,
    var(--thinking-muted) 28%,
    var(--thinking-ink) 46%,
    var(--thinking-muted) 64%,
    var(--thinking-muted) 100%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: thinking-text-sheen 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes thinking-text-sheen {
  0%,
  100% {
    background-position: 120% 0;
  }
  50% {
    background-position: -20% 0;
  }
}

@keyframes thinking-line-breathe {
  0%,
  100% {
    opacity: 0.22;
    transform: scaleX(0.55);
  }
  50% {
    opacity: 0.72;
    transform: scaleX(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .thinking-label,
  .thinking-label::after {
    animation: none;
  }

  .thinking-label {
    color: var(--thinking-muted);
    background: none;
  }
}

.thinking-timer {
  font-family: var(--font-family-mono, monospace);
  font-size: 12px;
  color: var(--text-muted);
}

.thinking-indicator {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 0 4px;
  min-height: 28px;
}

.thinking-sparkle {
  color: #10b981;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

@keyframes sparkle-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes sparkle-pulse {
  0%,
  100% {
    transform: rotate(0deg) scale(0.9);
  }
  50% {
    transform: rotate(180deg) scale(1.1);
  }
}

.thinking-text {
  font-size: var(--text-sm);
  color: var(--p-text-muted-color, #71717a);
  font-weight: 500;
}

.inspiration-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-top: 10px;
  margin-bottom: 6px;
  border-radius: 12px;
  overflow: hidden;
}

.inspiration-item {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--p-surface-100, #f3f4f6);
}

.inspiration-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.inspiration-img:hover {
  transform: scale(1.08);
  cursor: zoom-in;
}

/* Professional Scrollbar Styling (Shown only on hover) */
.agent-messages::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.agent-messages::-webkit-scrollbar-track {
  background: transparent;
}

.agent-messages::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 99px;
}

.agent-messages:hover::-webkit-scrollbar-thumb {
  background: var(--p-surface-300, rgba(0, 0, 0, 0.15));
}

.agent-messages:hover::-webkit-scrollbar-thumb:hover {
  background: var(--p-surface-400, rgba(0, 0, 0, 0.3));
}

.agent-messages {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.agent-messages:hover {
  scrollbar-color: var(--p-surface-300, rgba(0, 0, 0, 0.15)) transparent;
}

.msg-failed {
  font-size: 12px;
  color: var(--p-text-muted-color, #9ca3af);
  padding: 2px 0;
}

/* ── Tool call cards container ───────────────────────────────────── */
.tool-cards {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 3px;
  margin-bottom: 3px;
}

.mention-chip-msg {
  background: var(--p-primary-50, #f5f3ff);
  color: var(--p-primary-color, #6d28d9);
  border: 1px solid var(--p-primary-200, rgba(109, 40, 217, 0.2));
  border-radius: 4px;
  padding: 1px 4px;
  font-weight: 600;
  font-size: var(--text-sm);
  display: inline-block;
  margin: 0 2px;
}

.user-attached-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 90%;
  justify-content: flex-end;
  margin-top: 8px;
  margin-bottom: 4px;
}

.user-image-wrapper {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--p-surface-200, #e5e7eb);
  background: var(--p-surface-50, #f9fafb);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s ease;
}

.user-image-wrapper:hover {
  transform: scale(1.05);
  cursor: zoom-in;
}

.user-image {
  width: 100%;
  height: 100%;
  display: block;
}

.user-image :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ═══════════════════════════════════════════════════════════════════
   DARK MODE OVERRIDES  (.p-dark selector mirrors PrimeVue convention)
   ═══════════════════════════════════════════════════════════════════ */

:global(.p-dark .assistant-run) {
  --agent-text-primary: #f0f0f2;
  --agent-text-secondary: #b7b7bf;
  --agent-text-muted: #92929c;
  --agent-text-disabled: #70707a;
  --agent-border-subtle: #303036;
  --agent-border-strong: #45454d;
  --agent-surface: #202024;
  --agent-surface-raised: #18181b;
  --agent-surface-hover: #27272c;
  --accent-primary: #a5b4fc;
  --accent-success: #4ade80;
  --accent-error: #f87171;
  --accent-warning: #fbbf24;
}

:global(.p-dark .agent-bubble-user) {
  background: #27272a;
  color: #fafafa;
}

:global(.p-dark .markdown-body) {
  --markdown-border: var(--agent-border-subtle);
  --markdown-border-strong: var(--agent-border-strong);
  --markdown-surface: var(--agent-surface);
  --markdown-surface-raised: var(--agent-surface-raised);
  --markdown-muted: var(--agent-text-muted);
}

:global(.p-dark .agent-bubble-ai),
:global(.p-dark .markdown-body),
:global(.p-dark .markdown-body p),
:global(.p-dark .markdown-body li),
:global(.p-dark .markdown-body h1),
:global(.p-dark .markdown-body h2),
:global(.p-dark .markdown-body h3),
:global(.p-dark .markdown-body h4),
:global(.p-dark .markdown-body h5),
:global(.p-dark .markdown-body h6) {
  color: var(--agent-text-primary);
}

:global(.p-dark .markdown-body strong) {
  color: var(--agent-text-primary);
}

:global(.p-dark .run-meta),
:global(.p-dark .run-update),
:global(.p-dark .update-markdown),
:global(.p-dark .update-markdown p),
:global(.p-dark .update-markdown li) {
  color: var(--agent-text-secondary);
}

:global(.p-dark .update-markdown strong),
:global(.p-dark .update-markdown code) {
  color: var(--agent-text-primary);
}

:global(.p-dark .markdown-body span[style*="color"]),
:global(.p-dark .markdown-body font[color]) {
  color: inherit !important;
}

:global(.p-dark .markdown-body th) {
  background: #202024;
  color: #fafafa;
}

:global(.p-dark .markdown-body th),
:global(.p-dark .markdown-body td) {
  border-color: #3f3f46;
}

:global(.p-dark .markdown-body tbody tr) {
  background: #18181b;
}

:global(.p-dark .markdown-body tbody tr:nth-child(even)) {
  background: #1d1d21;
}

:global(.p-dark .markdown-body tbody tr:hover) {
  background: #27272a;
}

:global(.p-dark .markdown-body code) {
  background: #27272a;
  color: #f4f4f5;
  border-color: #3f3f46;
}

:global(.p-dark .markdown-body pre code) {
  background: transparent;
  color: inherit;
  border: 0;
}

:global(.p-dark .markdown-body blockquote) {
  background: transparent;
  color: #a1a1aa;
}

:global(.p-dark .markdown-body blockquote::before) {
  background: #52525b;
}

:global(.p-dark .markdown-body hr) {
  border-top-color: #3f3f46;
}

:global(.p-dark .markdown-body img) {
  background: #18181b;
  border-color: #3f3f46;
}

:global(.p-dark .markdown-body kbd) {
  background: #27272a;
  color: #f4f4f5;
  border-color: #52525b;
}

:global(.p-dark .empty-title) {
  color: #fafafa;
}

:global(.p-dark .empty-sub) {
  color: #a1a1aa;
}

:global(.p-dark .agent-chip) {
  border-color: #27272a;
  color: #d4d4d8;
}

:global(.p-dark .agent-chip:hover) {
  background: #1f1f23;
  border-color: #3f3f46;
}

:global(.p-dark .chip-arrow) {
  color: #71717a;
}

:global(.p-dark .thinking-sparkle) {
  color: #a78bfa;
}

:global(.p-dark .thinking-text) {
  color: #a1a1aa;
}

:global(.p-dark .inline-thinking-header) {
  --thinking-ink: #fafafa;
  --thinking-muted: #a1a1aa;
  --thinking-faint: rgba(250, 250, 250, 0.18);
  color: var(--thinking-muted);
}

:global(.p-dark .thinking-label) {
  color: transparent;
}

:global(.p-dark .user-image-wrapper) {
  border-color: #27272a;
  background: #18181b;
}

:global(.p-dark .agent-empty-logo) {
  box-shadow:
    0 0 32px rgba(124, 58, 237, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.4);
}

:global(.p-dark .mention-chip-msg) {
  background: rgba(124, 58, 237, 0.12);
  color: #a78bfa;
  border-color: rgba(124, 58, 237, 0.25);
}

:global(.p-dark .msg-failed) {
  color: #71717a;
}
</style>
