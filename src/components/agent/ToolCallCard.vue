<template>
  <div class="tool-badge-wrap" :class="{ 'is-running': !tool.done }">
    <!-- Sleek Minimal Professional Badge -->
    <div class="tool-badge-pill">
      <!-- Running spinner -->
      <span v-if="!tool.done" class="badge-spinner">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" class="spin">
          <path d="M8 2 A6 6 0 0 1 14 8" stroke-linecap="round"/>
        </svg>
      </span>
      <!-- Completed Tool Micro-Icons -->
      <span v-else class="badge-icon">
        <!-- 收集图片灵感 (Search Icon) -->
        <svg v-if="tool.name === 'collect_inspiration'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <!-- 生图 (Sparkles AI Icon) -->
        <svg v-else-if="tool.name === 'generate_image'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <!-- 视频 (Video Icon) -->
        <svg v-else-if="tool.name === 'generate_video'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
        <!-- 排版设计 / Canvas Operations (Layout Template Icon) -->
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
          <rect x="3" y="3" width="18" height="18" rx="2.5"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      </span>

      <span class="badge-label">{{ displayTitle }}</span>
    </div>
  </div>
</template>


<script setup lang="ts">
import { computed } from 'vue';
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
  color: #64748b;
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
  color: #94a3b8;
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
:global(.p-dark) .tool-badge-pill {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(51, 65, 85, 0.8);
  color: #cbd5e1;
}

:global(.p-dark) .is-running .tool-badge-pill {
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

:global(.p-dark) .badge-label {
  color: #f1f5f9;
}

:global(.p-dark) .badge-icon {
  color: #94a3b8;
}
</style>




