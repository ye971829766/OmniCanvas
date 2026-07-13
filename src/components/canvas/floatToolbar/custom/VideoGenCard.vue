<template>
  <div class="video-gen-card">
    <!-- Reference Image Container -->
    <div class="ref-images-scroll-container" v-if="supportReferenceType !== 'none'">
      <div class="ref-images-wrapper">
        <!-- First Frame (首帧) -->
        <template v-if="supportReferenceType === 'first' || supportReferenceType === 'first_last'">
          <div
            v-if="refImage"
            class="ref-image-item"
            @mouseenter="e => handleMouseEnter(e, 'first')"
            @mouseleave="handleMouseLeave"
          >
            <img :src="refImageUrl" class="ref-image-thumb" />
            <button
              type="button"
              class="ref-image-remove-btn"
              @click="removeRefImage"
              title="移除首帧"
              :disabled="isGenerating"
            >
              <X :size="10" />
            </button>
          </div>
          <label
            v-else
            class="ref-image-empty-pill"
            :class="{ 'is-disabled': isGenerating }"
          >
            <Plus :size="11" />
            <span>首帧</span>
            <input
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleFileSelected"
              :disabled="isGenerating"
            />
          </label>
        </template>

        <!-- Tail Frame (尾帧) -->
        <template v-if="supportReferenceType === 'first_last'">
          <div
            v-if="refTailImage"
            class="ref-image-item"
            @mouseenter="e => handleMouseEnter(e, 'tail')"
            @mouseleave="handleMouseLeave"
          >
            <img :src="refTailImageUrl" class="ref-image-thumb" />
            <button
              type="button"
              class="ref-image-remove-btn"
              @click="removeRefTailImage"
              title="移除尾帧"
              :disabled="isGenerating"
            >
              <X :size="10" />
            </button>
          </div>
          <label
            v-else
            class="ref-image-empty-pill"
            :class="{ 'is-disabled': isGenerating }"
          >
            <Plus :size="11" />
            <span>尾帧</span>
            <input
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleTailFileSelected"
              :disabled="isGenerating"
            />
          </label>
        </template>
      </div>
    </div>

    <!-- Prompt Textarea -->
    <Textarea
      v-model="promptText"
      class="prompt-textarea"
      placeholder="描述你想生成的视频场景内容..."
      rows="2"
      autoResize
      :disabled="isGenerating"
    />

    <!-- Controls Row -->
    <div class="card-controls-row">
      <div class="controls-left">
        <!-- Reusing ModelSelector styled inline -->
        <ModelSelector
          v-model="selectedModel"
          type="video"
          :showImageOptions="false"
          :showRefresh="false"
          placeholder="选择视频模型"
          :disabled="isGenerating"
          class="inline-model-selector"
        />

        <!-- Size Select (dropdown) -->
        <Select
          v-model="selectedSize"
          :options="sizeOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="比例"
          :disabled="isGenerating || optionsLoading"
          class="video-subselect"
        />

        <!-- Seconds Select (Pill Button + Popover Slider) -->
        <button
          type="button"
          class="video-subselect-btn"
          :disabled="isGenerating || optionsLoading"
          @click="toggleSecondsPopover"
        >
          <span>{{ selectedSeconds }} 秒</span>
        </button>

        <Popover
          ref="secondsPopoverRef"
          appendTo="body"
          :dismissable="true"
        >
          <div class="seconds-slider-popover-content">
            <span class="popover-slider-label">视频时长: {{ selectedSeconds }} 秒</span>
            <div class="slider-wrapper">
              <Slider
                v-model="selectedSeconds"
                :min="minSeconds"
                :max="maxSeconds"
                :disabled="isGenerating"
                class="video-seconds-slider"
              />
            </div>
          </div>
        </Popover>
      </div>

      <!-- Generate Button -->
      <Button
        class="generate-pill"
        :loading="isGenerating"
        @click="handleGenerate"
        :label="isGenerating ? '生成中' : '生成'"
        :disabled="!promptText.trim()"
      >
      </Button>
    </div>

    <!-- Error Message banner -->
    <div v-if="errorMessage" class="error-banner">
      {{ errorMessage }}
    </div>

    <!-- Popover for reference image hover preview -->
    <Popover
      ref="previewPopoverRef"
      appendTo="body"
      :dismissable="true"
      :pt="popoverPt"
    >
      <div v-if="hoveredImage" class="ref-image-hover-content">
        <img :src="hoveredImageUrl" class="ref-image-hover-large" />
        <div class="ref-image-hover-meta">
          <span class="ref-image-hover-name">{{ hoveredImage.name }}</span>
          <span class="ref-image-hover-size">{{
            formatFileSize(hoveredImage.size)
          }}</span>
        </div>
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { Plus, X } from "lucide-vue-next";
import Popover from "primevue/popover";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import ModelSelector from "@/components/ModelSelector.vue";
import { generateVideo, getVideoModelOptions, type VideoModelOptionsResponse } from "@/utils/api";
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
const selectedModel = ref("");
const selectedSize = ref("");
const selectedSeconds = ref<number>(5);
const refImage = ref<File | null>(null);
const refImageUrl = ref("");
const refTailImage = ref<File | null>(null);
const refTailImageUrl = ref("");

