<template>
  <div class="upscale-container">
    <button
      type="button"
      class="upscale-trigger"
      title="HD放大"
      :disabled="disabled || isProcessing"
      @click.stop="toggleMenu"
    >
      <Loader2 v-if="isProcessing" class="animate-spin" :size="18" />
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="2" y="4" width="20" height="16" rx="3" />
        <path d="M6 8v8M11 8v8M6 12h5" />
        <path d="M14 8v8M14 8h2.5a4 4 0 0 1 0 8H14" />
      </svg>
    </button>

    <!-- 弹出选择倍数菜单 -->
    <div v-if="showMenu" class="upscale-menu">
      <div class="menu-item" @click.stop="handleSelect(2)">
        <span class="menu-text">2x 快速超分</span>
      </div>
      <div class="menu-item" @click.stop="handleSelect(4)">
        <span class="menu-text">4x 极致超清</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  ref,
  onMounted,
  onUnmounted,
  toRaw,
  type PropType,
} from "vue";
import { Loader2 } from "lucide-vue-next";
import { Image } from "leafer-ui";
import { upscaleImage } from "@/utils/api";
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

const isProcessing = computed(
  () =>
    props.target?.generationStatus === "generating" &&
    props.target?.generationType === "upscale",
);
const showMenu = ref(false);

const toggleMenu = () => {
  if (isProcessing.value) return;
  showMenu.value = !showMenu.value;
};

const closeMenu = () => {
  showMenu.value = false;
};

const handleSelect = (scale: number) => {
  closeMenu();
  startUpscale(scale);
};

// 点击页面其他区域关闭下拉菜单
const onDocumentClick = () => {
  closeMenu();
};

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
});

const startUpscale = async (scale: number) => {
  const imageUrl = props.target.url;
  const parent = props.target.parent;
  if (!imageUrl) {
    return;
  }
  if (!parent) {
    return;
  }

  try {
    // 1. 调用后端异步任务接口，进行指定倍数放大
    const res = await upscaleImage(imageUrl, scale);

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
          generationType: "upscale",
        });

        // 4. 将新元素加入画布
        rawParent.add(newImage);

        emit("change", {
          key: "url",
          value: rawTarget.url,
          skipHistory: false,
          immediateSave: true,
        });
      }
    } else {
      throw new Error("后端未返回有效的异步任务ID");
    }
  } catch (error: any) {
    console.error("Image upscale failed:", error);
  }
};
</script>

<style scoped lang="scss">
.upscale-container {
  position: relative;
  display: inline-block;
}

.upscale-trigger {
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

.upscale-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  background: var(--p-surface-0, #ffffff);
  border: 1px solid var(--p-surface-200, rgba(0, 0, 0, 0.08));
  border-radius: 6px;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.12),
    0 2px 4px rgba(0, 0, 0, 0.06);
  padding: 4px;
  min-width: 90px;
  z-index: 9999;
  white-space: nowrap;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--p-surface-100, rgba(0, 0, 0, 0.04));
  }
}

.menu-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-primary, #333333);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
