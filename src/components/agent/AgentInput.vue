<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount, onMounted } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import {
  Plus,
  Lightbulb,
  Square,
  ArrowUp,
  X,
  Image as ImageIcon,
  Type as TypeIcon,
  Circle as CircleIcon,
  Play as PlayIcon,
  Cpu,
} from "lucide-vue-next";
import { getModelConfig } from "@/utils/api";
import Button from "primevue/button";
import type { AgentAttachmentInput } from "@/types/agent";
import {
  createAgentAttachment,
  createAgentAttachmentFromSource,
  MAX_AGENT_ATTACHMENTS,
} from "@/utils/agentAttachments";

const props = defineProps<{
  modelValue: string;
  running: boolean;
  canvasApp?: any;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: string): void;
  (
    e: "submit",
    payload: { text: string; attachments: AgentAttachmentInput[] },
  ): void;
  (e: "stop"): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);
const isDragging = ref(false);
const showMentions = ref(false);
const mentionsQuery = ref("");
const selectedMentionIndex = ref(0);
const attachments = ref<AgentAttachmentInput[]>([]);
const mentionCommandCallback = ref<any>(null);

const modelsList = ref<any[]>([]);

interface MentionOption {
  id: string;
  name: string;
  itemType: "element" | "model";
  url?: string;
  iconUrl?: string;
  tag?: string;
  parentName?: string;
  purpose?: "image" | "video" | string;
}

const loadModels = async () => {
  try {
    const config = await getModelConfig();
    modelsList.value = (config.mappings || []).map((m: any) => ({
      id: m.id,
      name: m.label || m.id,
      purpose: m.purpose,
      iconUrl: m.iconUrl,
      type: "model",
    }));
  } catch (err) {
    console.error("Failed to load models in AgentInput:", err);
    // Fallback static list in case of network failure
    modelsList.value = [
      {
        id: "gpt-image-2",
        name: "智能图片V2",
        purpose: "image",
        type: "model",
      },
      {
        id: "seedance2.0",
        name: "智能图片V2 低质",
        purpose: "video",
        type: "model",
      },
    ];
  }
};

function showAttachmentError(message: string) {
  window.dispatchEvent(
    new CustomEvent("canvas:toast", {
      detail: { severity: "warn", summary: "无法添加素材", detail: message },
    }),
  );
}

async function appendAttachment(file: File) {
  if (attachments.value.length >= MAX_AGENT_ATTACHMENTS) {
    showAttachmentError(`一次最多添加 ${MAX_AGENT_ATTACHMENTS} 张图片`);
    return;
  }
  try {
    attachments.value.push(await createAgentAttachment(file));
  } catch (error: any) {
    showAttachmentError(error?.message || "图片处理失败");
  }
}

const handleAddReferenceImage = async (e: Event) => {
  const customEvent = e as CustomEvent;
  const imgData = customEvent.detail?.image;
  if (imgData) {
    if (attachments.value.length >= MAX_AGENT_ATTACHMENTS) {
      showAttachmentError(`一次最多添加 ${MAX_AGENT_ATTACHMENTS} 张图片`);
      return;
    }
    try {
      attachments.value.push(await createAgentAttachmentFromSource(imgData));
    } catch (error: any) {
      showAttachmentError(error?.message || "画布引用添加失败");
    }
  }
};

onMounted(() => {
  loadModels();
  window.addEventListener("agent:add-reference-image", handleAddReferenceImage);
});