const sizeOptions = ref<{ label: string; value: string }[]>([]);
const minSeconds = ref(5);
const maxSeconds = ref(10);
const videoOptions = ref<VideoModelOptionsResponse | null>(null);
const optionsLoading = ref(false);

const secondsPopoverRef = ref();
const toggleSecondsPopover = (event: Event) => {
  secondsPopoverRef.value?.toggle(event);
};

watch(selectedModel, async (model) => {
  if (!model) return;
  optionsLoading.value = true;
  try {
    const opts = await getVideoModelOptions(model);
    videoOptions.value = opts;
    sizeOptions.value = opts.sizes;
    minSeconds.value = opts.minSeconds ?? 5;
    maxSeconds.value = opts.maxSeconds ?? 10;

    // Set defaults if current selection is not valid or not present in available options
    if (opts.defaults) {
      if (!selectedSize.value || !opts.sizes.some((s) => s.value === selectedSize.value)) {
        selectedSize.value = opts.defaults.size;
      }
      if (selectedSeconds.value < minSeconds.value || selectedSeconds.value > maxSeconds.value) {
        selectedSeconds.value = opts.defaults.seconds;
      }
    }
  } catch (err) {
    console.error("Failed to load options for model: " + model, err);
  } finally {
    optionsLoading.value = false;
  }
}, { immediate: true });

const previewPopoverRef = ref();
const popoverPt = {
  content: { style: { padding: "6px" } },
};

const supportReferenceType = computed(() => videoOptions.value?.supportReferenceType ?? 'none');
const hoveredType = ref<'first' | 'tail' | null>(null);
const hoveredImage = computed(() => hoveredType.value === 'first' ? refImage.value : refTailImage.value);
const hoveredImageUrl = computed(() => hoveredType.value === 'first' ? refImageUrl.value : refTailImageUrl.value);

const handleMouseEnter = (event: Event, type: 'first' | 'tail') => {
  hoveredType.value = type;
  previewPopoverRef.value?.show(event);
};

const handleMouseLeave = () => {
  hoveredType.value = null;
  previewPopoverRef.value?.hide();
};

const handleFileSelected = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files[0]) {
    refImage.value = files[0];
    if (refImageUrl.value) URL.revokeObjectURL(refImageUrl.value);
    refImageUrl.value = URL.createObjectURL(files[0]);
  }
  (e.target as HTMLInputElement).value = "";
};

const removeRefImage = () => {
  refImage.value = null;
  if (refImageUrl.value) {
    URL.revokeObjectURL(refImageUrl.value);
    refImageUrl.value = "";
  }
};

const handleTailFileSelected = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files[0]) {
    refTailImage.value = files[0];
    if (refTailImageUrl.value) URL.revokeObjectURL(refTailImageUrl.value);
    refTailImageUrl.value = URL.createObjectURL(files[0]);
  }
  (e.target as HTMLInputElement).value = "";
};

