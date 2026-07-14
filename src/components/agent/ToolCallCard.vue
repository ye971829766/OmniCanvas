<script setup lang="ts">
import { computed } from "vue";
import {
  CircleX,
  LayoutGrid,
  Loader2,
  Search,
  Sparkles,
  Video,
} from "lucide-vue-next";
import { getToolLabel } from "./tool-labels";
import type { ToolCallItem } from "@/composables/useAgent";

const props = defineProps<{ tool: ToolCallItem }>();

const isFailed = computed(
  () =>
    Boolean(props.tool.output?.error) ||
    props.tool.output?.status === "error" ||
    props.tool.output?.status === "failed",
);

const displayTitle = computed(() => {
  if (props.tool.name === "generate_image") return "GPT Image 2";
  if (props.tool.name === "collect_inspiration") return "图片灵感";
  if (props.tool.name === "generate_video") return "VideoGen";
  if (
    ["add_text", "set_frame", "add_rect", "add_frame"].includes(
      props.tool.name,
    )
  ) {
    return "排版设计";
  }
  return getToolLabel(props.tool.name);
});

const statusLabel = computed(() => {
  if (!props.tool.done) return "正在使用";
  if (isFailed.value) return "使用失败";
  return "已使用";
});
</script>

<template>
  <div
    class="tool-event"
    :class="{ 'is-running': !tool.done, 'is-failed': isFailed }"
    role="status"
  >
    <span class="tool-event-icon" aria-hidden="true">
      <Loader2 v-if="!tool.done" :size="13" class="spin" />
      <CircleX v-else-if="isFailed" :size="13" />
      <Search v-else-if="tool.name === 'collect_inspiration'" :size="13" />
      <Sparkles v-else-if="tool.name === 'generate_image'" :size="13" />
      <Video v-else-if="tool.name === 'generate_video'" :size="13" />
      <LayoutGrid v-else :size="13" />
    </span>
    <span class="tool-event-status">{{ statusLabel }}</span>
    <span class="tool-event-label">{{ displayTitle }}</span>
  </div>
</template>

<style scoped>
.tool-event {
  min-width: 0;
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--agent-text-secondary, var(--p-text-muted-color));
  font-size: 12.5px;
  line-height: 1.45;
}

.tool-event-icon {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--agent-text-muted, var(--p-text-muted-color));
}

.tool-event-status {
  color: var(--agent-text-muted, var(--p-text-muted-color));
  font-weight: 500;
}

.tool-event-label {
  min-width: 0;
  color: var(--agent-text-primary, var(--p-text-color));
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-event.is-running .tool-event-icon {
  color: var(--accent-primary, var(--p-primary-color));
}

.tool-event.is-running .tool-event-status {
  color: var(--agent-text-secondary, var(--p-text-muted-color));
}

.tool-event.is-failed,
.tool-event.is-failed .tool-event-label,
.tool-event.is-failed .tool-event-status {
  color: var(--accent-error, #ff3b30);
}

.spin {
  animation: tool-spin 1s linear infinite;
}

@keyframes tool-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
