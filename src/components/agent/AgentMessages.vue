<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import {
  IncremarkContent,
  AutoScrollContainer,
  type UseIncremarkOptions,
} from "@incremark/vue";
import { vStreamingDot } from "@/directives/vStreamingDot";
import ToolActivity from "./ToolActivity.vue";
import ToolCallCard from "./ToolCallCard.vue";
import ToolCallGroup from "./ToolCallGroup.vue";
import OptionPreviewCard from "./OptionPreviewCard.vue";
import { Image } from "primevue";
import plotTwistAvatar from "@/assets/plot_twist_avatar.jpg";
import logoImg from "@/assets/logo.jpg";
import type { ChatMessage, ToolCallItem } from "@/composables/useAgent";
import { stripInternalToolErrors } from "@/composables/useAgent";

const props = defineProps<{
  messages: ChatMessage[];
  nodeStates: Record<string, any>;
  suggestions: string[];
  loading?: boolean;
  running?: boolean;
  elapsedTime?: number;
}>();

const formattedTimer = computed(() => {
  const time = props.elapsedTime ?? 0;
  const m = Math.floor(time / 60);
  const s = time % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
});

const emit = defineEmits<{
  (e: "useSuggestion", s: string): void;
  (e: "zoomToNode", refId: string): void;
  (e: "scroll"): void;
  (e: "retry"): void;
}>();

const scrollRef = ref<any>(null);
const userScrolledUp = ref(false);

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
  () => props.messages.length,
  async () => {
    await nextTick();
    if (!userScrolledUp.value) {
      scrollToBottom();
      setTimeout(() => scrollToBottom(), 120);
    }
  },
);

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

function groupTools(tools: ToolCallItem[]): ToolRenderBlock[] {
  if (!tools || !tools.length) return [];

  const STANDALONE_TOOLS = new Set([
    "generate_image",
    "generate_video",
    "collect_inspiration",
  ]);

  const blocks: ToolRenderBlock[] = [];
  let currentGroup: ToolCallItem[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      // Find active tool or primary tool
      const activeTool = currentGroup.find((t) => !t.done) || currentGroup[0];
      const isGroupDone = currentGroup.every((t) => t.done);

      // Render as a single clean action badge (e.g. "排版设计") instead of "使用了 X 个工具"
      blocks.push({
        type: "single",
        tool: {
          id: activeTool.id,
          name: activeTool.name,
          done: isGroupDone,
          input: activeTool.input,
          output: activeTool.output,
        },
        id: `blk_layout_${activeTool.id}`,
      });
      currentGroup = [];
    }
  };

  for (const tool of tools) {
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
  return blocks;
}

function filterBlocks(blocks: any[]): any[] {
  if (!blocks || !blocks.length) return [];
  const result: any[] = [];
  let hasLayoutBadge = false;

  for (const blk of blocks) {
    if (blk.type === "text") {
      if (blk.text && stripInternalToolErrors(blk.text).trim()) {
        result.push(blk);
      }
    } else if (blk.type === "tools" && blk.tools && blk.tools.length > 0) {
      const isPureLayout = blk.tools.every((t: any) =>
        [
          "add_text",
          "set_frame",
          "add_rect",
          "add_frame",
          "update_node",
          "remove_node",
        ].includes(t.name),
      );

      if (isPureLayout) {
        if (!hasLayoutBadge) {
          result.push(blk);
          hasLayoutBadge = true;
        }
      } else {
        result.push(blk);
      }
    }
  }

  return result;
}

function isLastStreamingTextPart(
  blk: any,
  blocks: any[],
  partIdx: number,
  parts: ParsedMessagePart[],
  isStreaming: boolean,
): boolean {
  if (!isStreaming || !blocks || !blocks.length) return false;
  const textBlocks = blocks.filter((b) => b.type === "text" && b.text);
  if (!textBlocks.length) return false;
  if (textBlocks[textBlocks.length - 1].id !== blk.id) return false;

  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "text") {
      return i === partIdx;
    }
  }
  return false;
}

interface ParsedMessagePart {
  type: "text" | "grid" | "image_ref";
  content: string | string[];
  refId?: string;
}

