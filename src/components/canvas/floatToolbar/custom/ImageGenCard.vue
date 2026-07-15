<template>
  <div class="image-gen-card">
    <!-- Reference Images Scroll Container -->
    <div class="ref-images-scroll-container" v-if="maxRefImages > 0">
      <div class="ref-images-wrapper">
        <!-- If empty, show a small pill upload button -->
        <label v-if="refImagesList.length === 0" class="ref-image-empty-pill" :class="{ 'is-disabled': isGenerating }">
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
            @mouseenter="e => handleMouseEnter(e, item)"
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
          
          <label v-if="refImagesList.length < maxRefImages" class="ref-image-add-btn" :class="{ 'is-disabled': isGenerating }">
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

    <!-- Prompt Textarea (using PrimeVue Textarea with autoResize) -->
    <Textarea
      v-model="promptText"
      class="prompt-textarea"
      placeholder="今天我们要创作什么"
      rows="2"
      autoResize
      :disabled="isGenerating"
    />

    <!-- Bottom Controls Row -->
    <div class="card-controls-row">
      <div class="controls-left">
        <!-- Reusing ModelSelector styled inline -->
        <ModelSelector
          v-model="selectedModel"
          v-model:size="selectedSize"
          v-model:quality="selectedQuality"
          v-model:aspectRatio="selectedAspectRatio"
          v-model:options="imageOptions"
          v-model:count="n"
          
          type="image"
          :showImageOptions="true"
          :showRefresh="false"
          placeholder="选择模型"
          :disabled="isGenerating"
          class="inline-model-selector"
        />
      </div>

      <!-- Generate Action (using PrimeVue Button styled as a lightning bolt pill) -->
      <Button
        class="generate-pill"
        :loading="isGenerating"
        @click="handleGenerate"
        :label="isGenerating ? '生成中' : '生成'"
      >
      </Button>
    </div>

    <!-- Error Message banner -->
    <div v-if="errorMessage" class="error-banner">
      {{ errorMessage }}
    </div>

    <!-- Popover for reference image hover preview -->
    <Popover ref="previewPopoverRef" appendTo="body" :dismissable="true" :pt="popoverPt">
      <div v-if="hoveredRefImage" class="ref-image-hover-content">
        <img :src="hoveredRefImage.url" class="ref-image-hover-large" />
        <div class="ref-image-hover-meta">
          <span class="ref-image-hover-name">{{ hoveredRefImage.file.name }}</span>
          <span class="ref-image-hover-size">{{ formatFileSize(hoveredRefImage.file.size) }}</span>
        </div>
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { Plus, X } from "lucide-vue-next";
import Popover from "primevue/popover";
import ModelSelector from "@/components/ModelSelector.vue";
import { type ImageModelOptionsResponse } from "@/utils/api";
import { startImageGenBatch } from "@/utils/startImageGenBatch";
import { ref, watch, type PropType, onUnmounted, computed } from "vue";
import type { ToolbarChangePayload, ToolbarTarget } from "../types";

const props = defineProps({
  target: {
    type: Object as PropType<ToolbarTarget>,
    required: true,
  },
});

const emit = defineEmits<{
  change: [payload: ToolbarChangePayload];
}>();

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
const hoveredRefImage = ref<{ id: string; file: File; url: string } | null>(null);
const previewPopoverRef = ref();

