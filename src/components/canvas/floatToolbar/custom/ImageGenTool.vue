<template>
  <button
    type="button"
    class="image-gen-trigger-btn"
    title="生成图片"
    :disabled="disabled || isGenerating"
    @click="togglePanel"
  >
    <Sparkles :size="14" class="sparkles-icon" />
    <span class="btn-text">生成</span>
  </button>

  <Popover
    ref="popoverRef"
    append-to="body"
    :dismissable="true"
    :pt="popoverPt"
  >
    <div class="image-gen-panel">
      <div class="panel-title">AI 图像生成</div>

      <!-- Reference Images Scroll Container -->
      <div class="ref-images-scroll-container" v-if="maxRefImages > 0">
        <div class="ref-images-wrapper">
          <!-- If empty, show a small pill upload button -->
          <label
            v-if="refImagesList.length === 0"
            class="ref-image-empty-pill"
            :class="{ 'is-disabled': isGenerating }"
          >
            <Plus :size="11" />
            <span>参考图</span>
            <input
              type="file"
              accept="image/*"
              :multiple="maxRefImages > 1"
              style="display: none"
              @change="handleFilesSelected"
              :disabled="isGenerating"
            />
          </label>
          <!-- Otherwise, show thumbnails and the add card -->
          <template v-else>
            <div
              v-for="(item, idx) in refImagesList"
              :key="item.id"
              class="ref-image-item"
              @mouseenter="(e) => handleMouseEnter(e, item)"
              @mouseleave="handleMouseLeave"
            >
              <img :src="item.url" class="ref-image-thumb" />
              <button
                type="button"
                class="ref-image-remove-btn"
                @click="removeRefImageAt(idx)"
                title="移除参考图"
                :disabled="isGenerating"
              >
                <X :size="10" />
              </button>
            </div>

            <label
              v-if="refImagesList.length < maxRefImages"
              class="ref-image-add-btn"
              :class="{ 'is-disabled': isGenerating }"
            >
              <Plus :size="16" />
              <input
                type="file"
                accept="image/*"
                :multiple="maxRefImages > 1"
                style="display: none"
                @change="handleFilesSelected"
                :disabled="isGenerating"
              />
            </label>
          </template>
        </div>
      </div>

      <!-- Prompt input -->
      <div class="input-group">
        <label class="input-label">提示词 (Prompt)</label>
        <textarea
          v-model="promptText"
          class="prompt-textarea"
          placeholder="描述你想生成的图像内容..."
          rows="3"
          :disabled="isGenerating"
        ></textarea>
      </div>

      <!-- Model Selector -->
      <div class="input-group">
        <ModelSelector
          v-model="selectedModel"
          v-model:size="selectedSize"
          v-model:quality="selectedQuality"
          v-model:aspectRatio="selectedAspectRatio"
          v-model:options="imageOptions"
          v-model:count="n"
          type="image"
          showImageOptions
          class="model-selector-custom"
          :disabled="isGenerating"
        />
      </div>

      <!-- Generate Button -->
      <button
        type="button"
        class="generate-action-btn"
        :disabled="!promptText.trim() || isGenerating"
        @click="handleGenerate"
      >
        <span v-if="isGenerating" class="spinner"></span>
        <span>{{ isGenerating ? "生成中..." : "生成图像" }}</span>
      </button>

      <div v-if="errorMessage" class="error-msg">
        {{ errorMessage }}
      </div>

      <!-- Popover for reference image hover preview -->
      <Popover
        ref="previewPopoverRef"
        appendTo="body"
        :dismissable="true"
        :pt="previewPopoverPt"
      >
        <div v-if="hoveredRefImage" class="ref-image-hover-content">
          <img :src="hoveredRefImage.url" class="ref-image-hover-large" />
          <div class="ref-image-hover-meta">
            <span class="ref-image-hover-name">{{
              hoveredRefImage.file.name
            }}</span>
            <span class="ref-image-hover-size">{{
              formatFileSize(hoveredRefImage.file.size)
            }}</span>
          </div>
        </div>
      </Popover>
    </div>
  </Popover>
</template>

<script setup lang="ts">
import { Sparkles, Plus, X } from "lucide-vue-next";
import ModelSelector from "@/components/ModelSelector.vue";
import { type ImageModelOptionsResponse } from "@/utils/api";
import { startImageGenBatch } from "@/utils/startImageGenBatch";
import { ref, watch, type PropType, onUnmounted, computed } from "vue";
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

const popoverRef = ref();
const popoverPt = {
  root: { class: "toolbar-popover-root" },
  content: { class: "toolbar-popover-content" },
};

const promptText = ref("");
const selectedModel = ref("gpt-image-2");
const selectedSize = ref("auto");
const selectedQuality = ref("high");
const selectedAspectRatio = ref("1:1");
const n = ref(1);
const imageOptions = ref<ImageModelOptionsResponse | null>(null);
const referenceImages = ref<File[]>([]);
const refImagesList = ref<{ id: string; file: File; url: string }[]>([]);

