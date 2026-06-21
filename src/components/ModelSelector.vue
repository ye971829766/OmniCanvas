<template>
  <div class="model-selector">
    <label v-if="label" class="model-selector__label" :for="resolvedSelectId">{{
      label
    }}</label>
    <div class="model-selector__row">
      <Select
        :id="resolvedSelectId"
        v-model="selectedModel"
        :options="modelOptions"
        optionLabel="label"
        optionValue="value"
        :placeholder="placeholder"
        :loading="loading"
        :disabled="disabled || loading"
        filter
        class="model-selector__select"
      >
        <template #value="{ value, placeholder: valuePlaceholder }">
          <div v-if="selectedOption" class="model-selector__value">
            <img
              v-if="selectedOption.iconUrl"
              class="model-selector__logo-img"
              :src="selectedOption.iconUrl"
              aria-hidden="true"
            />
            <span
              v-else
              class="model-selector__logo"
              :style="getLogoStyle(selectedOption)"
              aria-hidden="true"
              >{{ selectedOption.brandInitial }}</span
            >
            <span class="model-selector__value-text">{{
              selectedOption.label
            }}</span>
          </div>
          <span v-else class="model-selector__placeholder">{{
            value ? value : valuePlaceholder
          }}</span>
        </template>
        <template #option="{ option }">
          <div class="model-selector__option flex justify-center items-center gap-1">
            <img
              v-if="option.iconUrl"
              class="model-selector__logo-img"
              :src="option.iconUrl"
              aria-hidden="true"
            />
            <span
              v-else
              class="model-selector__logo"
              :style="getLogoStyle(option)"
              aria-hidden="true"
              >{{ option.brandInitial }}</span
            >
            <span class="model-selector__option-text"
              ><span class="model-selector__option-name text-center">{{
                option.label
              }}</span></span
            >
          </div>
        </template>
        <template #empty
          ><div class="model-selector__empty">
            <span class="model-selector__empty-text">暂无数据</span>
          </div></template
        >
      </Select>
    </div>

    <div
      v-if="showImageOptions && type === 'image' && imageOptions"
      class="model-selector__image-options"
    >
      <Select
        v-if="sizeOptions.length"
        v-model="selectedSize"
        :options="sizeOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="尺寸"
        :disabled="disabled || optionsLoading"
        class="model-selector__subselect"
      >
    <template #header>
        <div class="font-medium p-3">尺寸</div>
    </template>
    </Select>
      <Select
        v-if="qualityOptions.length"
        v-model="selectedQuality"
        :options="qualityOptions"
        optionLabel="label"
        optionValue="value"
        :placeholder="qualityPlaceholder"
        :disabled="disabled || optionsLoading"
        class="model-selector__subselect"
      >
      <template #header>
        <div class="font-medium p-3">质量</div>
      </template>
    </Select>
      <Select
        v-if="aspectRatioOptions.length"
        v-model="selectedAspectRatio"
        :options="aspectRatioOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="比例"
        :disabled="disabled || optionsLoading"
        class="model-selector__subselect"
      >
      <template #header>
        <div class="font-medium p-3">比例</div>
      </template>
    </Select>
      <Select
        v-if="showCountSelector"
        v-model="selectedCount"
        :options="countOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="数量"
        :disabled="disabled || optionsLoading"
        class="model-selector__subselect"
      >
      <template #header>
        <div class="font-medium p-3">数量</div>
      </template>
    </Select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref, watch } from "vue";
import Select from "primevue/select";
import {
  getModelConfig,
  getImageModelOptions,
  type ImageModelOptionsResponse,
  type YunwuModelType,
} from "@/utils/api";

interface SelectorOption {
  label: string;
  value: string;
}
interface ModelOption extends SelectorOption {
  id: string;
  brandInitial: string;
  brandColor: string;
  iconUrl?: string;
}
interface Props {
  type?: YunwuModelType;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showRefresh?: boolean;
  showImageOptions?: boolean;
  autoSelectFirst?: boolean;
  selectId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  type: "image",
  label: "",
  placeholder: "选择模型",
  disabled: true,
  showRefresh: true,
  showImageOptions: false,
  autoSelectFirst: true,
  selectId: "",
});
const emit = defineEmits<{
  loaded: [models: ModelOption[]];
  "options-loaded": [options: ImageModelOptionsResponse | null];
  error: [message: string];
}>();

const selectedModel = defineModel<string>({ default: "" });
const selectedSize = defineModel<string>("size", { default: "" });
const selectedQuality = defineModel<string>("quality", { default: "" });
const selectedAspectRatio = defineModel<string>("aspectRatio", { default: "" });
const selectedCount = defineModel<number>("count", { default: 1 });
const imageOptions = defineModel<ImageModelOptionsResponse | null>("options", {
  default: null,
});

