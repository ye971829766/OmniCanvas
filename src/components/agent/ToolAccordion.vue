<script setup lang="ts">
import { ref } from "vue";
import { Loader2, Check, ChevronDown } from "lucide-vue-next";

const props = defineProps<{
  tool: {
    id: string;
    name: string;
    done: boolean;
  };
  messageText: string;
}>();

const isExpanded = ref(true);

function toggleExpand() {
  isExpanded.value = !isExpanded.value;
}

function getInspirationUrls(text: string): string[] {
  const regex = /\[inspiration_grid:([^\]]+)\]/;
  const match = regex.exec(text);
  if (match && match[1]) {
    return match[1].split(",").map((u) => u.trim());
  }
  return [];
}
</script>

<template>
  <div class="tool-accordion">
    <div class="tool-accordion-header" @click="toggleExpand">
      <div class="header-left">
        <Loader2
          v-if="!tool.done"
          class="animate-spin text-primary"
          :size="13"
        />
        <Check v-else class="text-emerald-500" :size="13" />
        <span>收集图片灵感</span>
      </div>
      <ChevronDown
        :class="['chevron-icon', isExpanded ? 'rotate-180' : '']"
        :size="14"
      />
    </div>

    <div v-if="isExpanded" class="tool-accordion-body">
      <div class="tool-task-title">搜索设计参考素材</div>

      <!-- Image list inside accordion if done -->
      <div
        v-if="tool.done && getInspirationUrls(messageText).length"
        class="tool-image-row"
      >
        <div
          v-for="(url, idx) in getInspirationUrls(messageText)"
          :key="idx"
          class="tool-image-thumb"
        >
          <img :src="url" />
        </div>
      </div>

      <!-- Loading state if not done -->
      <div v-else class="tool-loading-task">
        <Loader2 class="animate-spin text-primary mr-2" :size="12" />
        <span>检索并筛选高清设计情绪板库...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-accordion {
  border: 1px solid var(--p-surface-200, #e5e7eb);
  border-radius: 10px;
  background: var(--p-surface-50, #f9fafb);
  margin-top: 6px;
  margin-bottom: 6px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.tool-accordion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}

.tool-accordion-header:hover {
  background: var(--p-surface-100, #f3f4f6);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--p-text-color, #374151);
}

.chevron-icon {
  color: var(--p-text-muted-color, #9ca3af);
  transition: transform 0.2s ease;
}

.tool-accordion-body {
  padding: 10px 12px;
  border-top: 1px solid var(--p-surface-100, #f3f4f6);
  background: #fff;
}

.tool-task-title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--p-text-color, #1f2937);
  margin-bottom: 8px;
}

.tool-image-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.tool-image-row:hover {
  scrollbar-color: var(--p-surface-300, rgba(0, 0, 0, 0.15)) transparent;
}

.tool-image-row::-webkit-scrollbar {
  height: 4px;
  display: block;
}

.tool-image-row::-webkit-scrollbar-track {
  background: transparent;
}

.tool-image-row::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 99px;
}

.tool-image-row:hover::-webkit-scrollbar-thumb {
  background: var(--p-surface-300, rgba(0, 0, 0, 0.25));
}

.tool-image-row:hover::-webkit-scrollbar-thumb:hover {
  background: var(--p-surface-400, rgba(0, 0, 0, 0.4));
}

.tool-image-thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: #eee;
  flex-shrink: 0;
  border: 1px solid var(--p-surface-200, #e5e7eb);
}

.tool-image-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tool-loading-task {
  display: flex;
  align-items: center;
  font-size: 11px;
  color: var(--p-text-muted-color, #6b7280);
}
</style>