const maxRefImages = computed(() => imageOptions.value?.maxReferenceImages ?? 0);

watch(maxRefImages, (newMax) => {
  if (referenceImages.value.length > newMax) {
    referenceImages.value = referenceImages.value.slice(0, newMax);
  }
});
const hoveredRefImage = ref<{ id: string; file: File; url: string } | null>(
  null,
);
const previewPopoverRef = ref();

const previewPopoverPt = {
  content: { style: { padding: "6px" } },
};

const handleMouseEnter = (event: Event, item: any) => {
  hoveredRefImage.value = item;
  previewPopoverRef.value?.show(event);
};

const handleMouseLeave = () => {
  hoveredRefImage.value = null;
  previewPopoverRef.value?.hide();
};

watch(
  referenceImages,
  (newFiles) => {
    // Revoke old URLs to prevent memory leaks
    refImagesList.value.forEach((item) => URL.revokeObjectURL(item.url));
    refImagesList.value = (newFiles || []).map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      url: URL.createObjectURL(file),
    }));
  },
  { immediate: true },
);

onUnmounted(() => {
  refImagesList.value.forEach((item) => URL.revokeObjectURL(item.url));
});

const handleFilesSelected = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files) {
    const current = [...referenceImages.value];
    const limit = maxRefImages.value;
    for (let i = 0; i < files.length; i++) {
      if (current.length < limit) {
        current.push(files[i]);
      }
    }
    referenceImages.value = current;
  }
  (e.target as HTMLInputElement).value = "";
};

const removeRefImageAt = (index: number) => {
  const current = [...referenceImages.value];
  current.splice(index, 1);
  referenceImages.value = current;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const isGenerating = ref(false);
const errorMessage = ref("");

const dataURLtoFile = (dataurl: string, filename: string): File => {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

// Sync target values when selected element changes
watch(
  [
    () => props.target,
    () => (props.target as any)?.proxyData?.generationStatus,
    () => (props.target as any)?.proxyData?.errorMessage,
  ],
  ([newTarget]) => {
    if (!newTarget) return;
    const targetAny = newTarget as any;
    promptText.value = targetAny.prompt || "";
    selectedModel.value = targetAny.model || "gpt-image-2";
    selectedSize.value = targetAny.size || "auto";
    selectedQuality.value = targetAny.quality || "high";
    selectedAspectRatio.value = targetAny.aspectRatio || "1:1";
    errorMessage.value = targetAny.errorMessage || "";
    n.value = targetAny.n || 1;
    
    isGenerating.value = targetAny.generationStatus === "generating";

    if (Array.isArray(targetAny.images) && targetAny.images.length > 0) {
      // Avoid converting and setting if already matching
      const toBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
        });

      Promise.all(referenceImages.value.map(toBase64)).then((currentBase64s) => {
        if (JSON.stringify(currentBase64s) !== JSON.stringify(targetAny.images)) {
          referenceImages.value = targetAny.images.map((b64: string, idx: number) => {
            return dataURLtoFile(b64, `ref-image-${idx}.png`);
          });
        }
      });
    } else {
      if (referenceImages.value.length > 0) {
        referenceImages.value = [];
      }
    }
  },
  { immediate: true },
);

watch(referenceImages, async (newFiles) => {
  const targetAny = props.target as any;
  if (targetAny) {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });
    const base64s = await Promise.all(newFiles.map(toBase64));
    const currentBase64s = targetAny.images || [];
    if (JSON.stringify(currentBase64s) !== JSON.stringify(base64s)) {
      targetAny.set({ images: base64s });
      emit("change", { key: "images", value: base64s });
    }
  }
});

watch(n, (value) => {
  const targetAny = props.target as any;
  if (targetAny && targetAny.n !== value) {
    targetAny.set({ n: value });
    emit("change", { key: "n", value });
  }
});

const togglePanel = (event: Event) => {
  popoverRef.value?.toggle(event);
};

