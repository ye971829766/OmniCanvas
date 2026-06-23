<script setup lang="ts">
import { ref } from 'vue';
import {
  IncremarkContent,
  AutoScrollContainer,
  type UseIncremarkOptions,
} from '@incremark/vue';
import ToolActivity from './ToolActivity.vue';
import OptionPreviewCard from './OptionPreviewCard.vue';
import { Image } from 'primevue';
import plotTwistAvatar from '@/assets/plot_twist_avatar.jpg';
import logoImg from '@/assets/logo.jpg';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  tools: Array<{
    id: string;
    name: string;
    done: boolean;
    input?: any;
    output?: any;
  }>;
  images?: string[];
}

defineProps<{
  messages: ChatMessage[];
  nodeStates: Record<string, any>;
  suggestions: string[];
}>();

const emit = defineEmits<{
  (e: 'useSuggestion', s: string): void;
  (e: 'zoomToNode', refId: string): void;
  (e: 'scroll'): void;
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
    effect: 'fade-in',
  },
});

interface ParsedMessagePart {
  type: 'text' | 'grid' | 'image_ref';
  content: string | string[];
  refId?: string;
}

function parseMessageText(text: string): ParsedMessagePart[] {
  text = stripInternalToolErrors(text);
  const regex = /\[inspiration_grid:([^\]]+)\]|\[@image:#([^\]]+)\]/g;
  const parts: ParsedMessagePart[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }
    if (match[1]) {
      const urls = match[1].split(',').map((u) => u.trim());
      parts.push({ type: 'grid', content: urls });
    } else if (match[2]) {
      const refId = match[2].trim();
      parts.push({ type: 'image_ref', content: `[@image:#${refId}]`, refId });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}

function stripInternalToolErrors(text: string) {
  return text
    .replace(
      /\n{0,2}\s*⚠️\s+[a-z_]+:\s+(?:Parameter\s+"[^"]+"\s+must be[^\n]*|Missing required parameter[^\n]*|Tool\s+[a-z_]+\s+timed out[^\n]*)/g,
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trimStart();
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
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }
    parts.push({ type: 'mention', content: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
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
          <img
            class="agent-avatar shrink-0 mt-1"
            :src="plotTwistAvatar"
            alt="PlotTwist"
          />
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

            <ToolActivity
              v-if="m.tools.length"
              :tools="m.tools"
              :streaming="m.streaming"
              :message-text="m.text"
              :node-states="nodeStates"
              @zoom="emit('zoomToNode', $event)"
            />

            <!-- Auto-show generated media cards that are not inline in the message text -->
            <div v-if="m.tools && m.tools.length" class="flex flex-col gap-2 mt-1">
              <template v-for="tool in m.tools" :key="tool.id">
                <OptionPreviewCard
                  v-if="(tool.name === 'generate_image' || tool.name === 'generate_video') && tool.output?.refId && nodeStates[tool.output.refId] && !(m.text || '').includes(`[@image:#${tool.output.refId}]`)"
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
  max-width: 100%;
  padding: 2px 0 0;
  background: transparent;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.62;
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-body {
  font-size: 13px;
  line-height: 1.62;
  color: #0f172a;
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
  color: #0f172a;
  font-weight: 680;
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