function parseMessageText(text: string): ParsedMessagePart[] {
  text = stripInternalToolErrors(text);
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

function copyText(txt: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt);
  }
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
            alt="PlotTwist"
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

        <!-- assistant -->
        <div v-else class="flex flex-col gap-2">
          <div class="flex items-start gap-1">
            <div
              class="avatar-ring shrink-0 mt-0.5"
              :class="{ 'is-streaming': m.streaming }"
            >
              <img
                class="agent-avatar"
                :src="plotTwistAvatar"
                alt="PlotTwist"
              />
            </div>
            <div class="flex-1 min-w-0">
              <!-- Inline thinking indicator right next to avatar when AI is actively thinking       -->
              <div
                class="inline-thinking-header"
                v-if="
                  m.streaming &&
                  (!m.text || !m.text.trim() || m.tools?.some((t) => !t.done))
                "
              >
                <span class="gemini-sparkle-icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                  >
                    <path
                      d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z"
                    />
                  </svg>
                </span>
                <span class="thinking-label">思考中</span>
                <!-- <span class="thinking-timer">{{ formattedTimer }}</span> -->
              </div>

              <!-- Interleaved Blocks Rendering (Text -> Tool -> Text -> Tool) -->
              <div
                v-if="m.blocks && m.blocks.length"
                class="flex flex-col gap-1.5"
              >
                <template v-for="blk in filterBlocks(m.blocks)" :key="blk.id">
                  <!-- Text Block -->
                  <div
                    v-if="blk.type === 'text' && blk.text && stripInternalToolErrors(blk.text).trim()"
                    class="agent-bubble-ai"
                  >
                    <template
                      v-for="(part, idx) in parseMessageText(blk.text)"
                      :key="idx"
                    >
                      <IncremarkContent
                        v-if="
                          part.type === 'text' &&
                          typeof part.content === 'string'
                        "
                        v-streaming-dot="
                          isLastStreamingTextPart(
                            blk,
                            m.blocks,
                            idx,
                            parseMessageText(blk.text),
                            !!m.streaming,
                          )
                        "
                        class="incremark markdown-body"
                        :content="part.content"
                        :is-finished="!m.streaming"
                        :incremark-options="getIncremarkOptions(!!m.streaming)"
                      />
                      <div
                        v-else-if="part.type === 'grid'"
                        class="inspiration-grid"
                      >
                        <div
                          v-for="(url, uidx) in part.content"
                          :key="uidx"
                          class="inspiration-item"
                        >
                          <img :src="url" class="inspiration-img" />
                        </div>
                      </div>
                      <!-- Interactive Image Ref Tag -->
                      <button
                        v-else-if="part.type === 'image_ref' && part.refId"
                        class="inline-image-tag-btn"
                        @click="emit('zoomToNode', part.refId)"
                      >
                        {{ part.content }}
                      </button>
                    </template>
                  </div>

                  <!-- Tools Block -->
                  <div
                    v-else-if="
                      blk.type === 'tools' && blk.tools && blk.tools.length
                    "
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
                  </div>
                </template>
              </div>

              <!-- Legacy Fallback -->
              <div v-else-if="m.text && stripInternalToolErrors(m.text).trim()" class="agent-bubble-ai">
                <template
                  v-for="(part, idx) in parseMessageText(m.text)"
                  :key="idx"
                >
                  <IncremarkContent
                    v-if="
                      part.type === 'text' && typeof part.content === 'string'
                    "
                    v-streaming-dot="!!m.streaming"
                    class="incremark markdown-body"
                    :content="part.content"
                    :is-finished="!m.streaming"
                    :incremark-options="getIncremarkOptions(!!m.streaming)"
                  />
                  <div
                    v-else-if="part.type === 'grid'"
                    class="inspiration-grid"
                  >
                    <div
                      v-for="(url, uidx) in part.content"
                      :key="uidx"
                      class="inspiration-item"
                    >
                      <img :src="url" class="inspiration-img" />
                    </div>
                  </div>
                  <!-- Interactive Image Ref Tag -->
                  <button
                    v-else-if="part.type === 'image_ref' && part.refId"
                    class="inline-image-tag-btn"
                    @click="emit('zoomToNode', part.refId)"
                  >
                    {{ part.content }}
                  </button>
                </template>
              </div>

              <!-- Structured Error Card (Reference Image 5 style) -->
              <div v-if="m.error" class="structured-error-card mt-2">
                <div class="error-card-header">
                  <span class="error-card-title">糟糕！请求未能完成</span>
                </div>
                <p class="error-card-desc">{{ m.error }}</p>
                <div class="error-card-actions">
                  <button class="error-retry-btn" @click="emit('retry')">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      width="12"
                      height="12"
                    >
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>重试</span>
                  </button>
                </div>
              </div>

              <!-- Fallback active-tool status line -->
              <ToolActivity
                v-if="!m.tools.length"
                :tools="m.tools"
                :streaming="m.streaming"
                :message-text="m.text"
                :node-states="nodeStates"
                @zoom="emit('zoomToNode', $event)"
              />

              <!-- Generated media cards -->
              <div
                v-if="m.tools && m.tools.length"
                class="flex flex-col gap-2 mt-2"
              >
                <template v-for="tool in m.tools" :key="tool.id">
                  <OptionPreviewCard
                    v-if="
                      (tool.name === 'generate_image' ||
                        tool.name === 'generate_video') &&
                      tool.output?.refId &&
                      nodeStates[tool.output.refId]
                    "
                    :refId="tool.output.refId"
                    :state="nodeStates[tool.output.refId]"
                    @zoom="emit('zoomToNode', $event)"
                  />
                </template>
              </div>
            </div>
          </div>
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
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          width="16"
          height="16"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
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
  font-size: var(--text-base);
  line-height: 1.65;
  color: var(--p-text-color, #18181b);
}

.markdown-body :deep(p) {
  margin: 0 0 8px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 6px 0 8px;
  padding-left: 18px;
}

