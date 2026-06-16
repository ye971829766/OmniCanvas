<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import {
  Plus,
  BookOpen,
  Smile,
  ChevronDown,
  Lightbulb,
  Square,
  ArrowUp,
  X,
  Sparkles,
} from "lucide-vue-next";

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
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: string): void;
  (e: "submit", payload: { text: string; attachments: string[] }): void;
  (e: "stop"): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);
const isDragging = ref(false);
const showEmojiPicker = ref(false);
const showMentions = ref(false);
const mentionsQuery = ref("");
const selectedMentionIndex = ref(0);
const attachments = ref<string[]>([]);
const mentionCommandCallback = ref<any>(null);

const quickEmojis = ["😊", "👍", "🎉", "🔥", "💡", "🎨", "❤️"];

const mentionOptions = [
  {
    name: "set_frame",
    label: "设置画板 (set_frame)",
    desc: "在画布中创建或修改画框",
  },
  {
    name: "generate_image",
    label: "生成图片 (generate_image)",
    desc: "生成并放置AI设计图像",
  },
  {
    name: "generate_video",
    label: "生成视频 (generate_video)",
    desc: "生成并播放精美视频",
  },
  {
    name: "add_text",
    label: "添加文字 (add_text)",
    desc: "插入标题或段落文本",
  },
  {
    name: "add_rect",
    label: "添加图形 (add_rect)",
    desc: "在画布中绘制矩形等图形",
  },
  {
    name: "auto_layout",
    label: "自动布局 (auto_layout)",
    desc: "智能重排画布元素",
  },
  {
    name: "set_brand",
    label: "设置品牌 (set_brand)",
    desc: "调整品牌颜色和风格",
  },
  {
    name: "apply_palette",
    label: "应用色板 (apply_palette)",
    desc: "将配色快速应用 to 画布",
  },
];

const filteredMentions = computed(() => {
  if (!mentionsQuery.value) return mentionOptions;
  const q = mentionsQuery.value.toLowerCase();
  return mentionOptions.filter(
    (item) =>
      item.name.includes(q) || item.label.includes(q) || item.desc.includes(q),
  );
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
          if (!query) return mentionOptions;
          const q = query.toLowerCase();
          return mentionOptions.filter(
            (item) =>
              item.name.includes(q) ||
              item.label.includes(q) ||
              item.desc.includes(q),
          );
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

function insertEmoji(emoji: string) {
  if (editor.value) {
    editor.value.chain().focus().insertContent(emoji).run();
  }
  showEmojiPicker.value = false;
}

function triggerFileInput() {
  fileInputRef.value?.click();
}

function handleFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.indexOf("image") !== -1) {
      compressImage(file).then((compressed) => {
        attachments.value.push(compressed);
      });
    }
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (!files) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.indexOf("image") !== -1) {
      compressImage(file).then((compressed) => {
        attachments.value.push(compressed);
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
    :class="{ 'is-focused': isFocused, 'is-dragging': isDragging }"
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
        <div class="mentions-header">
          <Sparkles :size="11" class="text-primary" />
          <span>提及工具 / 命令</span>
        </div>
        <div class="mentions-list">
          <div
            v-for="(item, idx) in filteredMentions"
            :key="item.name"
            class="mention-item"
            :class="{ active: idx === selectedMentionIndex }"
            @click="insertMention(item.name)"
            @mouseenter="selectedMentionIndex = idx"
          >
            <span class="mention-name">@{{ item.name }}</span>
            <span class="mention-desc">{{ item.desc }}</span>
          </div>
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

        <!-- Emoji picker -->
        <div class="emoji-picker-container">
          <button
            class="toolbar-btn"
            :class="{ active: showEmojiPicker }"
            title="表情"
            @click="showEmojiPicker = !showEmojiPicker"
          >
            <Smile :size="14" />
          </button>
          <div v-if="showEmojiPicker" class="quick-emojis-bar">
            <span
              v-for="emoji in quickEmojis"
              :key="emoji"
              class="quick-emoji-item"
              @click="insertEmoji(emoji)"
            >
              {{ emoji }}
            </span>
          </div>
        </div>

        <!-- Agent selector indicator -->
        <div class="agent-dropdown-selector">
          <span style="font-size: 11px">Agent</span>
          <ChevronDown :size="10" class="ml-1 opacity-70" />
        </div>
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
          <Square :size="10" />
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
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.agent-input-wrap.is-dragging {
  border-color: var(--p-primary-color);
  background: rgba(109, 40, 217, 0.02);
  border-style: dashed;
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
  font-size: 13.5px;
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

.agent-dropdown-selector {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--p-surface-200, #e2e8f0);
  color: var(--p-text-color, #334155);
  cursor: pointer;
  font-weight: 500;
  font-size: 11px;
  transition: all 0.2s ease;
  user-select: none;
}

.agent-dropdown-selector:hover {
  background: var(--p-surface-100, #f1f5f9);
}

.toolbar-send-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--p-primary-color, #6d28d9);
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(109, 40, 217, 0.2);
}

.toolbar-send-btn:hover {
  transform: scale(1.06);
  box-shadow: 0 4px 12px rgba(109, 40, 217, 0.3);
}

.toolbar-send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.send-stop {
  background: #ef4444;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.2);
}

.char-counter {
  font-size: 10.5px;
  color: var(--p-text-muted-color, #9ca3af);
  font-family: monospace;
}

.kb-hint {
  font-size: 11px;
  color: var(--p-text-muted-color, #9ca3af);
  letter-spacing: 0.2px;
  user-select: none;
}

/* Mentions Suggestion Styling */
.mentions-popup {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--p-surface-0, #fff);
  border: 1px solid var(--p-surface-200, #e5e7eb);
  border-radius: 10px;
  box-shadow:
    0 -4px 18px rgba(0, 0, 0, 0.08),
    0 4px 18px rgba(0, 0, 0, 0.08);
  z-index: 100;
  overflow: hidden;
  max-height: 200px;
  display: flex;
  flex-direction: column;
}

.mentions-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--p-text-muted-color, #6b7280);
  background: var(--p-surface-50, #f9fafb);
  border-bottom: 1px solid var(--p-surface-100, #f3f4f6);
}

.mentions-list {
  overflow-y: auto;
  flex: 1;
}

.mention-item {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.1s ease;
  text-align: left;
}

.mention-item.active {
  background: var(--p-primary-50, #f5f3ff);
}

.mention-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--p-primary-color);
}

.mention-desc {
  font-size: 10.5px;
  color: var(--p-text-muted-color, #6b7280);
  margin-top: 2px;
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
  background: #0f172a;
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
</style>
