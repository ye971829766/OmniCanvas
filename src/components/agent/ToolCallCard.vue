<template>
  <div class="tool-badge-wrap" :class="{ 'is-running': !tool.done }">
    <!-- Sleek Minimal Professional Badge -->
    <div class="tool-badge-pill">
      <!-- Running spinner -->
      <span v-if="!tool.done" class="badge-spinner">
        <Loader2 :size="13" class="spin" />
      </span>
      <!-- Completed Tool Micro-Icons -->
      <span v-else class="badge-icon">
        <!-- 收集图片灵感 (Search Icon) -->
        <Search v-if="tool.name === 'collect_inspiration'" :size="13" />
        <!-- 生图 (Sparkles AI Icon) -->
        <Sparkles v-else-if="tool.name === 'generate_image'" :size="13" />
        <!-- 视频 (Video Icon) -->
        <Video v-else-if="tool.name === 'generate_video'" :size="13" />
        <!-- 排版设计 / Canvas Operations (Layout Template Icon) -->
        <LayoutGrid v-else :size="13" />
      </span>

      <span class="badge-label">{{ displayTitle }}</span>
    </div>
  </div>
</template>


<script setup lang="ts">
import { computed } from 'vue';
import { Loader2, Search, Sparkles, Video, LayoutGrid } from 'lucide-vue-next';
import { getToolLabel } from './tool-labels';
import type { ToolCallItem } from '@/composables/useAgent';

const props = defineProps<{ tool: ToolCallItem }>();

const displayTitle = computed(() => {
  if (props.tool.name === 'generate_image') return 'GPT Image 2';
  if (props.tool.name === 'collect_inspiration') return '收集图片灵感';
  if (props.tool.name === 'generate_video') return 'VideoGen';
  if (props.tool.name === 'add_text' || props.tool.name === 'set_frame' || props.tool.name === 'add_rect' || props.tool.name === 'add_frame') return '排版设计';
  return getToolLabel(props.tool.name);
});
</script>


<style scoped>
.tool-badge-wrap {
  display: inline-flex;
  margin: 4px 0;
  max-width: 100%;
}

/* ── Minimal Professional Modern Badge ──────────────────────────── */
.tool-badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--p-surface-50, #f8fafc);
  border: 1px solid var(--p-surface-200, #e2e8f0);
  padding: 4px 10px 4px 8px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 550;
  color: var(--p-text-color, #334155);
  user-select: none;
  line-height: 1.4;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

.badge-spinner,
.badge-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
}

.is-running .badge-spinner {
  color: #10b981;
}

.spin {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.badge-label {
  font-weight: 550;
  letter-spacing: 0.15px;
  color: var(--p-text-color, #1e293b);
}

.badge-summary {
  font-size: 11px;
  color: var(--text-muted);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Shimmer sweep effect while running ─────────────────────────── */
.is-running .tool-badge-pill {
  position: relative;
  overflow: hidden;
  border-color: rgba(16, 185, 129, 0.35);
  background: linear-gradient(
    90deg,
    var(--p-surface-50, #f8fafc) 0%,
    var(--p-surface-50, #f8fafc) 30%,
    rgba(16, 185, 129, 0.14) 50%,
    var(--p-surface-50, #f8fafc) 70%,
    var(--p-surface-50, #f8fafc) 100%
  );
  background-size: 220% 100%;
  animation: badge-shimmer-sweep 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes badge-shimmer-sweep {
  0%   { background-position:  180% 0; }
  100% { background-position: -180% 0; }
}

/* Dark mode */
:global(.p-dark .tool-badge-pill) {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(51, 65, 85, 0.8);
  color: #cbd5e1;
}

:global(.p-dark .is-running .tool-badge-pill) {
  background: linear-gradient(
    90deg,
    rgba(30, 41, 59, 0.7) 0%,
    rgba(30, 41, 59, 0.7) 30%,
    rgba(16, 185, 129, 0.22) 50%,
    rgba(30, 41, 59, 0.7) 70%,
    rgba(30, 41, 59, 0.7) 100%
  );
  background-size: 220% 100%;
  border-color: rgba(16, 185, 129, 0.4);
}

:global(.p-dark .badge-label) {
  color: #f1f5f9;
}

:global(.p-dark .badge-icon) {
  color: #94a3b8;
}
</style>




