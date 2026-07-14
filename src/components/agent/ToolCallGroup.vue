<template>
  <div class="inline-tool-group" :class="{ 'is-running': isRunning, 'is-expanded': isExpanded }">
    <!-- ── Seamless Inline Action Link (e.g. "使用了 6 个工具 ›") ── -->
    <button class="inline-action-btn" @click="isExpanded = !isExpanded">
      <span v-if="isRunning" class="inline-spin-sparkle">
        <Loader2 :size="12" class="spin" />
      </span>
      <span class="inline-action-text">{{ actionLabelText }}</span>
      <span class="inline-arrow" :class="{ 'rotated': isExpanded }">›</span>
    </button>

    <!-- ── Indented Micro Timeline ── -->
    <Transition name="timeline-expand">
      <div v-if="isExpanded" class="inline-timeline-body">
        <div class="timeline-line-track">
          <div
            v-for="tool in tools"
            :key="tool.id"
            class="timeline-row"
          >
            <div class="row-header">
              <span
                class="row-bullet"
                :class="{ done: tool.done && !isToolFailed(tool), failed: isToolFailed(tool) }"
              ></span>
              <span class="row-label">{{ getToolLabel(tool.name) }}</span>
              <span v-if="getToolSummary(tool)" class="row-summary">{{ getToolSummary(tool) }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>


<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import { getToolLabel } from './tool-labels';
import type { ToolCallItem } from '@/composables/useAgent';

const props = defineProps<{
  tools: ToolCallItem[];
  title?: string;
}>();

const isRunning = computed(() => props.tools.some((t) => !t.done));
const failedCount = computed(
  () => props.tools.filter((tool) => isToolFailed(tool)).length,
);
const isExpanded = ref(false); // Default collapsed like Bolt/Claude

// Auto-expand brief moments while actively executing
watch(isRunning, (newRunning, oldRunning) => {
  if (oldRunning && !newRunning) {
    setTimeout(() => {
      isExpanded.value = false;
    }, 600);
  }
});

const actionLabelText = computed(() => {
  if (props.title) return props.title;

  if (isRunning.value) {
    const activeTool = props.tools.find((t) => !t.done);
    if (activeTool) return `正在执行 ${getToolLabel(activeTool.name)}…`;
    return `执行中 (${props.tools.length} 个操作)…`;
  }

  if (failedCount.value) {
    return `执行了 ${props.tools.length} 项操作 · ${failedCount.value} 项失败`;
  }

  const labelCounts: Record<string, number> = {};
  for (const t of props.tools) {
    const label = getToolLabel(t.name);
    labelCounts[label] = (labelCounts[label] || 0) + 1;
  }

  const keys = Object.keys(labelCounts);
  if (keys.length === 1) {
    return `${keys[0]} ${labelCounts[keys[0]]} 次`;
  }
  if (keys.length <= 3) {
    return `${keys.join('，')} · 共 ${props.tools.length} 项工具`;
  }

  return `使用了 ${props.tools.length} 个工具`;
});

function isToolFailed(tool: ToolCallItem) {
  return Boolean(
    tool.output?.error ||
      tool.output?.status === "error" ||
      tool.output?.status === "failed",
  );
}

function getToolSummary(tool: ToolCallItem) {
  const rawOutput = tool.output as any;
  const output =
    rawOutput &&
    typeof rawOutput === 'object' &&
    (rawOutput.type === 'json' || rawOutput.type === 'text') &&
    'value' in rawOutput
      ? rawOutput.value
      : rawOutput;
  if (output?.error) return truncate(String(output.error), 54);

  const input = tool.input;
  if (!input) return '';
  if (tool.name === 'add_text' && input.text) return `"${truncate(input.text, 18)}"`;
  if (tool.name === 'update_node' && input.refId) return input.refId;
  if (tool.name === 'set_frame' && input.width) return `${input.width}×${input.height}`;
  return '';
}

function truncate(s: string, n: number) {
  const str = String(s ?? '').trim();
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
</script>



<style scoped>
.inline-tool-group {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  margin: 4px 0;
  width: 100%;
}

/* ── Inline Button Pill (Bolt / Claude Style) ────────────────────── */
.inline-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  /* Stay light on white agent panel — do not use canvas-level surface-100 */
  background: color-mix(in srgb, var(--p-surface-900, #1a1b1e) 3.5%, var(--p-surface-0, #fff));
  border: 1px solid color-mix(in srgb, var(--p-surface-900, #1a1b1e) 8%, var(--p-surface-0, #fff));
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 500;
  color: var(--p-surface-600, #5c616b);
  cursor: pointer;
  user-select: none;
  transition: all 0.18s ease;
  line-height: 1.5;
}

.is-running .inline-action-btn {
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--p-surface-900, #1a1b1e) 12%, var(--p-surface-0, #fff));
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--p-surface-900, #1a1b1e) 3.5%, #fff) 0%,
    color-mix(in srgb, var(--p-surface-900, #1a1b1e) 3.5%, #fff) 30%,
    color-mix(in srgb, var(--p-surface-900, #1a1b1e) 7%, #fff) 50%,
    color-mix(in srgb, var(--p-surface-900, #1a1b1e) 3.5%, #fff) 70%,
    color-mix(in srgb, var(--p-surface-900, #1a1b1e) 3.5%, #fff) 100%
  );
  background-size: 220% 100%;
  animation: group-shimmer-sweep 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes group-shimmer-sweep {
  0%   { background-position:  180% 0; }
  100% { background-position: -180% 0; }
}


.inline-action-btn:hover {
  color: var(--agent-text-primary, var(--p-text-color, #27272a));
  background: color-mix(in srgb, var(--p-surface-900, #1a1b1e) 5.5%, var(--p-surface-0, #fff));
  border-color: color-mix(in srgb, var(--p-surface-900, #1a1b1e) 11%, var(--p-surface-0, #fff));
}

.inline-spin-sparkle {
  color: var(--accent-primary, var(--p-primary-color));
  display: flex;
  align-items: center;
}


.spin {
  animation: spin-sparkle 2.5s linear infinite;
}

@keyframes spin-sparkle {
  to { transform: rotate(360deg); }
}

.inline-action-text {
  letter-spacing: 0;
}

.inline-arrow {
  font-size: 13px;
  font-family: system-ui, -apple-system, sans-serif;
  color: var(--agent-text-muted, var(--p-text-muted-color, #a1a1aa));
  transition: transform 0.2s ease, color 0.15s ease;
  display: inline-block;
  transform-origin: center;
}

.inline-action-btn:hover .inline-arrow {
  color: var(--agent-text-primary, var(--p-text-color, #3f3f46));
  transform: translateX(1px);
}

.inline-arrow.rotated {
  transform: rotate(90deg) !important;
}

/* ── Indented Micro Timeline ─────────────────────────────────────── */
.inline-timeline-body {
  margin-top: 4px;
  margin-left: 2px;
  padding-left: 10px;
  border-left: 1.5px solid var(--agent-border-subtle, var(--p-surface-200, #e4e4e7));
  width: 100%;
}

.timeline-line-track {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.timeline-row {
  display: flex;
  flex-direction: column;
}

.row-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--agent-text-secondary, var(--p-text-muted-color, #71717a));
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.12s ease, color 0.12s ease;
}

.row-header:hover {
  background: color-mix(in srgb, var(--p-surface-900, #1a1b1e) 4%, var(--p-surface-0, #fff));
  color: var(--agent-text-primary, var(--p-text-color, #18181b));
}

.row-bullet {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.row-bullet.done {
  background: var(--accent-success, #34c759);
}

.row-bullet.failed {
  background: var(--accent-error, #ff3b30);
}

.row-label {
  font-weight: 500;
  flex-shrink: 0;
}

.row-summary {
  font-size: 11px;
  color: var(--agent-text-muted, var(--p-text-muted-color, #a1a1aa));
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.row-chevron {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
  transition: transform 0.15s ease;
}

.row-chevron.rotated {
  transform: rotate(90deg);
}

/* ── Code Box Panel ──────────────────────────────────────────────── */
.row-code-panel {
  margin: 4px 0 6px 10px;
  padding: 6px 8px;
  background: #18181b;
  border-radius: 6px;
  font-family: var(--font-family-mono, monospace);
  font-size: 10.5px;
  color: #e4e4e7;
  overflow-x: auto;
}

.code-section + .code-section {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #27272a;
}

.code-tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #a1a1aa;

}

.code-content {
  margin: 2px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
  line-height: 1.35;
}

/* Transitions */
.timeline-expand-enter-active,
.timeline-expand-leave-active {
  transition: max-height 0.2s ease, opacity 0.18s ease;
  max-height: 500px;
  overflow: hidden;
}

.timeline-expand-enter-from,
.timeline-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.code-expand-enter-active,
.code-expand-leave-active {
  transition: max-height 0.15s ease, opacity 0.12s ease;
  max-height: 300px;
  overflow: hidden;
}

.code-expand-enter-from,
.code-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

/* Dark mode */
:global(.p-dark .inline-action-btn) {
  color: #a1a1aa;
}

:global(.p-dark .inline-action-btn:hover) {
  color: #fafafa;
}

:global(.p-dark .inline-timeline-body) {
  border-left-color: #27272a;
}

:global(.p-dark .row-header:hover) {
  background: #1f1f23;
  color: #fafafa;
}
</style>
