<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount, onMounted } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import {
  Plus,
  BookOpen,
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

function compressImage(
  file: File,
  maxWidth = 1024,
  maxHeight = 1024,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } else {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = () => {
        resolve(event.target?.result as string);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const props = defineProps<{
  modelValue: string;
  running: boolean;
  canvasApp?: any;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: string): void;
  (e: "submit", payload: { text: string; attachments: string[] }): void;
  (e: "stop"): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);
const isDragging = ref(false);
const showMentions = ref(false);
const mentionsQuery = ref("");
const selectedMentionIndex = ref(0);
const attachments = ref<string[]>([]);
const mentionCommandCallback = ref<any>(null);

const modelsList = ref<any[]>([]);

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

onMounted(() => {
  loadModels();
});

const canvasElements = computed(() => {
  if (!props.canvasApp?.tree?.children) return [];
  return props.canvasApp.tree.children.map((child: any) => {
    let url = "";
    let type = "shape";

    const tag = child.tag || child.__tag;
    if (tag === "Image") {
      url = child.url || "";
      type = "image";
    } else if (tag === "VideoNode") {
      url = child.thumbnailUrl || "";
      type = "video";
    } else if (tag === "ImageGen" && child.images?.length > 0) {
      url = child.images[0] || "";
      type = "image";
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

    return {
      id: child.innerId ?? child.id,
      name,
      tag,
      url,
      type,
    };
  });
});

const mentionOptions = computed(() => {
  const elements = canvasElements.value.map((el: any) => ({
    id: el.name,
    name: el.name,
    url: el.url,
    tag: el.tag,
    itemType: "element",
  }));

  const models = modelsList.value.map((m: any) => ({
    id: m.name,
    name: m.name,
    iconUrl: m.iconUrl,
    purpose: m.purpose,
    itemType: "model",
  }));

  return [...elements, ...models];
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
      placeholder: "描述你想要的设计，或输入 @ 提及…",
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
                  insertMention(option.name);
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
            compressImage(file).then((compressed) => {
              attachments.value.push(compressed);
            });
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
});

watch(
  () => props.modelValue,
  (val) => {
    if (val === "" && editor.value && editor.value.getText() !== "") {
      editor.value.commands.clearContent();
    }
  },
);

function insertMention(name: string) {
  if (mentionCommandCallback.value) {
    mentionCommandCallback.value({ id: name, label: name });
    editor.value?.chain().focus().insertContent(" ").run();
    showMentions.value = false;
  }
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
      compressImage(file)
        .then((compressed) => {
          attachments.value.push(compressed);
        })
        .catch((err) => {
          console.error("Failed to process image attachment:", err);
        });
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
      compressImage(file)
        .then((compressed) => {
          attachments.value.push(compressed);
        })
        .catch((err) => {
          console.error("Failed to process dropped image attachment:", err);
        });
    }
  }
}

function insertSuggestion() {
  const suggestionsList = [
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

function insertBrand() {
  if (editor.value) {
    editor.value
      .chain()
      .focus()
      .insertContent([
        { type: "mention", attrs: { id: "set_brand", label: "set_brand" } },
        { type: "text", text: " " },
      ])
      .run();
  }
}

function handleSubmit() {
  const text = editor.value?.getText() || "";
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
      accept="image/*"
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
                item.itemType === 'model' &&
                idx > 0 &&
                filteredMentions[idx - 1].itemType !== 'model'
              "
              class="section-divider"
            ></div>

            <!-- Section Header: 选择模型 -->
            <div
              v-if="
                item.itemType === 'model' &&
                (idx === 0 || filteredMentions[idx - 1].itemType !== 'model')
              "
              class="mentions-section-header"
            >
              选择模型
            </div>

            <!-- Mention Item -->
            <div
              class="mention-item"
              :class="{ active: idx === selectedMentionIndex }"
              @click="insertMention(item.id)"
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
              <span class="mention-item-name">{{ item.name }}</span>
            </div>
          </template>
        </div>
      </div>
    </Transition>

    <!-- Attached Files list -->
    <div v-if="attachments.length > 0" class="attachments-list">
      <div
        v-for="(src, idx) in attachments"
        :key="idx"
        class="attachment-preview"
      >
        <img :src="src" />
        <button class="remove-attachment" @click="attachments.splice(idx, 1)">
          <X :size="10" />
        </button>
      </div>
    </div>

    <!-- Textarea/Editor container -->
    <div class="textarea-container">
      <EditorContent :editor="editor" class="agent-input" />
      <button
        v-if="modelValue"
        class="clear-input-btn"
        @click="clearInput"
        title="清空输入"
      >
        <X :size="14" />
      </button>
    </div>

    <!-- Bottom Toolbar -->
    <div class="agent-input-toolbar">
      <div class="toolbar-left">
        <!-- Plus (upload) button -->
        <button
          class="toolbar-btn"
          title="上传素材 (支持粘贴/拖拽)"
          @click="triggerFileInput"
        >
          <Plus :size="14" />
        </button>

        <!-- Library command trigger -->
        <button
          class="toolbar-btn"
          title="快速提及品牌指令"
          @click="insertBrand"
        >
          <BookOpen :size="14" />
        </button>
      </div>

      <div class="toolbar-right">
        <!-- Suggestions button -->
        <button class="toolbar-btn" title="灵感建议" @click="insertSuggestion">
          <Lightbulb :size="14" />
        </button>

        <!-- Char counter or hint helper -->
        <span class="char-counter" v-if="modelValue.length > 0">
          {{ modelValue.length }}/1000
        </span>
        <span class="kb-hint" v-else> ↵ 发送 / ⇧↵ 换行 </span>

        <!-- Send/Stop Button -->
        <button
          v-if="running"
          class="toolbar-send-btn send-stop"
          title="停止"
          @click="emit('stop')"
        >
          <Square :size="10" fill="currentColor" />
        </button>
        <button
          v-else
          class="toolbar-send-btn"
          :disabled="!modelValue.trim() && attachments.length === 0"
          title="发送"
          @click="handleSubmit"
        >
          <ArrowUp :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-input-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 7px 8px 6px 8px;
  border: 1px solid var(--p-surface-200, #e5e7eb);
  border-radius: 16px;
  background: var(--p-surface-0, #fff);
  margin: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition:
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Focus: lift + glow ring */
.agent-input-wrap.is-focused {
  border-color: var(--accent-primary);
  box-shadow:
    0 0 0 3px rgba(24, 24, 27, 0.07),
    0 4px 16px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}

.agent-input-wrap.is-dragging {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.03);
  border-style: dashed;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.08);
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
  padding: 4px 24px 6px 0;
  font-size: var(--text-base);
  line-height: 1.6;
  outline: none;
  font-family: inherit;
  color: var(--p-text-color, #1e293b);
  background: transparent;
  overflow-y: auto;
  min-height: 60px;
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
  color: var(--p-text-muted-color, #9ca3af);
  pointer-events: none;
  height: 0;
}

/* Tiptap Mention chip styling */
.agent-input :deep(.mention-chip) {
  background: var(--p-primary-50, #f5f3ff);
  color: var(--p-primary-color, #6d28d9);
  border: 1px solid var(--p-primary-200, rgba(109, 40, 217, 0.2));
  border-radius: 4px;
  padding: 1px 4px;
  font-weight: 600;
  font-size: var(--text-sm);
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
  margin-top: 10px;
  border-top: 1px solid var(--p-surface-100, #f1f5f9);
  padding-top: 10px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--p-text-muted-color, #64748b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.toolbar-btn:hover,
.toolbar-btn.active {
  background: var(--p-surface-50, #f8fafc);
  color: var(--p-text-color, #0f172a);
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
  color: #fff;
  background: var(--accent-primary);
  transition:
    background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.2s ease;
  box-shadow: 0 2px 8px rgba(24, 24, 27, 0.25);
  overflow: hidden;
}

.toolbar-send-btn:not(:disabled):hover {
  transform: scale(1.08);
  box-shadow: 0 4px 14px rgba(24, 24, 27, 0.35);
}

.toolbar-send-btn:not(:disabled):active {
  transform: scale(0.88);
  box-shadow: 0 1px 4px rgba(24, 24, 27, 0.2);
}

/* Arrow "fly up" on click via CSS animation triggered by :active */
.toolbar-send-btn:not(:disabled):active :deep(svg) {
  animation: arrow-fly 0.25s cubic-bezier(0.4, 0, 1, 1) both;
}

@keyframes arrow-fly {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  60% {
    transform: translateY(-6px);
    opacity: 0;
  }
  61% {
    transform: translateY(6px);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

.toolbar-send-btn:disabled {
  background: var(--surface-active);
  color: var(--text-muted);
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.send-stop {
  background: var(--accent-error, #ff3b30);
  border: none;
  color: #ffffff;
  border-radius: 8px;
  box-shadow: none;
  animation: none !important;
  transform: none !important;
  transition: opacity 0.15s ease;
}

.send-stop:hover {
  background: var(--accent-error, #ff3b30) !important;
  opacity: 0.88;
  transform: none !important;
  box-shadow: none !important;
}

.send-stop:active {
  transform: none !important;
  box-shadow: none !important;
}

.char-counter {
  font-size: 10.5px;
  color: var(--p-text-muted-color, #9ca3af);
  font-family: monospace;
}

.kb-hint {
  font-size: var(--text-xs);
  color: var(--p-text-muted-color, #9ca3af);
  letter-spacing: 0.2px;
  user-select: none;
}

/* Mentions Suggestion Styling */
.mentions-popup {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 8px;
  width: 280px;
  background: var(--p-surface-0, #fff);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.05);
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

.attachment-preview:hover {
  transform: translateY(-2px);
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
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  z-index: 10;
}

.remove-attachment:hover {
  background: #ef4444;
  transform: scale(1.1);
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
  background: #18181b;
  border-color: #27272a;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

:global(.p-dark .agent-input-wrap.is-focused) {
  border-color: #d4d4d8;
  box-shadow:
    0 0 0 3px rgba(212, 212, 216, 0.08),
    0 4px 16px rgba(0, 0, 0, 0.3);
}

:global(.p-dark .agent-input-wrap.is-dragging) {
  border-color: #34d399;
  background: rgba(52, 211, 153, 0.05);
}

:global(.p-dark .toolbar-send-btn:not(:disabled)) {
  background: #fafafa;
  color: #09090b;
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.12);
}

:global(.p-dark .toolbar-send-btn:not(:disabled):hover) {
  box-shadow: 0 4px 14px rgba(255, 255, 255, 0.2);
}

:global(.p-dark .toolbar-send-btn:disabled) {
  background: #27272a;
  color: #52525b;
}

:global(.p-dark .agent-input-toolbar) {
  border-top-color: #27272a;
}

:global(.p-dark .mentions-popup) {
  background: #1f1f23;
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

:global(.p-dark .mention-item.active) {
  background: #27272a;
}

:global(.p-dark .mention-item-name) {
  color: #e4e4e7;
}
</style>
