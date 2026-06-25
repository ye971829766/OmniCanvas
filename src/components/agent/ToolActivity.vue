<script setup lang="ts">
import { computed } from "vue";

type ToolCall = {
  id: string;
  name: string;
  done: boolean;
  input?: any;
  output?: any;
};

const props = withDefaults(
  defineProps<{
    tools: ToolCall[];
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

  const label = !tool.done ? activeCopy(tool.name) : doneCopy(tool.name);
  const detail = summarizeInput(tool);

  if (detail) return `${label}  ·  ${detail}`;
  return label;
});

function isHiddenAfterDone(tool: ToolCall) {
  return tool.done && !props.streaming && !isImportantTool(tool);
}

function isImportantTool(tool: ToolCall) {
  return (
    tool.name === "generate_image" ||
    tool.name === "generate_video" ||
    tool.name === "collect_inspiration"
  );
}

function activeCopy(name: string) {
  const copy: Record<string, string> = {
    set_frame: "正在设置画布",
    add_text: "正在排入文字",
    add_rect: "正在添加图形",
    update_node: "正在微调元素",
    remove_node: "正在清理元素",
    query_canvas: "正在读取画布",
    collect_inspiration: "正在收集灵感",
    generate_image: "正在生成图片",
    generate_video: "正在生成视频",
    auto_layout: "正在调整布局",
    align_nodes: "正在对齐元素",
    distribute_nodes: "正在调整间距",
    set_brand: "正在应用品牌",
    apply_palette: "正在调整配色",
    add_frame: "正在添加画板",
    export_node_image: "正在截取画面",
    analyze_design: "正在分析设计",
    verify_design: "正在验证质量",
    plan_design: "正在规划任务",
    review_and_adjust: "正在检查布局",
    focus_node: "正在聚焦元素",
  };
  return copy[name] ?? "正在处理画布";
}

function doneCopy(name: string) {
  const copy: Record<string, string> = {
    collect_inspiration: "灵感收集完成",
    generate_image: "图片生成已启动",
    generate_video: "视频生成已启动",
  };
  return copy[name] ?? "思考中";
}

function summarizeInput(tool: ToolCall) {
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
      <span :class="['activity-text', { shimmer: streaming }]">
        {{ displayText }}
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.tool-activity {
  display: flex;
  align-items: center;
  margin: 4px 0 2px;
  padding: 6px 2px;
  min-height: 28px;
}

.activity-text {
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Skeleton shimmer effect for active (loading) state */
.activity-text.shimmer {
  color: transparent;
  background: linear-gradient(
    90deg,
    var(--p-text-muted-color, #64748b) 0%,
    var(--p-text-muted-color, #64748b) 30%,
    var(--p-surface-300, #cbd5e1) 50%,
    var(--p-text-muted-color, #64748b) 70%,
    var(--p-text-muted-color, #64748b) 100%
  );
  background-size: 250% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  animation: shimmer 2s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: 120% 0;
  }
  100% {
    background-position: -120% 0;
  }
}

/* Transition */
.activity-enter-active,
.activity-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.activity-enter-from,
.activity-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
</style>
