<template>
  <Transition name="fade-loader" @after-leave="emit('hidden')">
    <div v-if="loading" class="canvas-loader" aria-label="Loading workspace">
      <div class="loader-content">
        <!-- Minimalist macOS / Linear spinner -->
        <div class="loader-spinner">
          <Loader2 :size="22" class="spin-icon" />
        </div>
        <p class="loader-text">正在准备工作区…</p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";

defineProps<{ loading: boolean }>();
const emit = defineEmits<{ (e: 'hidden'): void }>();
</script>

<style scoped>
.canvas-loader {
  position: absolute;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  user-select: none;
}

.loader-spinner {
  color: var(--p-text-color, #18181b);
}

.spin-icon {
  animation: spinner-rotate 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes spinner-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.loader-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--p-text-muted-color, #71717a);
  letter-spacing: 0.2px;
}

/* Vue Fade Transition */
.fade-loader-enter-active,
.fade-loader-leave-active {
  transition: opacity 0.35s ease;
}

.fade-loader-enter-from,
.fade-loader-leave-to {
  opacity: 0;
}

/* Dark mode */
:global(.p-dark .canvas-loader) {
  background: rgba(9, 9, 11, 0.9);
}

:global(.p-dark .loader-spinner) {
  color: #f4f4f5;
}

:global(.p-dark .loader-text) {
  color: #a1a1aa;
}
</style>
