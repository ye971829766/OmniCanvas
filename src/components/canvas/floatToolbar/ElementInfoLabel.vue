<template>
  <div
    v-if="target"
    class="absolute z-40 transform -translate-y-full pointer-events-none select-none flex justify-between items-center px-1"
    :style="labelStyle"
  >
    <div
      class="flex items-center gap-1.5 text-surface-600 dark:text-surface-300 font-semibold text-[9.5px] leading-none"
    >
      <component
        :is="infoIcon"
        class="w-3 h-3 text-surface-500 dark:text-surface-400"
      />
      <span>{{ elementName }}</span>
    </div>
    <div
      v-if="showSize"
      class="text-surface-400 dark:text-surface-500 text-[9.5px] font-medium leading-none"
    >
      {{ elementSize }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type PropType } from "vue";
import type { ILeaf } from "leafer-ui";
import {
  Frame,
  Square,
  Video,
  HelpCircle,
  Type,
  Pencil,
  Circle,
  Triangle,
  Star,
  Minus,
  GroupIcon,
  Boxes,
  Image
} from "lucide-vue-next";

const props = defineProps({
  target: {
    type: Object as PropType<ILeaf>,
    required: true,
  },
  version: {
    type: Number,
    default: 0,
  },
});

const labelStyle = computed(() => {
  // Force evaluation on version updates (e.g. pan, zoom, scale, move)
  props.version;

  const bounds = props.target.worldBoxBounds;
  if (!bounds) return {};

  return {
    left: `${bounds.x}px`,
    top: `${bounds.y - 6}px`,
    width: `${bounds.width}px`,
  };
});

const elementName = computed(() => {
  if (props.target.name) return props.target.name;

  const tag = props.target.tag;
  if (tag === "Frame") return "智能画板";
  if (tag === "Rect") return "矩形";
  if (tag === "Ellipse") return "圆形";
  if (tag === "Polygon") return "多边形";
  if (tag === "Star") return "星形";
  if (tag === "Line") return "直线";
  if (tag === "Pen") return "画笔";
  if (tag === "VideoNode") return "视频";
  if (tag === "Text") return "文本";
  if (tag === "Group") return "编组";
  if (tag === "MultipleSelect") return "多选";
  if (tag === "Image") return "图片";
  if (tag === "ImageGen") return "图像生成器";
  if (tag === "VideoGen") return "视频生成器";
  return tag || "元素";
});

const showSize = computed(() => {
  props.version; // Force update
  const bounds = props.target.worldBoxBounds;
  // Hide size if element is too narrow to avoid collision
  return bounds ? bounds.width > 120 : false;
});

const elementSize = computed(() => {
  // Force evaluation on version updates
  props.version;

  const w = Math.round(props.target.width ?? 0);
  const h = Math.round(props.target.height ?? 0);
  return `${w} × ${h}`;
});

const infoIcon = computed(() => {
  const tag = props.target.tag;
  if (tag === "Frame") return Frame;
  if (tag === "Rect") return Square;
  if (tag === "Ellipse") return Circle;
  if (tag === "Polygon") return Triangle;
  if (tag === "Star") return Star;
  if (tag === "Line") return Minus;
  if (tag === "Pen") return Pencil;
  if (tag === "VideoNode" || tag === "VideoGen") return Video;
  if (tag === "Text") return Type;
  if (tag === "Group") return GroupIcon;
  if (tag === "MultipleSelect") return Boxes;
  if (tag === "Image" || tag === "ImageGen") return Image;
  return HelpCircle;
});</script>

<style scoped>
/* Reset any styling and use pure UnoCSS classes */
</style>