.markdown-body :deep(li) {
  margin: 2px 0;
  padding-left: 2px;
}

.markdown-body :deep(strong) {
  color: var(--text-primary);
  font-weight: 660;
}

/* ── Markdown Tables ────────────────────────────────────────────── */
.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 13px;
  line-height: 1.5;
  display: table;
}

.markdown-body :deep(thead) {
  background: var(--p-surface-100, #f4f4f5);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 7px 11px;
  border: 1px solid var(--p-surface-200, #e4e4e7);
  text-align: left;
  word-break: break-word;
}

.markdown-body :deep(th) {
  font-weight: 650;
  color: var(--p-text-color, #18181b);
  background: var(--p-surface-100, #f4f4f5);
}

.markdown-body :deep(tr:nth-child(even)) {
  background: var(--p-surface-50, #fafafa);
}

/* ── Headings ────────────────────────────────────────────────────── */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  font-weight: 700;
  color: var(--p-text-color, #18181b);
  margin: 12px 0 6px;
  line-height: 1.35;
}

.markdown-body :deep(h1) {
  font-size: 1.25em;
  border-bottom: 1px solid var(--p-surface-200, #e4e4e7);
  padding-bottom: 4px;
}
.markdown-body :deep(h2) {
  font-size: 1.15em;
}
.markdown-body :deep(h3) {
  font-size: 1.05em;
}
.markdown-body :deep(h4) {
  font-size: 1em;
}

/* ── Code & Pre ──────────────────────────────────────────────────── */
.markdown-body :deep(code) {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.88em;
  background: var(--p-surface-100, #f4f4f5);
  color: #7c3aed;
  padding: 2px 5px;
  border-radius: 4px;
}

.markdown-body :deep(.incremark-code) {
  margin: 8px 0;
  border-radius: 8px;
  overflow: hidden;
  background: #18181b;
}

.markdown-body :deep(.code-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: #27272a;
  color: #a1a1aa;
  font-size: 12px;
  font-family: var(--font-family-mono, monospace);
  min-height: 32px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.markdown-body :deep(.code-header .language) {
  color: #a1a1aa;
  text-transform: lowercase;
  font-weight: 500;
}

.markdown-body :deep(.code-btn),
.markdown-body :deep(button.code-btn),
.markdown-body :deep(.incremark-code-copy-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: #a1a1aa;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  box-shadow: none;
  opacity: 0.7;
  transition: all 0.15s ease;
}

.markdown-body :deep(.code-btn:hover),
.markdown-body :deep(button.code-btn:hover),
.markdown-body :deep(.incremark-code-copy-btn:hover) {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
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
  padding: 10px 12px;
  border-radius: 0 0 8px 8px;
  overflow-x: auto;
  margin: 0;
}

.markdown-body :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
  border-radius: 0;
}

/* ── Blockquote & HR ─────────────────────────────────────────────── */
.markdown-body :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid #10b981;
  color: var(--p-text-muted-color, #71717a);
  background: var(--p-surface-50, #fafafa);
  border-radius: 0 6px 6px 0;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--p-surface-200, #e4e4e7);
  margin: 12px 0;
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
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 2px 0 6px;
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--p-text-muted-color, #71717a);
  user-select: none;
}

.gemini-sparkle-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--p-text-color, #18181b);
  animation: gemini-spin-pulse 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  flex-shrink: 0;
}

@keyframes gemini-spin-pulse {
  0% {
    transform: rotate(0deg) scale(0.9);
    opacity: 0.7;
  }
  50% {
    transform: rotate(180deg) scale(1.18);
    opacity: 1;
  }
  100% {
    transform: rotate(360deg) scale(0.9);
    opacity: 0.7;
  }
}

.thinking-label {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.15px;
  color: var(--p-text-color, #18181b);
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
  margin-top: 2px;
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

:global(.p-dark .agent-bubble-user) {
  background: #27272a;
  color: #fafafa;
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
  color: #f4f4f6;
}

:global(.p-dark .markdown-body strong) {
  color: #fafafa;
}

:global(.p-dark .markdown-body span[style*="color"]),
:global(.p-dark .markdown-body font[color]) {
  color: inherit !important;
}

:global(.p-dark .markdown-body th) {
  background: #27272a;
  color: #fafafa;
}

:global(.p-dark .markdown-body th),
:global(.p-dark .markdown-body td) {
  border-color: #27272a;
}

:global(.p-dark .markdown-body tr:nth-child(even)) {
  background: #18181b;
}

:global(.p-dark .markdown-body code) {
  background: #27272a;
  color: #c4b5fd;
}

:global(.p-dark .markdown-body blockquote) {
  background: #18181b;
  color: #a1a1aa;
}

:global(.p-dark .markdown-body hr) {
  border-top-color: #27272a;
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
  background: transparent;
  border: none;
  color: #a1a1aa;
}

:global(.p-dark .gemini-sparkle-icon),
:global(.p-dark .thinking-label) {
  color: #f4f4f5;
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
