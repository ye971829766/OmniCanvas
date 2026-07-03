<template>
  <Transition name="canvas-loader" @after-leave="emit('hidden')">
    <div v-if="visible" class="canvas-loader" :class="{ dissolving }" aria-label="Loading workspace">
      <!-- Rotating arc progress ring -->
      <div class="loader-arc-wrap">
        <svg class="loader-arc" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="34" stroke-width="2.5"
            class="arc-track" />
          <circle cx="40" cy="40" r="34" stroke-width="2.5"
            class="arc-spin"
            stroke-linecap="round"
            stroke-dasharray="50 164"
            stroke-dashoffset="0" />
        </svg>
        <!-- Breathing logo inside the arc -->
        <img :src="logoSrc" alt="" class="loader-logo" aria-hidden="true" />
      </div>

      <!-- Shimmer text -->
      <p class="loader-text">Preparing your workspace…</p>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import logoImg from '@/assets/logo.jpg';

const props = defineProps<{ loading: boolean }>();
const emit = defineEmits<{ (e: 'hidden'): void }>();

const logoSrc = logoImg;
const visible   = ref(props.loading);
const dissolving = ref(false);

watch(() => props.loading, (val) => {
  if (!val) {
    // Trigger the radial-wipe dissolve, then hide
    dissolving.value = true;
    setTimeout(() => {
      visible.value = false;
    }, 520);
  } else {
    dissolving.value = false;
    visible.value = true;
  }
}, { immediate: true });
</script>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────────── */
.canvas-loader {
  position: absolute;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: rgba(250, 250, 250, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);

  /* Radial clip mask — starts fully visible */
  --reveal: circle(100% at 50% 50%);
  clip-path: var(--reveal);
  transition: clip-path 0s;
}

/* Dissolve: radial wipe from center outward to nothing */
.canvas-loader.dissolving {
  clip-path: circle(0% at 50% 50%);
  transition: clip-path 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

/* Vue transition — instant show, dissolve handled manually above */
.canvas-loader-enter-active { transition: opacity 0.01s; }
.canvas-loader-leave-active { transition: opacity 0.01s; }
.canvas-loader-enter-from,
.canvas-loader-leave-to      { opacity: 0; }

/* ── Arc ring ────────────────────────────────────────────────────── */
.loader-arc-wrap {
  position: relative;
  width: 80px;
  height: 80px;
}

.loader-arc {
  width: 80px;
  height: 80px;
  transform: rotate(-90deg);
}

.arc-track {
  stroke: rgba(0, 0, 0, 0.06);
}

.arc-spin {
  stroke: #18181b;
  animation: arc-rotate 2.5s linear infinite;
  transform-origin: center;
  transform-box: fill-box;
}

@keyframes arc-rotate {
  to { transform: rotate(360deg); }
}

/* ── Logo ────────────────────────────────────────────────────────── */
.loader-logo {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  animation: logo-breathe 2s ease-in-out infinite;
}

@keyframes logo-breathe {
  0%, 100% { transform: scale(0.95); }
  50%       { transform: scale(1.05); }
}

/* ── Text ────────────────────────────────────────────────────────── */
.loader-text {
  font-size: 13px;
  font-weight: 500;
  color: transparent;
  background: linear-gradient(
    90deg,
    #71717a 0%, #71717a 25%,
    #a1a1aa 50%,
    #71717a 75%, #71717a 100%
  );
  background-size: 250% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  animation: shimmer-sweep 2s ease-in-out infinite;
  user-select: none;
}

@keyframes shimmer-sweep {
  0%   { background-position:  120% 0; }
  100% { background-position: -120% 0; }
}

/* ── Dark mode ───────────────────────────────────────────────────── */
:global(.p-dark) .canvas-loader {
  background: rgba(10, 10, 10, 0.92);
  backdrop-filter: blur(16px);
}

:global(.p-dark) .arc-track { stroke: rgba(255, 255, 255, 0.06); }
:global(.p-dark) .arc-spin  { stroke: #d4d4d8; }

:global(.p-dark) .loader-logo {
  box-shadow: 0 0 24px rgba(124, 58, 237, 0.12);
}

:global(.p-dark) .loader-text {
  background: linear-gradient(
    90deg,
    #a1a1aa 0%, #a1a1aa 25%,
    #d4d4d8 50%,
    #a1a1aa 75%, #a1a1aa 100%
  );
  background-size: 250% 100%;
  background-clip: text;
  -webkit-background-clip: text;
}
</style>