const canvasElements = computed(() => {
  if (!props.canvasApp?.tree?.children) return [];
  const elements: any[] = [];

  const visit = (child: any, parentName = "") => {
    if (!child) return;
    const tag = child.tag || child.__tag;
    if (
      !tag ||
      tag === "SimulateElement" ||
      tag.startsWith("Edit") ||
      child.isTaskOverlay
    ) {
      return;
    }

    let url = "";
    let type = "shape";
    if (tag === "Image") {
      url = child.url || "";
      type = "image";
    } else if (tag === "VideoNode") {
      url = child.thumbnailUrl || "";
      type = "video";
    } else if (tag === "ImageGen" && child.images?.length > 0) {
      url = child.images[0] || "";
      type = "image";
    } else if (tag === "VideoGen") {
      type = "video";
    }

    let name = child.name;
    if (!name) {
      if (tag === "Rect") name = "矩形元素";
      else if (tag === "VideoNode") name = "视频元素";
      else if (tag === "Text") name = "文本元素";
      else if (tag === "Frame") name = "画板容器";
      else if (tag === "Line") name = "线段元素";
      else if (tag === "Star") name = "星形元素";
      else if (tag === "Ellipse") name = "椭圆元素";
      else if (tag === "Group") name = "编组容器";
      else name = tag || "元素";
    }

    const refId =
      child.refId || `node_${String(child.innerId ?? child.id ?? Date.now())}`;
    child.refId = refId;

    elements.push({
      refId,
      name,
      parentName,
      tag,
      url,
      type,
    });

    if (child.children?.length) {
      child.children.forEach((nested: any) => visit(nested, name));
    }
  };

  props.canvasApp.tree.children.forEach((child: any) => visit(child));

  const nameCounts = new Map<string, number>();
  elements.forEach((element) => {
    nameCounts.set(element.name, (nameCounts.get(element.name) || 0) + 1);
  });

  return elements.map((element) => ({
    ...element,
    displayName:
      (nameCounts.get(element.name) || 0) > 1
        ? `${element.name} · ${String(element.refId).slice(-6)}`
        : element.name,
  }));
});

const mentionOptions = computed<MentionOption[]>(() => {
  const elements = canvasElements.value.map((el: any) => ({
    id: `element:${el.refId}`,
    name: el.displayName,
    url: el.url,
    tag: el.tag,
    parentName: el.parentName,
    itemType: "element" as const,
  }));

  const imageModels = modelsList.value
    .filter((m: any) => m.purpose === "image")
    .map((m: any) => ({
      id: `model:${m.id}`,
      name: m.name,
      iconUrl: m.iconUrl,
      purpose: m.purpose,
      itemType: "model" as const,
    }));

  const videoModels = modelsList.value
    .filter((m: any) => m.purpose === "video")
    .map((m: any) => ({
      id: `model:${m.id}`,
      name: m.name,
      iconUrl: m.iconUrl,
      purpose: m.purpose,
      itemType: "model" as const,
    }));

  return [...elements, ...imageModels, ...videoModels];
});

const filteredMentions = computed(() => {
  const all = mentionOptions.value;
  if (!mentionsQuery.value) return all;
  const q = mentionsQuery.value.toLowerCase();
  return all.filter((item) => item.name.toLowerCase().includes(q));
});

const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: "描述你的想法，或输入@使用工具或素材…",
    }),
    Mention.configure({
      HTMLAttributes: {
        class: "mention-chip",
      },
      suggestion: {
        items: ({ query }) => {
          mentionsQuery.value = query;
          const q = query.toLowerCase();
          const all = mentionOptions.value;
          if (!q) return all;
          return all.filter((item) => item.name.toLowerCase().includes(q));
        },
        render: () => ({
          onStart: (props) => {
            showMentions.value = true;
            mentionsQuery.value = props.query;
            selectedMentionIndex.value = 0;
            mentionCommandCallback.value = props.command;
          },
          onUpdate: (props) => {
            mentionsQuery.value = props.query;
            mentionCommandCallback.value = props.command;
          },
          onKeyDown: (props) => {
            if (showMentions.value) {
              if (props.event.key === "ArrowDown") {
                selectedMentionIndex.value =
                  (selectedMentionIndex.value + 1) %
                  filteredMentions.value.length;
                return true;
              }
              if (props.event.key === "ArrowUp") {
                selectedMentionIndex.value =
                  (selectedMentionIndex.value -
                    1 +
                    filteredMentions.value.length) %
                  filteredMentions.value.length;
                return true;
              }
              if (props.event.key === "Enter" || props.event.key === "Tab") {
                const option =
                  filteredMentions.value[selectedMentionIndex.value];
                if (option) {
                  insertMention(option);
                }
                return true;
              }
              if (props.event.key === "Escape") {
                showMentions.value = false;
                return true;
              }
            }
            return false;
          },
          onExit: () => {
            showMentions.value = false;
          },
        }),
      },
    }),
  ],
  editorProps: {
    handleKeyDown: (_, event) => {
      if (showMentions.value) {
        return false;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
        return true;
      }
      return false;
    },
    handlePaste: (_, event) => {
      const items = event.clipboardData?.items;
      if (!items) return false;
      let imagePasted = false;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            void appendAttachment(file);
            imagePasted = true;
          }
        }
      }
      return imagePasted;
    },
  },
  onUpdate: ({ editor }) => {
    emit("update:modelValue", editor.getText());
  },
  onFocus: () => {
    isFocused.value = true;
  },
  onBlur: () => {
    // delay blur slightly so click event on mentions list can fire
    setTimeout(() => {
      isFocused.value = false;
    }, 150);
  },
});

