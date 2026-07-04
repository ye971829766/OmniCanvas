<template>
  <Transition name="fade-loader" @after-leave="emit('hidden')">
    <div v-if="loading" class="canvas-loader" aria-label="Loading workspace">
      <div class="loader-content">
        <!-- Minimalist macOS / Linear spinner -->
        <div class="loader-spinner">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" class="spin-icon">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke-linecap="round"/>
          </svg>
        </div>
        <p class="loader-text">正在准备工作区…</p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
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
