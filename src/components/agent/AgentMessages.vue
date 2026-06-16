<script setup lang="ts">
import { ref } from "vue";
import {
  IncremarkContent,
  AutoScrollContainer,
  type UseIncremarkOptions,
} from "@incremark/vue";
import ToolRowBasic from "./ToolRowBasic.vue";
import ToolAccordion from "./ToolAccordion.vue";
import OptionPreviewCard from "./OptionPreviewCard.vue";
import { Image } from "primevue";
import plotTwistAvatar from "@/assets/plot_twist_avatar.jpg";
import logoImg from "@/assets/logo.jpg";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  tools: Array<{
    id: string;
    name: string;
    done: boolean;
  }>;
  images?: string[];
}

defineProps<{
  messages: ChatMessage[];
  nodeStates: Record<string, any>;
  suggestions: string[];
}>();

const emit = defineEmits<{
  (e: "useSuggestion", s: string): void;
  (e: "zoomToNode", refId: string): void;
  (e: "scroll"): void;
}>();

const scrollRef = ref<any>(null);

function scrollToBottom() {
  scrollRef.value?.scrollToBottom();
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
    effect: "fade-in",
  },
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

interface ParsedMessagePart {
  type: "text" | "grid" | "image_ref";
  content: string | string[];
  refId?: string;
}

function parseMessageText(text: string): ParsedMessagePart[] {
  const regex = /\[inspiration_grid:([^\]]+)\]|\[@image:#([^\]]+)\]/g;
  const parts: ParsedMessagePart[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
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
    parts.push({ type: "text", content: text.substring(lastIndex) });
  }

  console.log(parts);

  return parts.length > 0 ? parts : [{ type: "text", content: text }];
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
  <AutoScrollContainer
    ref="scrollRef"
    class="agent-messages"
    :threshold="60"
    behavior="smooth"
    @scroll="emit('scroll')"
  >
    <!-- Empty state -->
    <div v-if="messages.length === 0" class="agent-empty">
      <div class="agent-empty-logo">
        <img :src="logoImg" alt="PlotTwist" class="agent-empty-logo-img" />
      </div>
      <p class="text-14px font-600 mt-3">告诉我你想设计什么</p>
      <p class="text-12px text-pTextMutedColor mt-1 leading-relaxed">
        我会在画布上为你生成图片、视频 and 排版
      </p>
      <div class="agent-suggestions">
        <button
          v-for="s in suggestions"
          :key="s"
          class="agent-chip"
          @click="emit('useSuggestion', s)"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <!-- Conversation -->
    <template v-for="m in messages" :key="m.id">
      <!-- user -->
      <div v-if="m.role === 'user'" class="flex flex-col items-end w-full">
        <div class="agent-bubble-user">
          <template v-for="(part, pidx) in parseUserText(m.text)" :key="pidx">
            <span v-if="part.type === 'mention'" class="mention-chip-msg">{{
              part.content
            }}</span>
            <template v-else>{{ part.content }}</template>
          </template>
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
          >
            <Image class="user-image" :src="img" alt="Image" preview />
          </div>
        </div>
      </div>

      <!-- assistant -->
      <div v-else class="flex flex-col gap-2">
        <div class="flex items-start gap-2">
          <img class="agent-avatar shrink-0 mt-1" :src="plotTwistAvatar" alt="PlotTwist" />
          <div class="flex-1 min-w-0">
            <div v-if="m.text" class="agent-bubble-ai">
              <template
                v-for="(part, idx) in parseMessageText(m.text)"
                :key="idx"
              >
                <IncremarkContent
                  v-if="
                    part.type === 'text' && typeof part.content === 'string'
                  "
                  class="incremark markdown-body"
                  :class="{ streaming: m.streaming }"
                  :content="part.content"
                  :is-finished="!m.streaming"
                  :incremark-options="getIncremarkOptions(!!m.streaming)"
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
                <OptionPreviewCard
                  v-else-if="part.type === 'image_ref' && part.refId"
                  :refId="part.refId"
                  :state="nodeStates[part.refId]"
                  @zoom="emit('zoomToNode', $event)"
                />
              </template>
            </div>
            <div
              v-else-if="m.streaming && m.tools.length === 0"
              class="agent-typing"
            >
              <span /><span /><span />
            </div>

            <!-- tool chips -->
            <div v-if="m.tools.length" class="flex flex-col gap-2 mt-2">
              <template v-for="t in m.tools" :key="t.id">
                <ToolAccordion
                  v-if="t.name === 'collect_inspiration'"
                  :tool="t"
                  :messageText="m.text"
                />
                <ToolRowBasic
                  v-else
                  :label="toolLabel(t.name)"
                  :done="t.done"
                />
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AutoScrollContainer>
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

.agent-empty {
  margin: auto 0;
  text-align: center;
  padding: 16px 8px;
}

.agent-empty-logo {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  border: 1px solid var(--p-surface-200, #e5e7eb);
}

.agent-empty-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.agent-suggestions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
}

.agent-chip {
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--p-surface-200, #e5e7eb);
  background: var(--p-surface-50, #f9fafb);
  color: var(--p-text-color, #111);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: all 0.12s ease;
}

.agent-chip:hover {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50, #f5f3ff);
}

.agent-bubble-user {
  max-width: 95%;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--p-surface-50, #f9fafb);
  border: 1px solid var(--p-surface-200, #e5e7eb);
  color: var(--p-text-color, #111);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-bubble-ai {
  padding: 4px 0px;
  background: transparent;
  color: var(--p-text-color, #111);
  font-size: 13.1px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--p-text-color, #111);
}

.agent-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--p-surface-100, #f3f4f6);
}

.agent-typing {
  display: inline-flex;
  gap: 4px;
  padding: 11px 13px;
}

.agent-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--p-text-muted-color, #9ca3af);
  animation: agent-blink 1.2s infinite both;
}

.agent-typing span:nth-child(2) {
  animation-delay: 0.2s;
}

.agent-typing span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes agent-blink {
  0%,
  80%,
  100% {
    opacity: 0.3;
  }
  40% {
    opacity: 1;
  }
}

.inspiration-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 10px;
  margin-bottom: 10px;
  border-radius: 12px;
  overflow: hidden;
  padding: 6px;
  background: var(--p-surface-200, #e5e7eb);
}

.inspiration-item {
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background: #ccc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.inspiration-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.inspiration-img:hover {
  transform: scale(1.1);
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

.mention-chip-msg {
  background: var(--p-primary-50, #f5f3ff);
  color: var(--p-primary-color, #6d28d9);
  border: 1px solid var(--p-primary-200, rgba(109, 40, 217, 0.2));
  border-radius: 4px;
  padding: 1px 4px;
  font-weight: 600;
  font-size: 12px;
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
</style>