onBeforeUnmount(() => {
  editor.value?.destroy();
  window.removeEventListener(
    "agent:add-reference-image",
    handleAddReferenceImage,
  );
});

watch(
  () => props.modelValue,
  (val) => {
    if (val === "" && editor.value && editor.value.getText() !== "") {
      editor.value.commands.clearContent();
    }
  },
);

function insertMention(item: Pick<MentionOption, "id" | "name">) {
  if (mentionCommandCallback.value) {
    mentionCommandCallback.value({ id: item.id, label: item.name });
    editor.value?.chain().focus().insertContent(" ").run();
    showMentions.value = false;
  }
}

function getStructuredPromptText() {
  const documentJson = editor.value?.getJSON();
  if (!documentJson) return "";

  const serializeNode = (node: any): string => {
    if (node.type === "text") return node.text || "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === "mention") {
      const id = String(node.attrs?.id || "");
      const label = String(node.attrs?.label || id);
      if (id.startsWith("element:")) {
        return `@${label} [refId:${id.slice("element:".length)}]`;
      }
      if (id.startsWith("model:")) {
        return `@${label} [modelId:${id.slice("model:".length)}]`;
      }
      return `@${label}`;
    }

    const content = Array.isArray(node.content)
      ? node.content.map(serializeNode).join("")
      : "";
    return node.type === "paragraph" ? `${content}\n` : content;
  };

  return serializeNode(documentJson).trim();
}

function clearInput() {
  emit("update:modelValue", "");
}

function triggerFileInput() {
  fileInputRef.value?.click();
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|svg|tiff?)$/i.test(file.name);
    if (isImage) {
      void appendAttachment(file);
    }
  }
  // Reset value so re-selecting the same file triggers change event
  target.value = "";
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|svg|tiff?)$/i.test(file.name);
    if (isImage) {
      void appendAttachment(file);
    }
  }
}

function insertSuggestion() {
  const suggestionsList = [
    "上传产品图，生成淘宝、京东和 Amazon 电商套图",
    "自动重排画布上的所有元素",
    "做一张咖啡店开业海报，暖色调",
    "生成一张可爱的橘猫照片",
    "画一个科技感的产品 banner",
  ];
  const rand =
    suggestionsList[Math.floor(Math.random() * suggestionsList.length)];
  if (editor.value) {
    editor.value.chain().focus().setContent(rand).run();
  }
}

function handleSubmit() {
  const text = getStructuredPromptText();
  if ((text.trim() || attachments.value.length > 0) && !props.running) {
    emit("submit", { text, attachments: [...attachments.value] });
    attachments.value = [];
    editor.value?.commands.clearContent();
  }
}
</script>