const handleGenerate = async () => {
  if (!promptText.value.trim() || isGenerating.value) return;

  isGenerating.value = true;
  errorMessage.value = "";

  const targetAny = props.target as any;
  const count = Math.max(1, Math.floor(Number(n.value) || 1));

  targetAny.set({
    prompt: promptText.value,
    model: selectedModel.value,
    size: selectedSize.value,
    quality: selectedQuality.value,
    aspectRatio: selectedAspectRatio.value,
    n: count,
    errorMessage: "",
    generationStatus: "generating",
  });

  emit("change", { key: "generationStatus", value: "generating" });
  emit("change", { key: "n", value: count, skipHistory: true });

  try {
    const result = await startImageGenBatch({
      sourceNode: targetAny,
      params: {
        prompt: promptText.value,
        model: selectedModel.value,
        size: selectedSize.value,
        quality: selectedQuality.value,
        aspectRatio: selectedAspectRatio.value,
        images:
          referenceImages.value.length > 0
            ? referenceImages.value
            : undefined,
        n: count,
      },
      maxCount: imageOptions.value?.maxGenerationCount ?? 16,
    });

    emit("change", {
      key: "taskId",
      value: targetAny.taskId,
      skipHistory: true,
    });
    popoverRef.value?.hide();

    if (result.errors.some(Boolean)) {
      const failed = result.errors.filter(Boolean).length;
      errorMessage.value = `${result.successCount} 个任务已启动，${failed} 个失败`;
    }
  } catch (err: any) {
    console.error("[ImageGenTool] failed:", err);
    const { userFacingGenerationError } = await import("@/utils/userFacingError");
    const errMsg = userFacingGenerationError(err, "生成失败，请稍后重试");
    errorMessage.value = errMsg;
    targetAny.set({
      generationStatus: "error",
      errorMessage: errMsg,
    });
    emit("change", { key: "errorMessage", value: errMsg });
    emit("change", { key: "generationStatus", value: "error" });
    isGenerating.value = false;
  }
};
</script>

<style scoped lang="scss">
.image-gen-trigger-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--p-primary-color);
  background: var(--p-primary-50);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--p-primary-100);
    border-color: var(--p-primary-200);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.sparkles-icon {
  flex-shrink: 0;
}

.image-gen-panel {
  width: 250px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
}

.prompt-textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 11px;
  font-family: inherit;
  resize: vertical;
  max-height: min(42vh, 280px);
  overflow-y: auto;
  overscroll-behavior: contain;
  background-color: var(--p-surface-50);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: var(--p-primary-color);
    background-color: var(--surface-panel);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.model-selector-custom {
  width: 100%;
  :deep(.model-selector__select) {
    width: 100% !important;
  }
  :deep(.model-selector__image-options) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-top: 4px;
  }
  :deep(.model-selector__subselect) {
    width: 100% !important;
  }
}

.generate-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  background-color: var(--p-primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background-color: var(--p-primary-hover-color, var(--p-primary-600));
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-msg {
  font-size: 10px;
  color: var(--accent-error);
  word-break: break-all;
  background-color: #fef2f2;
  border: 1px solid #fee2e2;
  padding: 6px;
  border-radius: 4px;
}

/* Horizontal scroll container styles */
.ref-images-scroll-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding: 4px 2px 8px 2px;
  margin-bottom: 2px;

  /* Firefox scrollbar styling */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;

  /* Webkit (Chrome, Safari, Edge) scrollbar styling */
  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 9999px;
  }
  
  &:hover {
    scrollbar-color: var(--p-surface-300, #cbd5e1) transparent;
    
    &::-webkit-scrollbar-thumb {
      background: var(--p-surface-300, #cbd5e1);
    }
    &::-webkit-scrollbar-thumb:hover {
      background: var(--p-surface-400, #94a3b8);
    }
  }
}

.ref-images-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ref-image-empty-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 550;
  border: 1px dashed var(--border-color, #e4e4e7);
  background-color: var(--p-surface-50);
  border-radius: 9999px;
  color: var(--text-secondary);
  cursor: pointer;
  box-sizing: border-box;
  transition: all 0.2s ease;

  &:hover:not(.is-disabled) {
    border-color: var(--p-primary-color);
    background-color: var(--p-primary-50);
    color: var(--p-primary-color);
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.ref-image-item {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e4e4e7);
  flex-shrink: 0;
  background-color: var(--p-surface-50);
}

.ref-image-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 7px;
}

.ref-image-remove-btn {
  position: absolute;
  top: -4px;
  right: -4px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s;
  z-index: 10;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  &:hover:not(:disabled) {
    background: var(--accent-error);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.ref-image-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px dashed var(--border-color, #e4e4e7);
  border-radius: 8px;
  background-color: var(--p-surface-50);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;

  &:hover:not(.is-disabled) {
    border-color: var(--p-primary-color);
    background-color: var(--p-primary-50);
    color: var(--p-primary-color);
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* Hover Preview Card styling */
.ref-image-hover-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 148px;
}

.ref-image-hover-large {
  width: 148px;
  height: 148px;
  object-fit: contain;
  border-radius: 4px;
  background-color: var(--p-surface-50);
}

.ref-image-hover-meta {
  display: flex;
  flex-direction: column;
  font-size: 10px;
  color: var(--text-secondary);
  line-height: 1.3;
}

.ref-image-hover-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  color: var(--text-primary);
}

.ref-image-hover-size {
  color: var(--text-tertiary, #9ca3af);
}
</style>
