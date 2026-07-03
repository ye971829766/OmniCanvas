<template>
  <div class="canvas-thumb" :class="{ 'has-image': thumbUrl }" @click="emit('click')">
    <img v-if="thumbUrl" :src="thumbUrl" class="thumb-img" alt="Canvas preview" />
    <div v-else class="thumb-placeholder">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
           width="16" height="16" class="thumb-icon">
        <rect x="2" y="2" width="16" height="16" rx="2"/>
        <path d="M2 13 L7 8 L11 12 L14 9 L18 13"/>
      </svg>
    </div>
    <!-- Refresh indicator -->
    <div v-if="refreshing" class="thumb-refresh-ring" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { App as LeaferApp } from 'leafer-ui';

const props = defineProps<{
  leaferApp: LeaferApp | null;
}>();

const emit = defineEmits<{ (e: 'click'): void }>();

const thumbUrl   = ref<string | null>(null);
const refreshing = ref(false);
let intervalId: ReturnType<typeof setInterval> | null = null;

async function capture() {
  const app = props.leaferApp;
  if (!app?.tree) return;
  try {
    refreshing.value = true;
    const result = await (app as any).export('png', { scale: 0.15, quality: 0.8 });
    if (result?.data) thumbUrl.value = result.data;
  } catch { /* canvas may not be ready */ }
  finally { refreshing.value = false; }
}

function startPolling() {
  capture();
  intervalId = setInterval(capture, 6000);
}

function stopPolling() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

/** External API: call this after agent finishes a turn to force a fresh capture. */
function refresh() { capture(); }
defineExpose({ refresh });

watch(() => props.leaferApp, (app) => {
  stopPolling();
  if (app) startPolling();
}, { immediate: true });

onUnmounted(stopPolling);
</script>

<style scoped>
.canvas-thumb {
  width: 52px;
  height: 38px;
  border-radius: 6px;
  border: 1px solid var(--p-surface-200, #e4e4e7);
  background: var(--p-surface-100, #f4f4f5);
  overflow: hidden;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.canvas-thumb:hover {
  border-color: var(--p-surface-300, #d4d4d8);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--p-text-muted-color, #a1a1aa);
}

/* Thin ring that flashes during capture */
.thumb-refresh-ring {
  position: absolute;
  inset: 0;
  border-radius: 6px;
  border: 1.5px solid rgba(124, 58, 237, 0.5);
  animation: ring-pulse 0.6s ease-out forwards;
  pointer-events: none;
}

@keyframes ring-pulse {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

:global(.p-dark) .canvas-thumb {
  background: #18181b;
  border-color: #27272a;
}
</style>