<template>
  <div
    class="agent-input-wrap"
    :class="{ 'is-dragging': isDragging }"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <!-- Hidden input for file selection -->
    <input
      type="file"
      ref="fileInputRef"
      style="display: none"
      accept="image/png,image/jpeg,image/webp"
      multiple
      @change="handleFileChange"
    />

    <!-- Mentions Suggestion Menu -->
    <Transition name="slide-up">
      <div
        v-if="showMentions && filteredMentions.length > 0"
        class="mentions-popup"
      >
        <div class="mentions-list">
          <template v-for="(item, idx) in filteredMentions" :key="idx">
            <!-- Section Header: 当前项目 -->
            <div
              v-if="idx === 0 && item.itemType === 'element'"
              class="mentions-section-header"
            >
              当前项目
            </div>

            <!-- Section Divider -->
            <div
              v-if="
                idx > 0 &&
                (item.itemType !== filteredMentions[idx - 1].itemType ||
                  (item.itemType === 'model' &&
                    item.purpose !== filteredMentions[idx - 1].purpose))
              "
              class="section-divider"
            ></div>

            <!-- Section Header: 图片模型 -->
            <div
              v-if="
                item.itemType === 'model' &&
                item.purpose === 'image' &&
                (idx === 0 ||
                  filteredMentions[idx - 1].itemType !== 'model' ||
                  filteredMentions[idx - 1].purpose !== 'image')
              "
              class="mentions-section-header"
            >
              图片模型
            </div>

            <!-- Section Header: 视频模型 -->
            <div
              v-if="
                item.itemType === 'model' &&
                item.purpose === 'video' &&
                (idx === 0 ||
                  filteredMentions[idx - 1].itemType !== 'model' ||
                  filteredMentions[idx - 1].purpose !== 'video')
              "
              class="mentions-section-header"
            >
              视频模型
            </div>

            <!-- Mention Item -->
            <div
              class="mention-item"
              :class="{ active: idx === selectedMentionIndex }"
              @click="insertMention(item)"
              @mouseenter="selectedMentionIndex = idx"
            >
              <!-- Thumbnail / Icon -->
              <div class="mention-avatar-container">
                <!-- For element with image/video thumbnail -->
                <img
                  v-if="item.itemType === 'element' && item.url"
                  :src="item.url"
                  class="mention-item-img"
                />
                <!-- For element shape fallback -->
                <div
                  v-else-if="item.itemType === 'element'"
                  class="mention-item-shape-placeholder"
                >
                  <ImageIcon
                    v-if="item.tag === 'Image' || item.tag === 'ImageGen'"
                    :size="14"
                  />
                  <PlayIcon
                    v-else-if="item.tag === 'VideoNode'"
                    :size="12"
                    fill="currentColor"
                  />
                  <TypeIcon v-else-if="item.tag === 'Text'" :size="14" />
                  <CircleIcon v-else-if="item.tag === 'Ellipse'" :size="14" />
                  <Square v-else :size="12" />
                </div>
                <!-- For model with iconUrl -->
                <img
                  v-else-if="item.itemType === 'model' && item.iconUrl"
                  :src="item.iconUrl"
                  class="mention-item-img"
                />
                <!-- For model fallback icon -->
                <div
                  v-else-if="item.itemType === 'model'"
                  class="mention-item-model-icon flex items-center justify-center"
                >
                  <Cpu :size="16" class="model-clover-icon" />
                </div>
              </div>

              <!-- Name -->
              <span class="mention-item-copy">
                <span class="mention-item-name">{{ item.name }}</span>
                <span v-if="item.parentName" class="mention-item-context">
                  位于 {{ item.parentName }}
                </span>
              </span>
            </div>
          </template>
        </div>
      </div>
    </Transition>

    <!-- Attached Files list -->
    <div v-if="attachments.length > 0" class="attachments-list">
      <div
        v-for="(attachment, idx) in attachments"
        :key="attachment.id"
        class="attachment-preview"
      >
        <img :src="attachment.previewUrl" :alt="attachment.name" />
        <Button
          unstyled
          class="remove-attachment"
          @click="attachments.splice(idx, 1)"
        >
          <X :size="10" />
        </Button>
      </div>
    </div>

    <!-- Textarea/Editor container -->
    <div class="textarea-container">
      <EditorContent :editor="editor" class="agent-input" />
      <Button
        v-if="modelValue"
        unstyled
        class="clear-input-btn"
        @click="clearInput"
        title="清空输入"
      >
        <X :size="14" />
      </Button>
    </div>

    <!-- Bottom Toolbar -->
    <div class="agent-input-toolbar">
      <div class="toolbar-left">
        <!-- Plus (upload) button -->
        <Button
          unstyled
          class="toolbar-btn"
          title="上传素材 (支持粘贴/拖拽)"
          @click="triggerFileInput"
        >
          <Plus :size="14" />
        </Button>
      </div>

      <div class="toolbar-right">
        <!-- Char counter or hint helper -->
        <span class="char-counter" v-if="modelValue.length > 0">
          {{ modelValue.length }}/1000
        </span>

        <!-- Send/Stop Button -->
        <Button
          v-if="running"
          unstyled
          class="toolbar-send-btn send-stop"
          title="停止"
          @click="emit('stop')"
        >
          <Square :size="10" fill="currentColor" />
        </Button>
        <Button
          v-else
          unstyled
          class="toolbar-send-btn"
          :disabled="!modelValue.trim() && attachments.length === 0"
          title="发送"
          @click="handleSubmit"
        >
          <ArrowUp :size="12" />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-input-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 8px;
  border: 1px solid var(--border-color, var(--p-surface-200));
  border-radius: 14px;
  background: var(--surface-panel, var(--p-surface-0));
  margin: 12px 14px 14px;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  transition:
    border-color var(--dur-fast, 150ms) var(--ease-default, ease),
    box-shadow var(--dur-fast, 150ms) var(--ease-default, ease);
}

/* Focus: ring only — no lift */
.agent-input-wrap.is-focused {
  border-color: var(--accent-primary, var(--p-primary-color));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--accent-primary, #161618) 8%, transparent),
    var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.06));
}

