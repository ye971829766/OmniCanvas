<template>
  <ImageGenCard
    v-if="target.tag === 'ImageGen'"
    :target="target"
    @change="applyToolbarChange"
  />
  <VideoGenCard
    v-else-if="target.tag === 'VideoGen'"
    :target="target"
    @change="applyToolbarChange"
  />
  <ToolbarShell v-else-if="items.length">
    <ToolbarItem
      v-for="(item, index) in items"
      :key="getItemKey(item, index)"
      :item="item"
      :target="target"
      :version="effectiveVersion"
      @change="applyToolbarChange"
      @action="runToolbarAction"
    />
  </ToolbarShell>
</template>

<script lang="ts" setup>
import { computed, ref, type PropType } from "vue";
import { type ILeaf } from "leafer-ui";
import ToolbarItem from "./ToolbarItem.vue";
import ToolbarShell from "./ToolbarShell.vue";
import ImageGenCard from "./custom/ImageGenCard.vue";
import VideoGenCard from "./custom/VideoGenCard.vue";
import {  App } from "leafer-ui";

import { getToolbarItems, toggleSizeLock } from "./toolbarRegistry";
import type {
  ToolbarActionPayload,
  ToolbarChangePayload,
  ToolbarItem as ToolbarItemConfig,
  ToolbarTarget,
} from "./types";

const props = defineProps({
  canvasApp: {
    type: Object as PropType<App | null>,
    default: null,
  },
  target: { type: Object as PropType<ILeaf>, required: true },
  version: { type: Number, default: 0 },
});

const emit = defineEmits<{
  change: [payload: ToolbarChangePayload];
  action: [payload: ToolbarActionPayload];
}>();

const items = computed(() => getToolbarItems(props.target as ToolbarTarget));
const localVersion = ref(0);
const effectiveVersion = computed(
  () => (props.version + localVersion.value) % 1_000_000,
);

const refreshLocalToolbar = () => {
  localVersion.value = (localVersion.value + 1) % 1_000_000;
};

const getItemKey = (item: ToolbarItemConfig, index: number) => {
  if ("key" in item) return item.key;
  if ("action" in item) return item.action;
  return `${item.type}-${index}`;
};

const applyToolbarChange = ({ key, value }: ToolbarChangePayload) => {
  const target = props.target as ToolbarTarget | undefined;
  
  if (!target) return;

  if (typeof target.set === "function") {
    target.set({ [key]: value });
  } else {
    target[key] = value;
  }

  refreshLocalToolbar();
  emit("change", { key, value });
};

const runToolbarAction = ({ action, target: payloadTarget }: ToolbarActionPayload) => {
  const t = (payloadTarget ?? props.target) as ToolbarTarget | undefined;
  if (!t) return;

  switch (action) {
    case "toggle-size-link":
      toggleSizeLock(t);
      refreshLocalToolbar();
      emit("change", { key: "lockRatio", value: t.lockRatio });
      break;
    case "export":
      {
        const el = t as any;
        console.log(el.tag,el.export)
        // VideoNode 导出视频源文件
        if (el.tag === "VideoNode") {
          const videoUrl = el.videoUrl || el.url;
          if (videoUrl) {
            window.open(videoUrl, "_blank");
          } else {
            console.error("[FloatToolbar] VideoNode has no videoUrl");
          }
          return;
        }
        if(el.tag === "MultipleSelect"){
           emit("action", { action: "export-multiple", target: t });
          return;
        }
        // 普通元素导出为图片
        if (typeof el.export === "function") {
          const timestamp = Date.now();
          const fileName = `${el.tag || "element"}_${timestamp}.png`;
          el.export(fileName).catch((err: any) => {
            console.error("[FloatToolbar] export failed:", err);
          });
        }
      }
      break;
    default:
      emit("action", { action, target: t });
  }
};
</script>