const removeRefTailImage = () => {
  refTailImage.value = null;
  if (refTailImageUrl.value) {
    URL.revokeObjectURL(refTailImageUrl.value);
    refTailImageUrl.value = "";
  }
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

// Clean up URLs
onUnmounted(() => {
  if (refImageUrl.value) URL.revokeObjectURL(refImageUrl.value);
  if (refTailImageUrl.value) URL.revokeObjectURL(refTailImageUrl.value);
});

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

// Sync properties from/to Canvas target
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
    selectedModel.value = targetAny.model || "";
    selectedSize.value = targetAny.size || "";
    const secVal = Number(targetAny.seconds);
    if (!isNaN(secVal) && secVal > 0) {
      selectedSeconds.value = secVal;
    } else if (videoOptions.value?.defaults?.seconds) {
      selectedSeconds.value = videoOptions.value.defaults.seconds;
    } else {
      selectedSeconds.value = minSeconds.value;
    }
    errorMessage.value = targetAny.errorMessage || "";
    isGenerating.value = targetAny.generationStatus === "generating";

    if (targetAny.inputReference) {
      const b64 = targetAny.inputReference;
      const toBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
        });

      const setRefFromFile = () => {
        const file = dataURLtoFile(b64, "ref_image.png");
        refImage.value = file;
        if (refImageUrl.value) URL.revokeObjectURL(refImageUrl.value);
        refImageUrl.value = URL.createObjectURL(file);
      };

      if (refImage.value) {
        toBase64(refImage.value).then((currentB64) => {
          if (currentB64 !== b64) {
            setRefFromFile();
          }
        });
      } else {
        setRefFromFile();
      }
    } else {
      refImage.value = null;
      if (refImageUrl.value) {
        URL.revokeObjectURL(refImageUrl.value);
        refImageUrl.value = "";
      }
    }

    if (targetAny.inputTailReference) {
      const file = dataURLtoFile(targetAny.inputTailReference, "ref_tail_image.png");
      refTailImage.value = file;
      if (refTailImageUrl.value) URL.revokeObjectURL(refTailImageUrl.value);
      refTailImageUrl.value = URL.createObjectURL(file);
    } else {
      refTailImage.value = null;
      if (refTailImageUrl.value) {
        URL.revokeObjectURL(refTailImageUrl.value);
        refTailImageUrl.value = "";
      }
    }
  },
  { immediate: true },
);

watch(promptText, (v) => {
  const targetAny = props.target as any;
  if (targetAny && targetAny.prompt !== v) {
    targetAny.set({ prompt: v });
    emit("change", { key: "prompt", value: v });
  }
});

watch([selectedModel, selectedSize, selectedSeconds, refImage, refTailImage], () => {
  const targetAny = props.target as any;
  if (targetAny) {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

    if (refImage.value) {
      toBase64(refImage.value).then((b64) => {
        if (targetAny.inputReference !== b64) {
          targetAny.set({ inputReference: b64 });
        }
      });
    } else {
      if (targetAny.inputReference !== "") {
        targetAny.set({ inputReference: "" });
      }
    }

    if (refTailImage.value) {
      toBase64(refTailImage.value).then((b64) => {
        if (targetAny.inputTailReference !== b64) {
          targetAny.set({ inputTailReference: b64 });
        }
      });
    } else if (targetAny.inputTailReference !== "") {
      targetAny.set({ inputTailReference: "" });
    }

    targetAny.set({
      model: selectedModel.value,
      size: selectedSize.value,
      seconds: String(selectedSeconds.value),
    });
    emit("change", { key: "model", value: selectedModel.value });
  }
});

const handleGenerate = async () => {
  if (!promptText.value.trim() || isGenerating.value) return;

  isGenerating.value = true;
  errorMessage.value = "";

  const targetAny = props.target as any;

  targetAny.set({
    generationStatus: "generating",
    errorMessage: "",
  });
  emit("change", { key: "generationStatus", value: "generating" });

  try {
    const payload: any = {
      prompt: promptText.value,
      model: selectedModel.value,
      size: selectedSize.value,
      seconds: String(selectedSeconds.value),
    };

    if (refImage.value && (supportReferenceType.value === "first" || supportReferenceType.value === "first_last")) {
      payload.input_reference = refImage.value;
    }

    if (refTailImage.value && supportReferenceType.value === "first_last") {
      payload.input_tail_reference = refTailImage.value;
    }

    const res = await generateVideo(payload);

    if (res && res.taskId) {
      targetAny.set({
        taskId: res.taskId,
        generationStatus: "generating",
      });
      targetAny.emit("task-start", { bubbles: true });
      emit("change", { key: "taskId", value: res.taskId });
    } else {
      throw new Error("No taskId returned from API");
    }
  } catch (err: any) {
    console.error("[VideoGenCard] failed:", err);
    const errMsg = err.message || "生成失败，请重试";
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
.video-gen-card {
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
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.inline-model-selector {
  display: flex;
  align-items: center;
  gap: 6px;

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

.video-subselect {
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

/* Reference image container and thumbnail styles consistent with ImageGenCard */
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

.video-subselect-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 24px !important;
  padding: 0 10px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
  background-color: var(--p-surface-50) !important;
  border-radius: 9999px !important;
  cursor: pointer !important;
  box-sizing: border-box !important;
  transition: all 0.2s ease !important;

  &:hover:not(:disabled) {
    background-color: var(--p-surface-100) !important;
    border-color: var(--p-primary-color) !important;
  }

  &:disabled {
    opacity: 0.5 !important;
    cursor: not-allowed !important;
  }
}

.seconds-slider-popover-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 160px;
  padding: 4px;
}

.popover-slider-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--p-text-color);
}

.slider-wrapper {
  padding: 6px 4px;
}

.video-seconds-slider {
  width: 100%;
}
</style>
