<template>
  <button
    type="button"
    class="remove-bg-trigger"
    title="去背景"
    :disabled="disabled || isProcessing"
    @click="startRemoveBg"
  >
    <Loader2 v-if="isProcessing" class="animate-spin" :size="18" />
    <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9" stroke-dasharray="3 3" />
      <circle cx="12" cy="9" r="3" />
      <path d="M6.5 18a5.5 5.5 0 0 1 11 0" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { computed, toRaw, type PropType } from "vue";
import { Loader2 } from "lucide-vue-next";
import { useToast } from "primevue/usetoast";
import { Image } from "leafer-ui";
import { removeBg } from "@/utils/api";
import type {
  ToolbarChangePayload,
  ToolbarItem,
  ToolbarTarget,
} from "../types";

const props = defineProps({
  target: {
    type: Object as PropType<ToolbarTarget>,
    required: true,
  },
  item: {
    type: Object as PropType<ToolbarItem>,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  version: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits<{
  action: [payload: unknown];
  change: [payload: ToolbarChangePayload];
}>();

// 只有当原图自身也处于处理状态时才禁用（通常新建的子节点去处理，原图保持可编辑）
const isProcessing = computed(() => props.target?.generationStatus === "generating" && props.target?.generationType === "removeBg");
const toast = useToast();

const startRemoveBg = async () => {
  const imageUrl = props.target.url;
  const parent = props.target.parent;
  if (!imageUrl) {
    toast.add({
      severity: "error",
      summary: "去背景失败",
      detail: "未找到有效的图片链接",
      life: 3000,
    });
    return;
  }
  if (!parent) {
    toast.add({
      severity: "error",
      summary: "去背景失败",
      detail: "图片未挂载在画布上",
      life: 3000,
    });
    return;
  }

  try {
    // 1. 调用后端异步去背景任务
    const res = await removeBg(imageUrl);

    if (res && res.taskId) {
      const rawTarget = toRaw(props.target);
      const rawParent = toRaw(parent);
      if (rawTarget && rawParent) {
        // 2. 创建一个新图片元素，宽度高度缩放角度等与原图完全一致，并在原图右侧 20px 摆放
        const newImage = new Image({
          x: rawTarget.x + rawTarget.width + 20,
          y: rawTarget.y,
          width: rawTarget.width,
          height: rawTarget.height,
          scaleX: rawTarget.scaleX,
          scaleY: rawTarget.scaleY,
          rotation: rawTarget.rotation,
          url: rawTarget.url, // 初始使用原图链接占位
          editable: true,
        });

        // 3. 在新图节点上挂载任务属性，供 useCanvas 的 initNodeListeners 自动识别并启动动画与轮询
        newImage.set({
          taskId: res.taskId,
          generationStatus: "generating",
          generationType: "removeBg",
        });

        // 4. 将新元素加入画布
        rawParent.add(newImage);

        // 5. 触发 change 强制让 Vue 的 Canvas 状态序列化，保存至后台数据库
        emit("change", { key: "url", value: rawTarget.url, skipHistory: false });

        toast.add({
          severity: "info",
          summary: "任务已启动",
          detail: "已创建新图片并在后台进行去背景处理",
          life: 3000,
        });
      }
    } else {
      throw new Error("后端未返回有效的异步任务ID");
    }
  } catch (error: any) {
    console.error("Remove background failed:", error);
    toast.add({
      severity: "error",
      summary: "去背景失败",
      detail: error.response?.data?.error || error.message || "请求处理失败，请重试",
      life: 3000,
    });
  }
};
</script>

<style scoped lang="scss">
.remove-bg-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--p-surface-100);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