.agent-input-wrap.is-dragging {
  border-color: var(--accent-primary, var(--p-primary-color));
  background: color-mix(
    in srgb,
    var(--accent-primary, #161618) 3%,
    var(--surface-panel, #fff)
  );
  border-style: dashed;
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--accent-primary, #161618) 6%, transparent);
}

.textarea-container {
  display: flex;
  align-items: flex-end;
  position: relative;
  margin-top: 4px;
  margin-bottom: 8px;
}

.agent-input {
  width: 100%;
}

.agent-input :deep(.ProseMirror) {
  width: 100%;
  max-height: 240px;
  resize: none;
  border: none;
  padding: 4px 28px 6px 0;
  font-size: 14px;
  line-height: 1.55;
  outline: none;
  font-family: inherit;
  color: var(--text-primary, var(--p-text-color));
  background: transparent;
  overflow-y: auto;
  min-height: 56px;
}

.agent-input :deep(.ProseMirror:focus) {
  outline: none;
}

.agent-input :deep(.ProseMirror p) {
  margin: 0;
}

/* Tiptap Placeholder styling */
.agent-input :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: var(--text-muted, var(--p-text-muted-color));
  pointer-events: none;
  height: 0;
}

/* Tiptap Mention chip — monochrome, Noir-aligned */
.agent-input :deep(.mention-chip) {
  background: var(--surface-hover, var(--p-surface-100));
  color: var(--text-primary, var(--p-text-color));
  border: 1px solid var(--border-color, var(--p-surface-200));
  border-radius: 5px;
  padding: 1px 6px;
  font-weight: 600;
  font-size: 12.5px;
}

.clear-input-btn {
  position: absolute;
  right: 0;
  bottom: 6px;
  background: transparent;
  border: none;
  color: var(--p-text-muted-color, #9ca3af);
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  z-index: 5;
}

.clear-input-btn:hover {
  background: var(--p-surface-100, #f3f4f6);
  color: var(--p-text-color, #374151);
}

.agent-input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  border-top: 1px solid var(--border-subtle, var(--p-surface-100));
  padding-top: 8px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-muted, var(--p-text-muted-color));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--dur-fast, 150ms) ease,
    color var(--dur-fast, 150ms) ease;
}

.toolbar-btn:hover,
.toolbar-btn.active {
  background: var(--surface-hover, var(--p-surface-100));
  color: var(--text-primary, var(--p-text-color));
}

.emoji-picker-container {
  position: relative;
}

.quick-emojis-bar {
  position: absolute;
  bottom: 100%;
  left: 0;
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  background: var(--p-surface-0, #fff);
  border: 1px solid var(--p-surface-200, #e5e7eb);
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 10;
  margin-bottom: 6px;
}

.quick-emoji-item {
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.12s ease;
}

.quick-emoji-item:hover {
  background: var(--p-surface-100, #f3f4f6);
}

.toolbar-send-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-inverse, #fff);
  background: var(--accent-primary, var(--p-primary-color));
  transition:
    background-color var(--dur-fast, 150ms) var(--ease-default, ease),
    opacity var(--dur-fast, 150ms) var(--ease-default, ease);
  box-shadow: none;
  overflow: hidden;
}

.toolbar-send-btn:not(:disabled):hover {
  opacity: 0.88;
}

.toolbar-send-btn:not(:disabled):active {
  opacity: 0.78;
}

.toolbar-send-btn:disabled {
  background: var(--surface-active, var(--p-surface-200));
  color: var(--text-muted, var(--p-text-muted-color));
  cursor: not-allowed;
  opacity: 1;
}

.send-stop {
  background: var(--text-primary, var(--p-text-color));
  border: none;
  color: var(--text-inverse, #fff);
  border-radius: 8px;
  box-shadow: none;
  transition: opacity var(--dur-fast, 150ms) ease;
}

.send-stop:hover {
  background: var(--text-primary, var(--p-text-color)) !important;
  opacity: 0.85;
  box-shadow: none !important;
}

.send-stop:active {
  opacity: 0.75;
  box-shadow: none !important;
}

.char-counter {
  font-size: 11px;
  color: var(--text-muted, var(--p-text-muted-color));
  font-variant-numeric: tabular-nums;
  font-family: var(--font-family-mono, ui-monospace, monospace);
}

.kb-hint {
  font-size: 11px;
  color: var(--text-muted, var(--p-text-muted-color));
  letter-spacing: 0.01em;
  user-select: none;
  opacity: 0.85;
}

/* Mentions Suggestion Styling */
.mentions-popup {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 8px;
  width: 280px;
  background: var(--surface-panel, var(--p-surface-0));
  border: 1px solid var(--border-color, var(--p-surface-200));
  border-radius: 12px;
  box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.1));
  z-index: 100;
  overflow: hidden;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.mentions-list {
  overflow-y: auto;
  flex: 1;
  padding: 8px 6px;
}

.mentions-section-header {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--p-text-muted-color, #94a3b8);
  padding: 6px 12px 4px 12px;
  user-select: none;
  text-align: left;
}

.section-divider {
  height: 1px;
  background: var(--p-surface-100, #f1f5f9);
  margin: 6px 12px;
  width: calc(100% - 24px);
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  margin: 2px 6px;
  cursor: pointer;
  border-radius: 10px;
  transition: all 0.15s ease;
  text-align: left;
}

.mention-item.active {
  background: var(--p-surface-100, #f1f5f9);
}

.mention-avatar-container {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.mention-item-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mention-item-shape-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: #a3a3a3;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mention-item-model-icon {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: #000000;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.model-clover-icon {
  width: 14px;
  height: 14px;
}

.mention-item-name {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--p-text-color, #0f172a);
}

.mention-item-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.mention-item-context {
  color: var(--p-text-muted-color);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Attachments preview list */
.attachments-list {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding: 10px 8px 8px 8px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.attachments-list:hover {
  scrollbar-color: var(--p-surface-300, rgba(0, 0, 0, 0.15)) transparent;
}

.attachments-list::-webkit-scrollbar {
  height: 4px;
  display: block;
}

.attachments-list::-webkit-scrollbar-track {
  background: transparent;
}

.attachments-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 99px;
}

.attachments-list:hover::-webkit-scrollbar-thumb {
  background: var(--p-surface-300, rgba(0, 0, 0, 0.25));
}

.attachments-list:hover::-webkit-scrollbar-thumb:hover {
  background: var(--p-surface-400, rgba(0, 0, 0, 0.4));
}

.attachment-preview {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.attachment-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--p-surface-200, #e2e8f0);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.remove-attachment {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-primary, var(--p-primary-color));
  color: var(--text-inverse, #fff);
  border: 1px solid color-mix(in srgb, #fff 20%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.08));
  transition: opacity var(--dur-fast, 150ms) ease;
  z-index: 10;
}

.remove-attachment:hover {
  opacity: 0.85;
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* ── Dark mode ─────────────────────────────────────────────────── */
:global(.p-dark .agent-input-wrap) {
  background: var(--p-surface-0, #18181b);
  border-color: var(--p-surface-200, #3f3f46);
  box-shadow: var(--shadow-sm);
}

:global(.p-dark .agent-input-wrap.is-focused) {
  border-color: var(--p-primary-color, #e4e4e7);
  box-shadow:
    0 0 0 3px rgba(228, 228, 231, 0.08),
    var(--shadow-md);
}

:global(.p-dark .agent-input-wrap.is-dragging) {
  border-color: var(--p-primary-color, #e4e4e7);
  background: color-mix(in srgb, var(--p-primary-color, #e4e4e7) 5%, #18181b);
}

:global(.p-dark .toolbar-send-btn:not(:disabled)) {
  background: var(--p-primary-color, #f4f4f6);
  color: var(--p-primary-contrast-color, #18181b);
}

:global(.p-dark .toolbar-send-btn:disabled) {
  background: var(--p-surface-100, #27272a);
  color: var(--p-surface-400, #71717a);
}

:global(.p-dark .send-stop) {
  background: var(--p-primary-color, #f4f4f6);
  color: var(--p-primary-contrast-color, #18181b);
}

:global(.p-dark .agent-input-toolbar) {
  border-top-color: var(--p-surface-200, #3f3f46);
}

:global(.p-dark .mentions-popup) {
  background: var(--p-surface-0, #18181b);
  border-color: var(--p-surface-200, #3f3f46);
  box-shadow: var(--shadow-lg);
}

:global(.p-dark .mention-item.active) {
  background: var(--p-surface-100, #27272a);
}

:global(.p-dark .mention-item-name) {
  color: var(--p-text-color, #e4e4e7);
}

:global(.p-dark .agent-input .mention-chip) {
  background: var(--p-surface-100, #27272a);
  color: var(--p-text-color, #e4e4e7);
  border-color: var(--p-surface-200, #3f3f46);
}
</style>