const popoverPt = {
  content: { style: { padding: '6px' } }
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

// Synchronize card states from selected canvas target element
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

// Sync input changes immediately to the canvas element properties
watch(promptText, (v) => {
  const targetAny = props.target as any;
  if (targetAny && targetAny.prompt !== v) {
    targetAny.set({ prompt: v });
    emit("change", { key: "prompt", value: v });
  }
});

watch(
    [selectedModel, selectedSize, selectedQuality, selectedAspectRatio, n],
  () => {
    const targetAny = props.target as any;
    if (targetAny) {
      targetAny.set({
        model: selectedModel.value,
        size: selectedSize.value,
        quality: selectedQuality.value,
        aspectRatio: selectedAspectRatio.value,
        n: n.value,
      });
      emit("change", { key: "model", value: selectedModel.value });
    }
  },
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
    generationStatus: "generating",
    errorMessage: "",
  });
  emit("change", { key: "generationStatus", value: "generating" });
  emit("change", { key: "n", value: count, skipHistory: true });

  try {
    // Fan out into N independent tasks (n=1 each) so providers without batch `n`
    // still produce the requested number of canvases.
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

    if (result.errors.some(Boolean)) {
      const failed = result.errors.filter(Boolean).length;
      errorMessage.value = `${result.successCount} 个任务已启动，${failed} 个失败`;
    }
  } catch (err: any) {
    console.error("[ImageGenCard] failed:", err);
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
.image-gen-card {
  width: 500px;
  background-color: var(--surface-panel);
  border: 1px solid var(--border-color);
  border-radius: 16px; // rounded-2xl
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.08),
    0 8px 10px -6px rgba(0, 0, 0, 0.03);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
}

.prompt-textarea {
  width: 100% !important;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-primary);
  outline: none;
  resize: none;
  padding: 2px 4px !important;
  line-height: 1.5;

  &::placeholder {
    color: var(--p-surface-400);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
}

.card-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid var(--p-surface-100);
  padding-top: 8px;
}

.controls-left {
  flex: 1;
  min-width: 0;
}

.inline-model-selector {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;

  :deep(.model-selector__row) {
    display: inline-block;
  }

  :deep(.p-select) {
    width: auto !important;
    height: 24px !important;
    padding: 0 4px 0 8px !important;
    font-size: 11px !important;
    border-color: var(--border-color) !important;
    background-color: var(--p-surface-50) !important;
    border-radius: 9999px !important;
    display: inline-flex !important;
    align-items: center !important;
    box-sizing: border-box !important;

    &:focus,
    &.p-focus {
      outline: none !important;
      box-shadow: none !important;
    }
  }

  :deep(.p-select-label) {
    padding: 0 !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    color: var(--text-primary) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    height: 100% !important;
    line-height: normal !important;
    text-align: center !important;
  }

  :deep(.p-select-dropdown) {
    width: 16px !important;
    height: 100% !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin-left: 2px !important;

    svg {
      width: 8px !important;
      height: 8px !important;
    }
  }

  :deep(.model-selector__value) {
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    height: 100% !important;
    line-height: normal !important;
  }

  :deep(.model-selector__image-options) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 0;
  }

  :deep(.model-selector__logo) {
    width: 14px !important;
    height: 14px !important;
    flex: 0 0 14px !important;
    font-size: 8px !important;
    border-radius: 4px !important;
    margin-right: 2px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  :deep(.model-selector__logo-img) {
    width: 10px !important;
    height: 10px !important;
  }
}

.generate-pill {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  height: 26px !important;
  padding: 0 12px !important;
  background-color: var(--p-surface-100) !important;
  border: none !important;
  border-radius: 9999px !important; // fully rounded pill
  color: var(--text-primary) !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  flex-shrink: 0 !important;
  box-shadow: none !important;

  &:hover:not(:disabled) {
    background-color: var(--p-surface-200) !important;
  }

  &:disabled {
    opacity: 0.5 !important;
    cursor: not-allowed !important;
  }

  &.is-generating {
    background-color: var(--p-primary-color) !important;
    color: white !important;
  }
}

.bolt-icon {
  font-size: 12px;
}

.cost-text {
  font-family: var(--font-family-mono);
}

.spinner {
  width: 10px;
  height: 10px;
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

.error-banner {
  font-size: 10px;
  color: var(--accent-error);
  word-break: break-all;
  background-color: #fef2f2;
  border: 1px solid #fee2e2;
  padding: 6px 10px;
  border-radius: 6px;
  margin-top: 2px;
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
