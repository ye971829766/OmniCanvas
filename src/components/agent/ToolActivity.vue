<script setup lang="ts">
import { computed } from "vue";
import { getToolActiveLabel, getToolDoneLabel } from "./tool-labels";
import type { ToolCallItem } from "@/composables/useAgent";

const props = withDefaults(
  defineProps<{
    tools: ToolCallItem[];
    streaming?: boolean;
    messageText?: string;
    nodeStates?: Record<string, any>;
  }>(),
  {
    streaming: false,
    messageText: "",
    nodeStates: () => ({}),
  },
);

defineEmits<{
  (e: "zoom", refId: string): void;
}>();

const visibleTools = computed(() =>
  props.tools.filter((tool) => !isHiddenAfterDone(tool)),
);

const activeTool = computed(
  () =>
    visibleTools.value.find((tool) => !tool.done) ??
    visibleTools.value[visibleTools.value.length - 1],
);

// const isActive = computed(
//   () => props.streaming && !!activeTool.value && !activeTool.value.done,
// );

const shouldShow = computed(() => {
  if (!visibleTools.value.length) return false;
  if (props.streaming) return true;
  return visibleTools.value.some((tool) => isImportantTool(tool));
});

const displayText = computed(() => {
  const tool = activeTool.value;
  if (!tool) return "正在理解需求…";

  const label = !tool.done ? getToolActiveLabel(tool.name) : getToolDoneLabel(tool.name);
  const detail = summarizeInput(tool);

  if (detail) return `${label}  ·  ${detail}`;
  return label;
});

function isImageTool(name: string) {
  return name === 'generate_image' || name === 'collect_inspiration';
}

function isLayoutTool(name: string) {
  return name === 'auto_layout' || name === 'align_nodes' || name === 'set_frame' || name === 'distribute_nodes';
}

function isHiddenAfterDone(tool: ToolCallItem) {
  return tool.done && !props.streaming && !isImportantTool(tool);
}

function isImportantTool(tool: ToolCallItem) {
  return (
    tool.name === "generate_image" ||
    tool.name === "generate_video" ||
    tool.name === "collect_inspiration"
  );
}


function summarizeInput(tool: ToolCallItem) {
  const input = tool.input || {};
  if (tool.name === "set_frame" && (input.width || input.height)) {
    return `${input.width || "-"} × ${input.height || "-"}`;
  }
  if (tool.name === "add_text" && input.text) return truncate(input.text, 28);
  if (tool.name === "collect_inspiration" && input.query) {
    return truncate(input.query, 28);
  }
  if (
    (tool.name === "generate_image" || tool.name === "generate_video") &&
    input.prompt
  ) {
    return truncate(input.prompt, 36);
  }
  if (tool.name === "auto_layout" && input.layoutHint) {
    return truncate(input.layoutHint, 28);
  }
  if (tool.name === "apply_palette" && input.paletteId) {
    return truncate(input.paletteId, 28);
  }
  return "";
}

function truncate(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}
</script>

<template>
  <Transition name="activity">
    <div v-if="shouldShow && activeTool" class="tool-activity" role="status">
      <!-- Tool icon (left) -->
      <span class="activity-icon" :class="{ spinning: streaming }">
        <svg v-if="isImageTool(activeTool.name)" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
          <path d="M14 10 L11 7 L7 11" />
        </svg>
        <svg v-else-if="isLayoutTool(activeTool.name)" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </svg>
        <svg v-else viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
          <path d="M8 1.5 L9.1 6.3 L14 7.5 L9.1 8.7 L8 13.5 L6.9 8.7 L2 7.5 L6.9 6.3 Z"/>
        </svg>
      </span>

      <!-- Tool text -->
      <span :class="['activity-text', { shimmer: streaming }]">
        {{ displayText }}
      </span>

      <!-- Progress bar (streaming only) -->
      <div v-if="streaming" class="activity-progress"></div>
    </div>
  </Transition>
</template>

<style scoped>
.tool-activity {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 4px 0 2px;
  padding: 6px 2px 10px; /* extra bottom for progress bar */
  min-height: 32px;
}

/* Tool-type icon */
.activity-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #10b981;
  opacity: 0.9;
}

.activity-icon.spinning {
  animation: tool-spin 3s linear infinite;
}

@keyframes tool-spin {
  to { transform: rotate(360deg); }
}

.activity-text {
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  color: var(--text-muted);
}

/* Skeleton shimmer on active text */
.activity-text.shimmer {
  color: var(--p-text-muted-color, #71717a);
  font-weight: 500;
}


/* Flowing gradient progress bar at the bottom */
.activity-progress {
  position: absolute;
  bottom: 2px;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 1px;
  overflow: hidden;
  background: linear-gradient(
    90deg,
    transparent 0%,
    #10b981 30%,
    #34d399 50%,
    #10b981 70%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: progress-flow 2s ease-in-out infinite;
}


@keyframes progress-flow {
  0%   { background-position:  120% 0; }
  100% { background-position: -120% 0; }
}

/* Transition */
.activity-enter-active,
.activity-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.activity-enter-from,
.activity-leave-to {
  opacity: 0;
  transform: translateY(3px);
}

/* Dark mode */
:global(.p-dark .activity-icon) {
  color: #a78bfa;
}

:global(.p-dark .activity-text) {
  color: #a1a1aa;
}

:global(.p-dark .activity-progress) {
  background: linear-gradient(
    90deg,
    transparent 0%,
    #a78bfa 30%,
    #c4b5fd 50%,
    #a78bfa 70%,
    transparent 100%
  );
  background-size: 200% 100%;
}
</style>