const instance = getCurrentInstance();
const loading = ref(false);
const optionsLoading = ref(false);
const models = ref<ModelOption[]>([]);
const errorMessage = ref("");
let optionsRequestId = 0;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
const getLogoStyle = (option: ModelOption) => ({
  background: option.brandColor,
});
const resolvedSelectId = computed(
  () => props.selectId || `model-selector-${props.type}-${instance?.uid ?? 0}`,
);

const modelOptions = computed(() =>
  models.value.map((model) => ({ ...model, value: model.id })),
);
const selectedOption = computed(() =>
  modelOptions.value.find((option) => option.value === selectedModel.value),
);
const sizeOptions = computed<SelectorOption[]>(() =>
  (imageOptions.value?.sizes ?? []).map((size) => ({
    label: size,
    value: size,
  })),
);
const qualityOptions = computed<SelectorOption[]>(() =>
  (imageOptions.value?.qualities ?? []).map((quality) => ({
    label: quality,
    value: quality,
  })),
);
const aspectRatioOptions = computed<SelectorOption[]>(() =>
  (imageOptions.value?.aspectRatios ?? []).map((ratio) => ({
    label: ratio,
    value: ratio,
  })),
);
const maxGenCount = computed(() => imageOptions.value?.maxGenerationCount ?? 1);
const showCountSelector = computed(() => maxGenCount.value > 1);
const countOptions = computed(() =>
  Array.from({ length: maxGenCount.value }, (_, i) => {
    const n = i + 1;
    return { label: String(n), value: n };
  }),
);
const qualityPlaceholder = computed(() =>
  imageOptions.value?.qualityMode === "image_size"
    ? "输出档位"
    : imageOptions.value?.qualityMode === "resolution"
      ? "清晰度"
      : imageOptions.value?.qualityMode === "preset"
        ? "预设"
        : "质量",
);

async function loadModels() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const config = await getModelConfig();
    const mappings = (config.mappings || []).filter(
      (item) => item.enabled && item.purpose === props.type,
    );
    models.value = mappings.map((item) => ({
      id: item.id,
      value: item.id,
      label: item.label || item.id,
      brandInitial: item.brandInitial || (item.label ? item.label.charAt(0).toUpperCase() : "M"),
      brandColor: item.brandColor || "linear-gradient(135deg, #475569, #94a3b8)",
      iconUrl: item.iconUrl,
    }));
    emit("loaded", models.value);
    if (!selectedModel.value && props.autoSelectFirst && models.value[0])
      selectedModel.value = models.value[0].id;
  } catch (error) {
    const message = getErrorMessage(error, "模型列表加载失败");
    errorMessage.value = message;
    emit("error", message);
  } finally {
    loading.value = false;
  }
}

async function loadImageOptions(model: string) {
  const requestId = ++optionsRequestId;
  optionsLoading.value = true;
  errorMessage.value = "";
  try {
    const options = await getImageModelOptions(model);
    if (requestId !== optionsRequestId) return;
    imageOptions.value = options;
    emit("options-loaded", options);
    if (
      options.defaults.size &&
      (!selectedSize.value || !options.sizes?.includes(selectedSize.value))
    )
      selectedSize.value = options.defaults.size;
    if (
      options.defaults.quality &&
      (!selectedQuality.value ||
        !options.qualities?.includes(selectedQuality.value))
    )
      selectedQuality.value = options.defaults.quality;
    if (
      selectedAspectRatio.value &&
      !options.aspectRatios?.includes(selectedAspectRatio.value)
    )
      selectedAspectRatio.value = "";
    if (showCountSelector.value) {
      if (!selectedCount.value || selectedCount.value > maxGenCount.value) {
        selectedCount.value = 1;
      }
    } else {
      selectedCount.value = 1;
    }
  } catch (error) {
    if (requestId !== optionsRequestId) return;
    const message = getErrorMessage(error, "模型选项加载失败");
    imageOptions.value = null;
    errorMessage.value = message;
    emit("options-loaded", null);
    emit("error", message);
  } finally {
    if (requestId === optionsRequestId) optionsLoading.value = false;
  }
}

watch(
  () => props.type,
  () => {
    selectedModel.value = "";
    selectedSize.value = "";
    selectedQuality.value = "";
    selectedAspectRatio.value = "";
    selectedCount.value = 1;
    imageOptions.value = null;
    emit("options-loaded", null);
    void loadModels();
  },
);

watch(
  [() => selectedModel.value, () => props.showImageOptions, () => props.type],
  ([model]) => {
    if (props.type === "image" && props.showImageOptions && model) {
      void loadImageOptions(model);
      return;
    }
    imageOptions.value = null;
    emit("options-loaded", null);
  },
  { immediate: true },
);

onMounted(() => {
  void loadModels();
});
</script>

<style lang="scss">
.model-selector__logo-img {
  width: 14px;
  height: 14px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}
</style>
